import { describe, expect, it } from 'vitest';
import { jp } from './jp.js';

describe('jp', () => {
  it('joins lines without the space JSX would put at the break', () => {
    expect(jp`投稿者数・一致率・情報の新しさから、
      いまの状態を推定しています。`).toBe('投稿者数・一致率・情報の新しさから、いまの状態を推定しています。');
  });

  it('keeps interpolated values, and never folds whitespace inside them', () => {
    const n = 30;
    const note = 'a\nb';
    expect(jp`過去${n}分の
      投稿で、${note}`).toBe('過去30分の投稿で、a\nb');
  });

  it('leaves a space written within a line alone', () => {
    expect(jp`Cloudflare Workers・D1で
      動作しています。`).toBe('Cloudflare Workers・D1で動作しています。');
  });

  it('handles CRLF sources and leading or trailing breaks', () => {
    expect(jp`
      一行目、\r\n      二行目。
    `).toBe('一行目、二行目。');
  });

  it('is a no-op on a single line', () => {
    expect(jp`そのまま`).toBe('そのまま');
  });
});
