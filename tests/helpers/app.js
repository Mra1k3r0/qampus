const config = require('../../src/config');
const { createApp } = require('../../src/app');

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
  const testConfig = buildTestConfig(overrides);
  return { app: createApp({ db, config: testConfig }), config: testConfig };
}

module.exports = {
  buildTestConfig,
  createTestApp,
};
