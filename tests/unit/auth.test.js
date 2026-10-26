import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import authService from '../../src/modules/auth/auth.service.js';
import authSchemas from '../../src/modules/auth/auth.schemas.js';

const { BCRYPT_COST, hashPassword, verifyPassword } = authService;
const { registerSchema, loginSchema } = authSchemas;

describe('auth password hashing', () => {
  it('hashes with bcrypt cost 12 and never stores the plaintext', async () => {
    const password = 'QueueDemo2026!';
    const hash = await hashPassword(password);

    expect(hash.startsWith('$2')).toBe(true);
    expect(bcrypt.getRounds(hash)).toBe(BCRYPT_COST);
    expect(hash).not.toContain(password);
  });

  it('verifies the matching password and rejects a wrong one', async () => {
    const hash = await hashPassword('QueueDemo2026!');

    await expect(verifyPassword('QueueDemo2026!', hash)).resolves.toBe(true);
    await expect(verifyPassword('WrongPassword2026!', hash)).resolves.toBe(false);
  });
});

describe('auth schemas', () => {
  const validRegister = {
    fullName: '  Alex Reyes  ',
    studentNo: '2026-0001',
    email: 'alex@my.cspc.edu.ph',
    password: 'QueueDemo2026!',
    confirmPassword: 'QueueDemo2026!',
    policy: 'agreed',
  };

  it('rejects a bad email and a password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      email: 'not-an-email',
      password: 'short12',
      confirmPassword: 'short12',
    });

    expect(result.success).toBe(false);
    const fields = result.error.issues.map((issue) => issue.path.join('.'));
    expect(fields).toContain('email');
    expect(fields).toContain('password');
  });

  it('accepts a valid payload and trims the full name', () => {
    const result = registerSchema.safeParse(validRegister);

    expect(result.success).toBe(true);
    expect(result.data.fullName).toBe('Alex Reyes');
    expect(result.data.email).toBe('alex@my.cspc.edu.ph');
  });

  it('rejects a confirmation that does not match', () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      confirmPassword: 'AnotherPassword2026!',
    });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toContain('confirmPassword');
  });

  it('rejects a registration without accepting the policy', () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      policy: undefined,
    });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toContain('policy');
  });

  it('requires an email and password on login', () => {
    const result = loginSchema.safeParse({ email: 'bad', password: '' });

    expect(result.success).toBe(false);
    expect(result.error.issues.length).toBeGreaterThan(0);
  });
});
