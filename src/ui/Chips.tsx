import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { languages, modeChipLabel, type LanguageMode } from '../content';
import { useSettings } from '../state/settings';
import { accent, cardInk, paperInk } from './theme';

/**
 * EN / BM / 中文 / ×3.
 *
 * **Session-only.** Tapping a chip changes what the app speaks right now but never writes the
 * parent's saved default — a toddler batting at the strip must not reconfigure the app.
 */
export const LanguageChips: React.FC = () => {
  const { language, setSessionLanguage } = useSettings();
  const modes: LanguageMode[] = [...languages.map((l) => l.code), 'all'];

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {modes.map((mode) => {
        const selected = mode === language;
        return (
          <Pressable
            key={mode}
            onPress={() => setSessionLanguage(mode)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={
              mode === 'all' ? 'Speak all three languages' : `Speak ${mode.toUpperCase()}`
            }
            testID={`language-chip-${mode}`}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && styles.chipPressed,
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.chipText, selected && styles.chipTextSelected]}
            >
              {modeChipLabel(mode)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

/** The category strip above the words grid. */
export const Strip: React.FC<{
  items: { id: string; label: string; icon?: React.ReactNode }[];
  selected: string;
  onSelect: (id: string) => void;
  testIDPrefix: string;
}> = ({ items, selected, onSelect, testIDPrefix }) => (
  <View style={styles.strip}>
    {items.map((item) => {
      const isSelected = item.id === selected;
      return (
        <Pressable
          key={item.id}
          onPress={() => onSelect(item.id)}
          testID={`${testIDPrefix}-${item.id}`}
          accessibilityRole="tab"
          accessibilityState={{ selected: isSelected }}
          style={({ pressed }) => [
            styles.stripItem,
            isSelected && styles.chipSelected,
            pressed && styles.chipPressed,
          ]}
        >
          {item.icon}
          <Text
            allowFontScaling={false}
            style={[styles.stripText, isSelected && styles.chipTextSelected]}
          >
            {item.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  chip: {
    minWidth: 56,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  chipSelected: { backgroundColor: accent },
  chipPressed: { transform: [{ scale: 0.94 }] },
  chipText: { fontSize: 17, fontWeight: '800', color: cardInk },
  chipTextSelected: { color: '#FFFFFF' },
  strip: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  stripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  stripText: { fontSize: 13, fontWeight: '700', color: paperInk },
});
