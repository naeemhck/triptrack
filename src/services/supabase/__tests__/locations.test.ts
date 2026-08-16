import { supabase } from '../../../config/supabase';
import { upsertLocation } from '../locations';

jest.mock('../../../config/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

describe('V2 location service', () => {
  it('uses the separate V2 RPC while preserving the stable sample id', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });

    await upsertLocation(
      'trip-1',
      'user-1',
      { lat: 1, lng: 2, accuracy: 5, sampledAt: 1000, speedMps: 12, heading: 90 },
      'sample-1',
      true,
    );

    expect(supabase.rpc).toHaveBeenCalledWith('submit_trip_location_v2', {
      p_trip_id: 'trip-1',
      p_sample_id: 'sample-1',
      p_latitude: 1,
      p_longitude: 2,
      p_accuracy: 5,
      p_sampled_at: new Date(1000).toISOString(),
      p_route_candidate: true,
      p_speed_mps: 12,
      p_heading: 90,
    });
  });
});
