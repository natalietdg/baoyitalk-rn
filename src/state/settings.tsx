import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { LanguageMode } from '../content';

/** Three named presets, not a slider — a parent picks a word, not a number. */
export type SpeedPreset = 'slow' | 'normal' | 'fast';

/**
 * Anchored to `AVSpeechUtteranceDefaultSpeechRate` (0.5).
 *
 * **Stops at 0.35 deliberately:** below about 0.30 the compact system voices slur and stop being
 * clearer, so "slower" would be worse.
 */
export const speedRate: Record<SpeedPreset, number> = {
  slow: 0.35,
  normal: 0.5,
  fast: 0.62,
};

export const speedLabel: Record<SpeedPreset, string> = {
  slow: 'Slow',
  normal: 'Normal',
  fast: 'Fast',
};

export const nextSpeed = (current: SpeedPreset): SpeedPreset =>
  current === 'slow' ? 'normal' : current === 'normal' ? 'fast' : 'slow';

export type Settings = {
  /** The parent's saved default language. A child's chip tap must never overwrite this. */
  defaultLanguage: LanguageMode;
  /** Slow, because the app is for one- to four-year-olds. A parent can speed it up. */
  speed: SpeedPreset;
  /** Pinyin under Chinese text. On by default — it is the adult's reading aid. */
  showPinyin: boolean;
  /** Silences all speech app-wide. Muted taps keep their visual feedback. */
  muted: boolean;
  /** Read the next story page by itself when narration ends. */
  storyAutoAdvance: boolean;
};

const defaults: Settings = {
  defaultLanguage: 'all',
  speed: 'slow',
  showPinyin: true,
  muted: false,
  storyAutoAdvance: true,
};

const STORAGE_KEY = 'baoyitalk.settings.v1';

type Store = {
  settings: Settings;
  loaded: boolean;
  /** Writes through to disk. Only the parent area calls this. */
  update: (patch: Partial<Settings>) => void;
  /**
   * The language actually in use right now.
   *
   * **Session-only by design.** A child (or a parent showing off) taps a chip and the app follows
   * it, but nothing is persisted, so the next launch is back to the parent's saved default.
   */
  language: LanguageMode;
  setSessionLanguage: (mode: LanguageMode) => void;
};

const SettingsContext = createContext<Store | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [sessionLanguage, setSessionLanguage] = useState<LanguageMode | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSettings({ ...defaults, ...JSON.parse(raw) });
      })
      .catch(() => {
        // A missing or corrupt preferences file must not stop the app speaking.
      })
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      settings,
      loaded,
      update,
      language: sessionLanguage ?? settings.defaultLanguage,
      setSessionLanguage,
    }),
    [settings, loaded, update, sessionLanguage]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = (): Store => {
  const store = useContext(SettingsContext);
  if (!store) throw new Error('useSettings must be used inside SettingsProvider');
  return store;
};
