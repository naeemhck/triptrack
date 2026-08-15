import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { TripWorkspaceView } from '../TripWorkspaceView';

jest.mock('../../../components/map/TripMap', () => ({
  TripMap: function MockTripMap() {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, 'Workspace map');
  },
}));
jest.mock('../TripSettingsScreen', () => ({
  TripSettingsScreen: function MockTripSettingsScreen() {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, 'Personal trip settings');
  },
}));
jest.mock('react-native-qrcode-svg', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const MockQRCode = () => React.createElement(Text, null, 'Trip QR');
  MockQRCode.displayName = 'MockQRCode';
  return MockQRCode;
});
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const props: React.ComponentProps<typeof TripWorkspaceView> = {
  trip: {
    id: 'trip-1',
    name: 'QA Drive',
    startDate: '2026-08-15',
    endDate: '2026-08-16',
    inviteCode: 'TRIP-QA01',
    memberIds: ['user-1'],
    createdBy: 'user-1',
    createdAt: 1,
    status: 'active',
  },
  tripId: 'trip-1',
  userId: 'user-1',
  navigation: { navigate: jest.fn() },
  locations: [],
  stops: [],
  routePoints: [],
  memberRows: [],
  activeMemberCount: 0,
  pendingCount: 0,
  loadingData: false,
  showBackgroundPermissionModal: false,
  isSharingEnabled: false,
  togglingSharing: false,
  isOrganizer: true,
  mapRef: { current: null },
  userCoords: null,
  alertEvents: [],
  onToggleSharing: jest.fn(),
  onConfirmAlways: jest.fn(),
  onFallbackForeground: jest.fn(),
  onRetrySync: jest.fn(),
  onTimedSharing: jest.fn(),
  onMarkStop: jest.fn(),
  onReviewStop: jest.fn().mockResolvedValue(undefined),
  onSelectStop: jest.fn(),
  onMakeLeader: jest.fn(),
  onRemoveMember: jest.fn(),
  onLeaveTrip: jest.fn(),
  onStartTrip: jest.fn(),
  onEndTrip: jest.fn(),
};

describe('TripWorkspaceView', () => {
  it('uses Map as the default tab and switches to trip-scoped settings', () => {
    const view = render(<TripWorkspaceView {...props} />);
    expect(view.getByText('Workspace map')).toBeTruthy();

    fireEvent.press(view.getByText('Settings'));
    expect(view.getByText('Personal trip settings')).toBeTruthy();
  });

  it('honors an alert notification target tab', () => {
    const view = render(<TripWorkspaceView {...props} initialTab="alerts" />);
    expect(view.getByText('No alerts recorded.')).toBeTruthy();
  });
});
