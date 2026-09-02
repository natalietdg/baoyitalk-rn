import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { bcp47, type LanguageCode } from '../content';

/**
 * **The Parent Voice Pack: the parent's own voice, recorded and played on this device only.**
 *
 * A toddler learns words from the person who loves them, and no system voice is that person. So a
 * recording, when there is one, always wins over TTS.
 *
 * Playback priority is exactly two tiers — **parent recording → TTS**. There is deliberately no
 * bundled-recordings tier: shipping a stranger's studio voice would sound like a person who isn't
 * the parent, which is worse than sounding like nobody.
 *
 * **Storage promise:** recordings live in the app's own document directory and there is no upload
 * path anywhere in this codebase, because none was written.
 */
export const privacyPromise =
  "Your recordings never leave this device. We don't upload, store, or process them anywhere. Delete them any time.";

export type VoiceItemKind = 'w' | 's' | 'c';

/** The stable key that names the file on disk — a kind prefix plus the item's own id. */
export const voiceItemKey = (kind: VoiceItemKind, itemId: string): string => `${kind}:${itemId}`;

const fileStem = (itemKey: string, language: LanguageCode): string =>
  `${itemKey.replace(/:/g, '-')}__${bcp47(language)}`;

const directory = new Directory(Paths.document, 'ParentVoice');

const ensureDirectory = () => {
  if (!directory.exists) directory.create({ intermediates: true });
};

type Store = {
  /** File stems that have a recording — one per (item, language) pair. */
  recorded: Set<string>;
  /** Non-nil while recording, so the row being recorded can show it live. */
  recordingStem: string | null;
  failure: string | null;
  uriFor: (itemKey: string, language: LanguageCode) => string | null;
  has: (itemKey: string, language: LanguageCode) => boolean;
  startRecording: (itemKey: string, language: LanguageCode) => Promise<void>;
  stopRecording: () => Promise<void>;
  remove: (itemKey: string, language: LanguageCode) => void;
  refresh: () => void;
};

const VoicePackContext = createContext<Store | null>(null);

export const VoicePackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recorded, setRecorded] = useState<Set<string>>(() => new Set());
  const [recordingStem, setRecordingStem] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const recorder = useRef<any>(null);

  const refresh = useCallback(() => {
    try {
      ensureDirectory();
      const stems = directory
        .list()
        .filter((entry) => entry instanceof File && entry.name.endsWith('.m4a'))
        .map((entry) => entry.name.replace(/\.m4a$/, ''));
      setRecorded(new Set(stems));
    } catch {
      setRecorded(new Set());
    }
  }, []);

  const uriFor = useCallback(
    (itemKey: string, language: LanguageCode) => {
      const stem = fileStem(itemKey, language);
      if (!recorded.has(stem)) return null;
      return new File(directory, `${stem}.m4a`).uri;
    },
    [recorded]
  );

  const has = useCallback(
    (itemKey: string, language: LanguageCode) => recorded.has(fileStem(itemKey, language)),
    [recorded]
  );

  const startRecording = useCallback(async (itemKey: string, language: LanguageCode) => {
    setFailure(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setFailure('Microphone access is off. Turn it on in iOS Settings to record.');
        return;
      }
      // Recording needs playAndRecord; the mode is put back on stop so speech keeps ignoring
      // the ringer switch.
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      ensureDirectory();
      const created = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
      await created.prepareToRecordAsync();
      created.record();
      recorder.current = { instance: created, stem: fileStem(itemKey, language) };
      setRecordingStem(fileStem(itemKey, language));
    } catch (error: any) {
      setFailure(error?.message ?? 'Recording could not start.');
      setRecordingStem(null);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const active = recorder.current;
    recorder.current = null;
    setRecordingStem(null);
    if (!active) return;
    try {
      await active.instance.stop();
      const source = active.instance.uri;
      if (source) {
        ensureDirectory();
        const target = new File(directory, `${active.stem}.m4a`);
        if (target.exists) target.delete();
        await new File(source).move(target);
      }
    } catch (error: any) {
      setFailure(error?.message ?? 'Recording could not be saved.');
    } finally {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
      refresh();
    }
  }, [refresh]);

  const remove = useCallback(
    (itemKey: string, language: LanguageCode) => {
      const target = new File(directory, `${fileStem(itemKey, language)}.m4a`);
      if (target.exists) target.delete();
      refresh();
    },
    [refresh]
  );

  const value = useMemo<Store>(
    () => ({
      recorded,
      recordingStem,
      failure,
      uriFor,
      has,
      startRecording,
      stopRecording,
      remove,
      refresh,
    }),
    [recorded, recordingStem, failure, uriFor, has, startRecording, stopRecording, remove, refresh]
  );

  return <VoicePackContext.Provider value={value}>{children}</VoicePackContext.Provider>;
};

export const useVoicePack = (): Store => {
  const store = useContext(VoicePackContext);
  if (!store) throw new Error('useVoicePack must be used inside VoicePackProvider');
  return store;
};
