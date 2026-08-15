import { supabase } from '../../../config/supabase';
import {
  createTrip,
  getTripPreview,
  joinTrip,
  listMembers,
  listTrips,
  removeMember,
  runTripRpc,
  setSharing,
  setTimedSharing,
  updateTripAlertThresholds,
  getTripStatistics,
} from '../trips';

jest.mock('../../../config/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

const client = supabase as any;
const tripRow = {
  id: 'trip-1',
  name: 'Coastal Run',
  invite_code: 'TRIP-AB12',
  created_by: 'user-1',
  created_at: '2026-08-15T00:00:00Z',
  status: 'active',
};
const memberRow = {
  trip_id: 'trip-1',
  user_id: 'user-1',
  joined_at: '2026-08-15T00:00:00Z',
  sharing_enabled: true,
  profiles: { display_name: 'Traveler', avatar_url: null },
};

describe('Supabase trip service boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    client.rpc.mockResolvedValue({ data: tripRow, error: null });
  });

  it('normalizes validated trip creation input', async () => {
    await expect(createTrip(' Coastal Run ', '2026-08-15', '2026-08-22')).resolves.toMatchObject({
      id: 'trip-1',
      name: 'Coastal Run',
    });
    expect(client.rpc).toHaveBeenCalledWith('create_trip', {
      p_name: 'Coastal Run',
      p_start_date: '2026-08-15',
      p_end_date: '2026-08-22',
    });
    await expect(createTrip('', '2026-08-15', '2026-08-22')).rejects.toBeTruthy();
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('returns early when the user has no trip memberships', async () => {
    client.from.mockReturnValue({ select: jest.fn().mockResolvedValue({ data: [], error: null }) });
    await expect(listTrips()).resolves.toEqual([]);
  });

  it('builds one trip-card summary from batched member and activity reads', async () => {
    client.from.mockImplementation((table: string) => {
      if (table === 'trip_members') {
        return { select: jest.fn().mockResolvedValue({ data: [memberRow], error: null }) };
      }
      const rows =
        table === 'trips'
          ? [tripRow]
          : table === 'trip_stops'
            ? [
                {
                  trip_id: 'trip-1',
                  title: 'Lunch',
                  created_at: '2026-08-15T10:00:00Z',
                },
              ]
            : [{ trip_id: 'trip-1', updated_at: '2026-08-15T09:00:00Z' }];
      return {
        select: () => ({
          in: () => ({ order: async () => ({ data: rows, error: null }) }),
        }),
      };
    });

    await expect(listTrips()).resolves.toEqual([
      expect.objectContaining({ memberNames: ['Traveler'], latestActivity: 'Last stop: Lunch' }),
    ]);
  });

  it('maps member profile joins', async () => {
    client.from.mockReturnValue({
      select: () => ({
        eq: () => ({ order: async () => ({ data: [memberRow], error: null }) }),
      }),
    });
    await expect(listMembers('trip-1')).resolves.toEqual([
      expect.objectContaining({ uid: 'user-1', displayName: 'Traveler' }),
    ]);
  });

  it('normalizes preview and join invite codes', async () => {
    client.from.mockReturnValue({
      select: () => ({
        eq: () => ({ order: async () => ({ data: [memberRow], error: null }) }),
      }),
    });
    await expect(getTripPreview(' trip-ab12 ')).resolves.toMatchObject({ memberCount: 1 });
    await expect(joinTrip('trip-ab12')).resolves.toMatchObject({ id: 'trip-1' });
    expect(client.rpc).toHaveBeenCalledWith('preview_trip', { p_invite_code: 'TRIP-AB12' });
    expect(client.rpc).toHaveBeenCalledWith('join_trip', { p_invite_code: 'TRIP-AB12' });
    await expect(joinTrip('not-a-code')).rejects.toBeTruthy();
  });

  it('uses the authoritative sharing RPC for indefinite and timed modes', async () => {
    await setSharing('trip-1', true, 'foreground');
    await setTimedSharing('trip-1', 'always');
    expect(client.rpc).toHaveBeenCalledWith('set_trip_sharing', {
      p_trip_id: 'trip-1',
      p_mode: 'foreground',
      p_duration_minutes: null,
    });
    expect(client.rpc).toHaveBeenCalledWith('set_trip_sharing', {
      p_trip_id: 'trip-1',
      p_mode: 'always',
      p_duration_minutes: 120,
    });
  });

  it('maps statistics and updates bounded threshold inputs through RPCs', async () => {
    client.rpc.mockResolvedValueOnce({
      data: {
        elapsed_seconds: 600,
        route_distance_meters: 1200,
        stop_count: 2,
        stopped_seconds: 120,
        moving_seconds: 480,
      },
      error: null,
    });
    await expect(getTripStatistics('trip-1')).resolves.toMatchObject({
      elapsedSeconds: 600,
      movingSeconds: 480,
    });
    await updateTripAlertThresholds('trip-1', {
      warningDistanceMeters: 250,
      criticalDistanceMeters: 600,
    });
    expect(client.rpc).toHaveBeenLastCalledWith('update_trip_alert_thresholds', {
      p_trip_id: 'trip-1',
      p_warning_meters: 250,
      p_critical_meters: 600,
    });
  });

  it('invokes only allowlisted lifecycle and removal RPCs', async () => {
    await runTripRpc('start_trip', 'trip-1');
    await removeMember('trip-1', 'user-2');
    expect(client.rpc).toHaveBeenCalledWith('start_trip', { p_trip_id: 'trip-1' });
    expect(client.rpc).toHaveBeenCalledWith('remove_trip_member', {
      p_trip_id: 'trip-1',
      p_user_id: 'user-2',
    });
  });
});
