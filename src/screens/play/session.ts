import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * **The anti-dopamine contract, in one place.**
 *
 * Every Play activity runs a fixed, short list of rounds and then ends. What this hook refuses to
 * provide is as much the point as what it provides:
 *
 * - no score, no timer, no streak, no stars, no leaderboard — there is nothing to count
 * - no loss state — `advance()` is the only transition, and nothing can fail it
 * - no "play again" — `finished` renders a calm screen, and the only way on is the mode switcher
 * - one confetti burst when the last round lands, never per round
 *
 * Rounds are drawn once per mount, so a session is a fixed length decided before it starts and a
 * child cannot extend it by tapping.
 */
export const useSession = <T,>(pool: T[], rounds: number) => {
  const items = useMemo(() => shuffle(pool).slice(0, Math.min(rounds, pool.length)), [pool, rounds]);
  const [index, setIndex] = useState(0);
  const [confetti, setConfetti] = useState(0);

  const finished = index >= items.length;

  const advance = useCallback(() => setIndex((current) => current + 1), []);

  // The single burst, fired as an effect of finishing rather than from inside the state updater —
  // so a double-invoked updater in StrictMode cannot fire it twice.
  useEffect(() => {
    if (finished && items.length > 0) setConfetti(1);
  }, [finished, items.length]);

  return {
    round: finished ? null : items[index],
    /** 1-based, for the quiet page dots — deliberately not a score. */
    position: Math.min(index + 1, items.length),
    total: items.length,
    finished,
    advance,
    confetti,
  };
};

const shuffle = <T,>(input: T[]): T[] => {
  const copy = [...input];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
