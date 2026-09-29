/**
 * Where short Japanese display text may break: its 文節 (phrase) boundaries,
 * marked with |.
 *
 * Japanese has no spaces, so a browser left to itself breaks between any two
 * characters. In a 34px headline on a phone column that left one kana alone on
 * the last line (まだ情報がありませ／ん, いまは使えませ／ん). The fix is to say
 * where a break is allowed — a <wbr> at each boundary (see Phrased.tsx) under
 * `word-break: keep-all` — rather than to reach for `word-break: auto-phrase`
 * (Chromium only, and its dictionary split たぶん飲めます as た／ぶん飲めます)
 * or `text-wrap: balance` (which on Safari splits mid-phrase on its own).
 *
 * Headlines come from shared/aggregate.ts (overallState) and SummaryPanel. The
 * list below is keyed by that exact text, so a headline added without an entry
 * still renders — whole, breaking anywhere only if it must — and
 * phrases.test.ts fails until it is listed.
 */

export const PHRASE_MARK = '|';

const HEADLINES: Readonly<Record<string, string>> = {
  いま飲めます: 'いま|飲めます',
  たぶん飲めます: 'たぶん|飲めます',
  そろそろ切れそう: 'そろそろ|切れそう',
  作れないものがあります: '作れないものが|あります',
  いまは使えません: 'いまは|使えません',
  お掃除中です: 'お掃除中です',
  まだ情報がありません: 'まだ情報が|ありません',
  いまは閉まっています: 'いまは|閉まっています',
  最新の状況を確認しています: '最新の状況を|確認しています',
  状況を取得できていません: '状況を|取得できていません',
};

/** Every headline with an entry — for the test that keeps the list complete. */
export const KNOWN_HEADLINES: readonly string[] = Object.keys(HEADLINES);

/** 'いま|飲めます' → ['いま', '飲めます']. */
export function splitPhrases(marked: string): string[] {
  return marked.split(PHRASE_MARK).filter((part) => part.length > 0);
}

/** The phrases of a known headline, or the text whole when it is not listed. */
export function headlinePhrases(text: string): string[] {
  return splitPhrases(HEADLINES[text] ?? text);
}
