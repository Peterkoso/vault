// Generate PNG icons using pure node (no canvas dependency)
const fs = require('fs');

// Minimal PNG encoder
function createPNG(width, height, pixels) {
  const zlib = require('zlib');

  function uint32BE(v) {
    return Buffer.from([(v>>>24)&0xff,(v>>>16)&0xff,(v>>>8)&0xff,v&0xff]);
  }

  function chunk(type, data) {
    const len = uint32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = crc32(body);
    return Buffer.concat([len, body, uint32BE(crc)]);
  }

  const crcTable = [];
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}
  function crc32(buf){let c=0xFFFFFFFF;for(const b of buf)c=crcTable[(c^b)&0xff]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}

  // Build raw image data (RGBA)
  const raw = [];
  for(let y=0;y<height;y++){
    raw.push(0); // filter byte
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      raw.push(pixels[i],pixels[i+1],pixels[i+2],pixels[i+3]);
    }
  }
  const deflated = zlib.deflateSync(Buffer.from(raw));

  const IHDR_data = Buffer.concat([uint32BE(width),uint32BE(height),Buffer.from([8,2,0,0,0])]); // 8-bit RGB... wait need RGBA
  // Use color type 6 = RGBA
  const IHDR = Buffer.concat([uint32BE(width),uint32BE(height),Buffer.from([8,6,0,0,0])]);

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), // PNG signature
    chunk('IHDR', IHDR),
    chunk('IDAT', deflated),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function makeIcon(size, file) {
  const pixels = new Uint8Array(size * size * 4);

  const bg = [234, 216, 188, 255]; // #EAD8BC
  const accent = [196, 136, 42, 255]; // #C4882A

  const cx = size / 2, cy = size / 2;
  const r = size * 0.38; // lock body radius

  for(let y=0; y<size; y++) {
    for(let x=0; x<size; x++) {
      const idx = (y * size + x) * 4;
      // rounded rect background
      const rx = size * 0.18;
      const inRect = x>=rx && x<=size-rx && y>=0 && y<=size ||
                     x>=0 && x<=size && y>=rx && y<=size-rx ||
                     Math.hypot(x-rx,y-rx)<rx || Math.hypot(x-(size-rx),y-rx)<rx ||
                     Math.hypot(x-rx,y-(size-rx))<rx || Math.hypot(x-(size-rx),y-(size-rx))<rx;

      const dx = x - cx, dy = y - cy;

      // Lock shackle (arc top half)
      const shackleR = size * 0.18;
      const shackleThick = size * 0.06;
      const dist = Math.hypot(dx, dy - (-size*0.05));
      const inShackle = dist >= shackleR - shackleThick && dist <= shackleR + shackleThick && dy < -size*0.05;

      // Lock body (rounded rect)
      const bw = size * 0.42, bh = size * 0.32, by = size * 0.08;
      const inBody = Math.abs(dx) < bw/2 && dy >= by && dy <= by + bh;

      // Keyhole
      const khR = size * 0.07;
      const inKeyhole = Math.hypot(dx, dy - (by + bh*0.35)) < khR;
      const inKeystick = Math.abs(dx) < size*0.025 && dy >= by+bh*0.35 && dy <= by+bh*0.7;

      const alpha = (x < size*0.18 || x > size*0.82 || y < size*0.18 || y > size*0.82) ? 0 : 255;
      // Simple rounded rect: corners
      let inBg = true;
      const corners = [[size*0.18,size*0.18],[size*0.82,size*0.18],[size*0.18,size*0.82],[size*0.82,size*0.82]];
      let nearCorner = false;
      for(const [cx2,cy2] of corners) {
        if(x<size*0.18||x>size*0.82||y<size*0.18||y>size*0.82) {
          if(Math.hypot(x-cx2,y-cy2)>size*0.18) { inBg=false; break; }
        }
      }

      if(!inBg) {
        pixels[idx+3]=0; continue;
      }

      if(inKeyhole || inKeystick) {
        pixels[idx]=bg[0]; pixels[idx+1]=bg[1]; pixels[idx+2]=bg[2]; pixels[idx+3]=255;
      } else if(inBody || inShackle) {
        pixels[idx]=accent[0]; pixels[idx+1]=accent[1]; pixels[idx+2]=accent[2]; pixels[idx+3]=255;
      } else {
        pixels[idx]=bg[0]; pixels[idx+1]=bg[1]; pixels[idx+2]=bg[2]; pixels[idx+3]=255;
      }
    }
  }

  fs.writeFileSync(file, createPNG(size, size, pixels));
  console.log('wrote', file);
}

makeIcon(192, 'icon-192.png');
makeIcon(512, 'icon-512.png');
