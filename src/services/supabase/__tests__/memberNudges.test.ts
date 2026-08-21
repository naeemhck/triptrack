import {
  isNudgeRateLimited,
  listTripNudges,
  NUDGE_RATE_LIMIT_MS,
  nudgeMember,
} from '../memberNudges';

jest.mock('../../../config/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

import { supabase } from '../../../config/supabase';

const client = supabase as jest.Mocked<typeof supabase>;

describe('nudgeMember', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls the RPC with trip and target ids', async () => {
    (client.rpc as jest.Mock).mockResolvedValue({ data: 'event-1', error: null });

    await expect(nudgeMember('trip-1', 'user-2')).resolves.toBe('event-1');
    expect(client.rpc).toHaveBeenCalledWith('send_member_nudge', {
      p_trip_id: 'trip-1',
      p_to_user_id: 'user-2',
    });
  });

  it('propagates RPC errors (rate limit, membership, inactive trip)', async () => {
    (client.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'This member was nudged recently; wait a few minutes' },
    });

    await expect(nudgeMember('trip-1', 'user-2')).rejects.toMatchObject({
      message: expect.stringContaining('nudged recently'),
    });
  });
});

describe('listTripNudges', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps snake_case rows to client shape', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'event-1',
            trip_id: 'trip-1',
            from_user_id: 'user-1',
            to_user_id: 'user-2',
            created_at: '2026-08-21T00:00:00.000Z',
          },
        ],
        error: null,
      }),
    };
    (client.from as jest.Mock).mockReturnValueOnce(query);

    const nudges = await listTripNudges('trip-1');

    expect(nudges).toEqual([
      {
        id: 'event-1',
        tripId: 'trip-1',
        fromUserId: 'user-1',
        toUserId: 'user-2',
        createdAt: '2026-08-21T00:00:00.000Z',
      },
    ]);
    expect(query.eq).toHaveBeenCalledWith('trip_id', 'trip-1');
  });
});

describe('isNudgeRateLimited', () => {
  const base = Date.now();
  const nudges = [
    {
      id: 'event-1',
      tripId: 'trip-1',
      fromUserId: 'user-1',
      toUserId: 'user-2',
      createdAt: new Date(base - 60_000).toISOString(),
    },
    {
      id: 'event-2',
      tripId: 'trip-1',
      fromUserId: 'user-3',
      toUserId: 'user-2',
      createdAt: new Date(base - 60_000).toISOString(),
    },
  ];

  it('blocks a repeat nudge inside the window', () => {
    expect(isNudgeRateLimited(nudges, 'user-1', 'user-2', base)).toBe(true);
  });

  it('allows other senders and targets inside the window', () => {
    expect(isNudgeRateLimited(nudges, 'user-3', 'user-4', base)).toBe(false);
  });

  it('allows the same pair after the window elapses', () => {
    expect(isNudgeRateLimited(nudges, 'user-1', 'user-2', base + NUDGE_RATE_LIMIT_MS)).toBe(false);
  });

  it('ignores empty history', () => {
    expect(isNudgeRateLimited([], 'user-1', 'user-2', base)).toBe(false);
  });
});
