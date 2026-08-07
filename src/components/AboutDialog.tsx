import { useEffect, useRef } from 'react';
import { CONFIG } from '../../shared/config.js';

export interface AboutDialogProps {
  onClose: () => void;
}

export function AboutDialog({ onClose }: AboutDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="about-title" className="dialog">
        <div className="dialog__head">
          <div className="dialog__dot" aria-hidden="true" />
          <h2 id="about-title" className="dialog__title">
            このアプリについて
          </h2>
        </div>
        <p className="dialog__body">
          利用者ごとの最新投稿を1票として集計し、投稿者数・一致率・情報の新しさから、
          いまの状態とその確からしさを推定しています。集計の対象は過去
          {CONFIG.observationWindowMin}分の投稿で、「補充された」の投稿があった場合は
          それ以前の投稿を除外します。
        </p>
        <p className="dialog__body">
          Cloudflare Workers・D1・静的アセット配信で動作しています。ログインは不要で、
          端末ごとに発行される匿名IDを1票として数えます。個人を特定する情報は保存しません。
        </p>
        <div className="dialog__foot">
          <button type="button" ref={closeRef} className="dialog__close" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
