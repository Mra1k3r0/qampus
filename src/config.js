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
};

module.exports = config;
