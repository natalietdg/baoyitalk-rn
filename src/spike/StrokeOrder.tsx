import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Path } from 'react-native-svg';

/**
 * **Real** Chinese stroke-order animation in React Native.
 *
 * `hanzi-writer` itself is a DOM library — it calls `document.createElementNS` and reads
 * `getTotalLength()`, neither of which exists in React Native. Its *data* package,
 * `hanzi-writer-data`, is plain JSON derived from Make Me a Hanzi: per-character stroke outlines as
 * SVG paths, in canonical writing order, plus a `median` polyline per stroke giving the direction
 * the brush travels. That is the part that carries the pedagogy, and it ports.
 *
 * The drawing technique here is the one hanzi-writer uses, reimplemented on `react-native-svg`:
 * clip to the stroke's outline, then sweep a 200-unit-wide line along that stroke's median with an
 * animated `strokeDashoffset`. The outline is never faked or approximated — it is the shipped
 * outline path, revealed progressively.
 */

/** hanzi-writer's coordinate space: x 0..1024, y -124..900, y axis pointing up. */
const GLYPH = { x0: 0, y0: -124, x1: 1024, y1: 900 };
/** hanzi-writer's `StrokeRendererBase.STROKE_WIDTH`. Wide enough to cover any single stroke. */
const BRUSH_WIDTH = 200;

export type CharacterData = { strokes: string[]; medians: [number, number][][] };

type Point = { x: number; y: number };

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Distance along a polyline — the substitute for the DOM's `getTotalLength()`. */
const polylineLength = (points: Point[]): number => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
};

/**
 * Pushes the first point back along its own heading so the round line cap begins outside the
 * outline. Without this the stroke appears to start with a blob already showing.
 */
const extendStart = (points: Point[], amount: number): Point[] => {
  if (points.length < 2) return points;
  const [first, second] = points;
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return points;
  const extended = { x: first.x + (dx / length) * amount, y: first.y + (dy / length) * amount };
  return [extended, ...points];
};

const toPathString = (points: Point[]): string =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

export default function StrokeOrder({
  character,
  data,
  size = 220,
  padding = 12,
  strokeDurationMs = 700,
  onStrokeDrawn,
  onComplete,
}: {
  character: string;
  data: CharacterData;
  size?: number;
  padding?: number;
  strokeDurationMs?: number;
  onStrokeDrawn?: (index: number, total: number) => void;
  onComplete?: (total: number) => void;
}) {
  const [visibleThrough, setVisibleThrough] = useState(-1);
  const [drawing, setDrawing] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  const geometry = useMemo(() => {
    const scale = (size - 2 * padding) / (GLYPH.x1 - GLYPH.x0);
    const yOffset = -GLYPH.y0 * scale + padding;
    const transform = `translate(${padding}, ${size - yOffset}) scale(${scale}, ${-scale})`;
    const strokes = data.strokes.map((outline, index) => {
      const points = (data.medians[index] ?? []).map(([x, y]) => ({ x, y }));
      const extended = extendStart(points, BRUSH_WIDTH / 2);
      return {
        outline,
        medianPath: toPathString(extended),
        // hanzi-writer adds half the brush width to account for the leading cap.
        length: polylineLength(extended) + BRUSH_WIDTH / 2,
      };
    });
    return { transform, strokes };
  }, [data, size, padding]);

  // Draws stroke `drawing`, then hands over to the next one. Order is the array order, which is
  // the canonical writing order in the source data.
  useEffect(() => {
    if (drawing >= geometry.strokes.length) {
      onComplete?.(geometry.strokes.length);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: strokeDurationMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (!finished) return;
      onStrokeDrawn?.(drawing, geometry.strokes.length);
      setVisibleThrough(drawing);
      setDrawing((n) => n + 1);
    });
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, geometry.strokes.length, strokeDurationMs]);

  const current = geometry.strokes[drawing];

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <Defs>
          {geometry.strokes.map((stroke, i) => (
            <ClipPath id={`stroke-clip-${character}-${i}`} key={i}>
              <Path d={stroke.outline} transform={geometry.transform} />
            </ClipPath>
          ))}
        </Defs>

        {/* Strokes already finished stay on screen as solid outlines. */}
        {geometry.strokes.slice(0, visibleThrough + 1).map((stroke, i) => (
          <Path key={`done-${i}`} d={stroke.outline} fill="#1b1b1b" transform={geometry.transform} />
        ))}

        {/* The stroke being written: a brush sweeping the median, clipped to the real outline. */}
        {current ? (
          <G clipPath={`url(#stroke-clip-${character}-${drawing})`}>
            <AnimatedPath
              d={current.medianPath}
              transform={geometry.transform}
              stroke="#d9480f"
              strokeWidth={BRUSH_WIDTH}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${current.length},${current.length}`}
              strokeDashoffset={progress.interpolate({
                inputRange: [0, 1],
                outputRange: [current.length, 0],
              })}
            />
          </G>
        ) : null}
      </Svg>
      <Text style={styles.caption}>
        {character} · stroke {Math.min(drawing + 1, geometry.strokes.length)}/
        {geometry.strokes.length}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  caption: { fontSize: 11, color: '#444', marginTop: 2 },
});
