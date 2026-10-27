const config = require('../../src/config');
const { createApp } = require('../../src/app');
const { createMemoryMailer } = require('../../src/core/mailer/memory');

function buildTestConfig(overrides = {}) {
  return {
    ...config,
    isProduction: false,
    isTest: true,
    logLevel: 'silent',
    cookieSecure: false,
    port: 0,
    sessionSecret: 'test-session-secret-with-enough-length-123456',
    ...overrides,
  };
}

function createTestApp(db, overrides = {}) {
  const mailer = createMemoryMailer();
  const testConfig = buildTestConfig({
    ...overrides,
    mail: {
      ...config.mail,
      driver: 'memory',
      ...(overrides.mail || {}),
    },
  });
  return { app: createApp({ db, config: testConfig, mailer }), config: testConfig, mailer };
}

module.exports = {
  buildTestConfig,
  createTestApp,
};
