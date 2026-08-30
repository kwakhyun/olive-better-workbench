function bytesOf(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError("Expected an image byte buffer.");
}

function uint32(bytes, offset) {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

export function imageSize(input) {
  const bytes = bytesOf(input);
  const png =
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[12] === 0x49 &&
    bytes[13] === 0x48 &&
    bytes[14] === 0x44 &&
    bytes[15] === 0x52;
  if (!png) {
    throw new TypeError("Only the project's trusted PNG metadata assets are supported.");
  }

  const width = uint32(bytes, 16);
  const height = uint32(bytes, 20);
  if (!width || !height || width > 100_000 || height > 100_000) {
    throw new TypeError("Invalid PNG dimensions.");
  }
  return { width, height, type: "png" };
}

export default imageSize;
