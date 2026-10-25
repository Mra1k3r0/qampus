const fs = require('node:fs');
const path = require('node:path');

const TMP_DIR = path.join(__dirname, '..', '.tmp');

module.exports = async function globalSetup() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  return async function globalTeardown() {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  };
};
