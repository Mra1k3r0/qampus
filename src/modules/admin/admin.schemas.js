const { z } = require('zod');

const positiveId = z.coerce.number().int().positive();

const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM in 24-hour time.');

const serviceParamsSchema = z.object({ id: positiveId });

const updateServiceSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Enter the window name.')
      .max(80, 'Window name must be 80 characters or fewer.'),
    description: z
      .string()
      .trim()
      .max(240, 'Description must be 240 characters or fewer.')
      .default(''),
    avgMinutes: z.coerce
      .number()
      .int('Average wait must be a whole number.')
      .min(1, 'Average wait must be at least 1 minute.')
      .max(120, 'Average wait must be 120 minutes or fewer.'),
    opensAt: timeSchema,
    closesAt: timeSchema,
    isOpen: z.preprocess(
      (value) => value === '1' || value === 'on' || value === true,
      z.boolean(),
    ),
  })
  .refine((data) => data.opensAt < data.closesAt, {
    path: ['closesAt'],
    message: 'Closing time must be after opening time.',
  });

const staffParamsSchema = z.object({ id: positiveId });

const staffNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter the staff name.')
  .max(80, 'Full name must be 80 characters or fewer.');

const staffEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Enter an email address.')
  .max(160, 'Email must be 160 characters or fewer.')
  .email('Enter a valid email address.');

const staffPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(200, 'Password must be 200 characters or fewer.');

const createStaffSchema = z.object({
  full_name: staffNameSchema,
  email: staffEmailSchema,
  password: staffPasswordSchema,
});

const updateStaffSchema = z.object({
  full_name: staffNameSchema,
  email: staffEmailSchema,
});

const resetStaffPasswordSchema = z.object({
  password: staffPasswordSchema,
});

const staffStatusSchema = z.object({
  isActive: z
    .string()
    .refine((value) => value === '0' || value === '1', 'Choose an account status.'),
});

module.exports = {
  serviceParamsSchema,
  updateServiceSchema,
  staffParamsSchema,
  createStaffSchema,
  updateStaffSchema,
  resetStaffPasswordSchema,
  staffStatusSchema,
};
