import { useState } from 'react';
import { a2hsHint, readA2hsDismissed, saveA2hsDismissed, type A2hsPlatform } from '../lib/a2hs.js';

/**
 * One-time install hint for phone visitors, right under the header. Closing
 * it is permanent (localStorage) — an install hint that reappears is a nag,
 * and the AboutDialog keeps the instructions for anyone who changes their
 * mind later.
 */

const WORDING: Record<A2hsPlatform, string> = {
  ios: '共有メニュー（□↑）から「ホーム画面に追加」すると、アプリのように開けて、新しい投稿の通知も受け取れます',
  android:
    'ブラウザのメニュー（⋮）から「ホーム画面に追加」すると、アプリのように開けます。通知はこのままONにできます',
};

function detectPlatform(): A2hsPlatform | null {
  if (typeof window === 'undefined') return null;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as { standalone?: boolean }).standalone === true;
  return a2hsHint(navigator.userAgent, standalone, readA2hsDismissed(), navigator.maxTouchPoints);
}

export function A2hsBanner() {
  // Decided once at mount: the UA, install state, and dismissal don't
  // change mid-visit, and re-running the check on every render would only
  // add ways to flicker.
  const [platform, setPlatform] = useState<A2hsPlatform | null>(detectPlatform);

  if (!platform) return null;

  return (
    <div className="a2hs" role="note">
      <span className="a2hs__icon" aria-hidden="true">
        📲
      </span>
      <span className="a2hs__text">{WORDING[platform]}</span>
      <button
        type="button"
        className="a2hs__close"
        aria-label="この案内を閉じる（次回から表示されません）"
        onClick={() => {
          saveA2hsDismissed();
          setPlatform(null);
        }}
      >
        ×
      </button>
    </div>
  );
}
