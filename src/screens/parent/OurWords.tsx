import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Trilingual } from '../../content';
import { useSpeaker } from '../../speech/speaker';
import { privacyPromise, voiceItemKey } from '../../state/voicePack';
import { accent, cardInk, paperInk } from '../../ui/theme';

export type CustomSentence = { id: string; text: Trilingual };

const STORAGE_KEY = 'baoyitalk.ourWords.v1';

/**
 * Sentences the parent writes themselves — the things this family actually says.
 *
 * A parent can fill in one language or all three. **Blanks are skipped, not spoken as silence**,
 * so a sentence written only in Malay plays only Malay even in ×3 mode.
 */
export const useCustomSentences = () => {
  const [customSentences, setCustomSentences] = useState<CustomSentence[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setCustomSentences(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  const persist = useCallback((next: CustomSentence[]) => {
    setCustomSentences(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  return { customSentences, persist };
};

export const OurWords: React.FC = () => {
  const { customSentences, persist } = useCustomSentences();
  const { speakPhrase } = useSpeaker();
  const [draft, setDraft] = useState<Trilingual>({ en: '', ms: '', zh: '', pinyin: '' });

  const canAdd = [draft.en, draft.ms, draft.zh].some((value) => value.trim().length > 0);

  const add = () => {
    if (!canAdd) return;
    persist([
      ...customSentences,
      { id: `${Date.now()}`, text: { ...draft } },
    ]);
    setDraft({ en: '', ms: '', zh: '', pinyin: '' });
  };

  return (
    <ScrollView contentContainerStyle={styles.panel}>
      <Text allowFontScaling={false} style={styles.promise}>
        Sentences your family actually says. Fill in one language or all three — blanks are skipped,
        never spoken as silence. {privacyPromise}
      </Text>

      {(['en', 'ms', 'zh', 'pinyin'] as const).map((field) => (
        <TextInput
          key={field}
          value={draft[field] ?? ''}
          onChangeText={(value) => setDraft((current) => ({ ...current, [field]: value }))}
          placeholder={
            { en: 'English', ms: 'Bahasa Melayu', zh: '中文', pinyin: 'pinyin (optional, never spoken)' }[
              field
            ]
          }
          placeholderTextColor={paperInk}
          testID={`ourwords-${field}`}
          style={styles.input}
        />
      ))}

      <Pressable onPress={add} disabled={!canAdd} testID="ourwords-add"
        style={[styles.button, !canAdd && styles.buttonDim]}>
        <Text allowFontScaling={false} style={styles.buttonText}>Add sentence</Text>
      </Pressable>

      {customSentences.map((sentence) => (
        <View key={sentence.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            {(['en', 'ms', 'zh'] as const)
              .filter((code) => sentence.text[code]?.trim())
              .map((code) => (
                <Text key={code} allowFontScaling={false} style={styles.line}>
                  {sentence.text[code]}
                </Text>
              ))}
          </View>
          <Pressable
            onPress={() => speakPhrase(sentence.text, { itemKey: voiceItemKey('c', sentence.id) })}
            style={styles.smallButton}
          >
            <Text allowFontScaling={false} style={styles.smallButtonText}>play</Text>
          </Pressable>
          <Pressable
            onPress={() => persist(customSentences.filter((s) => s.id !== sentence.id))}
            style={styles.smallButton}
          >
            <Text allowFontScaling={false} style={styles.smallButtonText}>×</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 18, gap: 10, paddingBottom: 60 },
  promise: { fontSize: 12, color: paperInk, lineHeight: 17, fontWeight: '600' },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: cardInk,
  },
  button: { backgroundColor: accent, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  buttonDim: { opacity: 0.4 },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  line: { fontSize: 14, fontWeight: '700', color: cardInk },
  smallButton: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, backgroundColor: '#FFFFFF' },
  smallButtonText: { fontSize: 11, fontWeight: '800', color: cardInk },
});
