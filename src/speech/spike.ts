import BaoyiSpeech from '../../modules/baoyi-speech';
import { mandarinPins } from '../content/pronunciation';

/**
 * **The four-part audio de-risking probe.**
 *
 * Runs the four things the SwiftUI app's speech engine actually needs and reports what happened,
 * so the answer to "can React Native do this?" is evidence rather than an opinion:
 *
 * 1. selecting a *specific* voice rather than the system default
 * 2. preferring premium/enhanced tiers over compact
 * 3. word-boundary callbacks for the word-by-word highlight
 * 4. IPA pronunciation override for Mandarin polyphones
 *
 * Every line it returns is also written to the engine log, so a screenshot of the Audio tab is
 * valid acceptance evidence.
 */
export const runAudioSpike = async (log: (line: string) => void): Promise<void> => {
  log('--- AUDIO SPIKE START ---');

  // 0. Silent switch.
  const session = await BaoyiSpeech.configureAudioSession();
  log(
    `[3-silent-switch] category=${session.category} mode=${session.mode} playsOnSilent=${session.playsWhenSilent}`
  );

  // 1 + 2. Voice inventory and tier preference.
  const all = await BaoyiSpeech.listVoices();
  log(`[voices] ${all.length} installed`);
  for (const code of ['en-US', 'ms-MY', 'zh-CN']) {
    const matches = all.filter((voice) => voice.language === code);
    log(
      `[1-specific-voice] ${code}: ${matches.length} candidate(s) — ` +
        (matches.map((m) => `${m.identifier}(${m.quality})`).join(', ') || 'NONE')
    );
  }
  const resolved = await BaoyiSpeech.resolvedVoices();
  for (const voice of resolved) {
    log(
      `[2-quality-tier] ${voice.requested} -> ${voice.resolved ?? 'system-default'} ` +
        `quality=${voice.quality ?? 'n/a'} fallback=${voice.isFallback}`
    );
  }

  // 3. Word-boundary callbacks. Counted rather than assumed.
  await BaoyiSpeech.setPronunciationPins(mandarinPins);
  const boundaries: string[] = [];
  const subscription = BaoyiSpeech.addListener('onBoundary', ({ text, location, length }) => {
    boundaries.push(`"${text.slice(location, location + length)}"@${location}+${length}`);
  });

  await speakAndWait('spike-en', [{ text: 'The cat is sleeping.', bcp47: 'en-US' }]);
  log(`[3-word-boundary] en-US fired ${boundaries.length} boundary event(s): ${boundaries.join(' ')}`);

  boundaries.length = 0;
  await speakAndWait('spike-ms', [{ text: 'Kucing tidur.', bcp47: 'ms-MY' }]);
  log(`[3-word-boundary] ms-MY fired ${boundaries.length} boundary event(s): ${boundaries.join(' ')}`);

  boundaries.length = 0;
  // 4. IPA override — a line containing all three pinned polyphones.
  await speakAndWait('spike-zh', [{ text: '猫睡着了。数一数。背。', bcp47: 'zh-CN' }]);
  log(`[3-word-boundary] zh-CN fired ${boundaries.length} boundary event(s): ${boundaries.join(' ')}`);
  log(
    `[4-ipa-override] pins applied for: ${Object.keys(mandarinPins).join(', ')} ` +
      '(see "IPA pin applied" lines above; audibility needs a human ear)'
  );

  subscription.remove();
  log('--- AUDIO SPIKE END ---');
};

/** Speaks one batch and resolves when the engine says it finished. */
const speakAndWait = (batchId: string, parts: { text: string; bcp47: string }[]): Promise<void> =>
  new Promise((resolve) => {
    const subscription = BaoyiSpeech.addListener('onBatchFinished', (event) => {
      if (event.batchId !== batchId) return;
      subscription.remove();
      resolve();
    });
    BaoyiSpeech.speak(batchId, parts, 0.35);
    // A voice that never reports back must not hang the probe.
    setTimeout(() => {
      subscription.remove();
      resolve();
    }, 12000);
  });
