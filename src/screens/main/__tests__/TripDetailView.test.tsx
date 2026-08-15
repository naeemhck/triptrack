import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { TripDetailView, TripMemberRowData } from '../TripDetailView';
import { Trip } from '../../../types/trip';

jest.mock('../../../components/map/TripMap', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  const MockTripMap = React.forwardRef((props: any, _ref: any) =>
    React.createElement(
      TouchableOpacity,
      { testID: 'trip-map', onPress: () => props.onMarkStop(1, 2) },
      React.createElement(Text, null, 'Map'),
    ),
  );
  MockTripMap.displayName = 'MockTripMap';
  return { TripMap: MockTripMap };
});
jest.mock('../../../components/trip/StopHistoryList', () => ({
  StopHistoryList: ({ stops, onSelectStop }: any) => {
    const React = require('react');
    const { Text, TouchableOpacity } = require('react-native');
    return stops.length
      ? React.createElement(
          TouchableOpacity,
          { onPress: () => onSelectStop(stops[0]) },
          React.createElement(Text, null, 'Select stop'),
        )
      : null;
  },
}));
jest.mock('../../../components/trip/TripTimelineList', () => ({
  TripTimelineList: ({ events, onSelectEvent }: any) => {
    const React = require('react');
    const { Text, TouchableOpacity } = require('react-native');
    const stopEvent = events.find((event: any) => event.stop);
    return stopEvent
      ? React.createElement(
          TouchableOpacity,
          { onPress: () => onSelectEvent(stopEvent) },
          React.createElement(Text, null, 'Select timeline stop'),
        )
      : null;
  },
}));

const trip: Trip = {
  id: 'trip-1',
  name: 'Coastal Run',
  inviteCode: 'TRIP-AB12',
  createdBy: 'user-1',
  createdAt: 1,
  startDate: '2026-08-15',
  endDate: '2026-08-22',
  memberIds: ['user-1', 'user-2'],
  routeLeaderUserId: 'user-1',
  status: 'active',
};

const memberRows: TripMemberRowData[] = [
  {
    member: { uid: 'user-2', displayName: 'Second Driver', joinedAt: 2, sharingEnabled: true },
    freshness: {
      state: 'fresh',
      label: 'Live',
      shortLabel: 'Just now',
      minutesAgo: 0,
      opacity: 1,
    },
    active: true,
    routeStatus: { userId: 'user-2', state: 'ON_ROUTE', deltaMeters: 210, sampledAt: 1 },
  },
];

const handlers = {
  handleConfirmAlways: jest.fn(),
  handleEndTrip: jest.fn(),
  handleFallbackForeground: jest.fn(),
  handleLeaveTrip: jest.fn(),
  handleMakeRouteLeader: jest.fn(),
  handleManualSyncRetry: jest.fn(),
  handleMarkStop: jest.fn(),
  handleRemoveMember: jest.fn(),
  handleShareInvite: jest.fn(),
  handleStartTrip: jest.fn(),
  handleToggleSharing: jest.fn(),
};

const baseProps = {
  ...handlers,
  activeTrip: trip,
  activeMemberCount: 1,
  displayStops: [],
  isOrganizer: true,
  isSharingEnabled: true,
  loadingData: false,
  locations: [],
  mapRef: React.createRef<any>(),
  memberFilter: 'all' as const,
  memberRows,
  members: memberRows.map((row) => row.member),
  navigation: { navigate: jest.fn() },
  pendingCount: 0,
  permState: 'granted-always' as const,
  routePoints: [],
  setMemberFilter: jest.fn(),
  showBgModal: false,
  togglingSharing: false,
  tripId: 'trip-1',
  userCoords: null,
  userId: 'user-1',
};

describe('TripDetailView', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows active background sharing and toggles it', () => {
    const view = render(<TripDetailView {...baseProps} />);
    expect(view.getByText('Sharing (Always)')).toBeTruthy();
    fireEvent(view.getByRole('switch'), 'valueChange', false);
    expect(handlers.handleToggleSharing).toHaveBeenCalledWith(false);
  });

  it('offers one retry for pending offline operations', () => {
    const view = render(<TripDetailView {...baseProps} pendingCount={2} />);
    expect(view.getByText(/Pending Sync \(2\)/)).toBeTruthy();
    fireEvent.press(view.getByText(/Retry/));
    expect(handlers.handleManualSyncRetry).toHaveBeenCalledTimes(1);
  });

  it('exposes route-leader assignment to an active organizer', () => {
    const view = render(<TripDetailView {...baseProps} />);
    fireEvent.press(view.getByText('Make leader'));
    expect(handlers.handleMakeRouteLeader).toHaveBeenCalledWith(memberRows[0].member);
  });

  it('renders planned-trip lifecycle controls without live sharing', () => {
    const view = render(
      <TripDetailView {...baseProps} activeTrip={{ ...trip, status: 'planned' }} />,
    );
    fireEvent.press(view.getByText(/^Start Trip/));
    expect(handlers.handleStartTrip).toHaveBeenCalledTimes(1);
    expect(view.queryByRole('switch')).toBeNull();
  });

  it('routes active-trip commands through the controller callbacks', () => {
    const stop = {
      id: 'stop-1',
      uid: 'user-1',
      displayName: 'Traveler',
      lat: 1,
      lng: 2,
      name: 'Fuel stop',
      createdAt: 2,
    };
    const mapRef = { current: { animateToLocation: jest.fn() } };
    const view = render(<TripDetailView {...baseProps} displayStops={[stop]} mapRef={mapRef} />);

    fireEvent.press(view.getByLabelText('Back to My Trips'));
    fireEvent.press(view.getByLabelText('Trip Settings'));
    fireEvent.press(view.getByText(/^End Trip/));
    fireEvent.press(view.getByText('Share code'));
    fireEvent.press(view.getByText('Active 1'));
    fireEvent.press(view.getByText('Select stop'));
    fireEvent.press(view.getByText('Select timeline stop'));
    fireEvent.press(view.getByTestId('trip-map'));
    fireEvent.press(view.getByText('Leave trip'));

    expect(baseProps.navigation.navigate).toHaveBeenCalledWith('TripList');
    expect(baseProps.navigation.navigate).toHaveBeenCalledWith('TripSettings', {
      tripId: 'trip-1',
    });
    expect(handlers.handleEndTrip).toHaveBeenCalledTimes(1);
    expect(handlers.handleShareInvite).toHaveBeenCalledTimes(1);
    expect(baseProps.setMemberFilter).toHaveBeenCalledWith('active');
    expect(mapRef.current.animateToLocation).toHaveBeenCalledTimes(2);
    expect(handlers.handleMarkStop).toHaveBeenCalledWith(1, 2);
    expect(handlers.handleLeaveTrip).toHaveBeenCalledTimes(1);
  });

  it('shows foreground-only and completed states', () => {
    const foreground = render(
      <TripDetailView {...baseProps} isOrganizer={false} permState="granted-foreground-only" />,
    );
    expect(foreground.getByText('Sharing (App Open Only)')).toBeTruthy();
    expect(foreground.getByText(/Want background updates/)).toBeTruthy();

    const completed = render(
      <TripDetailView {...baseProps} activeTrip={{ ...trip, status: 'completed' }} />,
    );
    expect(completed.getByText(/^Trip Completed/)).toBeTruthy();
    expect(completed.getByText('Historical Trip Map')).toBeTruthy();
  });
});
