import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { BackgroundPermissionModal } from '../BackgroundPermissionModal';

describe('BackgroundPermissionModal', () => {
  it('explains background access without changing permission itself', () => {
    const view = render(
      <BackgroundPermissionModal
        visible
        onConfirmAlways={jest.fn()}
        onFallbackForeground={jest.fn()}
      />,
    );
    expect(view.getByText('Enable Background Location Sharing?')).toBeTruthy();
    expect(view.getByText(/Always Allow/)).toBeTruthy();
  });

  it('reports the selected permission path', () => {
    const onConfirmAlways = jest.fn();
    const onFallbackForeground = jest.fn();
    const view = render(
      <BackgroundPermissionModal
        visible
        onConfirmAlways={onConfirmAlways}
        onFallbackForeground={onFallbackForeground}
      />,
    );
    fireEvent.press(view.getByText(/Enable "Always" Access/));
    fireEvent.press(view.getByText('Share Only While App is Open'));
    expect(onConfirmAlways).toHaveBeenCalledTimes(1);
    expect(onFallbackForeground).toHaveBeenCalledTimes(1);
  });
});
