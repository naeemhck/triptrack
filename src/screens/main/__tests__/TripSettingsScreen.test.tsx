import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { TripSettingsScreen } from '../TripSettingsScreen';
import { useTrips } from '../../../context/TripContext';
import { useAuth } from '../../../context/AuthContext';
import { updateTripAlertThresholds } from '../../../services/supabase/trips';

jest.mock('../../../context/TripContext', () => ({ useTrips: jest.fn() }));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../services/supabase/notificationPreferences', () => ({
  getTripNotificationPreferences: jest.fn().mockResolvedValue({
    warningEnabled: true,
    criticalEnabled: true,
    stopEnabled: true,
    staleEnabled: true,
    memberLeftEnabled: true,
    nudgeEnabled: true,
  }),
  updateTripNotificationPreferences: jest.fn(),
}));
jest.mock('../../../services/supabase/trips', () => ({
  updateTripAlertThresholds: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../services/offlineMapTiles', () => ({
  deleteTripOfflinePack: jest.fn(),
  getTripOfflinePackStatus: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../../services/trackingPreferences', () => ({
  getTrackingProfile: jest.fn().mockResolvedValue('balanced'),
  setTrackingProfile: jest.fn(),
  TRACKING_PROFILES: {
    'battery-saver': { label: 'Battery saver', description: 'Less often' },
    balanced: { label: 'Balanced', description: 'Default' },
    'high-accuracy': { label: 'High accuracy', description: 'More often' },
  },
}));
jest.mock('../../../services/backgroundLocation', () => ({
  restartBackgroundLocationTrackingIfRunning: jest.fn(),
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
}));
jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockSlider = () => React.createElement(View, { testID: 'threshold-slider' });
  return { __esModule: true, default: MockSlider };
});

const trip = {
  id: 'trip-1',
  name: 'Threshold QA',
  inviteCode: 'TRIP-TH01',
  memberIds: ['user-1'],
  createdBy: 'user-1',
  createdAt: 1,
  status: 'active' as const,
  warningDistanceMeters: 200,
  criticalDistanceMeters: 500,
};

describe('TripSettingsScreen thresholds', () => {
  beforeEach(() => {
    (useTrips as jest.Mock).mockReturnValue({ trips: [trip], refreshTrips: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { uid: 'user-1' } });
  });

  it('lets the organizer step warning and critical values and save them', async () => {
    const view = render(
      <TripSettingsScreen route={{ params: { tripId: 'trip-1' } }} navigation={{ goBack: jest.fn() }} />,
    );

    await waitFor(() => expect(view.getByText('Warning · 200 m')).toBeTruthy());
    fireEvent.press(view.getByLabelText('Increase warning threshold'));
    expect(view.getByText('Warning · 250 m')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Increase critical threshold'));
    expect(view.getByText('Critical · 550 m')).toBeTruthy();

    fireEvent.press(view.getByText('Save thresholds'));
    await waitFor(() =>
      expect(updateTripAlertThresholds).toHaveBeenCalledWith('trip-1', {
        warningDistanceMeters: 250,
        criticalDistanceMeters: 550,
      }),
    );
  });

  it('shows read-only thresholds for a non-organizer', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { uid: 'user-2' } });
    const view = render(
      <TripSettingsScreen route={{ params: { tripId: 'trip-1' } }} navigation={{ goBack: jest.fn() }} />,
    );
    await waitFor(() => expect(view.getByText(/Warning 200 m · Critical 500 m/)).toBeTruthy());
    expect(view.queryByText('Save thresholds')).toBeNull();
  });
});
