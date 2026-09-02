import { NativeModule, requireNativeModule } from 'expo';

/** One thing to say: text in one language, optionally a parent recording instead of TTS. */
export type SpeechPart = {
  text: string;
  bcp47: string;
  /** A parent's own recording. Wins over the system voice when present. */
  recordingUri?: string | null;
  /** Counting only: how many objects should be showing while this part is spoken. */
  reveal?: number | null;
};

export type VoiceQuality = 'premium' | 'enhanced' | 'compact' | 'unknown';

export type Voice = {
  identifier: string;
  name: string;
  language: string;
  quality: VoiceQuality;
  qualityRank: number;
};

export type ResolvedVoice = {
  requested: string;
  resolved: string | null;
  name?: string;
  language?: string;
  quality: VoiceQuality | null;
  /** True when no voice for the exact BCP-47 code was installed. */
  isFallback: boolean;
};

export type AudioSessionState = {
  category: string;
  mode: string;
  /** The whole point: true means the ringer switch is ignored. */
  playsWhenSilent: boolean;
  error: string | null;
};

/** Output of an ear-free pronunciation render. Two of these compared is the polyphone test. */
export type PhonemeProbeResult = {
  text: string;
  bcp47: string;
  voice: string;
  pinned: boolean;
  pinsApplied: string[];
  phonemes: string[];
  phonemeString: string;
  markers: string[];
  /** Fingerprint of the rendered PCM. Same text, different hash = the pin changed the audio. */
  audioSha256: string;
  audioBytes: number;
  audioFrames: number;
  sampleRate: number;
  end: 'done' | 'timeout';
};

type Events = {
  /** Word-boundary spotlight: which slice of which part is being spoken right now. */
  onBoundary: (e: {
    batchId: string;
    partIndex: number;
    text: string;
    location: number;
    length: number;
  }) => void;
  onPartStarted: (e: { batchId: string; partIndex: number; text: string; bcp47: string }) => void;
  onReveal: (e: { batchId: string; count: number }) => void;
  onBatchFinished: (e: { batchId: string }) => void;
  onBatchStopped: (e: { batchId: string }) => void;
  onEngineLog: (e: { message: string }) => void;
};

declare class BaoyiSpeechModule extends NativeModule<Events> {
  configureAudioSession(): Promise<AudioSessionState>;
  listVoices(): Promise<Voice[]>;
  resolvedVoices(): Promise<ResolvedVoice[]>;
  setPronunciationPins(pins: Record<string, string>): Promise<void>;
  /** Renders without playing; reports the phonemes chosen and a hash of the audio. */
  phonemeProbe(
    text: string,
    bcp47: string,
    voiceIdentifier: string | null,
    pins: Record<string, string>
  ): Promise<PhonemeProbeResult>;
  /** Muted means volume 0, not a skipped utterance — timing-dependent UI keeps working. */
  setMuted(muted: boolean): Promise<void>;
  speak(batchId: string, parts: SpeechPart[], rate: number): Promise<void>;
  stop(): Promise<void>;
  isSpeaking(): Promise<boolean>;
}

export default requireNativeModule<BaoyiSpeechModule>('BaoyiSpeech');
