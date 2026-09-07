/** Small deterministic encoders for the original desktop image formats. */
export function encodeBMP(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): Uint8Array {
  const stride = (width * 3 + 3) & ~3,
    bytes = new Uint8Array(54 + stride * height),
    v = new DataView(bytes.buffer);
  bytes.set([66, 77]);
  v.setUint32(2, bytes.length, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, width, true);
  v.setInt32(22, height, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, stride * height, true);
  v.setInt32(38, 3780, true);
  v.setInt32(42, 3780, true);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4,
        dst = 54 + (height - y - 1) * stride + x * 3;
      bytes[dst] = rgba[src + 2];
      bytes[dst + 1] = rgba[src + 1];
      bytes[dst + 2] = rgba[src];
    }
  return bytes;
}
export function encodeWBMP(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): Uint8Array {
  const number = (n: number) => {
    const a = [n & 127];
    while ((n >>= 7) > 0) a.unshift((n & 127) | 128);
    return a;
  };
  const header = [0, 0, ...number(width), ...number(height)],
    stride = Math.ceil(width / 8),
    bytes = new Uint8Array(header.length + height * stride);
  bytes.set(header);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2] >= 128)
        bytes[header.length + y * stride + (x >> 3)] |= 128 >> (x & 7);
    }
  return bytes;
}
export function encodeGIF(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): Uint8Array {
  const bytes: number[] = [
    71,
    73,
    70,
    56,
    57,
    97,
    width & 255,
    width >> 8,
    height & 255,
    height >> 8,
    247,
    0,
    0,
  ];
  for (let i = 0; i < 256; i++)
    bytes.push(
      Math.round((((i >> 5) & 7) * 255) / 7),
      Math.round((((i >> 2) & 7) * 255) / 7),
      Math.round(((i & 3) * 255) / 3),
    );
  bytes.push(
    44,
    0,
    0,
    0,
    0,
    width & 255,
    width >> 8,
    height & 255,
    height >> 8,
    0,
    8,
  );
  const data: number[] = [];
  let bits = 0,
    count = 0;
  const code = (n: number) => {
    bits |= n << count;
    count += 9;
    while (count >= 8) {
      data.push(bits & 255);
      bits >>>= 8;
      count -= 8;
    }
  };
  // Periodic dictionary reset keeps every code nine bits and bounds encoder memory.
  for (let i = 0; i < width * height; i++) {
    if (i % 200 === 0) code(256);
    const k = i * 4;
    code((rgba[k] & 224) | ((rgba[k + 1] >> 3) & 28) | (rgba[k + 2] >> 6));
  }
  code(257);
  if (count) data.push(bits & 255);
  for (let i = 0; i < data.length; i += 255) {
    const block = data.slice(i, i + 255);
    bytes.push(block.length, ...block);
  }
  bytes.push(0, 59);
  return new Uint8Array(bytes);
}
