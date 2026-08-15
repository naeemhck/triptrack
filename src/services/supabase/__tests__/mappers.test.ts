import { mapLocation, mapMember, mapStop, mapTrip, toIso, toMillis } from '../mappers';

describe('Supabase mappers', () => {
  it('converts between ISO and epoch time', () => {
    expect(toMillis('2026-08-14T12:00:00.000Z')).toBe(1786708800000);
    expect(toIso(1786708800000)).toBe('2026-08-14T12:00:00.000Z');
  });

  it('maps a trip and supplied member ids', () => {
    const trip = mapTrip(
      {
        id: 't1',
        name: 'Road',
        invite_code: 'ABC',
        created_by: 'u1',
        created_at: '2026-08-14T12:00:00Z',
        status: 'active',
      },
      ['u1'],
    );
    expect(trip).toMatchObject({
      id: 't1',
      inviteCode: 'ABC',
      memberIds: ['u1'],
      status: 'active',
    });
  });

  it('maps member defaults', () => {
    expect(
      mapMember({ user_id: 'u1', sharing_enabled: true, joined_at: '2026-08-14T12:00:00Z' }),
    ).toMatchObject({ uid: 'u1', displayName: 'Traveler', sharingEnabled: true });
  });

  it('maps location coordinates and membership state', () => {
    expect(
      mapLocation({
        user_id: 'u1',
        latitude: 1,
        longitude: 2,
        updated_at: '2026-08-14T12:00:00Z',
        trip_members: { sharing_enabled: false },
      }),
    ).toMatchObject({ uid: 'u1', lat: 1, lng: 2, sharingEnabled: false });
  });

  it('maps automatic stops', () => {
    expect(
      mapStop({
        id: 's1',
        user_id: 'u1',
        latitude: 1,
        longitude: 2,
        title: 'Cafe',
        source: 'automatic',
        created_at: '2026-08-14T12:00:00Z',
      }),
    ).toMatchObject({ id: 's1', name: 'Cafe', autoDetected: true, type: 'auto' });
  });

  it('keeps optional timestamps absent', () => {
    expect(toMillis(null)).toBeUndefined();
    expect(toIso(null)).toBeNull();
  });
});
