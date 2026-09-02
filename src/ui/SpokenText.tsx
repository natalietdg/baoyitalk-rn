import React from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';

import { useHighlight } from '../speech/speaker';
import { cardInk, paperInk, spotlightInk } from './theme';

/**
 * A line of text whose current word lights up while the engine reads it.
 *
 * Fed by `AVSpeechSynthesizerDelegate`'s word-boundary callback, which also reports ranges for
 * Mandarin — so 猫 lights up inside 猫在睡觉。exactly like "cat" does.
 *
 * Both colours are set on the runs explicitly rather than inherited, so the spotlight wins
 * regardless of what colour an ancestor applies.
 */
export const SpokenText: React.FC<{
  text: string;
  style?: TextStyle | TextStyle[];
  base?: string;
}> = ({ text, style, base = cardInk }) => {
  const highlight = useHighlight([text]);

  if (!highlight || highlight.start < 0 || highlight.end > text.length) {
    return (
      <Text style={[style, { color: base }]} allowFontScaling={false}>
        {text}
      </Text>
    );
  }
  return (
    <Text style={[style, { color: base }]} allowFontScaling={false}>
      {text.slice(0, highlight.start)}
      <Text style={{ color: spotlightInk }}>{text.slice(highlight.start, highlight.end)}</Text>
      {text.slice(highlight.end)}
    </Text>
  );
};

/**
 * Hanyu Pinyin under the Chinese line — **an adult reading aid, and display-only.**
 *
 * It is never a language the app can be asked to speak: `spokenLanguages` iterates the three
 * language codes, and pinyin is not one of them. Pronunciation comes from the characters plus the
 * IPA pins.
 */
export const Pinyin: React.FC<{ text?: string; show: boolean; size?: number }> = ({
  text,
  show,
  size = 15,
}) => {
  if (!show || !text?.trim()) return null;
  return (
    <Text allowFontScaling={false} style={[styles.pinyin, { fontSize: size }]}>
      {text}
    </Text>
  );
};

const styles = StyleSheet.create({
  pinyin: { color: paperInk, fontWeight: '600', textAlign: 'center', letterSpacing: 0.2 },
});
