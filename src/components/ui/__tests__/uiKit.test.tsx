import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { AppButton } from '../Buttons';
import { Card, SectionHeader, StatTile } from '../Card';
import { Chip, statusTone } from '../Chips';
import { LabeledInput } from '../Inputs';
import { CodeDisplay, EmptyState, ScreenHeader } from '../Feedback';
import { FadeInView } from '../FadeInView';
import { PressableScale } from '../PressableScale';

describe('AppButton', () => {
  it('renders the label and fires onPress', () => {
    const onPress = jest.fn();
    const view = render(<AppButton label="Create Trip" onPress={onPress} />);
    fireEvent.press(view.getByText('Create Trip'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while loading and shows no label', () => {
    const onPress = jest.fn();
    const view = render(<AppButton label="Save" onPress={onPress} loading />);
    expect(view.queryByText('Save')).toBeNull();
    fireEvent.press(view.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders variants with accessible labels', () => {
    const view = render(
      <AppButton label="Join" onPress={jest.fn()} variant="secondary" icon="key-outline" />,
    );
    expect(view.getByRole('button')).toBeTruthy();
    expect(view.getByText('Join')).toBeTruthy();
  });
});

describe('PressableScale', () => {
  it('renders children inside a touchable', () => {
    const onPress = jest.fn();
    const view = render(
      <PressableScale onPress={onPress} testID="scale">
        <Text>Card content</Text>
      </PressableScale>,
    );
    fireEvent.press(view.getByText('Card content'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Card kit', () => {
  it('renders card, section header, and stat tiles', () => {
    const view = render(
      <Card>
        <SectionHeader title="Activity" caption="Trip totals" />
        <StatTile label="Distance" value="12 km" icon="speedometer-outline" />
      </Card>,
    );
    expect(view.getByText('Activity')).toBeTruthy();
    expect(view.getByText('Trip totals')).toBeTruthy();
    expect(view.getByText('12 km')).toBeTruthy();
    expect(view.getByText('Distance')).toBeTruthy();
  });
});

describe('Chips', () => {
  it('renders a chip with label and icon', () => {
    const view = render(<Chip label="Active" tone="primary" icon="radio-outline" />);
    expect(view.getByText('Active')).toBeTruthy();
  });

  it('maps trip statuses to tones', () => {
    expect(statusTone('active')).toBe('primary');
    expect(statusTone('planned')).toBe('warning');
    expect(statusTone('completed')).toBe('neutral');
  });
});

describe('LabeledInput', () => {
  it('renders label and forwards text changes', () => {
    const onChangeText = jest.fn();
    const view = render(<LabeledInput label="Trip name" value="" onChangeText={onChangeText} />);
    expect(view.getByText('Trip name')).toBeTruthy();
    fireEvent.changeText(view.getByDisplayValue(''), 'Coastal Run');
    expect(onChangeText).toHaveBeenCalledWith('Coastal Run');
  });
});

describe('Feedback kit', () => {
  it('renders the invite code display', () => {
    const view = render(<CodeDisplay code="TRIP-AB12" />);
    expect(view.getByText('TRIP-AB12')).toBeTruthy();
    expect(view.getByText('Invite code')).toBeTruthy();
  });

  it('renders an empty state with actions', () => {
    const onPress = jest.fn();
    const view = render(
      <EmptyState
        icon="compass-outline"
        title="No Trips Yet"
        subtitle="Start or join a trip to see it here."
        actions={[{ label: '+ Create a Trip', onPress }]}
      />,
    );
    expect(view.getByText('No Trips Yet')).toBeTruthy();
    fireEvent.press(view.getByText('+ Create a Trip'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders a screen header with back button', () => {
    const onBack = jest.fn();
    const view = render(<ScreenHeader title="Trip Settings" onBack={onBack} />);
    fireEvent.press(view.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('FadeInView', () => {
  it('renders children without error', () => {
    const view = render(
      <FadeInView>
        <Text>Content</Text>
      </FadeInView>,
    );
    expect(view.getByText('Content')).toBeTruthy();
  });
});
