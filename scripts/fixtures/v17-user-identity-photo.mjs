import { deflateSync } from "node:zlib";

export const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

// Deliberately separate fixture encoder: no production parser or CRC helper.
export function pngChunk(type, payload = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), payload]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? ((crc >>> 1) ^ 0xedb88320) : (crc >>> 1);
  }
  const length = Buffer.alloc(4); length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

export function syntheticPng({ width = 1, height = 1, colorType = 6, bitDepth = 8, interlace = 0,
  filter = 0, beforeData = [], afterData = [], rawPixels, compressedData, ending = true } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = bitDepth; header[9] = colorType; header[12] = interlace;
  const channels = colorType === 6 ? 4 : 3;
  const pixels = rawPixels ?? Buffer.alloc((width * channels + 1) * height, 80);
  if (!rawPixels) for (let row = 0; row < height; row += 1) pixels[row * (width * channels + 1)] = filter;
  return Buffer.concat([
    PNG_SIGNATURE, pngChunk("IHDR", header), ...beforeData,
    pngChunk("IDAT", compressedData ?? deflateSync(pixels)), ...afterData,
    ...(ending ? [pngChunk("IEND")] : []),
  ]);
}
