module.exports = {
  test: {
    environment: 'node',
    setupFiles: ['tests/helpers/env.js'],
    globalSetup: ['tests/helpers/global.js'],
    pool: 'forks',
    include: ['tests/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 20000,
    restoreMocks: true,
  },
};
