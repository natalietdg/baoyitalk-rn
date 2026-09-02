import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { sentences, spokenLanguages } from '../content';
import { useSpeaker } from '../speech/speaker';
import { useSettings } from '../state/settings';
import { Scene } from '../ui/Art';
import { Pinyin, SpokenText } from '../ui/SpokenText';
import { palette } from '../ui/theme';
import { voiceItemKey } from '../state/voicePack';

/** Whole sentences, so words are heard in the shape a parent actually says them. */
export const SentencesScreen: React.FC = () => {
  const { language, settings } = useSettings();
  const { speakPhrase } = useSpeaker();
  const codes = spokenLanguages(language);

  return (
    <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      {sentences.map((sentence, index) => (
        <Pressable
          key={sentence.id}
          testID={`sentence-card-${sentence.id}`}
          accessibilityRole="button"
          accessibilityLabel={codes.map((code) => sentence.text[code]).join(', ')}
          onPress={() =>
            speakPhrase(sentence.text, { itemKey: voiceItemKey('s', sentence.id) })
          }
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: palette[index % palette.length] },
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.art}>
            <Scene art={sentence.art} size={56} />
          </View>
          <View style={styles.lines}>
            {codes.map((code) => (
              <View key={code}>
                <SpokenText text={sentence.text[code]} style={styles.line} />
                {code === 'zh' ? (
                  <Pinyin text={sentence.text.pinyin} show={settings.showPinyin} size={13} />
                ) : null}
              </View>
            ))}
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  list: { padding: 12, gap: 10, paddingBottom: 28 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pressed: { transform: [{ scale: 0.98 }] },
  art: { width: 70, alignItems: 'center' },
  lines: { flex: 1, gap: 3 },
  line: { fontSize: 17, fontWeight: '800' },
});
