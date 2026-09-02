/**
 * The palette, ported verbatim from the SwiftUI app's `WordStore`.
 *
 * The contrast numbers in the comments were measured there, not estimated, so they carry over
 * unchanged only because the colours do. Change a colour and the number is a lie.
 */

/** Bright toddler palette — cycled across cards. */
export const palette = [
  '#FF736B', // coral
  '#FFC230', // sunshine
  '#57CC97', // mint
  '#59AEFA', // sky
  '#B38CF7', // lavender
  '#FD9952', // tangerine
];

/** Colour cards sit on neutral paper so the swatch is the only colour on the card. */
export const paper = '#FAF5EE';

/** Type on a card. Clears WCAG AA 4.5:1 on all six palette colours (5.49:1 worst, coral). */
export const cardInk = '#33261F';

/** Selected chips, tiles and primary buttons. White text on it measures 5.80:1. */
export const accent = '#1861CC';

/** The word-boundary spotlight — 5.20:1 (coral) to 8.55:1 (sunshine), distinct from cardInk. */
export const spotlightInk = '#26108C';

/** Captions on the warm paper background — 5.25:1. */
export const paperInk = '#73665A';

/** Story page backgrounds, indexed by each story's `colour` field. */
export const storyColours = ['#7FB2E5', '#F4A97F', '#8FCBA6', '#C9A6E0', '#E9B5C4', '#9FBF8F'];

/**
 * The colours the colour words teach — saturated, not pastel, so a toddler naming them is naming
 * the same colour a grown-up would. Referenced from JSON as `"swatch:red"`.
 */
export const colourSwatches: Record<string, string> = {
  red: '#E63030',
  blue: '#216BE3',
  yellow: '#FDCC17',
  green: '#29A84F',
  orange: '#F58521',
  purple: '#8C45CC',
  black: '#29292E',
  white: '#FCFCFC',
  pink: '#F570B3',
  brown: '#8C5C38',
};

export const cardColour = (order: number, isColourWord: boolean): string =>
  isColourWord ? paper : palette[order % palette.length];
