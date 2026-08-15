import { z } from 'zod';

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use dates in YYYY-MM-DD format.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Enter a valid date.');

export const emailSchema = z.string().trim().email('Enter a valid email address.').max(254);

export const authCredentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const newAccountSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters.').max(1024),
  displayName: z.string().trim().min(1, 'Enter a display name.').max(100),
});

export const newPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(1024);

export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^TRIP-[A-Z0-9]{4,12}$/, 'Enter a valid TripTrack invite code.');

export const tripCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a trip name.').max(120, 'Trip name is too long.'),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .refine(({ startDate, endDate }) => !startDate || !endDate || endDate >= startDate, {
    message: 'End date must be on or after the start date.',
    path: ['endDate'],
  });

export const validationMessage = (result: { error: z.ZodError }): string =>
  result.error.issues[0]?.message ?? 'Check the entered values and try again.';
