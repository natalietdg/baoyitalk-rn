import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { categories, wordsIn, type CategoryId } from '../content';
import { useSpeaker } from '../speech/speaker';
import { useSettings } from '../state/settings';
import { Art } from '../ui/Art';
import { Strip } from '../ui/Chips';
import { WordCard } from '../ui/Cards';
import { paperInk } from '../ui/theme';

/**
 * The core loop: a grid of first words with a category strip above it.
 *
 * Tapping a card speaks it. **Counting cards count instead** — a quantity card that just said
 * "four" would teach the label without the sequence.
 */
export const WordsScreen: React.FC = () => {
  const [category, setCategory] = useState<CategoryId>('all');
  const { language, settings } = useSettings();
  const { speakWord, countWord } = useSpeaker();
  const { width } = useWindowDimensions();

  // Cards stay finger-sized on a phone and simply get more columns on an iPad, rather than
  // stretching into six enormous cards.
  const columns = width >= 900 ? 5 : width >= 700 ? 4 : 3;
  const gap = 10;
  const cardWidth = (width - 24 - gap * (columns - 1)) / columns;

  const shown = useMemo(() => wordsIn(category), [category]);

  return (
    <View style={styles.root}>
      <Strip
        testIDPrefix="category"
        selected={category}
        onSelect={(id) => setCategory(id as CategoryId)}
        items={categories.map((c) => ({
          id: c.id,
          label: c.label,
          icon: <Art art={c.art} size={18} />,
        }))}
      />
      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {shown.map((word) => (
          <WordCard
            key={word.id}
            word={word}
            mode={language}
            showPinyin={settings.showPinyin}
            width={cardWidth}
            onPress={() => (word.quantity ? countWord(word) : speakWord(word))}
          />
        ))}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {shown.length} {shown.length === 1 ? 'word' : 'words'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 24,
    justifyContent: 'center',
  },
  footer: { width: '100%', alignItems: 'center', paddingTop: 6 },
  footerText: { color: paperInk, fontSize: 12, fontWeight: '700' },
});
