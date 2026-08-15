import { buildTripTimeline } from '../timelineBuilder';
import { Trip } from '../../types/trip';
import { TripStop } from '../../types/location';

const trip: Trip = {
  id: 't1',
  name: 'Coast',
  startDate: '',
  endDate: '',
  inviteCode: 'ABC',
  memberIds: ['u1'],
  createdBy: 'u1',
  createdAt: 100,
  status: 'active',
  startedAt: 200,
};
const stop: TripStop = {
  id: 's1',
  uid: 'u1',
  displayName: 'Naeem',
  lat: 1,
  lng: 2,
  name: 'Cafe',
  createdAt: 300,
  departedAt: 420_300,
  type: 'manual',
};

describe('buildTripTimeline', () => {
  it('orders start, arrival, and departure events', () =>
    expect(buildTripTimeline(trip, [stop]).map((event) => event.type)).toEqual([
      'trip_started',
      'stop_arrival',
      'stop_departure',
    ]));
  it('describes manual stop authorship', () =>
    expect(buildTripTimeline(trip, [stop])[1].subtitle).toBe('Marked by Naeem'));
  it('uses automatic stop labels', () =>
    expect(buildTripTimeline(trip, [{ ...stop, type: 'auto', autoDetected: true }])[1].badge).toBe(
      'Automatic stop',
    ));
  it('adds completion after the final stop', () => {
    const events = buildTripTimeline({ ...trip, status: 'completed', endedAt: 500_000 }, [stop]);
    expect(events.at(-1)?.type).toBe('trip_completed');
  });
  it('uses trip creation when a trip has not started', () =>
    expect(buildTripTimeline({ ...trip, startedAt: undefined }, [])[0].title).toBe('Trip created'));
});
