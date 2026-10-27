import { afterEach, describe, expect, it } from 'vitest';
import dbScript from '../../scripts/db.js';

const { resetDatabase } = dbScript;

const originalNodeEnv = process.env.NODE_ENV;
const originalOverride = process.env.ALLOW_DEMO_RESET;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalOverride === undefined) {
    delete process.env.ALLOW_DEMO_RESET;
  } else {
    process.env.ALLOW_DEMO_RESET = originalOverride;
  }
});

describe('demo database reset guard', () => {
  it('refuses to delete the database in production without an explicit override', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEMO_RESET;

    expect(() => resetDatabase()).toThrow(
      'Refusing to reset the demo database in production. Set ALLOW_DEMO_RESET=1 to override.',
    );
  });
});
