const crypto = require('node:crypto');

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 2000;
const USER_AGENT = 'Qampus-Password-Safety/1.0';
const LEAKED_PASSWORD_MESSAGE = 'This password has appeared in a data breach. Choose a different one.';

function sha1Hex(value) {
  return crypto.createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

async function isPasswordLeaked(password) {
  const hash = sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const response = await globalThis.fetch(`${RANGE_URL}${prefix}`, {
      headers: {
        'Add-Padding': 'true',
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return false;
    }

    const body = await response.text();
    for (const line of body.split(/\r?\n/)) {
      const separator = line.indexOf(':');
      if (separator === -1) {
        continue;
      }
      const candidate = line.slice(0, separator).trim().toUpperCase();
      const count = Number.parseInt(line.slice(separator + 1), 10);
      if (candidate === suffix && count > 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

module.exports = {
  isPasswordLeaked,
  LEAKED_PASSWORD_MESSAGE,
};
