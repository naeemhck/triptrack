export interface TripNotificationPreferences {
  warningEnabled: boolean;
  criticalEnabled: boolean;
  stopEnabled: boolean;
  staleEnabled: boolean;
}

export const DEFAULT_TRIP_NOTIFICATION_PREFERENCES: TripNotificationPreferences = {
  warningEnabled: true,
  criticalEnabled: true,
  stopEnabled: true,
  staleEnabled: true,
};
