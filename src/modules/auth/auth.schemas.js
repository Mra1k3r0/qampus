const { z } = require('zod');

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your full name.')
  .max(80, 'Full name must be 80 characters or fewer.');

const studentNoSchema = z
  .string()
  .trim()
  .min(4, 'Enter your student number.')
  .max(20, 'Student number must be 20 characters or fewer.')
  .regex(/^[A-Za-z0-9-]+$/, 'Student number may only contain letters, numbers, and hyphens.');

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Enter your email address.')
  .max(160, 'Email must be 160 characters or fewer.')
  .email('Enter a valid email address.');

const passwordSchema = z
  .string()
  .min(8, 'Password must have at least 8 characters, including a letter and a number.')
  .max(200, 'Password must be 200 characters or fewer.')
  .refine(
    (value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value),
    'Password must have at least 8 characters, including a letter and a number.',
  );

const policySchema = z.literal('agreed', {
  errorMap: () => ({ message: 'Agree to the Terms of Use and Privacy Policy to continue.' }),
});

const registerSchema = z
  .object({
    fullName: nameSchema,
    studentNo: studentNoSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password.'),
    policy: policySchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200, 'Password is too long.'),
  portal: z.enum(['student', 'staff', 'admin']).optional(),
  remember: z.literal('on').optional(),
  next: z.string().optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
};
