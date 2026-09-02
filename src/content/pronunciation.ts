/**
 * The single, auditable table of pinned Mandarin pronunciations.
 *
 * Mandarin polyphones are where a zh-CN voice most visibly fails, and TTS is the default
 * experience rather than a fallback, so each trap is named explicitly. Keys are **substrings, not
 * characters**, because the correct reading depends on context: 着 is zháo in 睡着 but zhe as an
 * aspect particle.
 *
 * Values are IPA, handed to `AVSpeechSynthesisIPANotationAttribute` by the native module.
 *
 * **Honest limit:** Apple does not document IPA coverage for zh-CN. The pin is applied and logged;
 * whether the voice honours it must be confirmed by a human listening on a device.
 */
export const mandarinPins: Record<string, string> = {
  睡着: 'ʂweɪ˥˩ʈʂɑʊ˧˥', // shuì zháo — asleep, not shuì zhe
  数一数: 'ʂu˨˩˦ i˥ ʂu˨˩˦', // shǔ — "to count", not shù "a number"
  背: 'peɪ˥˩', // bèi — "back" (the noun), not bēi "to carry"
};
