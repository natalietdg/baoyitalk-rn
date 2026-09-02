import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { parseArt, type CardArt, type SceneArt } from '../content';
import { colourSwatches } from './theme';

/**
 * One picture — an emoji glyph, or a plain colour swatch for the colour words.
 *
 * **Why a font glyph here and a bundled PNG in the SwiftUI app.** The Swift version had to ship
 * 135 Noto Color Emoji PNGs because SwiftUI's `Text` drew the missing-glyph box at card sizes in
 * the simulator. React Native's `<Text>` is UIKit text layout, which rasterises Apple Color Emoji
 * at any point size — verified on the iPhone 17 Pro simulator at card size. So the glyph is used
 * directly and the PNG pipeline stays unnecessary. If a future iOS version regresses this, the
 * 135 PNGs in the Swift repo's `Assets.xcassets/Art` are the drop-in fallback.
 */
export const Art: React.FC<{ art: CardArt; size: number }> = ({ art, size }) => {
  if (art.kind === 'swatch') {
    return (
      <View
        style={{
          width: size * 0.86,
          height: size * 0.86,
          borderRadius: size * 0.2,
          backgroundColor: colourSwatches[art.colour] ?? '#CCCCCC',
          borderWidth: art.colour === 'white' ? 2 : 0,
          borderColor: '#00000022',
        }}
      />
    );
  }
  return (
    <Text
      allowFontScaling={false}
      style={[styles.glyph, { fontSize: size * 0.82, lineHeight: size }]}
    >
      {art.emoji}
    </Text>
  );
};

/** A sentence or story picture: one, two or three glyphs on a panel. */
export const Scene: React.FC<{ art: SceneArt; size: number }> = ({ art, size }) => {
  const glyphs = art.arts.slice(0, art.layout === 'single' ? 1 : art.layout === 'pair' ? 2 : 3);
  const each = glyphs.length === 1 ? size : glyphs.length === 2 ? size * 0.62 : size * 0.46;
  return (
    <View style={styles.scene}>
      {glyphs.map((emoji, index) => (
        <Art key={`${emoji}-${index}`} art={parseArt(emoji)} size={each} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  glyph: { textAlign: 'center' },
  scene: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
