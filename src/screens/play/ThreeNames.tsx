import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { bcp47, languages, play, wordById, type LanguageCode } from '../../content';
import { useSpeaker } from '../../speech/speaker';
import { useSettings } from '../../state/settings';
import { Art } from '../../ui/Art';
import { ConfettiBurst } from '../../ui/Confetti';
import { Pinyin, SpokenText } from '../../ui/SpokenText';
import { accent, cardInk, paper } from '../../ui/theme';
import { useSession } from './session';
import { ActivityTitle, CalmEnd, RoundDots } from './shared';

/**
 * **"Same thing, three names"** — one picture, three labels converging on it.
 *
 * The concept being linked is that a cat is 猫 is kucing: *one* thing with three names, not three
 * facts to memorise. So the three labels are drawn pointing at a single picture, and tapping any
 * of them speaks that one language while the picture stays put.
 *
 * The round completes when all three names have been heard — there is no right answer to find,
 * only three names to try, and the order does not matter.
 */
export const ThreeNames: React.FC = () => {
  const { speakWord } = useSpeaker();
  const { settings } = useSettings();
  const session = useSession(play.threeNames.words, play.threeNames.roundsPerSession);
  const [heard, setHeard] = useState<LanguageCode[]>([]);

  if (session.finished) {
    return (
      <>
        <CalmEnd line="One thing, three names." />
        <ConfettiBurst trigger={session.confetti} />
      </>
    );
  }

  const word = wordById(session.round!);
  if (!word) return <CalmEnd />;

  const say = (code: LanguageCode) => {
    speakWord(word, code);
    const next = heard.includes(code) ? heard : [...heard, code];
    setHeard(next);
    if (next.length === languages.length) {
      setTimeout(() => {
        setHeard([]);
        session.advance();
      }, 1400);
    }
  };

  return (
    <View style={styles.root}>
      <ActivityTitle text="Same thing, three names" />

      <Pressable
        onPress={() => speakWord(word, 'all')}
        testID="three-names-picture"
        accessibilityRole="button"
        accessibilityLabel={`${word.text.en}, hear all three names`}
        style={styles.picture}
      >
        <Art art={word.art} size={110} />
      </Pressable>

      <View style={styles.names}>
        {languages.map((language) => {
          const isHeard = heard.includes(language.code);
          return (
            <Pressable
              key={language.code}
              testID={`three-names-${language.code}`}
              accessibilityRole="button"
              accessibilityLabel={`${language.name}: ${word.text[language.code]}`}
              onPress={() => say(language.code)}
              style={({ pressed }) => [
                styles.name,
                isHeard && styles.nameHeard,
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
            >
              <Text allowFontScaling={false} style={styles.chip}>
                {language.chip}
              </Text>
              <View style={styles.nameText}>
                <SpokenText text={word.text[language.code]} style={styles.nameLabel} />
                {language.code === 'zh' ? (
                  <Pinyin text={word.text.pinyin} show={settings.showPinyin} size={12} />
                ) : null}
              </View>
              {/* A quiet tick that it has been heard — a marker, not a reward. */}
              <Text allowFontScaling={false} style={styles.tick}>
                {isHeard ? '·' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <RoundDots position={session.position} total={session.total} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 },
  picture: {
    width: 150,
    height: 150,
    borderRadius: 34,
    backgroundColor: paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  names: { gap: 8, width: '86%', maxWidth: 380 },
  name: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  nameHeard: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: `${accent}55` },
  chip: { fontSize: 13, fontWeight: '900', color: accent, width: 34 },
  nameText: { flex: 1 },
  nameLabel: { fontSize: 18, fontWeight: '800', color: cardInk },
  tick: { fontSize: 22, color: accent, width: 14, textAlign: 'center' },
});
