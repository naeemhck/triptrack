import React, { useRef } from 'react';
import {
  Animated,
  StyleProp,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from 'react-native';

/**
 * TouchableOpacity with a subtle spring scale on press and release.
 * Presentation only — accepts the same props as TouchableOpacity.
 */
export const PressableScale = ({
  children,
  style,
  scaleTo = 0.97,
  ...touchableProps
}: TouchableOpacityProps & { scaleTo?: number }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      speed: 40,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      {...touchableProps}
      onPressIn={(event) => {
        animateTo(scaleTo);
        touchableProps.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animateTo(1);
        touchableProps.onPressOut?.(event);
      }}
    >
      <Animated.View style={[style as StyleProp<ViewStyle>, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};
