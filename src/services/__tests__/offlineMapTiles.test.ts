import {
  computeRouteBounds,
  createTripOfflinePack,
  deleteTripOfflinePack,
  ensureTripOfflinePack,
  getTripOfflinePackStatus,
  OFFLINE_PACK_MAX_ZOOM,
  OFFLINE_PACK_MIN_ZOOM,
  tripOfflinePackName,
} from '../offlineMapTiles';

jest.mock('@maplibre/maplibre-react-native', () => ({
  OfflineManager: {
    createPack: jest.fn(),
    getPack: jest.fn(),
    deletePack: jest.fn(),
  },
}));
jest.mock('../../utils/errorReporting', () => ({ reportError: jest.fn() }));

import { OfflineManager } from '@maplibre/maplibre-react-native';

const manager = OfflineManager as jest.Mocked<typeof OfflineManager>;

const routePoints = [
  { latitude: 47.61, longitude: -122.33 },
  { latitude: 47.5, longitude: -122.2 },
  { latitude: 47.7, longitude: -122.4 },
];

describe('tripOfflinePackName', () => {
  it('namespaces pack names with the trip id', () => {
    expect(tripOfflinePackName('abc-123')).toBe('triptrack-abc-123');
  });
});

describe('computeRouteBounds', () => {
  it('returns padded NE/SW bounds covering all points', () => {
    const bounds = computeRouteBounds(routePoints);
    expect(bounds).not.toBeNull();
    const [[neLng, neLat], [swLng, swLat]] = bounds!;

    expect(neLng).toBeGreaterThan(-122.2);
    expect(neLat).toBeGreaterThan(47.7);
    expect(swLng).toBeLessThan(-122.4);
    expect(swLat).toBeLessThan(47.5);
    // NE corner must dominate SW corner
    expect(neLng).toBeGreaterThan(swLng);
    expect(neLat).toBeGreaterThan(swLat);
  });

  it('enforces a minimum span for near-identical points', () => {
    const bounds = computeRouteBounds([
      { latitude: 47.6, longitude: -122.3 },
      { latitude: 47.6001, longitude: -122.3001 },
    ])!;
    expect(bounds[0][0] - bounds[1][0]).toBeGreaterThan(0.0099);
    expect(bounds[0][1] - bounds[1][1]).toBeGreaterThan(0.0099);
  });

  it('returns null for fewer than two points', () => {
    expect(computeRouteBounds([routePoints[0]])).toBeNull();
    expect(computeRouteBounds([])).toBeNull();
  });

  it('returns null for non-finite coordinates', () => {
    expect(
      computeRouteBounds([
        { latitude: NaN, longitude: -122.3 },
        { latitude: 47.6, longitude: -122.2 },
      ]),
    ).toBeNull();
  });
});

describe('createTripOfflinePack', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a pack with the shared style and capped zooms', async () => {
    manager.getPack.mockResolvedValue(undefined);
    manager.createPack.mockResolvedValue(undefined);

    const created = await createTripOfflinePack('trip-1', routePoints);

    expect(created).toBe(true);
    expect(manager.createPack).toHaveBeenCalledTimes(1);
    const options = manager.createPack.mock.calls[0][0];
    expect(options.name).toBe('triptrack-trip-1');
    expect(options.styleURL).toBe('https://tiles.openfreemap.org/styles/bright');
    expect(options.minZoom).toBe(OFFLINE_PACK_MIN_ZOOM);
    expect(options.maxZoom).toBe(OFFLINE_PACK_MAX_ZOOM);
  });

  it('is a no-op when the pack already exists', async () => {
    manager.getPack.mockResolvedValue({ name: 'triptrack-trip-1' } as any);

    const created = await createTripOfflinePack('trip-1', routePoints);

    expect(created).toBe(false);
    expect(manager.createPack).not.toHaveBeenCalled();
  });

  it('does not create a pack without a usable route', async () => {
    manager.getPack.mockResolvedValue(undefined);

    expect(await createTripOfflinePack('trip-1', [])).toBe(false);
    expect(manager.createPack).not.toHaveBeenCalled();
  });
});

describe('ensureTripOfflinePack', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns false instead of throwing on manager errors', async () => {
    manager.getPack.mockRejectedValue(new Error('native failure'));

    await expect(ensureTripOfflinePack('trip-1', routePoints)).resolves.toBe(false);
  });
});

describe('deleteTripOfflinePack', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes an existing pack', async () => {
    manager.getPack.mockResolvedValue({ name: 'triptrack-trip-1' } as any);
    manager.deletePack.mockResolvedValue(undefined);

    await deleteTripOfflinePack('trip-1');

    expect(manager.deletePack).toHaveBeenCalledWith('triptrack-trip-1');
  });

  it('is safe when no pack exists', async () => {
    manager.getPack.mockResolvedValue(undefined);

    await deleteTripOfflinePack('trip-1');

    expect(manager.deletePack).not.toHaveBeenCalled();
  });
});

describe('getTripOfflinePackStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps pack status to a compact shape', async () => {
    manager.getPack.mockResolvedValue({
      status: jest.fn().mockResolvedValue({
        name: 'triptrack-trip-1',
        state: 1,
        percentage: 42.5,
        completedResourceCount: 10,
        completedResourceSize: 1024,
        completedTileCount: 8,
        completedTileSize: 512,
        requiredResourceCount: 24,
      }),
    } as any);

    const status = await getTripOfflinePackStatus('trip-1');

    expect(status).toEqual({
      percentage: 42.5,
      completedTileCount: 8,
      requiredResourceCount: 24,
    });
  });

  it('returns null when no pack exists', async () => {
    manager.getPack.mockResolvedValue(undefined);

    expect(await getTripOfflinePackStatus('trip-1')).toBeNull();
  });
});
