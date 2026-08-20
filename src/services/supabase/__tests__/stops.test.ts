import { supabase } from '../../../config/supabase';
import { listStops } from '../stops';

jest.mock('../../../config/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../photos', () => ({
  getStopPhotoUrl: jest.fn().mockResolvedValue('https://example.test/photo.jpg'),
}));

const client = supabase as jest.Mocked<typeof supabase>;

const stopRow = {
  id: 's1',
  user_id: 'u1',
  trip_id: 't1',
  latitude: 1,
  longitude: 2,
  title: 'Lunch',
  source: 'manual',
  created_at: '2026-08-15T12:00:00Z',
  arrived_at: '2026-08-15T12:00:00Z',
  profiles: { display_name: 'Naeem', avatar_url: null },
};

const mockStopQuery = (result: { data: unknown; error: { message: string } | null }) => {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    order: jest.fn(async () => result),
  };
  return query;
};

describe('stop service reads', () => {
  beforeEach(() => jest.clearAllMocks());

  it('disambiguates the owner profile embed so activity can load stops', async () => {
    const query = mockStopQuery({ data: [stopRow], error: null });
    client.from.mockReturnValue(query);

    await expect(listStops('t1')).resolves.toEqual([
      expect.objectContaining({
        id: 's1',
        name: 'Lunch',
        displayName: 'Naeem',
        uid: 'u1',
      }),
    ]);
    expect(client.from).toHaveBeenCalledWith('trip_stops');
    expect(query.select).toHaveBeenCalledWith('*, profiles!user_id(display_name,avatar_url)');
  });

  it('falls back to an unembedded read when the profile join is unavailable', async () => {
    const failed = mockStopQuery({
      data: null,
      error: { message: 'Could not embed because more than one relationship was found' },
    });
    const fallback = mockStopQuery({
      data: [{ ...stopRow, profiles: undefined }],
      error: null,
    });
    client.from.mockReturnValueOnce(failed).mockReturnValueOnce(fallback);

    await expect(listStops('t1')).resolves.toEqual([
      expect.objectContaining({ id: 's1', name: 'Lunch', displayName: 'Traveler' }),
    ]);
    expect(fallback.select).toHaveBeenCalledWith('*');
  });
});
