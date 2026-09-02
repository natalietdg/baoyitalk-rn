import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { accent, paperInk } from './theme';

const HOLD_MS = 3000;

/**
 * Kids Category parent gate: the parent area only opens after a full 3-second hold.
 *
 * A quick toddler tap does nothing. The filling bar telegraphs progress so the adult knows the
 * hold registered and the 3s wait doesn't feel like a dud tap.
 */
export const ParentGate: React.FC<{ onUnlock: () => void }> = ({ onUnlock }) => {
  const [holding, setHolding] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => cancel, [cancel]);

  const begin = useCallback(() => {
    setHolding(true);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
    timer.current = setTimeout(() => {
      cancel();
      onUnlock();
    }, HOLD_MS);
  }, [cancel, onUnlock, progress]);

  return (
    <Pressable
      onPressIn={begin}
      onPressOut={cancel}
      testID="parent-gate"
      accessibilityRole="button"
      accessibilityLabel="Settings for grown-ups"
      accessibilityHint="Hold for three seconds to open"
      style={styles.wrap}
    >
      <View style={[styles.pill, holding && styles.pillHolding]}>
        <Animated.View
          style={[
            styles.fill,
            { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
        <Text allowFontScaling={false} style={styles.gear}>
          ⚙︎
        </Text>
      </View>
      <Text allowFontScaling={false} style={styles.caption}>
        hold for grown-ups
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2 },
  pill: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pillHolding: { transform: [{ scale: 0.94 }] },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: `${accent}33` },
  gear: { fontSize: 22, color: paperInk },
  caption: { fontSize: 10, fontWeight: '700', color: paperInk },
});
