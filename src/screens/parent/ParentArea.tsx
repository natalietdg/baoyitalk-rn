import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { contentSummary, languages, sentences, words, type LanguageCode } from '../../content';
import { appendEngineLog, useEngineLog, useSpeaker } from '../../speech/speaker';
import { runAudioSpike } from '../../speech/spike';
import { nextSpeed, speedLabel, useSettings, type SpeedPreset } from '../../state/settings';
import { privacyPromise, useVoicePack, voiceItemKey } from '../../state/voicePack';
import { accent, cardInk, paper, paperInk } from '../../ui/theme';
import { OurWords, useCustomSentences } from './OurWords';
import { Requests } from './Requests';

type Tab = 'settings' | 'voice' | 'ourWords' | 'requests' | 'audio';

const tabs: { id: Tab; label: string }[] = [
  { id: 'settings', label: 'Settings' },
  { id: 'voice', label: 'Voice Pack' },
  { id: 'ourWords', label: 'Our words' },
  { id: 'requests', label: 'Requests' },
  { id: 'audio', label: 'Audio' },
];

/** Everything a grown-up can change lives behind the 3-second hold. Nothing here is child-facing. */
export const ParentArea: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<Tab>('settings');

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={styles.title}>
          For grown-ups
        </Text>
        <Pressable onPress={onClose} testID="parent-close" style={styles.done}
          accessibilityRole="button" accessibilityLabel="Done">
          <Text allowFontScaling={false} style={styles.doneText}>Done</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setTab(item.id)}
            testID={`parent-tab-${item.id}`}
            style={[styles.tab, tab === item.id && styles.tabOn]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.tabText, tab === item.id && styles.tabTextOn]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {tab === 'settings' ? <SettingsPanel /> : null}
      {tab === 'voice' ? <VoicePackPanel /> : null}
      {tab === 'ourWords' ? <OurWords /> : null}
      {tab === 'requests' ? <Requests /> : null}
      {tab === 'audio' ? <AudioPanel /> : null}
    </View>
  );
};

const SettingsPanel: React.FC = () => {
  const { settings, update } = useSettings();
  const { voices } = useSpeaker();

  return (
    <ScrollView contentContainerStyle={styles.panel}>
      <Row label="Default language" hint="What the app starts in. Chip taps don't change this.">
        <View style={styles.inlineChips}>
          {[...languages.map((l) => l.code), 'all'].map((mode) => (
            <Pressable
              key={mode}
              onPress={() => update({ defaultLanguage: mode as any })}
              testID={`default-language-${mode}`}
              style={[styles.pill, settings.defaultLanguage === mode && styles.pillOn]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.pillText, settings.defaultLanguage === mode && styles.pillTextOn]}
              >
                {mode === 'all' ? '×3' : (languages.find((l) => l.code === mode)?.chip ?? mode)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Row>

      <Row label="Speaking speed" hint="Slow is the default. It does not go slower — compact voices slur below this.">
        <Pressable
          onPress={() => update({ speed: nextSpeed(settings.speed) })}
          testID="speed-toggle"
          style={[styles.pill, styles.pillOn]}
        >
          <Text allowFontScaling={false} style={[styles.pillText, styles.pillTextOn]}>
            {speedLabel[settings.speed]} · {rateFor(settings.speed)}
          </Text>
        </Pressable>
      </Row>

      <Row label="Show pinyin" hint="A reading aid for you. It is never spoken.">
        <Switch
          value={settings.showPinyin}
          onValueChange={(value) => update({ showPinyin: value })}
          testID="pinyin-toggle"
        />
      </Row>

      <Row label="Mute all speech" hint="Taps still animate, so the app never looks broken.">
        <Switch
          value={settings.muted}
          onValueChange={(value) => update({ muted: value })}
          testID="mute-toggle"
        />
      </Row>

      <Row label="Stories advance themselves" hint="A one-year-old cannot reliably tap a page turn.">
        <Switch
          value={settings.storyAutoAdvance}
          onValueChange={(value) => update({ storyAutoAdvance: value })}
          testID="autoadvance-toggle"
        />
      </Row>

      <Text allowFontScaling={false} style={styles.sectionTitle}>Voices on this device</Text>
      {voices.map((voice) => (
        <Text key={voice.requested} allowFontScaling={false} style={styles.mono}>
          {voice.requested} → {voice.resolved ?? 'system default'} ({voice.quality ?? 'unknown'})
        </Text>
      ))}
      {voices.some((v) => v.quality === 'compact') ? (
        <Text allowFontScaling={false} style={styles.hint}>
          Some languages are on the compact voice, which sounds robotic. iOS Settings →
          Accessibility → Spoken Content → Voices lets you download a better one, free.
        </Text>
      ) : null}

      <Text allowFontScaling={false} style={styles.sectionTitle}>Content</Text>
      <Text allowFontScaling={false} style={styles.mono}>
        {contentSummary.words} words · {contentSummary.sentences} sentences ·{' '}
        {contentSummary.stories} stories
      </Text>
    </ScrollView>
  );
};

const rateFor = (speed: SpeedPreset) => ({ slow: '0.35', normal: '0.50', fast: '0.62' }[speed]);

/** The recorder. 18 starter items, three languages each — the parent's own voice wins over TTS. */
const VoicePackPanel: React.FC = () => {
  const voicePack = useVoicePack();
  const { speakPhrase } = useSpeaker();
  const { customSentences } = useCustomSentences();
  const [language, setLanguage] = useState<LanguageCode>('en');

  const items = [
    ...words.slice(0, 12).map((w) => ({ key: voiceItemKey('w', w.id), label: w.text[language], art: w.art })),
    ...sentences.slice(0, 6).map((s) => ({ key: voiceItemKey('s', s.id), label: s.text[language], art: null })),
    ...customSentences.map((s) => ({ key: voiceItemKey('c', s.id), label: s.text[language], art: null })),
  ];
  const done = items.filter((item) => voicePack.has(item.key, language)).length;

  return (
    <ScrollView contentContainerStyle={styles.panel}>
      <Text allowFontScaling={false} style={styles.promise}>{privacyPromise}</Text>
      <View style={styles.inlineChips}>
        {languages.map((l) => (
          <Pressable
            key={l.code}
            onPress={() => setLanguage(l.code)}
            style={[styles.pill, language === l.code && styles.pillOn]}
          >
            <Text allowFontScaling={false} style={[styles.pillText, language === l.code && styles.pillTextOn]}>
              {l.chip}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text allowFontScaling={false} style={styles.hint}>
        {done} of {items.length} recorded in {languages.find((l) => l.code === language)?.name}
      </Text>
      {voicePack.failure ? (
        <Text allowFontScaling={false} style={styles.failure}>{voicePack.failure}</Text>
      ) : null}

      {items.map((item) => {
        const recorded = voicePack.has(item.key, language);
        const recording = voicePack.recordingStem !== null &&
          voicePack.recordingStem.startsWith(item.key.replace(/:/g, '-'));
        return (
          <View key={item.key} style={styles.voiceRow}>
            <Text allowFontScaling={false} style={styles.voiceLabel} numberOfLines={1}>
              {item.label}
            </Text>
            {recorded ? (
              <Pressable
                onPress={() => speakPhrase({ en: item.label, ms: item.label, zh: item.label }, {
                  itemKey: item.key,
                  mode: language,
                })}
                style={styles.smallButton}
              >
                <Text allowFontScaling={false} style={styles.smallButtonText}>play</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() =>
                recording ? voicePack.stopRecording() : voicePack.startRecording(item.key, language)
              }
              testID={`record-${item.key}`}
              style={[styles.smallButton, recording && styles.recording]}
            >
              <Text allowFontScaling={false} style={styles.smallButtonText}>
                {recording ? 'stop' : recorded ? 're-record' : 'record'}
              </Text>
            </Pressable>
            {recorded ? (
              <Pressable onPress={() => voicePack.remove(item.key, language)} style={styles.smallButton}>
                <Text allowFontScaling={false} style={styles.smallButtonText}>×</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
};

/**
 * The audio evidence panel — the engine's own log, on screen.
 *
 * It exists because a green build proves nothing about sound. Every resolved voice, every applied
 * IPA pin and every utterance shows up here, so "is it actually speaking Mandarin with the pin?"
 * is answerable without a debugger.
 */
const AudioPanel: React.FC = () => {
  const log = useEngineLog();
  const { audioSession, voices } = useSpeaker();

  return (
    <ScrollView contentContainerStyle={styles.panel}>
      <Pressable
        onPress={() => runAudioSpike(appendEngineLog)}
        testID="run-audio-spike"
        style={[styles.button]}
      >
        <Text allowFontScaling={false} style={styles.buttonText}>Run the four-part audio spike</Text>
      </Pressable>
      <Text allowFontScaling={false} style={styles.sectionTitle}>Audio session</Text>
      <Text allowFontScaling={false} style={styles.mono} testID="audio-session-line">
        category={audioSession?.category ?? '…'} mode={audioSession?.mode ?? '…'} playsOnSilent=
        {String(audioSession?.playsWhenSilent ?? false)}
      </Text>
      <Text allowFontScaling={false} style={styles.sectionTitle}>Resolved voices</Text>
      {voices.map((voice) => (
        <Text key={voice.requested} allowFontScaling={false} style={styles.mono}>
          {voice.requested} → {voice.resolved ?? 'system'} ({voice.quality})
        </Text>
      ))}
      <Text allowFontScaling={false} style={styles.sectionTitle}>Engine log</Text>
      {log.slice(-60).reverse().map((line, index) => (
        <Text key={index} allowFontScaling={false} style={styles.logLine}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
};

const Row: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <View style={styles.row}>
    <View style={styles.rowText}>
      <Text allowFontScaling={false} style={styles.rowLabel}>{label}</Text>
      {hint ? <Text allowFontScaling={false} style={styles.hint}>{hint}</Text> : null}
    </View>
    {children}
  </View>
);

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: paper, paddingTop: 54 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  title: { fontSize: 22, fontWeight: '900', color: cardInk },
  done: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: accent },
  doneText: { color: '#FFFFFF', fontWeight: '800' },
  tabs: { paddingHorizontal: 14, gap: 8, paddingBottom: 8 },
  tab: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 14, backgroundColor: '#FFFFFF' },
  tabOn: { backgroundColor: accent },
  tabText: { fontWeight: '800', color: paperInk, fontSize: 13 },
  tabTextOn: { color: '#FFFFFF' },
  panel: { padding: 18, gap: 12, paddingBottom: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: '800', color: cardInk },
  hint: { fontSize: 12, color: paperInk, marginTop: 2, lineHeight: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: paperInk, marginTop: 12 },
  mono: { fontFamily: 'Menlo', fontSize: 11, color: cardInk },
  logLine: { fontFamily: 'Menlo', fontSize: 10, color: paperInk },
  inlineChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: '#FFFFFF' },
  pillOn: { backgroundColor: accent },
  pillText: { fontWeight: '800', color: cardInk, fontSize: 13 },
  pillTextOn: { color: '#FFFFFF' },
  promise: { fontSize: 12, color: paperInk, lineHeight: 17, fontWeight: '600' },
  failure: { fontSize: 12, color: '#B02020', fontWeight: '700' },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voiceLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: cardInk },
  smallButton: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  recording: { backgroundColor: '#F5C0C0' },
  smallButtonText: { fontSize: 11, fontWeight: '800', color: cardInk },
  button: { backgroundColor: accent, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: cardInk,
  },
});
