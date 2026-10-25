const path = require('node:path');
const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const DEFAULT_PORT = 3000;
const DEFAULT_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const MIN_SESSION_SECRET_LENGTH = 32;

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

if (isProduction && sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
  throw new Error('SESSION_SECRET must be at least 32 characters in production.');
}

if (isProduction && process.env.COOKIE_SECURE === 'false') {
  throw new Error('COOKIE_SECURE cannot be false in production.');
}

const config = {
  appName: 'CSPC Student Queue',
  projectRoot,
  isProduction,
  isTest,
  port: parseInteger(process.env.PORT, DEFAULT_PORT),
  databasePath: path.resolve(projectRoot, process.env.DATABASE_PATH || 'data/cspc_queue.sqlite'),
  sessionSecret,
  cookieName: process.env.COOKIE_NAME || 'cspc_queue.sid',
  sessionMaxAgeMs: parseInteger(process.env.SESSION_MAX_AGE_MS, DEFAULT_SESSION_MAX_AGE_MS),
  logLevel: isTest ? 'silent' : process.env.LOG_LEVEL || 'info',
  cookieSecure,
  queueEnforceHours,
};

module.exports = config;
