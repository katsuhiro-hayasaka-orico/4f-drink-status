/**
 * Japanese prose written across several source lines, without the space JSX
 * puts at every line break.
 *
 * JSX folds a line break inside text into one space. English wants that space;
 * Japanese does not, and the dialogs showed it as a stray gap after 、 and 。
 * wherever the source happened to wrap (「新しさから、 いまの状態」). Tag the
 * text instead of writing it bare:
 *
 *   <p>{jp`集計の対象は過去${CONFIG.observationWindowMin}分の投稿で、
 *         「補充された」の投稿があった場合は…`}</p>
 *
 * Only whitespace that contains a line break is removed, and only in the
 * literal parts — a space written within a line (「Cloudflare Workers」) and
 * the interpolated values survive untouched. The one thing to avoid is
 * breaking the source line between two Latin words: they would be joined.
 */
export function jp(strings: TemplateStringsArray, ...values: unknown[]): string {
  const fold = (s: string) => s.replace(/[ \t]*\r?\n\s*/g, '');
  let out = fold(strings[0]);
  values.forEach((value, i) => {
    out += String(value) + fold(strings[i + 1]);
  });
  return out;
}
