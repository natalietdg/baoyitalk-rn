import React, { useCallback, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { spokenLanguages, type LanguageMode, type Word } from '../content';
import { useCountingProgress } from '../speech/speaker';
import { Art } from './Art';
import { SpokenText, Pinyin } from './SpokenText';
import { cardColour, cardInk } from './theme';

/** A press that scales the card. Muted taps keep this feedback — the tap must never look dead. */
const usePressScale = () => {
  const scale = useRef(new Animated.Value(1)).current;
  const to = useCallback(
    (value: number) =>
      Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 6 }),
    [scale]
  );
  return {
    scale,
    onPressIn: () => to(0.95).start(),
    onPressOut: () => to(1).start(),
  };
};

/**
 * One word card: the picture, then the word in each language the chip asks for.
 *
 * The card shows every language in the current mode, so ×3 is legible as well as audible.
 */
export const WordCard: React.FC<{
  word: Word;
  mode: LanguageMode;
  showPinyin: boolean;
  width: number;
  onPress: () => void;
}> = ({ word, mode, showPinyin, width, onPress }) => {
  const press = usePressScale();
  const codes = spokenLanguages(mode);
  const isCounting = typeof word.quantity === 'number';

  return (
    <Animated.View style={{ transform: [{ scale: press.scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        testID={`word-card-${word.id}`}
        accessibilityRole="button"
        accessibilityLabel={codes.map((code) => word.text[code]).join(', ')}
        style={[
          styles.card,
          { width, backgroundColor: cardColour(word.order, word.category === 'colours') },
        ]}
      >
        <View style={[styles.artArea, { height: width * 0.5 }]}>
          {isCounting ? (
            <CountingArt word={word} size={width * 0.5} />
          ) : (
            <Art art={word.art} size={width * 0.46} />
          )}
        </View>
        <View style={styles.labels}>
          {codes.map((code) => (
            <View key={code} style={styles.labelRow}>
              <SpokenText text={word.text[code]} style={styles.label} />
              {code === 'zh' ? <Pinyin text={word.text.pinyin} show={showPinyin} size={12} /> : null}
            </View>
          ))}
        </View>
      </Pressable>
    </Animated.View>
  );
};

/**
 * A counting card's picture: **the quantity, drawn.**
 *
 * A card showing a big "4" teaches the shape of a digit; a card showing four things teaches four.
 * So the objects get the space and the numeral is the smaller element.
 *
 * **A ten-frame, not a row.** 1–4 sit in one clean line, the range a toddler sees at a glance.
 * From 5 up they group in fives, so 8 reads as "a full five and three more" rather than a blob.
 */
export const CountingArt: React.FC<{ word: Word; size: number }> = ({ word, size }) => {
  const total = word.quantity ?? 1;
  const revealed = useCountingProgress(word.id);
  // Nothing has been counted yet, so the card shows its full quantity at rest.
  const shown = revealed === 0 ? total : revealed;

  const perRow = total > 5 ? 5 : total;
  const rows: number[][] = [];
  for (let start = 0; start < total; start += perRow) {
    rows.push(Array.from({ length: Math.min(perRow, total - start) }, (_, i) => start + i));
  }
  const objectSide = Math.min(
    (size * 0.78) / (perRow + 0.12 * (perRow - 1)),
    size / (rows.length + 0.12)
  );

  return (
    <View style={styles.countingRow}>
      <View style={{ gap: objectSide * 0.12 }}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={{ flexDirection: 'row', gap: objectSide * 0.12 }}>
            {row.map((index) => (
              <View key={index} style={{ opacity: index < shown ? 1 : 0 }}>
                <Art art={word.art} size={objectSide} />
              </View>
            ))}
          </View>
        ))}
      </View>
      <Text allowFontScaling={false} style={[styles.numeral, { fontSize: size * 0.34 }]}>
        {total}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  artArea: { alignItems: 'center', justifyContent: 'center' },
  labels: { alignItems: 'center', gap: 1, paddingBottom: 2 },
  labelRow: { alignItems: 'center' },
  label: { fontSize: 15, fontWeight: '800', color: cardInk, textAlign: 'center' },
  countingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  numeral: { fontWeight: '900', color: `${cardInk}D9` },
});
