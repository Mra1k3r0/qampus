import { describe, it, expect, afterEach, vi } from 'vitest';
import dbModule from '../../src/core/db.js';
import mailerModule from '../../src/core/mailer/index.js';
import cryptoModule from '../../src/core/mailer/crypto.js';
import outboxModule from '../../src/core/mailer/outbox.js';
import renderModule from '../../src/core/mailer/render.js';

const { openDatabase, migrate } = dbModule;
const { createMailer } = mailerModule;
const { seal, open } = cryptoModule;
const { enqueueMail, runMailOutbox } = outboxModule;
const { createRenderer } = renderModule;

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const CODE = '12345678';
const EXPIRES_AT = '2026-10-27T04:00:00.000Z';
const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

function freshDatabase() {
  const db = openDatabase(':memory:', { journalMode: 'DELETE' });
  migrate(db);
  return db;
}

function outboxRow(db, id) {
  return db.prepare('SELECT * FROM mail_outbox WHERE id = ?').get(id);
}

async function flush() {
  await Promise.resolve();
}

describe('mail encryption', () => {
  it('round trips a payload through AES-256-GCM', () => {
    const sealed = seal(JSON.stringify({ code: CODE }), ENCRYPTION_KEY);

    expect(sealed.iv).not.toBe('');
    expect(sealed.tag).not.toBe('');
    expect(sealed.ciphertext).not.toContain(CODE);
    expect(open(sealed, ENCRYPTION_KEY)).toBe(JSON.stringify({ code: CODE }));
  });

  it('rejects a payload when the auth tag does not match', () => {
    const sealed = seal('sensitive', ENCRYPTION_KEY);
    const tampered = { ...sealed, tag: Buffer.alloc(16, 1).toString('base64') };

    expect(() => open(tampered, ENCRYPTION_KEY)).toThrow();
  });

  it('rejects an encryption key that is not 32 bytes', () => {
    expect(() => seal('sensitive', Buffer.alloc(16, 1).toString('base64'))).toThrow();
  });
});

describe('memory mailer', () => {
  it('captures messages and returns an id', async () => {
    const mailer = createMailer({ mail: { driver: 'memory' } }, { logger: silentLogger });

    const result = await mailer.send({
      to: 'student@example.com',
      subject: 'Your Qampus verification code',
      html: '<p>12345678</p>',
      text: '12345678',
      idempotencyKey: 'outbox-1',
    });

    expect(result.id).toBeTruthy();
    expect(mailer.messages).toHaveLength(1);
    expect(mailer.messages[0]).toMatchObject({
      to: 'student@example.com',
      subject: 'Your Qampus verification code',
      idempotencyKey: 'outbox-1',
    });
  });
});

describe('brevo mailer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to the transactional endpoint and returns the provider id on 201', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: 'brevo-123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const mailer = createMailer(
      {
        mail: {
          driver: 'brevo',
          from: 'Qampus <no-reply@mail.qampus.dpdns.org>',
          replyTo: '',
          brevoApiKey: 'api-key-value',
        },
      },
      { logger: silentLogger },
    );

    const result = await mailer.send({
      to: 'student@example.com',
      subject: 'Your Qampus verification code',
      html: '<p>12345678</p>',
      text: '12345678',
      idempotencyKey: 'outbox-9',
    });

    expect(result).toEqual({ id: 'brevo-123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.method).toBe('POST');
    expect(init.headers['api-key']).toBe('api-key-value');
    expect(init.headers.IdempotencyKey).toBe('outbox-9');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body);
    expect(body.subject).toBe('Your Qampus verification code');
    expect(body.htmlContent).toContain('12345678');
  });

  it('throws a retryable error on a 500 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'upstream down',
      json: async () => ({ message: 'upstream down' }),
    }));

    const mailer = createMailer(
      {
        mail: {
          driver: 'brevo',
          from: 'Qampus <no-reply@mail.qampus.dpdns.org>',
          replyTo: '',
          brevoApiKey: 'api-key-value',
        },
      },
      { logger: silentLogger },
    );

    const error = await mailer.send({
      to: 'student@example.com',
      subject: 'Your Qampus verification code',
      html: '<p>12345678</p>',
      text: '12345678',
    }).catch((err) => err);

    expect(error.status).toBe(500);
    expect(error.retryable).toBe(true);
  });
});

describe('mail outbox', () => {
  it('sends a queued message and nulls the encrypted payload', async () => {
    const db = freshDatabase();
    const mailer = createMailer({ mail: { driver: 'memory' } }, { logger: silentLogger });
    const render = ({ data }) => ({ html: `<p>${data.code}</p>`, text: data.code });

    const id = enqueueMail(
      db,
      {
        to: 'student@example.com',
        template: 'verify-code',
        subject: 'Your Qampus verification code',
        data: { code: CODE, expiresAt: EXPIRES_AT },
      },
      { encryptionKey: ENCRYPTION_KEY },
    );

    const result = await runMailOutbox({
      db,
      mailer,
      render,
      logger: silentLogger,
      encryptionKey: ENCRYPTION_KEY,
    });

    expect(result.processed).toBe(1);
    expect(mailer.messages).toHaveLength(1);
    expect(mailer.messages[0].text).toBe(CODE);

    const row = outboxRow(db, id);
    expect(row.status).toBe('sent');
    expect(row.attempts).toBe(1);
    expect(row.provider_message_id).toBeTruthy();
    expect(row.sent_at).toBeTruthy();
    expect(row.payload_ciphertext).toBeNull();
    expect(row.payload_iv).toBeNull();
    expect(row.payload_tag).toBeNull();
    db.close();
  });

  it('keeps the payload encrypted and stores no plaintext code', () => {
    const db = freshDatabase();

    const id = enqueueMail(
      db,
      {
        to: 'student@example.com',
        template: 'verify-code',
        subject: 'Your Qampus verification code',
        data: { code: CODE, expiresAt: EXPIRES_AT },
      },
      { encryptionKey: ENCRYPTION_KEY },
    );

    const row = outboxRow(db, id);
    const storedValues = [
      row.payload_ciphertext,
      row.payload_iv,
      row.payload_tag,
      row.last_error || '',
    ].join(' ');

    expect(row.status).toBe('pending');
    expect(storedValues).not.toContain(CODE);
    expect(open({
      ciphertext: row.payload_ciphertext,
      iv: row.payload_iv,
      tag: row.payload_tag,
    }, ENCRYPTION_KEY)).toContain(CODE);
    db.close();
  });

  it('returns a 5xx failure to pending with a future retry time', async () => {
    const db = freshDatabase();
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('mail server error'), {
      status: 503,
      retryable: true,
    }));
    const mailer = { send };

    const id = enqueueMail(
      db,
      {
        to: 'student@example.com',
        template: 'password-changed',
        subject: 'Your Qampus password was changed',
        data: {},
      },
      { encryptionKey: ENCRYPTION_KEY },
    );

    const result = await runMailOutbox({
      db,
      mailer,
      render: () => ({ html: '<p>changed</p>', text: 'changed' }),
      logger: silentLogger,
      encryptionKey: ENCRYPTION_KEY,
    });

    expect(result.processed).toBe(1);
    const row = outboxRow(db, id);
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(row.last_error).toContain('mail server error');
    expect(new Date(row.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
    expect(row.payload_ciphertext).not.toBeNull();

    await runMailOutbox({
      db,
      mailer,
      render: () => ({ html: '<p>changed</p>', text: 'changed' }),
      logger: silentLogger,
      encryptionKey: ENCRYPTION_KEY,
    });
    expect(send).toHaveBeenCalledTimes(1);
    db.close();
  });
});

describe('email renderer', () => {
  it('renders the code and expiry from the template data', async () => {
    const render = createRenderer();

    const result = await render({
      template: 'verify-code',
      data: { code: CODE, expiresAt: EXPIRES_AT },
    });

    expect(result.html).toContain(CODE);
    expect(result.html).toContain('600px');
    expect(result.text).toContain(CODE);
    expect(result.text).toContain('10 minutes');
    expect(result.text).toContain('PHT');
    await flush();
  });
});
