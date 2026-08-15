import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { TripCard } from '../TripCard';
import { Trip } from '../../../types/trip';

const trip: Trip = {
  id: 'trip-1',
  name: 'Coastal Run',
  startDate: '2026-08-14',
  endDate: '2026-08-15',
  inviteCode: 'COAST1',
  memberIds: ['u1', 'u2'],
  createdBy: 'u1',
  createdAt: 1,
  status: 'active',
};

describe('TripCard', () => {
  it('renders trip identity and member count', () => {
    const view = render(<TripCard trip={trip} currentUserId="u2" onPress={jest.fn()} />);
    expect(view.getByText('Coastal Run')).toBeTruthy();
    expect(view.getByText('COAST1')).toBeTruthy();
    expect(view.getByText('2 members')).toBeTruthy();
  });

  it('identifies the host', () => {
    expect(
      render(<TripCard trip={trip} currentUserId="u1" onPress={jest.fn()} />).getByText('Host'),
    ).toBeTruthy();
  });

  it.each(['planned', 'active', 'completed'] as const)('renders %s status', (status) => {
    expect(
      render(<TripCard trip={{ ...trip, status }} onPress={jest.fn()} />).getByText(
        status[0].toUpperCase() + status.slice(1),
      ),
    ).toBeTruthy();
  });

  it('opens the selected trip', () => {
    const onPress = jest.fn();
    const view = render(<TripCard trip={trip} onPress={onPress} />);
    fireEvent.press(view.getByLabelText('Open Coastal Run'));
    expect(onPress).toHaveBeenCalledWith(trip);
  });
});
