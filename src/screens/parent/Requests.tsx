import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { accent, cardInk, paperInk } from '../../ui/theme';

type Request = { id: string; text: string; at: string };

const STORAGE_KEY = 'baoyitalk.requests.v1';

/**
 * A parent's wishlist — words or stories they want added.
 *
 * **Stored on this device and nowhere else.** There is no submit endpoint, because a Kids Category
 * app makes zero network calls; the list is here so a parent can write things down and read them
 * back to the developer themselves. Saying so plainly is better than a fake "Sent!" toast.
 */
export const Requests: React.FC = () => {
  const [requests, setRequests] = useState<Request[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setRequests(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  const persist = (next: Request[]) => {
    setRequests(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  return (
    <ScrollView contentContainerStyle={styles.panel}>
      <Text allowFontScaling={false} style={styles.note}>
        Words or stories you'd like added. This list stays on your device — the app never sends
        anything anywhere.
      </Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="e.g. more animal sounds, a story about the pasar"
        placeholderTextColor={paperInk}
        testID="request-input"
        multiline
        style={styles.input}
      />
      <Pressable
        onPress={() => {
          if (!draft.trim()) return;
          persist([{ id: `${Date.now()}`, text: draft.trim(), at: new Date().toISOString() }, ...requests]);
          setDraft('');
        }}
        testID="request-add"
        style={styles.button}
      >
        <Text allowFontScaling={false} style={styles.buttonText}>Save to my list</Text>
      </Pressable>

      {requests.map((request) => (
        <View key={request.id} style={styles.row}>
          <Text allowFontScaling={false} style={styles.line}>{request.text}</Text>
          <Pressable
            onPress={() => persist(requests.filter((r) => r.id !== request.id))}
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
  note: { fontSize: 12, color: paperInk, lineHeight: 17, fontWeight: '600' },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    minHeight: 74,
    fontSize: 15,
    color: cardInk,
    textAlignVertical: 'top',
  },
  button: { backgroundColor: accent, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  line: { flex: 1, fontSize: 14, fontWeight: '700', color: cardInk },
  smallButton: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, backgroundColor: '#FFFFFF' },
  smallButtonText: { fontSize: 11, fontWeight: '800', color: cardInk },
});
