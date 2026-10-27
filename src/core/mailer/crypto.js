const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

function decodeKey(encryptionKey) {
  const key = Buffer.from(String(encryptionKey || ''), 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error('MAIL_ENCRYPTION_KEY must decode to 32 bytes.');
  }
  return key;
}

function seal(plaintext, encryptionKey) {
  const key = decodeKey(encryptionKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

function open(payload, encryptionKey) {
  const key = decodeKey(encryptionKey);
  const iv = Buffer.from(String(payload && payload.iv), 'base64');
  const tag = Buffer.from(String(payload && payload.tag), 'base64');

  if (!payload || !payload.ciphertext) {
    throw new Error('Encrypted payload is incomplete.');
  }
  if (iv.length !== IV_BYTES) {
    throw new Error('Encrypted payload IV is invalid.');
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error('Encrypted payload tag is invalid.');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(String(payload.ciphertext), 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

module.exports = {
  seal,
  open,
};
