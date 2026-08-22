import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleProp, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme';

/**
 * Shimmer placeholder bar. Pure presentation loop (translateX sweep) used in
 * loading states in place of spinners.
 */
export const SkeletonBar = ({
  width = '100%',
  height = 14,
  rounded = radius.pill,
  style,
}: {
  width?: number | `${number}%` | '100%';
  height?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) => {
  const translateX = useRef(new Animated.Value(-1)).current;
  const windowWidth = Dimensions.get('window').width;

  useEffect(() => {
    const sweep = Animated.loop(
      Animated.timing(translateX, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    sweep.start();
    return () => sweep.stop();
  }, [translateX]);

  return (
    <Animated.View
      style={[
        {
          width: width as ViewStyle['width'],
          height,
          borderRadius: rounded,
          backgroundColor: colors.surfaceLight,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: windowWidth,
          backgroundColor: colors.surfaceElevated,
          opacity: 0.9,
          transform: [
            {
              translateX: translateX.interpolate({
                inputRange: [-1, 1],
                outputRange: [-windowWidth, windowWidth],
              }),
            },
          ],
        }}
      />
    </Animated.View>
  );
};

/** A trip-card-shaped skeleton block for list loading states. */
export const TripCardSkeleton = () => (
  <React.Fragment>
    {[0, 1, 2].map((index) => (
      <SkeletonGroup key={index} />
    ))}
  </React.Fragment>
);

const SkeletonGroup = () => (
  <Animated.View
    style={{
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md + 2,
      gap: spacing.md,
    }}
  >
    <SkeletonBar width="55%" height={18} />
    <SkeletonBar width="38%" height={12} />
    <SkeletonBar width="80%" height={12} />
  </Animated.View>
);
