import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { spokenLanguages, stories, type Story } from '../content';
import { useSpeaker } from '../speech/speaker';
import { useSettings } from '../state/settings';
import { Scene } from '../ui/Art';
import { Pinyin, SpokenText } from '../ui/SpokenText';
import { accent, cardInk, paperInk, storyColours } from '../ui/theme';

export const StoriesScreen: React.FC = () => {
  const [open, setOpen] = useState<Story | null>(null);

  return (
    <>
      <ScrollView contentContainerStyle={styles.shelf} showsVerticalScrollIndicator={false}>
        {stories.map((story) => (
          <Pressable
            key={story.id}
            testID={`story-${story.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Read ${story.title.en}`}
            onPress={() => setOpen(story)}
            style={({ pressed }) => [
              styles.cover,
              { backgroundColor: storyColours[story.colour % storyColours.length] },
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
          >
            <Scene art={story.cover} size={54} />
            <Text allowFontScaling={false} style={styles.coverTitle} numberOfLines={2}>
              {story.title.en}
            </Text>
            <Text allowFontScaling={false} style={styles.coverMeta}>
              {story.pages.length} pages
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Modal visible={open !== null} animationType="slide" onRequestClose={() => setOpen(null)}>
        {open ? <StoryReader story={open} onClose={() => setOpen(null)} /> : null}
      </Modal>
    </>
  );
};

/**
 * A paged story reader: one line, one picture, one page.
 *
 * Toddler-safety rules baked in:
 * - **One tap out, always.** Close sits top-left, is never gated, disabled or hidden mid-page.
 * - **Nothing autoplays into a next story.** Auto-advance stops dead on the last page.
 * - **Speech stops on the way out**, so closing the book actually silences it.
 */
const StoryReader: React.FC<{ story: Story; onClose: () => void }> = ({ story, onClose }) => {
  const [pageIndex, setPageIndex] = useState(0);
  const { language, settings, update } = useSettings();
  const { speakPhrase, stop } = useSpeaker();
  const codes = spokenLanguages(language);
  const page = story.pages[pageIndex];
  const isLastPage = pageIndex === story.pages.length - 1;

  // Read from a ref inside the narration completion so auto-advance always sees the page the
  // reader is actually on, not the one captured when narration began.
  const pageRef = useRef(pageIndex);
  pageRef.current = pageIndex;
  const autoAdvance = useRef(settings.storyAutoAdvance);
  autoAdvance.current = settings.storyAutoAdvance;

  const narrate = useCallback(
    (index: number) => {
      speakPhrase(story.pages[index].line, {
        onFinished: () => {
          if (!autoAdvance.current) return;
          if (pageRef.current !== index) return; // the child already turned the page
          if (index >= story.pages.length - 1) return; // never autoplay past the end
          setPageIndex(index + 1);
        },
      });
    },
    [speakPhrase, story.pages]
  );

  useEffect(() => {
    narrate(pageIndex);
  }, [pageIndex, narrate]);

  useEffect(() => stop, [stop]);

  const leave = () => {
    stop();
    onClose();
  };

  return (
    <View
      style={[styles.reader, { backgroundColor: storyColours[story.colour % storyColours.length] }]}
    >
      <View style={styles.readerTop}>
        <Pressable onPress={leave} testID="story-close" style={styles.roundSmall}
          accessibilityRole="button" accessibilityLabel="Close the story">
          <Text allowFontScaling={false} style={styles.roundGlyph}>✕</Text>
        </Pressable>
        <View style={styles.topCluster}>
          <Pressable
            onPress={() => update({ muted: !settings.muted })}
            testID="story-mute"
            style={styles.roundSmall}
            accessibilityRole="button"
            accessibilityLabel={settings.muted ? 'Turn sound on' : 'Turn sound off'}
          >
            <Text allowFontScaling={false} style={styles.roundGlyph}>
              {settings.muted ? '🔇' : '🔊'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => narrate(pageIndex)}
            testID="story-replay"
            style={styles.roundSmall}
            accessibilityRole="button"
            accessibilityLabel="Read this page again"
          >
            <Text allowFontScaling={false} style={styles.roundGlyph}>↺</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.readerBody}>
        {/* The picture is also the page turn — the biggest, most obvious target on screen. */}
        <Pressable
          onPress={() => (isLastPage ? leave() : setPageIndex(pageIndex + 1))}
          testID="story-page-art"
          accessibilityRole="button"
          accessibilityLabel="Turn the page"
          style={styles.panel}
        >
          <Scene art={page.art} size={92} />
        </Pressable>

        <Pressable onPress={() => narrate(pageIndex)} style={styles.linesBox}>
          {codes.map((code) => (
            <View key={code}>
              <SpokenText text={page.line[code]} style={styles.storyLine} />
              {code === 'zh' ? (
                <Pinyin text={page.line.pinyin} show={settings.showPinyin} size={14} />
              ) : null}
            </View>
          ))}
        </Pressable>

        <View style={styles.dots}>
          {story.pages.map((_, index) => (
            <View
              key={index}
              style={[styles.dot, index === pageIndex ? styles.dotOn : styles.dotOff]}
            />
          ))}
        </View>

        <View style={styles.controls}>
          <Pressable
            onPress={() => setPageIndex(Math.max(0, pageIndex - 1))}
            disabled={pageIndex === 0}
            style={[styles.round, pageIndex === 0 && styles.roundDim]}
            accessibilityRole="button"
            accessibilityLabel="Previous page"
          >
            <Text allowFontScaling={false} style={styles.roundGlyphBig}>←</Text>
          </Pressable>
          {/* On the last page forward becomes "done" and leaves the book — never a dead end. */}
          <Pressable
            onPress={() => (isLastPage ? leave() : setPageIndex(pageIndex + 1))}
            testID="story-next"
            style={styles.round}
            accessibilityRole="button"
            accessibilityLabel={isLastPage ? 'Finish story' : 'Next page'}
          >
            <Text allowFontScaling={false} style={styles.roundGlyphBig}>
              {isLastPage ? '✓' : '→'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  shelf: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 12,
    paddingBottom: 28,
    justifyContent: 'center',
  },
  cover: {
    width: 150,
    height: 158,
    borderRadius: 22,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  coverTitle: { fontSize: 14, fontWeight: '800', color: cardInk, textAlign: 'center' },
  coverMeta: { fontSize: 11, fontWeight: '700', color: `${cardInk}99` },
  reader: { flex: 1, paddingHorizontal: 18, paddingTop: 54, paddingBottom: 18 },
  readerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topCluster: { flexDirection: 'row', gap: 8 },
  readerBody: { flex: 1, justifyContent: 'center', gap: 14 },
  panel: {
    backgroundColor: '#FFFFFF2E',
    borderRadius: 32,
    padding: 24,
    aspectRatio: 1.35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linesBox: { gap: 4, alignItems: 'center' },
  storyLine: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { borderRadius: 6 },
  dotOn: { width: 12, height: 12, backgroundColor: '#FFFFFF' },
  dotOff: { width: 8, height: 8, backgroundColor: '#FFFFFF66', marginVertical: 2 },
  controls: { flexDirection: 'row', gap: 24, justifyContent: 'center' },
  round: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundDim: { backgroundColor: '#FFFFFF59' },
  roundSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundGlyph: { fontSize: 19, color: accent, fontWeight: '800' },
  roundGlyphBig: { fontSize: 26, color: cardInk, fontWeight: '900' },
  meta: { color: paperInk },
});
