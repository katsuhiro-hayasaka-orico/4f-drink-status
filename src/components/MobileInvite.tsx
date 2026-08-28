import { useEffect, useState } from 'react';
import { qrDataUrl } from '../lib/qr.js';

/**
 * 「スマホでも見られます」— a slim band attached under the header, desktop
 * widths only (CSS hides it below 720px). The board is often left open on a
 * PC or wall display, which makes the page itself the best poster the site
 * will ever get: a standing QR at the very top means anyone can pull the
 * board onto their phone without asking around for the URL.
 */

export interface MobileInviteProps {
  /** Opens the full-size QR dialog. */
  onShowQr: () => void;
}

export function MobileInvite({ onShowQr }: MobileInviteProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = window.location.origin;

  useEffect(() => {
    let cancelled = false;
    // 240px render shown at 76 CSS px — sharp enough to scan off a monitor.
    qrDataUrl(url, 240)
      .then((u) => {
        if (!cancelled) setDataUrl(u);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Without a QR there is nothing to invite with — render nothing rather
  // than an empty frame.
  if (!dataUrl) return null;

  return (
    <aside className="mobile-invite" aria-label="スマホでのアクセス案内">
      <div className="shell mobile-invite__inner">
        <span className="mobile-invite__qr">
          <img src={dataUrl} alt={`このサイトのQRコード（${url}）`} />
        </span>
        <div className="mobile-invite__text">
          <strong>📱 スマホでもこのまま見られます</strong>
          <p>
            カメラでQRコードを読み取るだけ。ホーム画面に追加すれば、新しい投稿の
            プッシュ通知も受け取れます。
          </p>
        </div>
        <button type="button" className="mobile-invite__more" onClick={onShowQr}>
          QRを大きく表示
        </button>
      </div>
    </aside>
  );
}
