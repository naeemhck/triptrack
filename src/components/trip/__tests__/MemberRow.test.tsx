import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { MemberRow } from '../MemberRow';
import { LocationFreshnessResult } from '../../../utils/locationFreshness';

const freshness: LocationFreshnessResult = {
  state: 'fresh',
  label: 'Live',
  shortLabel: 'Just now',
  minutesAgo: 0,
  opacity: 1,
};
const member = { uid: 'u2', displayName: 'Jane Doe', joinedAt: 1, sharingEnabled: true };
const baseProps = {
  member,
  freshness,
  isMe: false,
  isHost: false,
  isRouteLeader: false,
  completed: false,
  canManage: false,
  onMakeLeader: jest.fn(),
  onRemove: jest.fn(),
};

describe('MemberRow', () => {
  it('renders a warning separation', () => {
    const view = render(
      <MemberRow
        {...baseProps}
        routeStatus={{ userId: 'u2', state: 'ON_ROUTE', deltaMeters: 251, sampledAt: 1 }}
      />,
    );
    expect(view.getByText('Warning separation')).toBeTruthy();
    expect(view.getByText('251 m behind')).toBeTruthy();
  });

  it('renders critical and ahead states', () => {
    expect(
      render(
        <MemberRow
          {...baseProps}
          routeStatus={{ userId: 'u2', state: 'ON_ROUTE', deltaMeters: 500, sampledAt: 1 }}
        />,
      ).getByText('Critical separation'),
    ).toBeTruthy();
    expect(
      render(
        <MemberRow
          {...baseProps}
          routeStatus={{ userId: 'u2', state: 'ON_ROUTE', deltaMeters: -20, sampledAt: 1 }}
        />,
      ).getByText('20 m ahead'),
    ).toBeTruthy();
  });

  it('renders off-route state', () => {
    expect(
      render(
        <MemberRow
          {...baseProps}
          routeStatus={{ userId: 'u2', state: 'OFF_ROUTE', sampledAt: 1 }}
        />,
      ).getByText('Off route'),
    ).toBeTruthy();
  });

  it('exposes organizer controls only when allowed', () => {
    const onMakeLeader = jest.fn();
    const onRemove = jest.fn();
    const view = render(
      <MemberRow {...baseProps} canManage onMakeLeader={onMakeLeader} onRemove={onRemove} />,
    );
    fireEvent.press(view.getByText('Make leader'));
    fireEvent.press(view.getByText('Remove member'));
    expect(onMakeLeader).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('sends a nudge when the action is available', () => {
    const onNudge = jest.fn();
    const view = render(<MemberRow {...baseProps} canManage onNudge={onNudge} />);
    fireEvent.press(view.getByText('Ask location'));
    expect(onNudge).toHaveBeenCalledTimes(1);
  });

  it('shows the rate-limited state without firing the handler', () => {
    const onNudge = jest.fn();
    const view = render(<MemberRow {...baseProps} canManage onNudge={onNudge} nudgeDisabled />);
    expect(view.getByText('Nudged recently')).toBeTruthy();
    fireEvent.press(view.getByText('Nudged recently'));
    expect(onNudge).not.toHaveBeenCalled();
  });

  it('hides the nudge action for the signed-in member', () => {
    const view = render(<MemberRow {...baseProps} canManage isMe onNudge={jest.fn()} />);
    expect(view.queryByText('Ask location')).toBeNull();
  });
});
