import { useEffect, useRef } from 'react';
import { CONFIG } from '../../shared/config.js';
import {
  CONTRIBUTOR_WINDOW_DAYS,
  MILESTONE_EVERY,
  tierLadderNote,
} from '../../shared/contributors.js';

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
          投稿は2通りあります。ドリンクを作った結果を報告すると、使った材料の残量が自動で更新されます。
          作っていなくても、ホッパーを見て気づいた残量（たっぷり／半分くらい／少なめ／ほとんどない、
          または補充された）を材料ごとに報告できます。「材料の推定残量」の各カードからも直接投稿できます。
          表示される残量%は、みんなの報告を新しいものほど重く平均した値です。
        </p>
        <p className="dialog__body">
          ヘッダーの「通知」をONにすると、新しい投稿をプッシュ通知でお知らせします。
          タブやブラウザを閉じていても届きます（自分の投稿は通知されません）。
        </p>
        <p className="dialog__body">
          iPhone・iPadでは、Safariの共有メニュー（□↑）から「ホーム画面に追加」でこのサイトを
          追加し、ホーム画面のアイコンから開くと通知をONにできます（iOS 16.4以降）。
          ブラウザのタブから開いている間は、iOSの仕様により通知ボタンは表示されません。
          Androidでは、ブラウザのメニュー（⋮）から「ホーム画面に追加」できます
          （通知はタブのままでもONにできます）。
        </p>
        <p className="dialog__body">
          投稿してくださった方には、累計の投稿件数に応じて称号（{tierLadderNote()}）が付き、
          {MILESTONE_EVERY}件ごとにお礼を表示します。「投稿の常連さん」は直近
          {CONTRIBUTOR_WINDOW_DAYS}日に投稿した日数で並べたもので、同じ日に何件投稿しても1日と
          数えます。いずれも端末（ブラウザ）ごとの集計で、クッキーを消すと新しい端末として
          数え直します。投稿の多さが、いまの状態の集計に影響することはありません。
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
