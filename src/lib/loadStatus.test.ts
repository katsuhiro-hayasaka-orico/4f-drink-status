import { describe, expect, it } from 'vitest';
import { loadStatus } from './loadStatus.js';

const at = (n: number) => `T${n}`;

describe('loadStatus', () => {
  it('says it is still looking while the first fetch is out', () => {
    const s = loadStatus({ loading: true, loadError: null, fetchedAt: null }, at);
    expect(s.kind).toBe('loading');
    expect(s.retry).toBe(false);
  });

  it('does not claim previous data it never had', () => {
    // The old banner said 「表示は前回取得した内容です」 even on a first fetch
    // that never came back — there was no previous content to show.
    const s = loadStatus({ loading: false, loadError: '接続できません', fetchedAt: null }, at);
    expect(s.kind).toBe('failedFirst');
    expect(s.text).toContain('取得できませんでした');
    expect(s.text).not.toContain('前回');
    expect(s.retry).toBe(true);
  });

  it('names the time of the data it is still showing after a later failure', () => {
    const s = loadStatus({ loading: false, loadError: '接続できません', fetchedAt: 42 }, at);
    expect(s.kind).toBe('failedLater');
    expect(s.text).toContain('T42');
    expect(s.retry).toBe(true);
  });

  it('is quiet when the last fetch succeeded', () => {
    expect(loadStatus({ loading: false, loadError: null, fetchedAt: 42 }, at)).toEqual({
      kind: 'ok',
      text: null,
      retry: false,
    });
  });

  it('prefers the failure over "loading" when both are set', () => {
    // loading only flips off after the first fetch settles; a failure that
    // arrives in the same tick must not be hidden behind 「確認しています」.
    const s = loadStatus({ loading: true, loadError: 'x', fetchedAt: null }, at);
    expect(s.kind).toBe('failedFirst');
  });
});
