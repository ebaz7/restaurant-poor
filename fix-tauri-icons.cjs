const fs = require('fs');
const path = require('path');

/**
 * Creates a 100% compliant Windows 3.00 format uncompressed DIB ICO file.
 * Compatible with all versions of Microsoft Windows Resource Compiler (RC.EXE),
 * including older Windows SDKs (10.0.10011, MSVC 2017, 2019, 2022).
 */
function createWindows300Icon(sizes = [16, 32, 48, 64]) {
  // Arka brand colors: Royal Blue #2563eb (R=37, G=99, B=235) with White 'A'
  const BG_R = 37, BG_G = 99, BG_B = 235;

  const images = sizes.map((size) => {
    const width = size;
    const height = size;

    // 1. DIB BITMAPINFOHEADER (40 bytes)
    const dibHeader = Buffer.alloc(40);
    dibHeader.writeUInt32LE(40, 0); // biSize
    dibHeader.writeInt32LE(width, 4); // biWidth
    dibHeader.writeInt32LE(height * 2, 8); // biHeight (CRITICAL: 2 * height for Windows 3.00 ICO)
    dibHeader.writeUInt16LE(1, 12); // biPlanes
    dibHeader.writeUInt16LE(32, 14); // biBitCount (32 bpp BGRA)
    dibHeader.writeUInt32LE(0, 16); // biCompression (0 = BI_RGB, NO PNG COMPRESSION)
    dibHeader.writeUInt32LE(width * height * 4, 20); // biSizeImage
    dibHeader.writeInt32LE(0, 24); // biXPelsPerMeter
    dibHeader.writeInt32LE(0, 28); // biYPelsPerMeter
    dibHeader.writeUInt32LE(0, 32); // biClrUsed
    dibHeader.writeUInt32LE(0, 36); // biClrImportant

    // 2. XOR Mask: width * height * 4 bytes (BGRA, bottom-up order)
    const xorMask = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      // In bottom-up DIB: row 0 in file is bottom of visual image
      const visualY = height - 1 - y;
      const cornerRadius = Math.max(2, Math.floor(size * 0.2));

      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;

        // Rounded rectangle test
        let inRoundedRect = true;
        const dx = x < cornerRadius ? cornerRadius - x : (x >= width - cornerRadius ? x - (width - cornerRadius - 1) : 0);
        const dy = visualY < cornerRadius ? cornerRadius - visualY : (visualY >= height - cornerRadius ? visualY - (height - cornerRadius - 1) : 0);
        if (dx > 0 && dy > 0 && (dx * dx + dy * dy > cornerRadius * cornerRadius)) {
          inRoundedRect = false;
        }

        if (!inRoundedRect) {
          // Transparent pixel
          xorMask[offset] = 0; // B
          xorMask[offset + 1] = 0; // G
          xorMask[offset + 2] = 0; // R
          xorMask[offset + 3] = 0; // Alpha
          continue;
        }

        // Draw 'A' letter in white inside
        const normX = x / width;
        const normY = visualY / height;
        let isWhiteLetter = false;

        if (normY >= 0.25 && normY <= 0.75) {
          // Left diagonal leg: x = 0.5 - (y - 0.25) * 0.5 => from (0.5, 0.25) to (0.25, 0.75)
          const expectedLeftX = 0.5 - (normY - 0.25) * 0.5;
          const expectedRightX = 0.5 + (normY - 0.25) * 0.5;
          const thickness = Math.max(0.08, 1.5 / width);

          if (Math.abs(normX - expectedLeftX) < thickness || Math.abs(normX - expectedRightX) < thickness) {
            isWhiteLetter = true;
          }
          // Crossbar at y = 0.55
          if (Math.abs(normY - 0.55) < thickness * 0.8 && normX >= expectedLeftX && normX <= expectedRightX) {
            isWhiteLetter = true;
          }
        }

        if (isWhiteLetter) {
          xorMask[offset] = 255; // B
          xorMask[offset + 1] = 255; // G
          xorMask[offset + 2] = 255; // R
          xorMask[offset + 3] = 255; // Alpha
        } else {
          xorMask[offset] = BG_B; // Blue
          xorMask[offset + 1] = BG_G; // Green
          xorMask[offset + 2] = BG_R; // Red
          xorMask[offset + 3] = 255; // Full Alpha
        }
      }
    }

    // 3. AND Mask: 1 bit per pixel monochrome mask, 32-bit DWORD row aligned
    // 0 = opaque, 1 = transparent
    const andRowBytes = Math.ceil(width / 32) * 4;
    const andMask = Buffer.alloc(andRowBytes * height, 0); // default all 0 (opaque)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const xorOffset = (y * width + x) * 4;
        const alpha = xorMask[xorOffset + 3];
        if (alpha === 0) {
          const byteIndex = y * andRowBytes + Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          andMask[byteIndex] |= (1 << bitIndex);
        }
      }
    }

    const dibData = Buffer.concat([dibHeader, xorMask, andMask]);
    return {
      width: width >= 256 ? 0 : width,
      height: height >= 256 ? 0 : height,
      size: dibData.length,
      dibData,
    };
  });

  // Calculate file layout
  const headerSize = 6;
  const dirEntrySize = 16;
  const totalEntriesSize = images.length * dirEntrySize;
  let currentOffset = headerSize + totalEntriesSize;

  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0); // reserved
  iconDir.writeUInt16LE(1, 2); // 1 = ICO
  iconDir.writeUInt16LE(images.length, 4); // count

  const dirEntries = [];
  const dibBuffers = [];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry[0] = img.width; // width
    entry[1] = img.height; // height
    entry[2] = 0; // color count
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(img.size, 8); // size
    entry.writeUInt32LE(currentOffset, 12); // offset

    dirEntries.push(entry);
    dibBuffers.push(img.dibData);
    currentOffset += img.size;
  }

  return Buffer.concat([iconDir, ...dirEntries, ...dibBuffers]);
}

// Write to src-tauri/icons/icon.ico and public/favicon.ico
const icoBuffer = createWindows300Icon([16, 32, 48, 64]);
const targetPath = path.join(__dirname, 'src-tauri', 'icons', 'icon.ico');
fs.writeFileSync(targetPath, icoBuffer);
console.log('[✔] Generated 100% Windows 3.00 compliant icon.ico at:', targetPath, `(${icoBuffer.length} bytes)`);

// Also save copy in public/favicon.ico
const publicFavicon = path.join(__dirname, 'public', 'favicon.ico');
fs.writeFileSync(publicFavicon, icoBuffer);
console.log('[✔] Saved copy to public/favicon.ico');
