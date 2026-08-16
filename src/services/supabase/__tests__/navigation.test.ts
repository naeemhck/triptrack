import { supabase } from '../../../config/supabase';
import { calculateRoute, savePlannedRoute, searchPlaces } from '../navigation';

jest.mock('../../../config/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    rpc: jest.fn(),
  },
}));

const mockInvoke = supabase.functions.invoke as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

describe('navigation service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('normalizes Photon-compatible place results', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        results: [
          {
            id: '1',
            label: 'Fuel stop',
            detail: 'Lahore, Pakistan',
            latitude: 31.5,
            longitude: 74.3,
          },
        ],
      },
      error: null,
    });
    await expect(searchPlaces('trip-1', 'fuel')).resolves.toEqual([
      {
        id: '1',
        title: 'Fuel stop',
        subtitle: 'Lahore, Pakistan',
        latitude: 31.5,
        longitude: 74.3,
      },
    ]);
  });

  it('normalizes sanitized OSRM route data', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        origin: { latitude: 1, longitude: 2, name: 'Leader' },
        destination: { latitude: 3, longitude: 4, name: 'Finish' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [2, 1],
            [4, 3],
          ],
        },
        points: [
          { sequence: 0, latitude: 1, longitude: 2, cumulative_distance_meters: 0 },
          { sequence: 1, latitude: 3, longitude: 4, cumulative_distance_meters: 100 },
        ],
        waypoints: [],
        steps: [],
        distanceMeters: 100,
        durationSeconds: 20,
        routingProvider: 'osrm',
      },
      error: null,
    });
    const route = await calculateRoute(
      'trip-1',
      null,
      { latitude: 3, longitude: 4, title: 'Finish' },
      [],
    );
    expect(route.origin.title).toBe('Leader');
    expect(route.points[1].cumulativeDistanceMeters).toBe(100);
  });

  it('saves only normalized route fields through the transactional RPC', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'route-1' }, error: null });
    const id = await savePlannedRoute('trip-1', {
      origin: { latitude: 1, longitude: 2, title: 'Start' },
      destination: { latitude: 3, longitude: 4, title: 'Finish' },
      geometryGeoJson: {
        type: 'LineString',
        coordinates: [
          [2, 1],
          [4, 3],
        ],
      },
      distanceMeters: 100,
      durationSeconds: 20,
      routingProvider: 'osrm',
      points: [
        { sequence: 0, latitude: 1, longitude: 2, cumulativeDistanceMeters: 0 },
        { sequence: 1, latitude: 3, longitude: 4, cumulativeDistanceMeters: 100 },
      ],
      waypoints: [],
      steps: [],
    });
    expect(id).toBe('route-1');
    expect(mockRpc).toHaveBeenCalledWith(
      'save_trip_planned_route',
      expect.objectContaining({
        p_trip_id: 'trip-1',
        p_distance_meters: 100,
      }),
    );
  });
});
