import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { radius } from '../../theme';

export interface AnimatedTabItem<K extends string> {
  key: K;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

/**
 * Floating pill tab bar with a spring-sliding active indicator.
 * Generic over the tab key so callers keep their own typed tab unions.
 */
export const AnimatedTabBar = <K extends string>({
  tabs,
  active,
  onSelect,
  styles: themeStyles,
}: {
  tabs: AnimatedTabItem<K>[];
  active: K;
  onSelect: (tab: K) => void;
  styles?: Partial<typeof defaultStyles>;
}) => {
  const activeIndex = () =>
    Math.max(
      0,
      tabs.findIndex((item) => item.key === active),
    );
  const indicatorX = useRef(new Animated.Value(activeIndex())).current;
  const [tabWidth, setTabWidth] = useState(0);

  useEffect(() => {
    Animated.spring(indicatorX, {
      toValue: activeIndex(),
      speed: 40,
      bounciness: 7,
      useNativeDriver: true,
    }).start();
  }, [active, indicatorX, tabs]);

  const indicatorWidth = (tabWidth - 8) / tabs.length;

  return (
    <View
      style={[defaultStyles.tabBar, themeStyles?.tabBar]}
      onLayout={(event) => setTabWidth(event.nativeEvent.layout.width)}
    >
      {tabWidth > 0 ? (
        <Animated.View
          style={[
            defaultStyles.tabIndicator,
            themeStyles?.tabIndicator,
            {
              width: indicatorWidth,
              transform: [
                {
                  translateX: indicatorX.interpolate({
                    inputRange: [0, tabs.length - 1],
                    outputRange: [4, 4 + indicatorWidth * (tabs.length - 1)],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      {tabs.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={defaultStyles.tab}
          onPress={() => onSelect(item.key)}
          accessibilityState={{ selected: active === item.key }}
        >
          <Ionicons
            name={active === item.key ? (item.icon.replace('-outline', '') as any) : item.icon}
            size={19}
            color={active === item.key ? colors.primaryLight : colors.textMuted}
          />
          <Text style={[defaultStyles.tabText, active === item.key && defaultStyles.tabTextActive]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const defaultStyles = StyleSheet.create({
  tabBar: {
    height: 62,
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 10,
    marginTop: 4,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.tintPrimary,
    borderWidth: 1,
    borderColor: colors.borderActive,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabText: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  tabTextActive: { color: colors.primaryLight, fontWeight: '800' },
});
