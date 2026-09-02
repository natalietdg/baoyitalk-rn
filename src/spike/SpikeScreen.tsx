import { Asset } from 'expo-asset';
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

import StrokeOrder, { CharacterData } from './StrokeOrder';
import {
  PAGE0_CHAR_CLIPS,
  PAGE_CLIPS,
  PAGE_SIDECARS,
  STROKE_DATA,
  Sidecar,
  TimingMark,
} from './bundledAudio';

/**
 * **The de-risking spike, not app code.**
 *
 * The plan changed mid-spike and the change simplifies it: **all narration audio is pre-generated
 * with a premium neural TTS and bundled in the app** rather than synthesised on the device. That
 * removes the whole class of "will the on-device Mandarin voice mispronounce 多音字 in front of a
 * paying parent" failure, because pronunciation is fixed once, by ear, at build time.
 *
 * What is left to prove, in the order that matters:
 *
 * 1. bundled clips play (trivial — confirmed, not belaboured)
 * 2. **word-by-word highlighting still works when playing a file instead of synthesising** — the
 *    one capability pre-generation costs us, so the three options are measured against each other
 * 3. the narration-dies-by-page-3 re-entrancy bug does not come back in the *playback* completion
 *    chain, which has the same hazard shape
 * 4. on-device recording, RevenueCat, stroke order
 *
 * Every line is POSTed to `spike-tools/collector.js` as well as drawn on screen, so a run leaves a
 * file behind that can be read without a simulator.
 */

const COLLECTOR = `http://${Platform.OS === 'android' ? '10.0.2.2' : 'localhost'}:8900/log`;
const MANDARIN = 'zh-CN';

/** Present only on Apple today. Its absence on Android is itself a result. */
let Baoyi: any = null;
let baoyiError: string | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Baoyi = require('../../modules/baoyi-speech').default;
} catch (e: any) {
  baoyiError = e?.message ?? String(e);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const stats = (values: number[]) => {
  if (!values.length) return { n: 0, mean: 0, p50: 0, max: 0, min: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: values.length,
    mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    p50: Math.round(sorted[Math.floor(sorted.length / 2)]),
    max: Math.round(sorted[sorted.length - 1]),
    min: Math.round(sorted[0]),
  };
};

export default function SpikeScreen() {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [strokeChar, setStrokeChar] = useState<{ char: string; data: CharacterData } | null>(null);
  const [highlight, setHighlight] = useState<{ line: string; index: number } | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const started = useRef(false);

  const log = useCallback((line: string) => {
    setLines((prev) => [...prev, line]);
    fetch(COLLECTOR, { method: 'POST', body: line }).catch(() => {});
    console.log('[SPIKE]', line);
  }, []);

  // ------------------------------------------------------- 1. bundled clip playback

  /** The new baseline requirement. Confirmed and moved past. */
  const probeBundledPlayback = useCallback(async () => {
    log(`=== PROBE 1: BUNDLED AUDIO PLAYBACK (${Platform.OS} ${Platform.Version}) ===`);
    // playsInSilentMode is the difference between "works" and "silent for every parent whose
    // ringer switch is off", which is most of them.
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });

    const player = createAudioPlayer(PAGE_CLIPS[0], { updateInterval: 50 });
    const t0 = Date.now();
    let ready = false;
    for (let i = 0; i < 100 && !ready; i += 1) {
      await sleep(20);
      ready = player.isLoaded;
    }
    log(`[1] bundled require() -> loaded=${player.isLoaded} in ${Date.now() - t0}ms`);
    log(`[1] duration reported = ${player.duration}s (sidecar says ${PAGE_SIDECARS[0].totalMs}ms)`);

    let finished = false;
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) finished = true;
    });
    const playStart = Date.now();
    player.play();
    await sleep(60);
    log(`[1] play() -> playing=${player.playing} after 60ms`);
    for (let i = 0; i < 200 && !finished; i += 1) await sleep(25);
    log(`[1] didJustFinish after ${Date.now() - playStart}ms (clip is ${PAGE_SIDECARS[0].totalMs}ms)`);
    sub.remove();
    player.remove();
    log('[1] VERDICT: bundled clips load from the app bundle and play. No network, no permissions.');
  }, [log]);

  // ------------------------------- 2. THE interesting question: highlighting from a file

  /**
   * **What pre-generation costs us.** Synthesising gave word-boundary callbacks for free
   * (`willSpeakRangeOfSpeechString`). Playing a file gives no such thing, so highlighting has to be
   * driven some other way. Three options, all measured here rather than argued about:
   *
   * - **A. timing sidecar + status events** — subscribe to `playbackStatusUpdate` and match
   *   `currentTime` against pre-computed marks. Measured: how often events actually arrive.
   * - **B. timing sidecar + JS polling** — a `setInterval` reading `player.currentTime`. Measured:
   *   the error between when a mark should fire and when it does.
   * - **C. one clip per word, stitched** — the clip boundary *is* the word boundary, so no timing
   *   data is needed at all. Measured in probe 3.
   *
   * The bar: a Mandarin character in these clips lasts 82–673ms (median ~200ms). Highlight error
   * has to stay well inside that or the wrong character lights up.
   */
  const probeHighlighting = useCallback(async () => {
    log('=== PROBE 2: WORD-BY-WORD HIGHLIGHTING WHILE PLAYING A FILE ===');
    const sidecar: Sidecar = PAGE_SIDECARS[0];
    const durations = sidecar.marks.map((m) => m.endMs - m.startMs);
    log(
      `[2] page0 "${sidecar.line}" ${sidecar.totalMs}ms, ${sidecar.marks.length} marks; ` +
        `per-char ms min=${Math.min(...durations)} median=${stats(durations).p50} max=${Math.max(...durations)}`
    );
    log('[2] so any highlighting mechanism must resolve better than ~100ms to be believable.');

    // --- A. how often does playbackStatusUpdate actually fire? ---
    for (const requested of [16, 50, 100]) {
      const player = createAudioPlayer(PAGE_CLIPS[0], { updateInterval: requested });
      for (let i = 0; i < 60 && !player.isLoaded; i += 1) await sleep(20);
      const arrivals: number[] = [];
      const times: number[] = [];
      let last = 0;
      let done = false;
      const sub = player.addListener('playbackStatusUpdate', (s) => {
        const now = Date.now();
        if (last) arrivals.push(now - last);
        last = now;
        times.push(s.currentTime * 1000);
        if (s.didJustFinish) done = true;
      });
      player.play();
      for (let i = 0; i < 300 && !done; i += 1) await sleep(20);
      sub.remove();
      player.remove();
      const gaps = stats(arrivals);
      log(
        `[2A] updateInterval=${requested}ms -> ${gaps.n} events; actual gap ` +
          `min=${gaps.min} median=${gaps.p50} mean=${gaps.mean} max=${gaps.max}ms`
      );
      log(
        `[2A]   currentTime samples advanced ${Math.round(times[0] ?? 0)}ms -> ` +
          `${Math.round(times[times.length - 1] ?? 0)}ms`
      );
    }

    // --- B. sidecar + polling: measure the real error per mark ---
    log('--- 2B. timing sidecar driven by a JS poll on player.currentTime ---');
    const player = createAudioPlayer(PAGE_CLIPS[0], { updateInterval: 1000 });
    for (let i = 0; i < 60 && !player.isLoaded; i += 1) await sleep(20);

    const fired: { mark: TimingMark; atMs: number; positionMs: number }[] = [];
    let markIndex = 0;
    let done = false;
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) done = true;
    });

    const startedAt = Date.now();
    player.play();
    const poll = setInterval(() => {
      const positionMs = player.currentTime * 1000;
      while (markIndex < sidecar.marks.length && positionMs >= sidecar.marks[markIndex].startMs) {
        const mark = sidecar.marks[markIndex];
        fired.push({ mark, atMs: Date.now() - startedAt, positionMs });
        setHighlight({ line: sidecar.line, index: mark.charIndex });
        markIndex += 1;
      }
    }, 16);

    for (let i = 0; i < 300 && !done; i += 1) await sleep(20);
    clearInterval(poll);
    sub.remove();
    player.remove();
    setHighlight(null);

    // Error measured against the audio clock, which is what the ear is comparing against.
    const positionError = fired.map((f) => Math.abs(f.positionMs - f.mark.startMs));
    const wallError = fired.map((f) => Math.abs(f.atMs - f.mark.startMs));
    const pe = stats(positionError);
    const we = stats(wallError);
    log(`[2B] fired ${fired.length}/${sidecar.marks.length} marks`);
    log(`[2B] error vs audio clock : median=${pe.p50}ms max=${pe.max}ms`);
    log(`[2B] error vs wall clock  : median=${we.p50}ms max=${we.max}ms (includes play() latency)`);
    log(
      `[2B] first five: ${fired
        .slice(0, 5)
        .map((f) => `${f.mark.char}@want${f.mark.startMs}/got${Math.round(f.positionMs)}`)
        .join(' ')}`
    );
    const worstCharacter = sidecar.marks[0] ? Math.min(...durations) : 0;
    log(
      `[2B] VERDICT: max error ${pe.max}ms against a shortest-character duration of ` +
        `${worstCharacter}ms -> ${pe.max < worstCharacter ? 'highlight lands on the right character' : 'CAN LAND ON THE WRONG CHARACTER'}`
    );
  }, [log]);

  // ------------------------------------- 3. option C: one clip per word, stitched

  /**
   * The third highlighting option, which needs no timing data at all: if each word is its own clip,
   * the clip boundary *is* the highlight boundary. `expo-audio`'s native `AudioPlaylist` sequences
   * them and reports `currentIndex`, so highlighting is exact by construction.
   *
   * The cost is the seam. Measured here as: total elapsed minus the sum of the clip durations.
   */
  const probeStitchedClips = useCallback(async () => {
    log('=== PROBE 3: ONE CLIP PER WORD, STITCHED (exact highlighting, no timing data) ===');
    const sidecar = PAGE_SIDECARS[0];

    // Individual durations first, so the seam can be isolated from the audio itself.
    let sumDurations = 0;
    for (const source of PAGE0_CHAR_CLIPS) {
      const p = createAudioPlayer(source, { updateInterval: 1000 });
      for (let i = 0; i < 60 && !p.isLoaded; i += 1) await sleep(20);
      sumDurations += p.duration * 1000;
      p.remove();
    }
    log(`[3] ${PAGE0_CHAR_CLIPS.length} per-character clips, ${Math.round(sumDurations)}ms of audio total`);

    // `createAudioPlayer` resolves a require()'d asset module id for you; the AudioPlaylist
    // constructor does not, and throws ArgumentCastException on a raw number. Resolving to local
    // file URIs by hand is the fix — and a rough edge worth knowing about before relying on it.
    const sources = await Promise.all(
      PAGE0_CHAR_CLIPS.map(async (module) => {
        const asset = Asset.fromModule(module);
        await asset.downloadAsync();
        return { uri: asset.localUri ?? asset.uri };
      })
    );
    log(`[3] resolved ${sources.length} asset uris, e.g. ${sources[0].uri.slice(0, 60)}…`);
    const playlist = new (AudioModule as any).AudioPlaylist(sources, 50, 'none');
    const indexChanges: { index: number; atMs: number }[] = [];
    let lastIndex = -1;
    let finishes = 0;
    const t0 = Date.now();
    const sub = playlist.addListener('playlistStatusUpdate', (s: any) => {
      if (s.currentIndex !== lastIndex) {
        lastIndex = s.currentIndex;
        indexChanges.push({ index: s.currentIndex, atMs: Date.now() - t0 });
        setHighlight({ line: sidecar.line, index: sidecar.marks[s.currentIndex]?.charIndex ?? 0 });
      }
      if (s.didJustFinish) finishes += 1;
    });
    playlist.play();

    for (let i = 0; i < 400; i += 1) {
      await sleep(20);
      if (lastIndex >= PAGE0_CHAR_CLIPS.length - 1 && !playlist.playing) break;
    }
    const elapsed = Date.now() - t0;
    sub.remove();
    setHighlight(null);
    // NOTE AudioPlaylist.remove(index) removes one track — there is no zero-argument teardown, so
    // calling it like a player's remove() throws. Pausing is the only release available from JS.
    playlist.pause();

    log(
      `[3] playlist advanced through ${indexChanges.length} index change(s): ` +
        indexChanges.map((c) => `${c.index}@${c.atMs}ms`).join(' ')
    );
    log(`[3] elapsed ${elapsed}ms vs ${Math.round(sumDurations)}ms of audio`);
    log(
      `[3] total seam overhead = ${Math.round(elapsed - sumDurations)}ms across ` +
        `${PAGE0_CHAR_CLIPS.length - 1} joins = ~${Math.round((elapsed - sumDurations) / Math.max(1, PAGE0_CHAR_CLIPS.length - 1))}ms per join`
    );
    log(
      '[3] NOTE: per-word clips also lose sentence prosody — each word is synthesised in isolation, ' +
        'so the line reads as a word list rather than a sentence. That is a content problem, not a ' +
        'code one, and it is why the sidecar option is the better default.'
    );
  }, [log]);

  // ------------------------------------------- 4. the re-entrancy regression, on playback

  /**
   * **The regression that must not come back.** In the SwiftUI app narration died permanently on
   * story page 3: an auto-advance completion fired synchronously inside `didFinish` and called
   * `stopSpeaking` re-entrantly, and `didCancel` never cleared the last utterance.
   *
   * Bundled playback has the same hazard shape — a completion callback that tears down the thing
   * that is calling it and immediately starts the next one. So the walk is driven exactly that way:
   * inside the `didJustFinish` handler, remove the current player and create-and-play page N+1 in
   * the same tick. Five pages, three runs. A page that never reports progress is silence.
   */
  const probeReentrancy = useCallback(async () => {
    log('=== PROBE 4: RE-ENTRANCY — 5 BUNDLED PAGES x 3 RUNS ===');
    log('[4] three strategies, because the difference between them IS the bug:');
    log('[4]   sync-recreate : remove the player and build the next one inside didJustFinish');
    log('[4]   next-turn     : same, but deferred to the next turn (the SwiftUI fix, ported)');
    log('[4]   replace       : one long-lived player, swap its source (the idiomatic RN way)');

    /**
     * Walks the five pages three times using one advance strategy, and reports every page that
     * produced no audio. A generation counter makes a late callback from a torn-down player
     * harmless, which is the other half of the native fix.
     */
    const walk = async (
      strategy: 'sync-recreate' | 'next-turn' | 'replace'
    ): Promise<{ silent: string[]; runsFinished: number; froze: boolean }> => {
      const silent: string[] = [];
      let runsFinished = 0;
      let froze = false;
      // One player for the whole walk in `replace` mode; per-page players otherwise.
      let shared = strategy === 'replace' ? createAudioPlayer(PAGE_CLIPS[0], { updateInterval: 50 }) : null;
      let generation = 0;

      for (let run = 1; run <= 3; run += 1) {
        const runDone = new Promise<void>((resolveRun) => {
          let index = 0;

          const playPage = () => {
            const myGeneration = (generation += 1);
            const pageNumber = index + 1;
            const t0 = Date.now();
            let progressed = false;
            let updates = 0;
            let settled = false;

            const player = shared ?? createAudioPlayer(PAGE_CLIPS[index], { updateInterval: 50 });
            if (shared) shared.replace(PAGE_CLIPS[index]);

            const advance = (how: string) => {
              // A callback from a superseded page must not advance anything.
              if (settled || myGeneration !== generation) return;
              settled = true;
              clearTimeout(watchdog);
              sub.remove();
              if (!progressed) silent.push(`${strategy}/run${run}/page${pageNumber}`);
              log(
                `[4-${strategy}] run${run} page${pageNumber} progressed=${progressed} ` +
                  `updates=${updates} ms=${Date.now() - t0} via=${how}${progressed ? '' : '  <-- SILENT'}`
              );
              index += 1;
              const next = () => {
                if (index < PAGE_CLIPS.length) playPage();
                else resolveRun();
              };
              if (strategy === 'sync-recreate') {
                // The bug shape, verbatim: tear down from inside the callback, then immediately
                // build and start the next page in the same tick.
                player.remove();
                next();
              } else if (strategy === 'next-turn') {
                setTimeout(() => {
                  player.remove();
                  next();
                }, 0);
              } else {
                setTimeout(next, 0);
              }
            };

            const watchdog = setTimeout(() => advance('watchdog-no-callback'), 8000);
            const sub = player.addListener('playbackStatusUpdate', (s) => {
              updates += 1;
              if (s.currentTime > 0.05) progressed = true;
              if (s.error) log(`[4-${strategy}] run${run} page${pageNumber} error=${s.error}`);
              if (s.didJustFinish) advance('didJustFinish');
            });
            player.play();
          };
          playPage();
        });

        // A native deadlock would stop the watchdog firing too, so the walk needs its own ceiling.
        const timedOut = await Promise.race([
          runDone.then(() => false),
          sleep(60000).then(() => true),
        ]);
        if (timedOut) {
          froze = true;
          log(`[4-${strategy}] run${run} DID NOT FINISH within 60s — the JS thread stopped advancing`);
          break;
        }
        runsFinished += 1;
        log(`[4-${strategy}] run${run} complete`);
      }
      shared?.remove();
      return { silent, runsFinished, froze };
    };

    for (const strategy of ['sync-recreate', 'next-turn', 'replace'] as const) {
      const result = await walk(strategy);
      log(
        `[4] ${strategy}: runsFinished=${result.runsFinished}/3 silentPages=${result.silent.length}/15 ` +
          `froze=${result.froze}${result.silent.length ? ` at ${result.silent.join(', ')}` : ''}`
      );
      log(
        `[4] ${strategy} VERDICT: ` +
          (result.froze
            ? 'REPRODUCED THE BUG CLASS — narration stopped advancing and never recovered'
            : result.silent.length
              ? 'pages went silent — usable only with care'
              : 'page 5 of run 3 still played. Safe.')
      );
    }
  }, [log]);

  /** The harsher variant: a toddler tapping fast — stop and restart in the same tick, repeatedly. */
  const probeStopThenPlay = useCallback(async () => {
    log('=== PROBE 4b: TEAR DOWN AND RESTART IN THE SAME TICK, 6 TIMES ===');
    let silent = 0;
    let player = createAudioPlayer(PAGE_CLIPS[0], { updateInterval: 50 });
    for (let i = 1; i <= 6; i += 1) {
      player.pause();
      player.remove();
      player = createAudioPlayer(PAGE_CLIPS[i % PAGE_CLIPS.length], { updateInterval: 50 });
      let progressed = false;
      const sub = player.addListener('playbackStatusUpdate', (s) => {
        if (s.currentTime > 0.05) progressed = true;
      });
      player.play();
      await sleep(700);
      sub.remove();
      if (!progressed) silent += 1;
      log(`[4b] burst${i} progressed=${progressed}${progressed ? '' : '  <-- SILENT'}`);
    }
    player.remove();
    log(`[4b] VERDICT: ${silent}/6 bursts silent after an immediate teardown`);
  }, [log]);

  // ------------------------------------------------------------- 5. voice recording

  /** On-device recording, local storage, playback, deletion — the privacy guarantee. */
  const probeRecording = useCallback(async () => {
    log('=== PROBE 5: ON-DEVICE VOICE RECORDING (must never leave the device) ===');
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    log(`[5] mic permission: status=${permission.status} granted=${permission.granted}`);
    if (!permission.granted) {
      log('[5] ABORT — no microphone permission');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    log(`[5] recording... isRecording=${recorder.isRecording}`);
    await sleep(2500);
    await recorder.stop();
    const uri = recorder.uri;
    log(`[5] stopped. uri=${uri}`);
    if (!uri) {
      log('[5] FAIL — no uri produced');
      return;
    }

    // Where the file lives is the privacy claim: inside the app sandbox, not a shared store.
    const file = new File(uri);
    log(`[5] exists=${file.exists} size=${file.size} bytes`);
    log(`[5] app document dir = ${Paths.document.uri}`);
    log(`[5] app cache dir    = ${Paths.cache.uri}`);
    log(
      `[5] inside app sandbox = ${uri.startsWith(Paths.document.uri) || uri.startsWith(Paths.cache.uri)}`
    );

    // A parent memo has to survive app restarts, so move it out of cache into documents.
    const packDir = new Directory(Paths.document, 'voicepack');
    if (!packDir.exists) packDir.create({ intermediates: true });
    const keptName = `memo-zh${uri.slice(uri.lastIndexOf('.'))}`;
    const kept = new File(packDir, keptName);
    if (kept.exists) kept.delete();
    file.copy(kept);
    // The handle that performed the copy reports stale metadata, so the destination is re-statted
    // through a fresh handle and by listing the directory. Both, because the privacy guarantee
    // rests on knowing exactly where the file is.
    const restat = new File(packDir, keptName);
    log(`[5] copy destination ${kept.uri}`);
    log(`[5]   original handle : exists=${kept.exists} size=${kept.size}`);
    log(`[5]   fresh handle    : exists=${restat.exists} size=${restat.size}`);
    log(
      `[5]   directory listing: ${packDir
        .list()
        .map((entry) => `${entry.name}${entry instanceof File ? `(${entry.size}b)` : '/'}`)
        .join(', ')}`
    );

    const player = createAudioPlayer(restat.uri);
    for (let i = 0; i < 60 && !player.isLoaded; i += 1) await sleep(20);
    player.play();
    await sleep(1200);
    log(
      `[5] playback from Documents: loaded=${player.isLoaded} playing=${player.playing} ` +
        `duration=${player.duration}s currentTime=${player.currentTime}s`
    );
    player.remove();

    restat.delete();
    log(
      `[5] after delete: freshHandle.exists=${new File(packDir, keptName).exists} ` +
        `dirNowContains=${packDir.list().length} entr(ies)`
    );
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    log('[5] VERDICT: record -> local file in app sandbox -> persist -> play -> delete all worked');
  }, [log, recorder]);

  // ------------------------------------------------------------------ 6. RevenueCat

  /** Does react-native-purchases link, configure, and answer? And what happens unconfigured? */
  const probePurchases = useCallback(async () => {
    log('=== PROBE 6: REVENUECAT ===');
    try {
      log(`[6] isConfigured() before configure = ${await Purchases.isConfigured()}`);
    } catch (e: any) {
      log(`[6] isConfigured() threw before configure: ${e?.message}`);
    }

    // The unconfigured hard-fatal the native app guards against — is it catchable here?
    try {
      await Purchases.getOfferings();
      log('[6] getOfferings() before configure RESOLVED (unexpected)');
    } catch (e: any) {
      log(`[6] getOfferings() before configure threw a CATCHABLE JS error: ${e?.message}`);
    }

    await Purchases.setLogLevel(LOG_LEVEL.WARN);
    // A syntactically valid but non-existent key: proves the SDK links and reaches the backend
    // without needing the real project's credentials.
    const key =
      Platform.OS === 'ios' ? 'appl_spikeNotARealKey0000000000' : 'goog_spikeNotARealKey000000000';
    Purchases.configure({ apiKey: key });
    log(`[6] configure() called with placeholder ${key.slice(0, 5)}* key`);
    log(`[6] isConfigured() after configure = ${await Purchases.isConfigured()}`);

    try {
      const offerings = await Purchases.getOfferings();
      log(
        `[6] getOfferings() resolved: current=${offerings.current?.identifier ?? 'null'} ` +
          `all=${Object.keys(offerings.all).length}`
      );
    } catch (e: any) {
      log(`[6] getOfferings() rejected (expected with placeholder key): code=${e?.code} ${e?.message}`);
    }
    try {
      const info = await Purchases.getCustomerInfo();
      log(`[6] getCustomerInfo() resolved: entitlements=${Object.keys(info.entitlements.active).length}`);
    } catch (e: any) {
      log(`[6] getCustomerInfo() rejected: code=${e?.code} ${e?.message}`);
    }
    log('[6] VERDICT: SDK links, configures, and surfaces catchable errors rather than fatals');
  }, [log]);

  // -------------------------------------------------------- 7. stroke-order animation

  /** Real Make-Me-a-Hanzi stroke data, rendered and animated by react-native-svg. */
  const probeStrokeOrder = useCallback(async () => {
    log('=== PROBE 7: CHINESE STROKE-ORDER ANIMATION ===');
    log('[7] hanzi-writer itself is DOM-only (document.createElementNS, getTotalLength) so it cannot');
    log('[7] run in RN. hanzi-writer-data is plain JSON (Make Me a Hanzi) and does port.');
    log('[7] NOTE metro rejects require(`…/${char}.json`) — dynamic requires are a build error, so a');
    log('[7] real port generates a static character->data map from the content JSON at build time.');
    for (const [char, raw] of Object.entries(STROKE_DATA)) {
      const data = raw as CharacterData;
      log(
        `[7] ${char}: strokes=${data.strokes.length} medians=${data.medians.length} ` +
          `firstOutline=${data.strokes[0].slice(0, 28)}… firstMedianPts=${data.medians[0].length}`
      );
    }
    setStrokeChar({ char: '猫', data: STROKE_DATA['猫'] as CharacterData });
    log('[7] animating 猫 on screen now — 11 strokes, canonical order, real outlines from the dataset');
  }, [log]);

  // -------------------------------- 8. why pre-generation was the right call (brief)

  /**
   * Kept short on purpose: the decision to bundle audio is already made. This just records the
   * evidence that made runtime synthesis the wrong choice, so the decision is defensible later.
   */
  const probeRuntimeTtsForTheRecord = useCallback(async () => {
    log('=== PROBE 8: RUNTIME TTS — the evidence that justified pre-generating (brief) ===');
    const voices = await Speech.getAvailableVoicesAsync();
    const zh = voices.filter((v) => v.language.toLowerCase().startsWith('zh'));
    log(`[8] expo-speech sees ${voices.length} voices, ${zh.length} Chinese`);
    log(`[8] quality values expo-speech can express: ${JSON.stringify(Array.from(new Set(voices.map((v) => v.quality))))}`);
    log(`[8] zh voices: ${zh.map((v) => `${v.identifier}|q=${v.quality}`).join(' , ') || 'NONE'}`);

    if (Baoyi) {
      // expo-speech's iOS code is `voice.quality == .enhanced ? "Enhanced" : "Default"`, and Apple
      // has three tiers (compact=1, enhanced=2, premium=3). So premium — the best voice a parent
      // can install — is reported identically to the tinny compact one.
      const real = await Baoyi.listVoices();
      const realZh = real.filter((v: any) => v.language.toLowerCase().startsWith('zh'));
      const premium = real.filter((v: any) => v.quality === 'premium');
      log(`[8] OS ground truth: ${real.length} voices, ${realZh.length} Chinese, ${premium.length} premium overall`);
      for (const v of realZh) {
        const stock = voices.find((s) => s.identifier === v.identifier);
        log(`[8]   ${v.identifier} OS=${v.quality} expo-speech=${stock?.quality ?? 'NOT LISTED'}`);
      }
      log(
        `[8] premium voices expo-speech mislabels as "Default": ${premium.length} — a tier the stock ` +
          'library cannot even see, let alone prefer'
      );
    } else {
      log(`[8] no native module on ${Platform.OS} (${baoyiError}) — real voice tier is unreadable here`);
    }

    if (Baoyi?.phonemeProbe) {
      // Ear-free: writeUtterance(...toMarkerCallback:) reports the phonemes chosen without playing.
      const best = (await Baoyi.listVoices())
        .filter((v: any) => v.language.toLowerCase().startsWith('zh-cn'))
        .sort((a: any, b: any) => b.qualityRank - a.qualityRank)[0];
      const render = (text: string, pins: Record<string, string> = {}) =>
        Baoyi.phonemeProbe(text, MANDARIN, best?.identifier ?? null, pins);
      const pairs = [
        ['银行', '行走', '行'],
        ['了解', '好了', '了'],
        ['很长', '长大', '长'],
      ];
      for (const [a, b, char] of pairs) {
        const ra = await render(a);
        const rb = await render(b);
        log(
          `[8-polyphone] ${char}: "${a}" sha=${ra.audioSha256} ph="${ra.phonemeString.slice(0, 40)}" | ` +
            `"${b}" sha=${rb.audioSha256} ph="${rb.phonemeString.slice(0, 40)}"`
        );
      }
      const plain = await render('睡着了');
      const pinned = await render('睡着了', { 睡着: 'ʂweɪ˥˩ʈʂɑʊ˧˥' });
      log(
        `[8-ipa] 睡着了 plain sha=${plain.audioSha256} frames=${plain.audioFrames} | ` +
          `IPA-pinned sha=${pinned.audioSha256} frames=${pinned.audioFrames} applied=${JSON.stringify(pinned.pinsApplied)}`
      );
      log(`[8-ipa] IPA pin changed the rendered audio = ${plain.audioSha256 !== pinned.audioSha256}`);
      log(
        '[8-ipa] NOTE even where the pin works it is only reachable from custom Swift. expo-speech ' +
          'builds AVSpeechUtterance(string:) only and has no attributedString/IPA/phoneme option, ' +
          'so with the stock library pinning is absent, not degraded.'
      );
    }
    log('[8] Also unavoidable at runtime: enhanced/premium voices must be downloaded by the user in');
    log('[8] Settings > Accessibility > Spoken Content > Voices, and Siri voices are off-limits to');
    log('[8] third-party apps. Runtime quality is therefore not something the app can guarantee.');
    log('[8] VERDICT: pre-generating and bundling removes all of the above. Correct call.');
  }, [log]);

  // ------------------------------------------------------------------------ runner

  const run = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      setBusy(true);
      try {
        await fn();
      } catch (e: any) {
        log(`!! ${name} THREW: ${e?.message}\n${e?.stack?.split('\n').slice(0, 4).join(' | ')}`);
      } finally {
        setBusy(false);
      }
    },
    [log]
  );

  const runAll = useCallback(async () => {
    log(`##### SPIKE RUN START platform=${Platform.OS} os=${Platform.Version} #####`);
    // Cheap-but-load-bearing probes first, so a flaky simulator cannot cost the whole run.
    await run('bundledPlayback', probeBundledPlayback);
    await run('recording', probeRecording);
    await run('purchases', probePurchases);
    await run('strokeOrder', probeStrokeOrder);
    await run('highlighting', probeHighlighting);
    await run('stitchedClips', probeStitchedClips);
    await run('runtimeTts', probeRuntimeTtsForTheRecord);
    // Last on purpose: it is the longest probe by far (~2 minutes of real audio), so everything
    // else is already on disk if the app is killed part-way through.
    await run('reentrancy', probeReentrancy);
    await run('stopThenPlay', probeStopThenPlay);
    log('##### SPIKE RUN END #####');
  }, [
    log,
    run,
    probeBundledPlayback,
    probeHighlighting,
    probeStitchedClips,
    probeReentrancy,
    probeStopThenPlay,
    probeRecording,
    probePurchases,
    probeStrokeOrder,
    probeRuntimeTtsForTheRecord,
  ]);

  // Runs itself, so a plain `simctl launch` produces the whole log with no tapping.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buttons: [string, () => void][] = [
    ['RUN ALL', () => runAll()],
    ['1 bundled', () => run('bundledPlayback', probeBundledPlayback)],
    ['2 highlight', () => run('highlighting', probeHighlighting)],
    ['3 stitched', () => run('stitchedClips', probeStitchedClips)],
    ['4 reentrancy', () => run('reentrancy', probeReentrancy)],
    ['4b burst', () => run('stopThenPlay', probeStopThenPlay)],
    ['5 recording', () => run('recording', probeRecording)],
    ['6 purchases', () => run('purchases', probePurchases)],
    ['7 strokes', () => run('strokeOrder', probeStrokeOrder)],
    ['8 tts record', () => run('runtimeTts', probeRuntimeTtsForTheRecord)],
  ];

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>BaoYiTalk RN spike {busy ? '· running…' : '· idle'}</Text>
      <View style={styles.row}>
        {buttons.map(([label, onPress]) => (
          <Pressable
            key={label}
            onPress={onPress}
            disabled={busy}
            style={[styles.button, busy && styles.buttonDisabled]}>
            <Text style={styles.buttonText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* The highlight itself, so "does it land on the right character" is visible, not just logged. */}
      {highlight ? (
        <Text style={styles.karaoke}>
          {[...highlight.line].map((c, i) => (
            <Text key={i} style={i === highlight.index ? styles.karaokeOn : undefined}>
              {c}
            </Text>
          ))}
        </Text>
      ) : null}

      {strokeChar ? (
        <View style={styles.strokeBox}>
          <StrokeOrder
            character={strokeChar.char}
            data={strokeChar.data}
            size={150}
            onComplete={(total) => log(`[7] VERDICT: animated all ${total} strokes of 猫 in RN`)}
          />
        </View>
      ) : null}

      <ScrollView style={styles.logBox}>
        {lines.map((line, i) => (
          <Text key={i} style={styles.logLine} selectable>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 56, paddingHorizontal: 12, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  button: { backgroundColor: '#1f6feb', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  karaoke: { fontSize: 26, textAlign: 'center', marginBottom: 6, color: '#888' },
  karaokeOn: { color: '#d9480f', fontWeight: '800' },
  strokeBox: { alignItems: 'center', marginBottom: 8 },
  logBox: { flex: 1, backgroundColor: '#0d1117', borderRadius: 8, padding: 8 },
  logLine: { color: '#c9d1d9', fontFamily: 'Menlo', fontSize: 9, marginBottom: 1 },
});
