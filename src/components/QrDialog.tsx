import { useEffect, useRef, useState } from 'react';
import { splitPhrases } from '../lib/phrases.js';
import { qrDataUrl } from '../lib/qr.js';
import { DialogContent, initialFocus } from './DialogContent.js';
import { Phrased } from './Phrased.js';

/** Where the caption may break (see src/lib/phrases.ts). */
const LEAD = splitPhrases(
  'スマホの|カメラで|読み取ると、|このサイトが|開きます。|ラウンジで|隣の人に|そのまま|見せてください。',
);

/**
 * 「このサイト、QRで読んで」— the site's own URL as a QR code, for showing a
 * colleague across the lounge table. The code is generated locally (no
 * external image service — nothing about the site leaves the browser) from
 * location.origin, so the same build works on any deployment URL.
 */

export interface QrDialogProps {
  onClose: () => void;
}

export function QrDialog({ onClose }: QrDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /**
   * undefined while the code is being drawn, null if it could not be, else
   * the image. Loading and failure used to share null, so every open flashed
   * 「QRコードを生成できませんでした」 for a moment — and the dialog measured
   * its layout for initial focus with that one line where the code would be.
   */
  const [dataUrl, setDataUrl] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const url = window.location.origin;

  // Once, on open — see AboutDialog for why this is not keyed on onClose.
  // The code's box is already in place (a same-size placeholder while it is
  // drawn), so this sees the layout the user will see.
  useEffect(() => {
    initialFocus(contentRef.current, closeRef.current)?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    // 512px render shown at 232 CSS px — crisp on high-DPI phone screens,
    // which is exactly where a QR gets scanned from.
    qrDataUrl(url, 512)
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

  const copy = () => {
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard blocked — the URL is printed right there to select */
      });
  };

  return (
    <div
      className="backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="qr-title" className="dialog">
        <div className="dialog__head">
          <div className="dialog__dot" aria-hidden="true" />
          <h2 id="qr-title" className="dialog__title">
            QRコードで紹介
          </h2>
        </div>
        {/* The code comes first. On a landscape phone the scrolling area is
            barely taller than the code itself, and with the sentence above it
            the code could never be on screen whole — a clipped QR does not
            scan. .qr__image also sizes itself to the height available. */}
        <DialogContent ref={contentRef} labelledBy="qr-title">
          {/* The QR sits on a fixed white card in both themes — scanners want
              contrast, not brand palette. */}
          <div className="qr__card">
            {dataUrl ? (
              <img className="qr__image" src={dataUrl} alt={`このサイトのQRコード（${url}）`} />
            ) : dataUrl === undefined ? (
              <div className="qr__image" aria-hidden="true" />
            ) : (
              <p className="dialog__body">QRコードを生成できませんでした</p>
            )}
          </div>
          <p className="dialog__body qr__lead">
            <Phrased parts={LEAD} />
          </p>
          <p className="qr__url" aria-label="このサイトのURL">
            {url}
          </p>
        </DialogContent>
        <div className="dialog__foot">
          {/* Both labels are always laid out (one hidden), so the button
              keeps one width and the row cannot re-wrap on copy. */}
          <button type="button" className="qr__copy" onClick={copy} aria-live="polite">
            <span className="qr__copy-labels">
              <span className={copied ? 'is-hidden' : undefined}>URLをコピー</span>
              <span className={copied ? undefined : 'is-hidden'}>コピー済み ✓</span>
            </span>
          </button>
          <button type="button" ref={closeRef} className="dialog__close" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
