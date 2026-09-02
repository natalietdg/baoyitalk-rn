import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { palette } from './theme';

const DURATION = 550; // under 600ms, hard rule

/**
 * A single short burst — **once per session, never per tap.**
 *
 * The rule it enforces: a reward on every tap turns a language app into a slot machine, and a
 * toddler will chase the burst instead of the word. So it fires only when a whole activity is
 * finished, lasts under 600ms, and is followed by a calm screen rather than another prompt.
 */
export const ConfettiBurst: React.FC<{ trigger: number }> = ({ trigger }) => {
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useRef(
    Array.from({ length: 14 }, (_, index) => ({
      x: (index / 13) * 2 - 1,
      colour: palette[index % palette.length],
      rise: 0.6 + ((index * 7) % 10) / 25,
    }))
  ).current;

  useEffect(() => {
    if (trigger === 0) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [trigger, progress]);

  if (trigger === 0) return null;

  return (
    <View pointerEvents="none" style={styles.layer}>
      {pieces.map((piece, index) => (
        <Animated.View
          key={index}
          style={[
            styles.piece,
            {
              backgroundColor: piece.colour,
              opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, piece.x * 150],
                  }),
                },
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -110 * piece.rise],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  piece: { position: 'absolute', width: 9, height: 9, borderRadius: 2 },
});
