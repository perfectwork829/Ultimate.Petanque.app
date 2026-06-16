/**
 * Minimal Buffer polyfill for react-native-svg's fetchData.ts
 * Only implements Buffer.from() for base64/utf8 which is all SVG needs.
 */
class BufferShim {
  static from(data, encoding) {
    if (typeof data === 'string') {
      return new BufferShim(data, encoding);
    }
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      const bytes = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
      const shim = new BufferShim('', 'binary');
      shim._bytes = bytes;
      return shim;
    }
    return new BufferShim('', 'utf8');
  }

  static alloc(size) {
    const shim = new BufferShim('', 'binary');
    shim._bytes = new Uint8Array(size);
    return shim;
  }

  constructor(data, encoding) {
    this._data = data || '';
    this._encoding = encoding || 'utf8';
    this._bytes = null;
  }

  toString(encoding) {
    if (encoding === 'base64') {
      if (this._bytes) {
        let binary = '';
        for (let i = 0; i < this._bytes.length; i++) {
          binary += String.fromCharCode(this._bytes[i]);
        }
        try { return btoa(binary); } catch { return ''; }
      }
      try { return btoa(this._data); } catch { return ''; }
    }
    if (this._bytes) {
      let result = '';
      for (let i = 0; i < this._bytes.length; i++) {
        result += String.fromCharCode(this._bytes[i]);
      }
      return result;
    }
    return this._data;
  }

  get length() {
    return this._bytes ? this._bytes.length : this._data.length;
  }
}

module.exports = { Buffer: BufferShim };
