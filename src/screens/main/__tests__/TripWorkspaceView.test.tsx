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
  plannedRoute: null,
  navigationStatuses: [],
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

  it('opens the organizer route planner without affecting an unplanned active trip', () => {
    const navigate = jest.fn();
    const view = render(<TripWorkspaceView {...props} navigation={{ navigate }} />);

    expect(
      view.getByText('No planned route. Actual trip tracking continues normally.'),
    ).toBeTruthy();
    fireEvent.press(view.getByText('Plan route'));
    expect(navigate).toHaveBeenCalledWith('RoutePlanner', { tripId: 'trip-1' });
  });

  it('shows visual navigation and in-app predictive guidance', () => {
    const plannedRoute = {
      id: 'route-1',
      tripId: 'trip-1',
      version: 1,
      isCurrent: true,
      origin: { latitude: 0, longitude: 0, title: 'Start' },
      destination: { latitude: 0, longitude: 0.01, title: 'Finish' },
      distanceMeters: 1000,
      durationSeconds: 120,
      routingProvider: 'osrm',
      createdAt: 1,
      points: [],
      waypoints: [],
      steps: [
        {
          sequence: 0,
          instruction: 'Turn right onto Main Street',
          roadName: 'Main Street',
          maneuverType: 'turn',
          latitude: 0,
          longitude: 0,
          progressMeters: 300,
          distanceMeters: 200,
          durationSeconds: 20,
        },
      ],
    };
    const navigationStatuses = [
      {
        tripId: 'trip-1',
        userId: 'user-1',
        routeId: 'route-1',
        state: 'ON_ROUTE' as const,
        progressMeters: 100,
        remainingDistanceMeters: 900,
        nextStepSequence: 0,
        smoothedSpeedMps: 10,
        speedTrustworthy: true,
        speedDifferenceWarning: false,
        fallingBehindPredicted: true,
        rerouteSuggested: false,
      },
    ];
    const view = render(
      <TripWorkspaceView
        {...props}
        plannedRoute={plannedRoute}
        navigationStatuses={navigationStatuses}
      />,
    );

    expect(view.getByText('NAVIGATION · Ease pace')).toBeTruthy();
    expect(view.getByText('Turn right onto Main Street')).toBeTruthy();
    fireEvent.press(view.getByText('Alerts'));
    expect(view.getByText('Warning separation predicted within 2 minutes')).toBeTruthy();
  });
});
