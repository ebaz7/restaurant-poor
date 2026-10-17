const fs = require('fs');
const path = require('path');

// A valid, clean 256x256 RGBA PNG in base64 format (pure standalone valid PNG header and payload)
// Let's create a minimal valid 32-bit ICO header with a valid 32x32 bitmap or clean PNG structure for Windows RC.EXE
function createStandardIco(destPath) {
    // Standard Windows ICO file structure containing a valid uncompressed BMP / DIB or PNG
    // For 32x32 32-bit BGRA:
    const width = 32;
    const height = 32;
    const bpp = 32;
    const imageSize = 40 + (width * height * 4); // BITMAPINFOHEADER (40) + pixel data
    const headerSize = 6;
    const dirEntrySize = 16;
    const totalFileSize = headerSize + dirEntrySize + imageSize;

    const buf = Buffer.alloc(totalFileSize);

    // ICONDIR
    buf.writeUInt16LE(0, 0); // Reserved
    buf.writeUInt16LE(1, 2); // Type: 1 = ICO
    buf.writeUInt16LE(1, 4); // Count: 1 image

    // ICONDIRENTRY
    buf.writeUInt8(width, 6);        // Width (32)
    buf.writeUInt8(height, 7);       // Height (32)
    buf.writeUInt8(0, 8);            // Color count (0 for 32bpp)
    buf.writeUInt8(0, 9);            // Reserved
    buf.writeUInt16LE(1, 10);        // Planes
    buf.writeUInt16LE(bpp, 12);      // Bit count (32 bpp)
    buf.writeUInt32LE(imageSize, 14);// Bytes in resource
    buf.writeUInt32LE(headerSize + dirEntrySize, 18); // Offset to image data (22)

    // BITMAPINFOHEADER (40 bytes)
    const bihOffset = 22;
    buf.writeUInt32LE(40, bihOffset + 0);         // biSize
    buf.writeInt32LE(width, bihOffset + 4);       // biWidth
    buf.writeInt32LE(height * 2, bihOffset + 8);  // biHeight (must be 2 * height in ICO for XOR + AND mask)
    buf.writeUInt16LE(1, bihOffset + 12);         // biPlanes
    buf.writeUInt16LE(bpp, bihOffset + 14);       // biBitCount
    buf.writeUInt32LE(0, bihOffset + 16);         // biCompression (BI_RGB = 0)
    buf.writeUInt32LE(width * height * 4, bihOffset + 20); // biSizeImage
    buf.writeInt32LE(0, bihOffset + 24);          // biXPelsPerMeter
    buf.writeInt32LE(0, bihOffset + 28);          // biYPelsPerMeter
    buf.writeUInt32LE(0, bihOffset + 32);         // biClrUsed
    buf.writeUInt32LE(0, bihOffset + 36);         // biClrImportant

    // Pixel data: 32x32 pixels, let's draw an elegant deep emerald / gold brand badge for Arka
    const pixelOffset = bihOffset + 40;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = pixelOffset + (y * width + x) * 4;
            // Draw a rounded box with stylish colors
            const isBorder = (x <= 1 || x >= width - 2 || y <= 1 || y >= height - 2);
            if (isBorder) {
                // Gold / Amber border (#F59E0B) -> BGRA: 11, 158, 245, 255
                buf.writeUInt8(11, idx + 0);  // B
                buf.writeUInt8(158, idx + 1); // G
                buf.writeUInt8(245, idx + 2); // R
                buf.writeUInt8(255, idx + 3); // A
            } else {
                // Emerald background (#059669) -> BGRA: 105, 150, 5, 255
                buf.writeUInt8(105, idx + 0); // B
                buf.writeUInt8(150, idx + 1); // G
                buf.writeUInt8(5, idx + 2);   // R
                buf.writeUInt8(255, idx + 3); // A
            }
        }
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buf);
    console.log(`Generated 100% RC.EXE compliant DIB ICO file at: ${destPath}`);
}

// Generate for src-tauri/icons/icon.ico and src/assets/images/arka_logo.ico
const tauriIco = path.join(__dirname, 'src-tauri', 'icons', 'icon.ico');
const srcIco = path.join(__dirname, 'src', 'assets', 'images', 'arka_logo.ico');

createStandardIco(tauriIco);
createStandardIco(srcIco);
