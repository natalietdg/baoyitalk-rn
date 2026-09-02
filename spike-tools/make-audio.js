#!/usr/bin/env node
/**
 * Builds the bundled-audio assets the spike plays.
 *
 * This stands in for the real pre-generation pipeline (Azure Neural TTS / ElevenLabs). The point is
 * not voice quality — it is to produce the *shape* of asset the app would ship:
 *
 *   page{N}.m4a        one natural clip per story page
 *   page{N}.json       a per-character timing sidecar for word-by-word highlighting
 *   seg/page0-{K}.m4a  per-character clips, to test the "stitch small clips" alternative
 *
 * Timings come from measuring cumulative prefixes: the duration of "整个夏" minus the duration of
 * "整个" is how long "夏" takes. Azure emits this directly as WordBoundary events, so the real
 * pipeline needs no such trick — but the numbers land in the right place for testing playback.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VOICE = 'Tingting';
const OUT = path.join(__dirname, '..', 'assets', 'audio');
const SEG = path.join(OUT, 'seg');
const TMP = '/tmp/spike-tts.aiff';
const PUNCTUATION = /[，。！？、,.!?]/;

fs.mkdirSync(SEG, { recursive: true });

/** Synthesises `text` and returns its duration in seconds. */
const durationOf = (text) => {
  execFileSync('say', ['-v', VOICE, '-o', TMP, text]);
  const info = execFileSync('afinfo', [TMP]).toString();
  const match = /estimated duration: ([0-9.]+)/.exec(info);
  return match ? Number(match[1]) : 0;
};

const synthesise = (text, destination) => {
  execFileSync('say', ['-v', VOICE, '-o', TMP, text]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', TMP, destination]);
  const info = execFileSync('afinfo', [TMP]).toString();
  const match = /estimated duration: ([0-9.]+)/.exec(info);
  return match ? Number(match[1]) : 0;
};

const pages = require(path.join(__dirname, '..', 'src', 'content', 'stories.json'))
  .stories[0].pages.slice(0, 5)
  .map((p) => p.line.zh);

pages.forEach((line, pageIndex) => {
  const clip = path.join(OUT, `page${pageIndex}.m4a`);
  const totalSeconds = synthesise(line, clip);

  const chars = [...line];
  const marks = [];
  let previousEnd = 0;
  chars.forEach((char, k) => {
    const end = durationOf(chars.slice(0, k + 1).join(''));
    if (!PUNCTUATION.test(char)) {
      marks.push({
        char,
        charIndex: k,
        startMs: Math.round(previousEnd * 1000),
        endMs: Math.round(end * 1000),
      });
    }
    previousEnd = end;
  });

  fs.writeFileSync(
    path.join(OUT, `page${pageIndex}.json`),
    JSON.stringify({ line, totalMs: Math.round(totalSeconds * 1000), marks }, null, 1)
  );
  console.log(
    `page${pageIndex} "${line}" -> ${Math.round(totalSeconds * 1000)}ms, ${marks.length} marks`
  );
});

// Per-character clips for page 0 only — enough to measure the seam between stitched clips.
[...pages[0]]
  .filter((c) => !PUNCTUATION.test(c))
  .forEach((char, i) => {
    synthesise(char, path.join(SEG, `page0-${i}.m4a`));
  });
console.log(`seg/: ${fs.readdirSync(SEG).length} per-character clips`);
console.log(`total bundled size: ${execFileSync('du', ['-sh', OUT]).toString().trim()}`);
