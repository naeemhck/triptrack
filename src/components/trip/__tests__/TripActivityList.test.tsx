import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { TripActivityList } from '../TripActivityList';
import { TripStop } from '../../../types/location';

const stop: TripStop = {
  id: 'stop-1',
  uid: 'member-1',
  displayName: 'Naeem',
  lat: 37.42,
  lng: -122.08,
  name: 'Lunch stop',
  note: 'Meet near the entrance',
  autoDetected: true,
  createdAt: Date.parse('2026-08-15T12:00:00Z'),
  departedAt: Date.parse('2026-08-15T12:20:00Z'),
  category: 'food',
  reviewStatus: 'needs_review',
};

describe('TripActivityList', () => {
  it('expands a categorized stop and exposes organizer review', () => {
    const onReview = jest.fn().mockResolvedValue(undefined);
    const view = render(
      <TripActivityList stops={[stop]} isOrganizer onSelect={jest.fn()} onReview={onReview} />,
    );

    expect(view.getByText(/Food/)).toBeTruthy();
    fireEvent.press(view.getByRole('button', { expanded: false }));
    expect(view.getByText('Meet near the entrance')).toBeTruthy();
    expect(view.getByText('Departed after 20 min')).toBeTruthy();
    fireEvent.press(view.getByText('Confirm'));
    expect(onReview).toHaveBeenCalledWith(stop, 'confirm');
  });

  it('does not expose review commands to a regular member', () => {
    const view = render(
      <TripActivityList
        stops={[stop]}
        isOrganizer={false}
        onSelect={jest.fn()}
        onReview={jest.fn()}
      />,
    );
    fireEvent.press(view.getByRole('button', { expanded: false }));
    expect(view.queryByText('Confirm')).toBeNull();
  });
});
