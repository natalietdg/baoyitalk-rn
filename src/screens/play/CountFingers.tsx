import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { numberWord, play, spokenLanguages, wordById } from '../../content';
import { useSpeaker } from '../../speech/speaker';
import { useSettings } from '../../state/settings';
import { Art } from '../../ui/Art';
import { ConfettiBurst } from '../../ui/Confetti';
import { Pinyin } from '../../ui/SpokenText';
import { accent, cardInk, paper } from '../../ui/theme';
import { useSession } from './session';
import { ActivityTitle, CalmEnd, RoundDots } from './shared';

/**
 * **"Count with your finger"** — the child's own finger does the counting.
 *
 * One-to-one correspondence is the actual skill here: not reciting "one two three" but touching
 * one thing per number. So each object is tapped individually, says its number, and stays marked
 * so it cannot be counted twice. When the last one is marked, the total is spoken.
 *
 * Objects can be tapped in any order and a marked object simply does nothing — no penalty, and no
 * way to lose count.
 */
export const CountFingers: React.FC = () => {
  const { speakPhrase } = useSpeaker();
  const { settings, language } = useSettings();
  const session = useSession(play.countFingers.rounds, play.countFingers.roundsPerSession);
  const [counted, setCounted] = useState<number[]>([]);

  if (session.finished) {
    return (
      <>
        <CalmEnd line="You counted them all." />
        <ConfettiBurst trigger={session.confetti} />
      </>
    );
  }

  const round = session.round!;
  const word = wordById(round.word);
  if (!word) return <CalmEnd />;

  const tap = (index: number) => {
    if (counted.includes(index)) return; // already counted — nothing happens, nothing is wrong
    const next = [...counted, index];
    setCounted(next);

    if (next.length === round.count) {
      // The total, after the count — the answer the counting was for.
      speakPhrase(round.total);
      setTimeout(() => {
        setCounted([]);
        session.advance();
      }, 2600);
      return;
    }
    const number = numberWord(next.length);
    if (number) {
      speakPhrase(number.text);
    }
  };

  // Same ten-frame rule as the counting cards: 1–4 in a line, 5 and up grouped in fives.
  const perRow = round.count > 5 ? 5 : round.count;
  const rows: number[][] = [];
  for (let start = 0; start < round.count; start += perRow) {
    rows.push(Array.from({ length: Math.min(perRow, round.count - start) }, (_, i) => start + i));
  }

  return (
    <View style={styles.root}>
      <ActivityTitle text="Count with your finger" />

      <View style={styles.tray}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((index) => {
              const isCounted = counted.includes(index);
              return (
                <Pressable
                  key={index}
                  testID={`count-object-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${word.text.en} ${index + 1}`}
                  onPress={() => tap(index)}
                  style={({ pressed }) => [
                    styles.object,
                    isCounted && styles.objectCounted,
                    pressed && { transform: [{ scale: 0.92 }] },
                  ]}
                >
                  <Art art={word.art} size={46} />
                  {isCounted ? (
                    <Text allowFontScaling={false} style={styles.mark}>
                      {counted.indexOf(index) + 1}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.totalBox}>
        <Text allowFontScaling={false} style={styles.total}>
          {counted.length === round.count
            ? spokenLanguages(language)
                .map((code) => round.total[code])
                .join(' · ')
            : ' '}
        </Text>
        {counted.length === round.count ? (
          <Pinyin text={round.total.pinyin} show={settings.showPinyin} />
        ) : null}
      </View>

      <RoundDots position={session.position} total={session.total} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 },
  tray: { gap: 10, backgroundColor: paper, borderRadius: 28, padding: 16 },
  row: { flexDirection: 'row', gap: 10 },
  object: {
    width: 62,
    height: 62,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  objectCounted: { borderWidth: 3, borderColor: accent },
  mark: {
    position: 'absolute',
    bottom: -2,
    right: 2,
    fontSize: 13,
    fontWeight: '900',
    color: accent,
  },
  totalBox: { alignItems: 'center', minHeight: 44 },
  total: { fontSize: 19, fontWeight: '800', color: cardInk, textAlign: 'center' },
});
