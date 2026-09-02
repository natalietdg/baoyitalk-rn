import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { parseArt, play, wordById, type Trilingual } from '../../content';
import { useSpeaker } from '../../speech/speaker';
import { useSettings } from '../../state/settings';
import { Art } from '../../ui/Art';
import { ConfettiBurst } from '../../ui/Confetti';
import { Pinyin } from '../../ui/SpokenText';
import { cardInk, paper } from '../../ui/theme';
import { useSession } from './session';
import { ActivityTitle, CalmEnd, RoundDots } from './shared';

/**
 * **"Where does it belong?"** — two picture baskets, and one thing to put away.
 *
 * The link being built is item → category, so **every drop speaks the item and then the basket's
 * category name**: "Cat. Animals." Putting a cat in the food basket says "Cat. Food." and moves on.
 *
 * That is not a bug. The activity teaches the words for the grouping, and a toddler who hears
 * "cat, food" and looks puzzled has just learned more than one who saw a red X. Nothing is marked
 * wrong, nothing is retried, and both baskets always accept.
 */
export const Belongs: React.FC = () => {
  const { speakPhrase } = useSpeaker();
  const { settings } = useSettings();
  const session = useSession(play.belongs.words, play.belongs.roundsPerSession);

  if (session.finished) {
    return (
      <>
        <CalmEnd line="Everything is put away." />
        <ConfettiBurst trigger={session.confetti} />
      </>
    );
  }

  const word = wordById(session.round!);
  if (!word) return <CalmEnd />;

  const putAway = (basketName: Trilingual) => {
    // Item then category, in each language the chip asks for — one continuous phrase per language.
    speakPhrase({
      en: `${word.text.en}. ${basketName.en}.`,
      ms: `${word.text.ms}. ${basketName.ms}.`,
      zh: `${word.text.zh}。${basketName.zh}。`,
      pinyin: `${word.text.pinyin ?? ''} ${basketName.pinyin ?? ''}`.trim(),
    });
    setTimeout(session.advance, 2400);
  };

  return (
    <View style={styles.root}>
      <ActivityTitle text="Where does it belong?" />

      <View style={styles.item}>
        <Art art={word.art} size={78} />
        <Text allowFontScaling={false} style={styles.itemLabel}>
          {word.text.en}
        </Text>
      </View>

      <View style={styles.baskets}>
        {play.belongs.baskets.map((basket) => (
          <Pressable
            key={basket.category}
            testID={`basket-${basket.category}`}
            accessibilityRole="button"
            accessibilityLabel={`Put ${word.text.en} in ${basket.name.en}`}
            onPress={() => putAway(basket.name)}
            style={({ pressed }) => [styles.basket, pressed && { transform: [{ scale: 0.96 }] }]}
          >
            <Art art={parseArt(basket.art)} size={54} />
            <Text allowFontScaling={false} style={styles.basketLabel}>
              {basket.name.en}
            </Text>
            <Pinyin text={basket.name.pinyin} show={settings.showPinyin} size={11} />
          </Pressable>
        ))}
      </View>

      <RoundDots position={session.position} total={session.total} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 16 },
  item: { alignItems: 'center', gap: 4 },
  itemLabel: { fontSize: 20, fontWeight: '900', color: cardInk },
  baskets: { flexDirection: 'row', gap: 18 },
  basket: {
    width: 130,
    height: 136,
    borderRadius: 26,
    backgroundColor: paper,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 3,
    borderColor: '#00000012',
    borderStyle: 'dashed',
  },
  basketLabel: { fontSize: 15, fontWeight: '800', color: cardInk },
});
