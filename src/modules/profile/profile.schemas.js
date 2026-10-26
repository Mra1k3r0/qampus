const { z } = require('zod');
const { isPresetKey } = require('./profile.avatars');

const FULL_NAME_PATTERN = /^[A-Za-z .'-]+$/;

const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your full name.')
  .max(80, 'Full name must be 80 characters or fewer.')
  .regex(
    FULL_NAME_PATTERN,
    'Use only letters, spaces, periods, hyphens, and apostrophes.',
  );

const updateProfileSchema = z.object({
  fullName: fullNameSchema,
});

const presetAvatarSchema = z.object({
  preset: z
    .string()
    .refine(isPresetKey, 'Choose one of the profile pictures.'),
});

module.exports = {
  FULL_NAME_PATTERN,
  updateProfileSchema,
  presetAvatarSchema,
};
