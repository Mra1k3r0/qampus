const crypto = require('node:crypto');
const path = require('node:path');
const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const DEFAULT_PORT = 3000;
const DEFAULT_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const DEFAULT_REMEMBER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_SESSION_SECRET_LENGTH = 32;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const MAIL_DRIVERS = Object.freeze(['memory', 'ethereal', 'brevo']);
const DEFAULT_MAIL_DRIVER = isTest ? 'memory' : 'ethereal';
const DEFAULT_MAIL_FROM = 'Qampus <no-reply@mail.qampus.dpdns.org>';
const DEFAULT_OTP_TTL_MINUTES = 10;
const DEFAULT_OTP_MAX_ATTEMPTS = 5;
const DEFAULT_OTP_RESEND_COOLDOWN_SECONDS = 60;
const ENCRYPTION_KEY_BYTES = 32;
const MIN_AUTH_PEPPER_LENGTH = 32;
const REQUIRED_PRODUCTION_MAIL_ENV = [
  'BREVO_API_KEY',
  'MAIL_FROM',
  'MAIL_ENCRYPTION_KEY',
  'AUTH_PEPPER',
  'PUBLIC_BASE_URL',
];

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value) {
  return value === 'true' || value === '1';
}

const sessionSecret = process.env.SESSION_SECRET || 'development-only-secret-change-me-please';
const requestedCookieSecure = parseBoolean(process.env.COOKIE_SECURE);
const cookieSecure = isProduction ? true : requestedCookieSecure;
const queueEnforceHours = process.env.QUEUE_ENFORCE_HOURS === undefined
  ? true
  : parseBoolean(process.env.QUEUE_ENFORCE_HOURS);
const passwordLeakCheck = process.env.PASSWORD_LEAK_CHECK === undefined
  ? !isTest
  : parseBoolean(process.env.PASSWORD_LEAK_CHECK);

if (isProduction && sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
  throw new Error('SESSION_SECRET must be at least 32 characters in production.');
}

if (isProduction && process.env.COOKIE_SECURE === 'false') {
  throw new Error('COOKIE_SECURE cannot be false in production.');
}

function deriveDevSecret(secret, purpose) {
  return crypto.createHash('sha256').update(`${purpose}:${secret}`).digest('base64');
}

function deriveDevPepper(secret) {
  return crypto.createHash('sha256').update(`auth-pepper:${secret}`).digest('hex');
}

const mailDriver = (process.env.MAIL_DRIVER || DEFAULT_MAIL_DRIVER).toLowerCase();
if (!MAIL_DRIVERS.includes(mailDriver)) {
  throw new Error(`MAIL_DRIVER must be one of: ${MAIL_DRIVERS.join(', ')}.`);
}

const mailFrom = process.env.MAIL_FROM || (isProduction ? '' : DEFAULT_MAIL_FROM);
const mailEncryptionKey = process.env.MAIL_ENCRYPTION_KEY
  || (isProduction ? '' : deriveDevSecret(sessionSecret, 'mail-encryption'));
const authPepper = process.env.AUTH_PEPPER
  || (isProduction ? '' : deriveDevPepper(sessionSecret));

if (isProduction) {
  if (mailDriver !== 'brevo') {
    throw new Error('MAIL_DRIVER must be brevo in production.');
  }

  const missing = REQUIRED_PRODUCTION_MAIL_ENV.filter(
    (name) => !String(process.env[name] || '').trim(),
  );
  if (missing.length > 0) {
    throw new Error(`Missing required production environment: ${missing.join(', ')}.`);
  }

  if (Buffer.from(mailEncryptionKey, 'base64').length !== ENCRYPTION_KEY_BYTES) {
    throw new Error('MAIL_ENCRYPTION_KEY must be a 32-byte base64 value in production.');
  }

  if (authPepper.length < MIN_AUTH_PEPPER_LENGTH) {
    throw new Error('AUTH_PEPPER must be at least 32 characters in production.');
  }
}

const port = parseInteger(process.env.PORT || process.env.SERVER_PORT, DEFAULT_PORT);
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');

const config = {
  appName: 'Qampus',
  projectRoot,
  isProduction,
  isTest,
  port,
  publicBaseUrl,
  databasePath: path.resolve(projectRoot, process.env.DATABASE_PATH || 'data/cspc_queue.sqlite'),
  avatarUploadDir: path.resolve(projectRoot, 'data/uploads/avatars'),
  avatarMaxBytes: AVATAR_MAX_BYTES,
  sessionSecret,
  cookieName: process.env.COOKIE_NAME || 'cspc_queue.sid',
  sessionMaxAgeMs: parseInteger(process.env.SESSION_MAX_AGE_MS, DEFAULT_SESSION_MAX_AGE_MS),
  sessionRememberMaxAgeMs: parseInteger(
    process.env.SESSION_REMEMBER_MAX_AGE_MS,
    DEFAULT_REMEMBER_MAX_AGE_MS,
  ),
  logLevel: isTest ? 'silent' : process.env.LOG_LEVEL || 'info',
  cookieSecure,
  queueEnforceHours,
  passwordLeakCheck,
  mail: {
    driver: mailDriver,
    from: mailFrom,
    replyTo: process.env.MAIL_REPLY_TO || '',
    brevoApiKey: process.env.BREVO_API_KEY || '',
    encryptionKey: mailEncryptionKey,
    authPepper,
    ttlMinutes: parseInteger(process.env.OTP_TTL_MINUTES, DEFAULT_OTP_TTL_MINUTES),
    maxAttempts: parseInteger(process.env.OTP_MAX_ATTEMPTS, DEFAULT_OTP_MAX_ATTEMPTS),
    resendCooldownSeconds: parseInteger(
      process.env.OTP_RESEND_COOLDOWN_SECONDS,
      DEFAULT_OTP_RESEND_COOLDOWN_SECONDS,
    ),
  },
};

module.exports = config;
