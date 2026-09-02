/**
 * The content layer. **Every JSON file here is byte-identical to the SwiftUI app's**
 * `BabyLang/Content/*.json` — copied, never retyped, so the two apps can never drift on wording.
 * Register decisions (spoken Malaysian Malay, caregiver-register Mandarin) live in that data.
 */
import categoriesJson from './categories.json';
import languagesJson from './languages.json';
import playJson from './play.json';
import sentencesJson from './sentences.json';
import storiesJson from './stories.json';
import wordsJson from './words.json';

/** A phrase in every language it has been written in, plus display-only pinyin. */
export type Trilingual = {
  en: string;
  ms: string;
  zh: string;
  /** Adult reading aid. Display-only — never handed to the synthesiser. */
  pinyin?: string;
};

export type LanguageCode = 'en' | 'ms' | 'zh';

export type LanguageDescriptor = {
  code: LanguageCode;
  bcp47: string;
  chip: string;
  name: string;
};

/** Ordered as they appear in the JSON — that order is the chip order and the ×3 play order. */
export const languages = languagesJson.languages as LanguageDescriptor[];

export const bcp47 = (code: LanguageCode): string =>
  languages.find((l) => l.code === code)?.bcp47 ??
  ({ en: 'en-US', ms: 'ms-MY', zh: 'zh-CN' }[code] as string);

/** EN / BM / 中文 / ×3. `all` speaks the three in sequence. */
export type LanguageMode = LanguageCode | 'all';

export const spokenLanguages = (mode: LanguageMode): LanguageCode[] =>
  mode === 'all' ? languages.map((l) => l.code) : [mode];

export const modeChipLabel = (mode: LanguageMode): string =>
  mode === 'all' ? `×${languages.length}` : (languages.find((l) => l.code === mode)?.chip ?? mode);

/** Card art is one picture — an emoji glyph, or a plain colour swatch for the colour words. */
export type CardArt = { kind: 'emoji'; emoji: string } | { kind: 'swatch'; colour: string };

export const parseArt = (raw: string): CardArt =>
  raw.startsWith('swatch:')
    ? { kind: 'swatch', colour: raw.slice('swatch:'.length) }
    : { kind: 'emoji', emoji: raw };

export type CategoryId =
  | 'all'
  | 'animals'
  | 'food'
  | 'family'
  | 'body'
  | 'things'
  | 'actions'
  | 'colours'
  | 'counting';

export type Category = { id: CategoryId; label: string; art: CardArt };

export const categories: Category[] = categoriesJson.categories.map((c) => ({
  id: c.id as CategoryId,
  label: c.label,
  art: parseArt(c.art),
}));

export type Word = {
  id: string;
  category: CategoryId;
  art: CardArt;
  text: Trilingual;
  /** Counting cards only: how many objects the card must draw. */
  quantity?: number;
  /** Index in the source order — what the palette cycles on, so colours match the Swift app. */
  order: number;
};

export const words: Word[] = (wordsJson.words as any[]).map((w, order) => ({
  id: w.id,
  category: w.category as CategoryId,
  art: parseArt(w.art),
  text: w.text as Trilingual,
  quantity: w.quantity,
  order,
}));

export const wordsIn = (category: CategoryId): Word[] =>
  category === 'all' ? words : words.filter((w) => w.category === category);

export const wordById = (id: string): Word | undefined => words.find((w) => w.id === id);

/** The counting card for a quantity — how "one, two, three" finds its words to speak. */
export const numberWord = (quantity: number): Word | undefined =>
  words.find((w) => w.quantity === quantity);

export type SceneArt = {
  layout: 'single' | 'pair' | 'trio';
  arts: string[];
  accent?: string;
};

export type Sentence = { id: string; text: Trilingual; art: SceneArt };

export const sentences = sentencesJson.sentences as Sentence[];

export type StoryPage = { line: Trilingual; art: SceneArt };

export type Story = {
  id: string;
  length: 'short' | 'long';
  title: Trilingual;
  cover: SceneArt;
  colour: number;
  pages: StoryPage[];
};

export const stories = (storiesJson.stories as any[]).map((s) => ({
  ...s,
  colour: s.colour,
})) as Story[];

export const storyById = (id: string): Story | undefined => stories.find((s) => s.id === id);

// MARK: Play activities

export type GoesTogetherPair = {
  object: string;
  action: string;
  relation: Trilingual;
};

export type PlayContent = {
  goesTogether: {
    roundsPerSession: number;
    pairs: GoesTogetherPair[];
    observations: { action: string; phrase: Trilingual }[];
  };
  threeNames: { roundsPerSession: number; words: string[] };
  belongs: {
    roundsPerSession: number;
    baskets: { category: CategoryId; art: string; name: Trilingual }[];
    words: string[];
  };
  countFingers: {
    roundsPerSession: number;
    rounds: { word: string; count: number; total: Trilingual }[];
  };
};

export const play = playJson as unknown as PlayContent;

/** Content counts, asserted in the app's own diagnostics so a bad copy is visible immediately. */
export const contentSummary = {
  words: words.length,
  sentences: sentences.length,
  stories: stories.length,
  categories: categories.length,
};
