import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import BaoyiSpeech, { type AudioSessionState, type SpeechPart } from '../../modules/baoyi-speech';
import {
  bcp47,
  numberWord,
  spokenLanguages,
  type LanguageCode,
  type LanguageMode,
  type Trilingual,
  type Word,
} from '../content';
import { mandarinPins } from '../content/pronunciation';
import { speedRate, useSettings } from '../state/settings';
import { useVoicePack, voiceItemKey } from '../state/voicePack';

/** Which slice of which line is being spoken right now. */
export type Highlight = { text: string; start: number; end: number };

/**
 * A tiny external store for the two values that change several times a second.
 *
 * Deliberately **not** React state on the provider: a highlight changes per word, and anything
 * subscribed to the provider (the whole word grid) would re-render with it. Components subscribe
 * to just the slice they draw.
 */
class Signal<T> {
  private listeners = new Set<() => void>();
  constructor(private value: T) {}
  get = () => this.value;
  set = (next: T) => {
    if (next === this.value) return;
    this.value = next;
    this.listeners.forEach((listen) => listen());
  };
  subscribe = (listen: () => void) => {
    this.listeners.add(listen);
    return () => this.listeners.delete(listen);
  };
}

const highlightSignal = new Signal<Highlight | null>(null);
const countingSignal = new Signal<{ wordId: string | null; revealed: number }>({
  wordId: null,
  revealed: 0,
});
const logSignal = new Signal<string[]>([]);

/** Subscribes to the spotlight, but only for the lines *this* view shows. */
export const useHighlight = (lines: string[]): Highlight | null => {
  const highlight = useSyncExternalStore(highlightSignal.subscribe, highlightSignal.get);
  if (!highlight) return null;
  return lines.includes(highlight.text) ? highlight : null;
};

export const useCountingProgress = (wordId: string): number => {
  const progress = useSyncExternalStore(countingSignal.subscribe, countingSignal.get);
  return progress.wordId === wordId ? progress.revealed : 0;
};

/** The engine's own log, surfaced in the parent area as the audio evidence panel. */
export const useEngineLog = (): string[] =>
  useSyncExternalStore(logSignal.subscribe, logSignal.get);

/** Lets the audio spike write its findings into the same log the engine writes to. */
export const appendEngineLog = (line: string): void => {
  logSignal.set([...logSignal.get().slice(-199), line]);
  // eslint-disable-next-line no-console
  console.log(`[spike] ${line}`);
};

type Store = {
  /** Speaks a word — the plain card tap. */
  speakWord: (word: Word, mode?: LanguageMode) => void;
  /** Counts a quantity card out loud, revealing one object per number. */
  countWord: (word: Word, mode?: LanguageMode) => void;
  /** Speaks any phrase. `itemKey` opts the phrase into parent-recording lookup. */
  speakPhrase: (
    phrase: Trilingual,
    options?: { itemKey?: string; mode?: LanguageMode; onFinished?: () => void }
  ) => void;
  stop: () => void;
  audioSession: AudioSessionState | null;
  /** What voice each language resolved to, and at what quality tier. */
  voices: { requested: string; resolved: string | null; quality: string | null }[];
};

const SpeakerContext = createContext<Store | null>(null);

export const SpeakerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings, language } = useSettings();
  const voicePack = useVoicePack();
  const [audioSession, setAudioSession] = React.useState<AudioSessionState | null>(null);
  const [voices, setVoices] = React.useState<Store['voices']>([]);

  /** Fires when the batch it was registered for finishes. Cleared by any stop. */
  const pendingCompletion = useRef<{ batchId: string; run: () => void } | null>(null);
  const batchCounter = useRef(0);

  // Settings are read at speak time, never captured, so changing the speed takes effect on the
  // next line without interrupting the one being spoken.
  const live = useRef({ settings, language });
  live.current = { settings, language };

  // Mute lives in the engine, because it has to reach the utterance already in flight.
  useEffect(() => {
    BaoyiSpeech.setMuted(settings.muted);
  }, [settings.muted]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await BaoyiSpeech.configureAudioSession();
      await BaoyiSpeech.setPronunciationPins(mandarinPins);
      const resolved = await BaoyiSpeech.resolvedVoices();
      if (cancelled) return;
      setAudioSession(session);
      setVoices(resolved);
    })();
    voicePack.refresh();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscriptions = [
      BaoyiSpeech.addListener('onBoundary', ({ text, location, length }) => {
        highlightSignal.set({ text, start: location, end: location + length });
      }),
      BaoyiSpeech.addListener('onPartStarted', () => {
        highlightSignal.set(null);
      }),
      BaoyiSpeech.addListener('onReveal', ({ count }) => {
        const current = countingSignal.get();
        countingSignal.set({ wordId: current.wordId, revealed: count });
      }),
      BaoyiSpeech.addListener('onBatchFinished', ({ batchId }) => {
        highlightSignal.set(null);
        countingSignal.set({ wordId: null, revealed: 0 });
        const pending = pendingCompletion.current;
        if (pending && pending.batchId === batchId) {
          pendingCompletion.current = null;
          pending.run();
        }
      }),
      BaoyiSpeech.addListener('onBatchStopped', () => {
        highlightSignal.set(null);
        countingSignal.set({ wordId: null, revealed: 0 });
      }),
      BaoyiSpeech.addListener('onEngineLog', ({ message }) => {
        logSignal.set([...logSignal.get().slice(-199), message]);
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  const stop = useCallback(() => {
    // Cleared before the stop, so cancelling never fires a completion that would auto-advance a
    // story a child just closed.
    pendingCompletion.current = null;
    highlightSignal.set(null);
    countingSignal.set({ wordId: null, revealed: 0 });
    BaoyiSpeech.stop();
  }, []);

  /** The one path from "say this" to the engine. Everything public funnels through it. */
  const run = useCallback(
    (
      parts: SpeechPart[],
      options?: { onFinished?: () => void; countingWordId?: string }
    ) => {
      const { settings: current } = live.current;
      batchCounter.current += 1;
      const batchId = `b${batchCounter.current}`;

      // Mute is handled natively as volume 0, **not** by skipping the utterance — see
      // `SpeechEngine.muted`. Returning early here instead would fire this completion
      // immediately, and a muted story would flip through all ten pages in one frame.
      pendingCompletion.current = options?.onFinished
        ? { batchId, run: options.onFinished }
        : null;
      countingSignal.set({ wordId: options?.countingWordId ?? null, revealed: 0 });
      BaoyiSpeech.speak(batchId, parts, speedRate[current.speed]);
    },
    []
  );

  const partsFor = useCallback(
    (phrase: Trilingual, mode: LanguageMode, itemKey?: string): SpeechPart[] =>
      spokenLanguages(mode)
        // Missing languages are **skipped, not spoken as empty strings** — in ×3 a parent who
        // filled in only Malay hears only Malay, not two silences.
        .map((code) => ({ code, text: (phrase[code] ?? '').trim() }))
        .filter(({ text }) => text.length > 0)
        .map(({ code, text }) => ({
          text,
          bcp47: bcp47(code),
          recordingUri: itemKey ? voicePack.uriFor(itemKey, code) : null,
        })),
    [voicePack]
  );

  const speakWord = useCallback(
    (word: Word, mode?: LanguageMode) => {
      run(partsFor(word.text, mode ?? live.current.language, voiceItemKey('w', word.id)));
    },
    [partsFor, run]
  );

  /**
   * Counts a number card out loud — "one, two, three… three" — so the child hears the sequence,
   * not just the label.
   *
   * In ×3 each language counts all the way through before the next starts; interleaving
   * "one, satu, 一, two…" teaches the wrong thing.
   */
  const countWord = useCallback(
    (word: Word, mode?: LanguageMode) => {
      const total = word.quantity;
      if (!total) {
        speakWord(word, mode);
        return;
      }
      const parts: SpeechPart[] = [];
      for (const code of spokenLanguages(mode ?? live.current.language)) {
        for (let step = 1; step <= total; step += 1) {
          const number = numberWord(step);
          if (!number) continue;
          parts.push({
            text: number.text[code],
            bcp47: bcp47(code),
            recordingUri: voicePack.uriFor(voiceItemKey('w', number.id), code),
            reveal: step,
          });
        }
        // The answer, after the count. Skipped at one, where "one, one" is just odd.
        if (total > 1) {
          parts.push({
            text: word.text[code],
            bcp47: bcp47(code),
            recordingUri: voicePack.uriFor(voiceItemKey('w', word.id), code),
            reveal: total,
          });
        }
      }
      run(parts, { countingWordId: word.id });
    },
    [run, speakWord, voicePack]
  );

  const speakPhrase = useCallback<Store['speakPhrase']>(
    (phrase, options) => {
      run(partsFor(phrase, options?.mode ?? live.current.language, options?.itemKey), {
        onFinished: options?.onFinished,
      });
    },
    [partsFor, run]
  );

  const value = useMemo<Store>(
    () => ({ speakWord, countWord, speakPhrase, stop, audioSession, voices }),
    [speakWord, countWord, speakPhrase, stop, audioSession, voices]
  );

  return <SpeakerContext.Provider value={value}>{children}</SpeakerContext.Provider>;
};

export const useSpeaker = (): Store => {
  const store = useContext(SpeakerContext);
  if (!store) throw new Error('useSpeaker must be used inside SpeakerProvider');
  return store;
};
