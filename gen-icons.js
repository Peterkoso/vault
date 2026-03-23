// Generate PNG icons using pure node (no canvas dependency)
const fs = require('fs');

// Minimal PNG encoder
function createPNG(width, height, pixels) {
  const zlib = require('zlib');

  function uint32BE(v) {
    return Buffer.from([(v>>>24)&0xff,(v>>>16)&0xff,(v>>>8)&0xff,v&0xff]);
  }
  function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = crc32(body);
    return Buffer.concat([uint32BE(data.length), body, uint32BE(crc)]);
  }
  const crcTable = [];
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}
  function crc32(buf){let c=0xFFFFFFFF;for(const b of buf)c=crcTable[(c^b)&0xff]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}

  const raw = [];
  for(let y=0;y<height;y++){
    raw.push(0);
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      raw.push(pixels[i],pixels[i+1],pixels[i+2],pixels[i+3]);
    }
  }
  const deflated = zlib.deflateSync(Buffer.from(raw));
  const IHDR = Buffer.concat([uint32BE(width),uint32BE(height),Buffer.from([8,6,0,0,0])]);
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', IHDR),
    chunk('IDAT', deflated),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Anti-aliased coverage: sample NxN sub-pixels and return fraction [0..1] inside shape
function coverage(x, y, N, shapeFn) {
  let count = 0;
  const step = 1 / N;
  for (let sy = 0; sy < N; sy++) {
    for (let sx = 0; sx < N; sx++) {
      const px = x + (sx + 0.5) * step;
      const py = y + (sy + 0.5) * step;
      if (shapeFn(px, py)) count++;
    }
  }
  return count / (N * N);
}

// Blend two RGBA colors by alpha t
function blend(fg, bg, t) {
  return [
    Math.round(fg[0]*t + bg[0]*(1-t)),
    Math.round(fg[1]*t + bg[1]*(1-t)),
    Math.round(fg[2]*t + bg[2]*(1-t)),
    Math.round(fg[3]*t + bg[3]*(1-t)),
  ];
}

function makeIcon(size, file) {
  const pixels = new Uint8Array(size * size * 4);
  const AA = 4; // 4x4 supersampling

  const BG   = [196, 136, 42,  255]; // #C4882A — warm wooden
  const WHITE = [255, 255, 255, 255];
  const TRANS = [0,   0,   0,   0  ];

  const cx = size / 2;
  const cy = size / 2;

  // Rounded square corner radius: 22% of size
  const cornerR = size * 0.22;

  // --- Shape definitions ---

  // Rounded square background
  function inRoundedSquare(px, py) {
    const x = px, y = py;
    const minX = cornerR, maxX = size - cornerR;
    const minY = cornerR, maxY = size - cornerR;
    if (x >= minX && x <= maxX) return y >= 0 && y <= size;
    if (y >= minY && y <= maxY) return x >= 0 && x <= size;
    // corners
    const nearX = Math.max(minX, Math.min(maxX, x));
    const nearY = Math.max(minY, Math.min(maxY, y));
    return Math.hypot(x - nearX, y - nearY) <= cornerR;
  }

  // Lock shackle: a U-shape
  // Shackle is a thick arc (semicircle open at bottom) centered slightly above center
  const shackleCY   = cy - size * 0.085; // center of arc
  const shackleR    = size * 0.175;       // outer arc radius
  const shackleThick = size * 0.075;      // stroke thickness

  // The shackle arc spans from left-bottom to right-bottom (goes up and over)
  // Left leg: x in [cx - shackleR - shackleThick/2, cx - shackleR + shackleThick/2], y < shackleCY
  // Right leg same mirrored
  // Top arc: distance from shackleCY in [shackleR-thick/2, shackleR+thick/2] AND y <= shackleCY

  const shackleInnerR = shackleR - shackleThick / 2;
  const shackleOuterR = shackleR + shackleThick / 2;

  // Leg bottom: shackle legs go down into the body; clip legs at body top
  // Body top y coordinate
  const bodyTop    = cy - size * 0.035;
  const bodyBottom = cy + size * 0.295;
  const bodyHalfW  = size * 0.285;
  const bodyCornerR = size * 0.065;

  function inShackle(px, py) {
    const dx = px - cx;
    const dy = py - shackleCY;
    const dist = Math.hypot(dx, dy);

    // Arc portion: above arc center
    if (py <= shackleCY + shackleThick * 0.5) {
      if (dist >= shackleInnerR && dist <= shackleOuterR) return true;
    }

    // Vertical legs: below arc center down to body top
    if (py > shackleCY && py <= bodyTop + shackleThick * 0.5) {
      const legX = shackleR; // distance from cx to leg center
      if (Math.abs(Math.abs(dx) - legX) <= shackleThick / 2) return true;
    }

    return false;
  }

  // Lock body: rounded rectangle
  function inBody(px, py) {
    const dx = px - cx;
    const dy = py - (bodyTop + bodyBottom) / 2;
    const hw = bodyHalfW;
    const hh = (bodyBottom - bodyTop) / 2;
    const r = bodyCornerR;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > hw || ay > hh) return false;
    if (ax <= hw - r || ay <= hh - r) return true;
    return Math.hypot(ax - (hw - r), ay - (hh - r)) <= r;
  }

  // Keyhole: circle + downward teardrop cut-out (rendered as NOT white inside body)
  const khCY      = bodyTop + (bodyBottom - bodyTop) * 0.38;
  const khCircleR = size * 0.055;
  const khStemW   = size * 0.038;
  const khStemBot = bodyTop + (bodyBottom - bodyTop) * 0.72;

  function inKeyhole(px, py) {
    const dx = px - cx;
    // Circle
    if (Math.hypot(dx, py - khCY) <= khCircleR) return true;
    // Stem rectangle below circle center
    if (py >= khCY && py <= khStemBot && Math.abs(dx) <= khStemW / 2) return true;
    return false;
  }

  // --- Render ---
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Background rounded square
      const bgCov = coverage(x, y, AA, inRoundedSquare);
      if (bgCov === 0) {
        // Transparent outside
        pixels[idx+3] = 0;
        continue;
      }

      // Base = background color (anti-aliased edge blended with transparent)
      let color = blend(BG, TRANS, bgCov);

      // Shackle (white) on top of bg
      const shackleCov = coverage(x, y, AA, inShackle);
      if (shackleCov > 0) {
        color = blend(WHITE, color, shackleCov * bgCov);
      }

      // Body (white)
      const bodyCov = coverage(x, y, AA, inBody);
      if (bodyCov > 0) {
        // Keyhole cuts through body (bg color shows through)
        const kh = coverage(x, y, AA, inKeyhole);
        const netWhite = bodyCov * (1 - kh);
        const keyholeVis = bodyCov * kh;
        if (netWhite > 0) color = blend(WHITE, color, netWhite);
        // Keyhole area stays as underlying color (bg), already set
      }

      pixels[idx]   = color[0];
      pixels[idx+1] = color[1];
      pixels[idx+2] = color[2];
      pixels[idx+3] = color[3];
    }
  }

  fs.writeFileSync(file, createPNG(size, size, pixels));
  console.log('wrote', file, `(${size}x${size})`);
}

makeIcon(192, 'C:/Users/Uživatel/vault/icon-192.png');
makeIcon(512, 'C:/Users/Uživatel/vault/icon-512.png');
