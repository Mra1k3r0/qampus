import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import passwordSafety from '../../src/core/password-safety.js';

const { isPasswordLeaked } = passwordSafety;

const PASSWORD = 'Password123!';
const HASH = createHash('sha1').update(PASSWORD).digest('hex').toUpperCase();
const PREFIX = HASH.slice(0, 5);
const SUFFIX = HASH.slice(5);
const ENDPOINT = `https://api.pwnedpasswords.com/range/${PREFIX}`;

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: async () => body,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('password safety', () => {
  it('returns true when the range response contains the password suffix with a count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(`${SUFFIX}:12\r\n0000000000000000000000000000000000:0`));
    vi.stubGlobal('fetch', fetchMock);

    await expect(isPasswordLeaked(PASSWORD)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, expect.objectContaining({
      headers: expect.objectContaining({
        'Add-Padding': 'true',
        'User-Agent': expect.any(String),
      }),
      signal: expect.anything(),
    }));
  });

  it('returns false when a padded suffix has a zero count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(`${SUFFIX}:0`)));

    await expect(isPasswordLeaked(PASSWORD)).resolves.toBe(false);
  });

  it('returns false when the range endpoint is not successful', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('', { ok: false, status: 503 })));

    await expect(isPasswordLeaked(PASSWORD)).resolves.toBe(false);
  });

  it('returns false when the network request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(isPasswordLeaked(PASSWORD)).resolves.toBe(false);
  });
});
