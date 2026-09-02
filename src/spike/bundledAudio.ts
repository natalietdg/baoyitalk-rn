/**
 * The bundled-audio assets, wired up statically because Metro's `require` needs literal paths.
 *
 * These stand in for the real pre-generated clips (Azure Neural TTS / ElevenLabs). Built by
 * `spike-tools/make-audio.js`; the shape is what matters, not the voice:
 *
 * - one clip per story page, plus a per-character timing sidecar for highlighting
 * - per-character clips for page 0, to test the "stitch small clips" alternative
 */

export type TimingMark = {
  char: string;
  /** Index into the page's Mandarin string, so a highlight can be positioned. */
  charIndex: number;
  startMs: number;
  endMs: number;
};

export type Sidecar = { line: string; totalMs: number; marks: TimingMark[] };

export const PAGE_CLIPS = [
  require('../../assets/audio/page0.m4a'),
  require('../../assets/audio/page1.m4a'),
  require('../../assets/audio/page2.m4a'),
  require('../../assets/audio/page3.m4a'),
  require('../../assets/audio/page4.m4a'),
];

export const PAGE_SIDECARS: Sidecar[] = [
  require('../../assets/audio/page0.json'),
  require('../../assets/audio/page1.json'),
  require('../../assets/audio/page2.json'),
  require('../../assets/audio/page3.json'),
  require('../../assets/audio/page4.json'),
];

/**
 * Stroke data for a handful of characters. Metro cannot resolve `require(\`…/${char}.json\`)` — a
 * dynamic template literal is a build error, not a runtime one — so a real port would generate this
 * map from the content JSON at build time. 9,575 characters ship in the package.
 */
export const STROKE_DATA: Record<string, unknown> = {
  猫: require('hanzi-writer-data/猫.json'),
  水: require('hanzi-writer-data/水.json'),
  爱: require('hanzi-writer-data/爱.json'),
  一: require('hanzi-writer-data/一.json'),
  蚂: require('hanzi-writer-data/蚂.json'),
};

/** Page 0, one clip per character — the raw material for the stitching test. */
export const PAGE0_CHAR_CLIPS = [
  require('../../assets/audio/seg/page0-0.m4a'),
  require('../../assets/audio/seg/page0-1.m4a'),
  require('../../assets/audio/seg/page0-2.m4a'),
  require('../../assets/audio/seg/page0-3.m4a'),
  require('../../assets/audio/seg/page0-4.m4a'),
  require('../../assets/audio/seg/page0-5.m4a'),
  require('../../assets/audio/seg/page0-6.m4a'),
  require('../../assets/audio/seg/page0-7.m4a'),
  require('../../assets/audio/seg/page0-8.m4a'),
  require('../../assets/audio/seg/page0-9.m4a'),
  require('../../assets/audio/seg/page0-10.m4a'),
  require('../../assets/audio/seg/page0-11.m4a'),
];
