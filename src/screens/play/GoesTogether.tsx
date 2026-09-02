import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { play, wordById, type Trilingual } from '../../content';
import { useSpeaker } from '../../speech/speaker';
import { useSettings } from '../../state/settings';
import { Art } from '../../ui/Art';
import { ConfettiBurst } from '../../ui/Confetti';
import { Pinyin, SpokenText } from '../../ui/SpokenText';
import { cardInk, palette, paperInk } from '../../ui/theme';
import { useSession } from './session';
import { ActivityTitle, CalmEnd, RoundDots } from './shared';

/**
 * **"Goes together"** — an action, and things it could be done to.
 *
 * This is a linking activity, not a quiz. The child taps an object and the app speaks the
 * **relation as a whole phrase** — "drink the milk / minum susu / 喝牛奶" — which is the thing
 * being taught: the verb and the noun belong together in one breath.
 *
 * A pairing the data does not know gets a gentle spoken observation instead
 * ("Shoe? We don't usually drink that!"). **Nothing is ever marked wrong**, nothing turns red, and
 * the round still advances — a two-year-old exploring is not making a mistake.
 */
export const GoesTogether: React.FC = () => {
  const { speakPhrase } = useSpeaker();
  const { settings } = useSettings();
  const session = useSession(play.goesTogether.pairs, play.goesTogether.roundsPerSession);
  const [spoken, setSpoken] = useState<Trilingual | null>(null);

  const action = session.round?.action;

  /** The right object plus two decoys, so the choice is real without being a test. */
  const choices = useMemo(() => {
    if (!session.round) return [];
    const others = play.goesTogether.pairs
      .filter((pair) => pair.action !== session.round!.action)
      .map((pair) => pair.object);
    const decoys = [...new Set(others)].sort(() => Math.random() - 0.5).slice(0, 2);
    return [session.round.object, ...decoys].sort(() => Math.random() - 0.5);
  }, [session.round]);

  if (session.finished) {
    return (
      <>
        <CalmEnd line="That all goes together." />
        <ConfettiBurst trigger={session.confetti} />
      </>
    );
  }

  const actionWord = wordById(action!);

  const choose = (objectId: string) => {
    const match = play.goesTogether.pairs.find(
      (pair) => pair.action === action && pair.object === objectId
    );
    const object = wordById(objectId);

    if (match) {
      setSpoken(match.relation);
      speakPhrase(match.relation);
    } else {
      // A gentle observation, in the same three languages, with the object's own name in it.
      const template = play.goesTogether.observations.find((o) => o.action === action);
      const phrase: Trilingual = {
        en: (template?.phrase.en ?? '{word}?').replace('{word}', object?.text.en ?? ''),
        ms: (template?.phrase.ms ?? '{word}?').replace('{word}', object?.text.ms ?? ''),
        zh: (template?.phrase.zh ?? '{word}?').replace('{word}', object?.text.zh ?? ''),
        pinyin: (template?.phrase.pinyin ?? '').replace('{word}', object?.text.pinyin ?? ''),
      };
      setSpoken(phrase);
      speakPhrase(phrase);
    }
    // Both outcomes move on. There is no retry, because there was nothing to get right.
    setTimeout(() => {
      setSpoken(null);
      session.advance();
    }, 2600);
  };

  return (
    <View style={styles.root}>
      <ActivityTitle text="What goes together?" />
      <View style={styles.actionCard}>
        {actionWord ? <Art art={actionWord.art} size={64} /> : null}
        <Text allowFontScaling={false} style={styles.actionLabel}>
          {actionWord?.text.en}
        </Text>
      </View>

      {spoken ? (
        <View style={styles.spokenBox}>
          <SpokenText text={spoken.en} style={styles.spokenLine} />
          <SpokenText text={spoken.ms} style={styles.spokenLine} />
          <SpokenText text={spoken.zh} style={styles.spokenLine} />
          <Pinyin text={spoken.pinyin} show={settings.showPinyin} />
        </View>
      ) : (
        <View style={styles.choices}>
          {choices.map((objectId, index) => {
            const object = wordById(objectId);
            if (!object) return null;
            return (
              <Pressable
                key={objectId}
                testID={`goes-together-${objectId}`}
                accessibilityRole="button"
                accessibilityLabel={object.text.en}
                onPress={() => choose(objectId)}
                style={({ pressed }) => [
                  styles.choice,
                  { backgroundColor: palette[index % palette.length] },
                  pressed && { transform: [{ scale: 0.95 }] },
                ]}
              >
                <Art art={object.art} size={54} />
                <Text allowFontScaling={false} style={styles.choiceLabel}>
                  {object.text.en}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <RoundDots position={session.position} total={session.total} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 16 },
  actionCard: { alignItems: 'center', gap: 4 },
  actionLabel: { fontSize: 22, fontWeight: '900', color: cardInk },
  choices: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  choice: { width: 104, height: 116, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 4 },
  choiceLabel: { fontSize: 14, fontWeight: '800', color: cardInk },
  spokenBox: { alignItems: 'center', gap: 3, minHeight: 116, justifyContent: 'center' },
  spokenLine: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  meta: { color: paperInk },
});
