import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Art } from '../../ui/Art';
import { parseArt } from '../../content';
import { cardInk, paperInk } from '../../ui/theme';

/**
 * **The calm screen every activity ends on.**
 *
 * There is deliberately no button here. No "play again?", no "next activity", no score. A session
 * ends by going quiet, which is the only ending that leaves a toddler calm rather than wound up.
 * The mode switcher stays visible below, so a grown-up can move on if they choose to.
 */
export const CalmEnd: React.FC<{ line?: string }> = ({ line = 'All done.' }) => (
  <View style={styles.calm}>
    <Art art={parseArt('🌙')} size={72} />
    <Text allowFontScaling={false} style={styles.calmLine}>
      {line}
    </Text>
  </View>
);

/** Quiet progress dots. Not a score — they say "how much is left", not "how well you did". */
export const RoundDots: React.FC<{ position: number; total: number }> = ({ position, total }) => (
  <View style={styles.dots}>
    {Array.from({ length: total }, (_, index) => (
      <View key={index} style={[styles.dot, index < position ? styles.dotOn : styles.dotOff]} />
    ))}
  </View>
);

export const ActivityTitle: React.FC<{ text: string }> = ({ text }) => (
  <Text allowFontScaling={false} style={styles.title}>
    {text}
  </Text>
);

const styles = StyleSheet.create({
  calm: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  calmLine: { fontSize: 22, fontWeight: '700', color: paperInk },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: cardInk },
  dotOff: { backgroundColor: '#00000022' },
  title: { fontSize: 15, fontWeight: '800', color: paperInk, textAlign: 'center' },
});
