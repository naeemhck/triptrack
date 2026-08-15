/**
 * TripTrack Timeline Builder Utility
 * 
 * Derives a clean chronological timeline from existing durable Supabase models:
 * - Trip metadata (`startedAt`, `endedAt`, `name`)
 * - Trip stops (`createdAt` arrival, `departedAt` departure, `name`, `note`, `photoUrl`, `type`)
 */

import { Trip } from '../types/trip';
import { TripStop } from '../types/location';

export type TimelineItemType = 'trip_started' | 'stop_arrival' | 'stop_departure' | 'trip_completed';

export interface TimelineEvent {
  id: string;
  type: TimelineItemType;
  timestamp: number;
  title: string;
  subtitle?: string;
  badge?: string;
  note?: string;
  photoUrl?: string;
  stop?: TripStop;
}

export const buildTripTimeline = (trip: Trip, stops: TripStop[]): TimelineEvent[] => {
  const events: TimelineEvent[] = [];

  // 1. Trip Started Event
  if (trip.startedAt) {
    events.push({
      id: `started_${trip.id}_${trip.startedAt}`,
      type: 'trip_started',
      timestamp: trip.startedAt,
      title: 'Trip started',
      subtitle: `Organizer started "${trip.name}"`,
      badge: 'Start',
    });
  } else if (trip.createdAt) {
    events.push({
      id: `created_${trip.id}_${trip.createdAt}`,
      type: 'trip_started',
      timestamp: trip.createdAt,
      title: 'Trip created',
      subtitle: `Trip "${trip.name}" created`,
      badge: 'Created',
    });
  }

  // 2. Stop Arrivals & Departures
  stops.forEach((stop) => {
    const isAuto = stop.autoDetected || stop.type === 'auto';

    // Arrival event
    events.push({
      id: `arrival_${stop.id}_${stop.createdAt}`,
      type: 'stop_arrival',
      timestamp: stop.createdAt,
      title: stop.name,
      subtitle: isAuto ? `Detected for ${stop.displayName}` : `Marked by ${stop.displayName}`,
      badge: isAuto ? 'Automatic stop' : 'Manual stop',
      note: stop.note,
      photoUrl: stop.photoUrl,
      stop,
    });

    // Departure event if departedAt exists
    if (stop.departedAt) {
      const stayDurationMins = Math.max(1, Math.floor((stop.departedAt - stop.createdAt) / 60000));
      events.push({
        id: `departure_${stop.id}_${stop.departedAt}`,
        type: 'stop_departure',
        timestamp: stop.departedAt,
        title: `Departed ${stop.name}`,
        subtitle: `Stay duration: ${stayDurationMins} minute${stayDurationMins === 1 ? '' : 's'}`,
        badge: 'Departure',
        stop,
      });
    }
  });

  // 3. Trip Completed Event
  if (trip.endedAt || trip.status === 'completed') {
    const endedTime = trip.endedAt || (stops.length ? Math.max(...stops.map((s) => s.departedAt || s.createdAt)) : Date.now());
    events.push({
      id: `completed_${trip.id}_${endedTime}`,
      type: 'trip_completed',
      timestamp: endedTime,
      title: 'Trip completed',
      subtitle: 'All members finished sharing location',
      badge: 'Completed',
    });
  }

  // Sort chronologically ascending (oldest first)
  events.sort((a, b) => a.timestamp - b.timestamp);

  return events;
};
