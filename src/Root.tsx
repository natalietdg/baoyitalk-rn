import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpeakerProvider, useSpeaker } from './speech/speaker';
import { SettingsProvider, useSettings } from './state/settings';
import { VoicePackProvider } from './state/voicePack';
import { PlayScreen } from './screens/PlayScreen';
import { SentencesScreen } from './screens/SentencesScreen';
import { StoriesScreen } from './screens/StoriesScreen';
import { WordsScreen } from './screens/WordsScreen';
import { ParentArea } from './screens/parent/ParentArea';
import { LanguageChips } from './ui/Chips';
import { ParentGate } from './ui/ParentGate';
import { accent, cardInk, paper, paperInk } from './ui/theme';

/** The four top-level surfaces. Words is the core loop and always the default. */
const modes = [
  { id: 'words', label: 'Words', art: '🔠', screen: WordsScreen },
  { id: 'sentences', label: 'Sentences', art: '💬', screen: SentencesScreen },
  { id: 'stories', label: 'Stories', art: '📖', screen: StoriesScreen },
  { id: 'play', label: 'Play', art: '👆', screen: PlayScreen },
] as const;

export const App: React.FC = () => (
  <SafeAreaProvider>
    <SettingsProvider>
      <VoicePackProvider>
        <SpeakerProvider>
          <Shell />
        </SpeakerProvider>
      </VoicePackProvider>
    </SettingsProvider>
  </SafeAreaProvider>
);

const Shell: React.FC = () => {
  const [modeId, setModeId] = useState<string>('words');
  const [parentOpen, setParentOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { stop } = useSpeaker();

  const mode = modes.find((m) => m.id === modeId) ?? modes[0];
  const Screen = mode.screen;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 4 }]}>
      <View style={styles.topBar}>
        <ParentGate onUnlock={() => setParentOpen(true)} />
        <LanguageChips />
        <Pressable
          onPress={() => update({ muted: !settings.muted })}
          testID="mute-button"
          accessibilityRole="button"
          accessibilityLabel={settings.muted ? 'Turn sound on' : 'Turn sound off'}
          style={styles.mute}
        >
          <Text allowFontScaling={false} style={styles.muteGlyph}>
            {settings.muted ? '🔇' : '🔊'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Screen />
      </View>

      <View style={[styles.switcher, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {modes.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => {
              stop();
              setModeId(item.id);
            }}
            testID={`mode-${item.id}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: item.id === modeId }}
            style={[styles.tile, item.id === modeId && styles.tileOn]}
          >
            <Text allowFontScaling={false} style={styles.tileArt}>{item.art}</Text>
            <Text
              allowFontScaling={false}
              style={[styles.tileLabel, item.id === modeId && styles.tileLabelOn]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Modal visible={parentOpen} animationType="slide" onRequestClose={() => setParentOpen(false)}>
        <ParentArea onClose={() => setParentOpen(false)} />
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: paper },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 8,
  },
  mute: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteGlyph: { fontSize: 19 },
  body: { flex: 1 },
  switcher: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#0000000F',
    backgroundColor: '#FFFFFFCC',
  },
  tile: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16, gap: 1 },
  tileOn: { backgroundColor: `${accent}18` },
  tileArt: { fontSize: 22 },
  tileLabel: { fontSize: 11, fontWeight: '800', color: paperInk },
  tileLabelOn: { color: accent },
});
