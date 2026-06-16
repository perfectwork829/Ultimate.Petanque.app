/**
 * Unit tests for services/base64.web.ts (pure JS base64-arraybuffer implementation)
 *
 * Tests: encode/decode round-trip, padding, empty buffers, known values,
 * binary data, various byte lengths (1,2,3,4, large).
 */

// ─── Inline implementations (from base64.web.ts) ──

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lookup = new Uint8Array(256);
for (let i = 0; i < chars.length; i++) {
  lookup[chars.charCodeAt(i)] = i;
}

function decode(base64: string): ArrayBuffer {
  let bufferLength = base64.length * 0.75;
  const len = base64.length;
  let p = 0;

  if (base64[len - 1] === '=') bufferLength--;
  if (base64[len - 2] === '=') bufferLength--;

  const arraybuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arraybuffer);

  for (let i = 0; i < len; i += 4) {
    const encoded1 = lookup[base64.charCodeAt(i)];
    const encoded2 = lookup[base64.charCodeAt(i + 1)];
    const encoded3 = lookup[base64.charCodeAt(i + 2)];
    const encoded4 = lookup[base64.charCodeAt(i + 3)];

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }

  return arraybuffer;
}

function encode(arraybuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arraybuffer);
  const len = bytes.length;
  let base64 = '';

  for (let i = 0; i < len; i += 3) {
    base64 += chars[bytes[i] >> 2];
    base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    base64 += chars[bytes[i + 2] & 63];
  }

  if (len % 3 === 2) {
    base64 = base64.substring(0, base64.length - 1) + '=';
  } else if (len % 3 === 1) {
    base64 = base64.substring(0, base64.length - 2) + '==';
  }

  return base64;
}

// Helper to create ArrayBuffer from byte array
function bufferFrom(bytes: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.length);
  const view = new Uint8Array(buf);
  bytes.forEach((b, i) => { view[i] = b; });
  return buf;
}

// Helper to get bytes from ArrayBuffer
function toBytes(buf: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(buf));
}

// ─── Tests ──

describe('encode', () => {
  test('empty buffer produces empty string', () => {
    expect(encode(new ArrayBuffer(0))).toBe('');
  });

  test('single byte (1 byte → 4 chars with ==)', () => {
    const buf = bufferFrom([65]); // 'A'
    const result = encode(buf);
    expect(result).toMatch(/==$/);
    expect(result.length).toBe(4);
  });

  test('two bytes (2 bytes → 4 chars with =)', () => {
    const buf = bufferFrom([65, 66]); // 'AB'
    const result = encode(buf);
    expect(result).toMatch(/=$/);
    expect(result).not.toMatch(/==$/);
    expect(result.length).toBe(4);
  });

  test('three bytes (3 bytes → 4 chars, no padding)', () => {
    const buf = bufferFrom([65, 66, 67]); // 'ABC'
    const result = encode(buf);
    expect(result).not.toContain('=');
    expect(result.length).toBe(4);
  });

  test('known value: "Hello" → SGVsbG8=', () => {
    const buf = bufferFrom([72, 101, 108, 108, 111]);
    expect(encode(buf)).toBe('SGVsbG8=');
  });

  test('known value: "AB" → QUI=', () => {
    const buf = bufferFrom([65, 66]);
    expect(encode(buf)).toBe('QUI=');
  });

  test('all zeros', () => {
    const buf = bufferFrom([0, 0, 0]);
    expect(encode(buf)).toBe('AAAA');
  });

  test('all 255s', () => {
    const buf = bufferFrom([255, 255, 255]);
    expect(encode(buf)).toBe('////');
  });

  test('only uses valid base64 characters', () => {
    const buf = bufferFrom([0, 64, 128, 192, 255, 1, 2, 3]);
    const result = encode(buf);
    expect(result).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});

describe('decode', () => {
  test('empty string produces empty buffer', () => {
    expect(decode('').byteLength).toBe(0);
  });

  test('known value: SGVsbG8= → "Hello"', () => {
    const buf = decode('SGVsbG8=');
    expect(toBytes(buf)).toEqual([72, 101, 108, 108, 111]);
  });

  test('no padding (3 bytes)', () => {
    const buf = decode('AAAA');
    expect(toBytes(buf)).toEqual([0, 0, 0]);
  });

  test('single padding (2 bytes)', () => {
    const buf = decode('QUI=');
    expect(toBytes(buf)).toEqual([65, 66]);
  });

  test('double padding (1 byte)', () => {
    const buf = decode('QQ==');
    expect(toBytes(buf)).toEqual([65]);
  });

  test('all 255s: //// → [255, 255, 255]', () => {
    const buf = decode('////');
    expect(toBytes(buf)).toEqual([255, 255, 255]);
  });
});

describe('encode/decode round-trip', () => {
  test('single byte round-trip', () => {
    const original = bufferFrom([42]);
    expect(toBytes(decode(encode(original)))).toEqual([42]);
  });

  test('two bytes round-trip', () => {
    const original = bufferFrom([100, 200]);
    expect(toBytes(decode(encode(original)))).toEqual([100, 200]);
  });

  test('three bytes round-trip', () => {
    const original = bufferFrom([10, 20, 30]);
    expect(toBytes(decode(encode(original)))).toEqual([10, 20, 30]);
  });

  test('6 bytes round-trip', () => {
    const original = bufferFrom([1, 2, 3, 4, 5, 6]);
    expect(toBytes(decode(encode(original)))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('7 bytes round-trip (non-multiple of 3)', () => {
    const original = bufferFrom([10, 20, 30, 40, 50, 60, 70]);
    expect(toBytes(decode(encode(original)))).toEqual([10, 20, 30, 40, 50, 60, 70]);
  });

  test('binary data round-trip (all byte values 0-255)', () => {
    const bytes = Array.from({ length: 256 }, (_, i) => i);
    const original = bufferFrom(bytes);
    const decoded = decode(encode(original));
    expect(toBytes(decoded)).toEqual(bytes);
  });

  test('large buffer round-trip (1024 bytes)', () => {
    const bytes = Array.from({ length: 1024 }, (_, i) => i % 256);
    const original = bufferFrom(bytes);
    const encoded = encode(original);
    const decoded = decode(encoded);
    expect(decoded.byteLength).toBe(1024);
    expect(toBytes(decoded)).toEqual(bytes);
  });

  test('random-like data round-trip', () => {
    const bytes = Array.from({ length: 100 }, (_, i) => (i * 37 + 13) % 256);
    const original = bufferFrom(bytes);
    expect(toBytes(decode(encode(original)))).toEqual(bytes);
  });
});

describe('encoding output format', () => {
  test('output length for n bytes = ceil(n/3)*4', () => {
    for (let n = 1; n <= 12; n++) {
      const buf = bufferFrom(Array.from({ length: n }, (_, i) => i));
      const encoded = encode(buf);
      expect(encoded.length).toBe(Math.ceil(n / 3) * 4);
    }
  });

  test('padding count matches (n % 3)', () => {
    // 1 byte → 2 padding
    expect(encode(bufferFrom([1])).match(/=+$/)?.[0].length).toBe(2);
    // 2 bytes → 1 padding
    expect(encode(bufferFrom([1, 2])).match(/=+$/)?.[0].length).toBe(1);
    // 3 bytes → no padding
    expect(encode(bufferFrom([1, 2, 3]))).not.toContain('=');
  });
});

describe('lookup table', () => {
  test('has 256 entries', () => {
    expect(lookup.length).toBe(256);
  });

  test('A maps to 0', () => {
    expect(lookup['A'.charCodeAt(0)]).toBe(0);
  });

  test('Z maps to 25', () => {
    expect(lookup['Z'.charCodeAt(0)]).toBe(25);
  });

  test('a maps to 26', () => {
    expect(lookup['a'.charCodeAt(0)]).toBe(26);
  });

  test('0 maps to 52', () => {
    expect(lookup['0'.charCodeAt(0)]).toBe(52);
  });

  test('+ maps to 62', () => {
    expect(lookup['+'.charCodeAt(0)]).toBe(62);
  });

  test('/ maps to 63', () => {
    expect(lookup['/'.charCodeAt(0)]).toBe(63);
  });
});

describe('chars alphabet', () => {
  test('has 64 characters', () => {
    expect(chars.length).toBe(64);
  });

  test('starts with A-Z', () => {
    expect(chars.substring(0, 26)).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.substring(0, 26));
  });

  test('ends with +/', () => {
    expect(chars.endsWith('+/')).toBe(true);
  });
});
