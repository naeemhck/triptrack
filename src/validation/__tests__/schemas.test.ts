import {
  authCredentialsSchema,
  inviteCodeSchema,
  newAccountSchema,
  tripCreateSchema,
} from '../schemas';

describe('authentication schemas', () => {
  it('normalizes valid email credentials', () => {
    expect(
      authCredentialsSchema.parse({ email: '  traveler@example.com ', password: 'secret' }),
    ).toEqual({ email: 'traveler@example.com', password: 'secret' });
  });

  it('requires a valid email and a stronger new-account password', () => {
    expect(authCredentialsSchema.safeParse({ email: 'invalid', password: '' }).success).toBe(false);
    expect(
      newAccountSchema.safeParse({
        email: 'traveler@example.com',
        password: 'short',
        displayName: 'Traveler',
      }).success,
    ).toBe(false);
  });
});

describe('trip schemas', () => {
  it('normalizes canonical invite codes', () => {
    expect(inviteCodeSchema.parse(' trip-ab12 ')).toBe('TRIP-AB12');
  });

  it('rejects malformed invite codes', () => {
    expect(inviteCodeSchema.safeParse('AB12').success).toBe(false);
    expect(inviteCodeSchema.safeParse('TRIP-!BAD').success).toBe(false);
  });

  it('normalizes a valid trip and enforces date order', () => {
    expect(
      tripCreateSchema.parse({
        name: '  Coastal Run ',
        startDate: '2026-08-15',
        endDate: '2026-08-22',
      }),
    ).toEqual({ name: 'Coastal Run', startDate: '2026-08-15', endDate: '2026-08-22' });
    expect(
      tripCreateSchema.safeParse({
        name: 'Coastal Run',
        startDate: '2026-08-22',
        endDate: '2026-08-15',
      }).success,
    ).toBe(false);
  });
});
