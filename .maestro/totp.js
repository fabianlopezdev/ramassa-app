// The six-digit authenticator code for the seeded development secret (RFC 6238:
// HMAC-SHA1, 30-second steps), for `_second-factor.yaml`.
//
// Plain JavaScript on purpose. Maestro runs this in its own script engine,
// which has no crypto module, so SHA-1 is written out here. The web QA twin is
// `scripts/qa-web/totp.ts`, and `tests/maestro-totp.test.ts` checks that both
// give the same code.
//
// Reads SECRET (base32) from the calling flow's env and writes `output.totp`.

/* global output, SECRET, module */

function base32Bytes(secret) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var clean = secret.replace(/[\s=]/g, '').toUpperCase();
  var bytes = [];
  var buffer = 0;
  var bits = 0;
  for (var i = 0; i < clean.length; i++) {
    var value = alphabet.indexOf(clean.charAt(i));
    if (value < 0) throw new Error('The authenticator secret is not base32');
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  return bytes;
}

function rotl(value, count) {
  return ((value << count) | (value >>> (32 - count))) >>> 0;
}

function sha1(bytes) {
  var message = bytes.slice();
  var bitLength = bytes.length * 8;
  message.push(0x80);
  while (message.length % 64 !== 56) message.push(0);
  // The high 32 bits of the length are always zero for inputs this small.
  message.push(0, 0, 0, 0);
  message.push(
    (bitLength >>> 24) & 0xff,
    (bitLength >>> 16) & 0xff,
    (bitLength >>> 8) & 0xff,
    bitLength & 0xff,
  );

  var h0 = 0x67452301;
  var h1 = 0xefcdab89;
  var h2 = 0x98badcfe;
  var h3 = 0x10325476;
  var h4 = 0xc3d2e1f0;
  var words = [];
  for (var block = 0; block < message.length; block += 64) {
    for (var t = 0; t < 16; t++) {
      var at = block + t * 4;
      words[t] =
        ((message[at] << 24) |
          (message[at + 1] << 16) |
          (message[at + 2] << 8) |
          message[at + 3]) >>>
        0;
    }
    for (t = 16; t < 80; t++) {
      words[t] = rotl(words[t - 3] ^ words[t - 8] ^ words[t - 14] ^ words[t - 16], 1);
    }
    var a = h0;
    var b = h1;
    var c = h2;
    var d = h3;
    var e = h4;
    for (t = 0; t < 80; t++) {
      var f;
      var k;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      var next = (rotl(a, 5) + (f >>> 0) + e + k + words[t]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = next;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  var digest = [];
  [h0, h1, h2, h3, h4].forEach(function (word) {
    digest.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
  });
  return digest;
}

function hmacSha1(key, message) {
  var block = key.length > 64 ? sha1(key) : key.slice();
  while (block.length < 64) block.push(0);
  var inner = [];
  var outer = [];
  for (var i = 0; i < 64; i++) {
    inner.push(block[i] ^ 0x36);
    outer.push(block[i] ^ 0x5c);
  }
  return sha1(outer.concat(sha1(inner.concat(message))));
}

function totpCode(secret, nowMs) {
  // A 30-second step count fits in 32 bits until the year 6053, so the high
  // half of the 8-byte counter is zero.
  var step = Math.floor(nowMs / 1000 / 30);
  var counter = [
    0,
    0,
    0,
    0,
    (step >>> 24) & 0xff,
    (step >>> 16) & 0xff,
    (step >>> 8) & 0xff,
    step & 0xff,
  ];
  var digest = hmacSha1(base32Bytes(secret), counter);
  var offset = digest[digest.length - 1] & 0x0f;
  var binary =
    (((digest[offset] & 0x7f) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) %
    1000000;
  var code = String(binary);
  while (code.length < 6) code = '0' + code;
  return code;
}

if (typeof output !== 'undefined') {
  output.totp = totpCode(SECRET, Date.now());
}
if (typeof module !== 'undefined') {
  module.exports = { totpCode: totpCode };
}
