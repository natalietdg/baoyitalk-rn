import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { parseArt } from '../content';
import { useSpeaker } from '../speech/speaker';
import { Art } from '../ui/Art';
import { cardInk, palette, paperInk } from '../ui/theme';
import { Belongs } from './play/Belongs';
import { CountFingers } from './play/CountFingers';
import { GoesTogether } from './play/GoesTogether';
import { ThreeNames } from './play/ThreeNames';

/**
 * **Play, never "Quiz".** Nothing in here tests the child.
 *
 * All four activities build a *relation* between things the child already meets in Words —
 * verb to object, one thing to three names, item to category, number to finger. None of them asks
 * for a word back and none of them can be failed.
 *
 * Sessions are short and fixed (3–6 rounds, under two minutes) and always end on a calm screen.
 */
const activities = [
  { id: 'goes-together', art: '🥛', title: 'Goes together', component: GoesTogether },
  { id: 'three-names', art: '🐱', title: 'Same thing, three names', component: ThreeNames },
  { id: 'belongs', art: '🧺', title: 'Where does it belong?', component: Belongs },
  { id: 'count-fingers', art: '☝️', title: 'Count with your finger', component: CountFingers },
] as const;

export const PlayScreen: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(null);
  const { stop } = useSpeaker();
  const open = activities.find((activity) => activity.id === openId);

  if (open) {
    const Activity = open.component;
    return (
      <View style={styles.activityRoot}>
        <Pressable
          onPress={() => {
            stop();
            setOpenId(null);
          }}
          testID="play-close"
          accessibilityRole="button"
          accessibilityLabel="Leave this activity"
          style={styles.close}
        >
          <Text allowFontScaling={false} style={styles.closeGlyph}>
            ✕
          </Text>
        </Pressable>
        {/* Keyed on the activity so leaving and re-entering starts a genuinely new session. */}
        <Activity key={open.id} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text allowFontScaling={false} style={styles.lead}>
        Things that go together
      </Text>
      <View style={styles.tiles}>
        {activities.map((activity, index) => (
          <Pressable
            key={activity.id}
            testID={`play-${activity.id}`}
            accessibilityRole="button"
            accessibilityLabel={activity.title}
            onPress={() => setOpenId(activity.id)}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: palette[index % palette.length] },
              pressed && { transform: [{ scale: 0.96 }] },
            ]}
          >
            <Art art={parseArt(activity.art)} size={58} />
            <Text allowFontScaling={false} style={styles.tileTitle}>
              {activity.title}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text allowFontScaling={false} style={styles.note}>
        Short sessions. Nothing to win, nothing to lose.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 },
  lead: { fontSize: 17, fontWeight: '800', color: paperInk },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  tile: {
    width: 152,
    height: 140,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 10,
  },
  tileTitle: { fontSize: 14, fontWeight: '800', color: cardInk, textAlign: 'center' },
  note: { fontSize: 12, fontWeight: '600', color: paperInk },
  activityRoot: { flex: 1 },
  close: {
    position: 'absolute',
    top: 4,
    left: 12,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: { fontSize: 18, fontWeight: '800', color: cardInk },
});
