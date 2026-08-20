import {
  calculatePublicRoute,
  searchPublicPlaces,
  shouldUsePublicRoutingFallback,
} from '../openMapRouting';

describe('open map routing', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
  });

  it('falls back only for missing or unavailable routing configuration', () => {
    expect(
      shouldUsePublicRoutingFallback({ message: 'Routing service is not configured' }, null),
    ).toBe(true);
    expect(
      shouldUsePublicRoutingFallback(
        new Error('failed to send a request to the edge function'),
        {},
      ),
    ).toBe(true);
    expect(shouldUsePublicRoutingFallback(null, { error: 'Organizer required' })).toBe(false);
  });

  it('maps Photon search features to place results', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [74.3, 31.5] },
            properties: { name: 'Fuel stop', city: 'Lahore', country: 'Pakistan', osm_id: 11 },
          },
        ],
      }),
    });
    await expect(searchPublicPlaces('fuel')).resolves.toEqual([
      {
        id: '11',
        title: 'Fuel stop',
        subtitle: 'Lahore, Pakistan',
        latitude: 31.5,
        longitude: 74.3,
      },
    ]);
  });

  it('builds a driving preview from an OSRM route', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            distance: 1000,
            duration: 120,
            geometry: {
              coordinates: [
                [74.3, 31.5],
                [74.31, 31.51],
              ],
            },
            legs: [
              {
                steps: [
                  {
                    name: 'Main Street',
                    distance: 1000,
                    duration: 120,
                    maneuver: { type: 'turn', modifier: 'right', location: [74.3, 31.5] },
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
    const route = await calculatePublicRoute(
      { latitude: 31.5, longitude: 74.3, title: 'Start' },
      { latitude: 31.51, longitude: 74.31, title: 'Finish' },
    );
    expect(route.routingProvider).toBe('osrm');
    expect(route.distanceMeters).toBe(1000);
    expect(route.points).toHaveLength(2);
    expect(route.steps[0].instruction).toContain('Turn right');
  });
});
