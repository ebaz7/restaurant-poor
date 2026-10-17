const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, 'src', 'assets', 'images', 'arka_logo.png');
const icoPath = path.join(__dirname, 'src', 'assets', 'images', 'arka_logo.ico');

if (!fs.existsSync(pngPath)) {
  console.error("PNG logo not found at " + pngPath);
  process.exit(1);
}

const pngBuf = fs.readFileSync(pngPath);

// Create the ICO buffer
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Type: 1 (ICO)
header.writeUInt16LE(1, 4); // Count: 1

const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(0, 0); // Width: 256 (0 means 256)
dirEntry.writeUInt8(0, 1); // Height: 256 (0 means 256)
dirEntry.writeUInt8(0, 2); // Color palette: 0 (no palette)
dirEntry.writeUInt8(0, 3); // Reserved: 0
dirEntry.writeUInt16LE(1, 4); // Planes: 1
dirEntry.writeUInt16LE(32, 6); // Bits per pixel: 32
dirEntry.writeUInt32LE(pngBuf.length, 8); // Size of image data
dirEntry.writeUInt32LE(22, 12); // Offset to image data (6 + 16 = 22)

const icoBuf = Buffer.concat([header, dirEntry, pngBuf]);
fs.writeFileSync(icoPath, icoBuf);
console.log("Successfully generated standard 256x256 PNG-encoded ICO file at " + icoPath);
