import { MOOD_KEYS, MOOD_META, type MoodKey } from '../../shared/domain.js';

/**
 * Shipped improvements that started as feedback-box submissions — the proof
 * that writing in here does something. `voice` is a PARAPHRASE written by
 * the admin, never the submitted text: bodies stay private (they may carry
 * personal or confidential details), so only a generalized gist of the idea
 * is republished, with no name, label, or date-of-submission.
 */
const FROM_FEEDBACK: { when: string; voice: string; change: string }[] = [
  {
    when: '2026年8月28日',
    voice: '予測できないとダメ！',
    change:
      '曜日×時間帯の傾向マップ「いつ切れやすい？」（切れやすい時間帯・混み具合・ねらい目）を追加しました',
  },
  {
    when: '2026年8月28日',
    voice: '自分は作らなくても、見かけた残量を報告できるようにしてほしい',
    change: '投稿フォームに「残りが少なそうだと気づいたら」の1タップ報告を追加しました',
  },
];

export interface FeedbackBoxProps {
  tally: Record<MoodKey, number>;
  onWrite: () => void;
}

/**
 * ご意見箱 — the private successor to the public みんなの声 list.
 *
 * Bodies are collected but never shown on the site (a public page must not
 * republish free text that may carry personal or confidential details).
 * What remains visible is the mood tally — enough for contributors to see
 * that voices are being counted — and the way in.
 */
export function FeedbackBox({ tally, onWrite }: FeedbackBoxProps) {
  const total = MOOD_KEYS.reduce((sum, k) => sum + tally[k], 0);

  return (
    <div className="card feedback-box">
      <div className="feedback-box__info">
        {total > 0 ? (
          <div className="voices__tally" aria-label="いただいたご意見の満足度内訳">
            {MOOD_KEYS.map((k) => (
              <span className="voices__tally-item" key={k} title={MOOD_META[k].label}>
                <span aria-hidden="true">{MOOD_META[k].emoji}</span>
                <span className="visually-hidden">{MOOD_META[k].label}</span>
                {tally[k]}
              </span>
            ))}
          </div>
        ) : (
          <span className="feedback-box__lead">サイトへのご意見・ご感想をお寄せください。</span>
        )}
        <p className="feedback-box__note">
          お寄せいただいた内容はサイト上には公開されず、管理者だけが確認します。
        </p>
      </div>
      <button type="button" className="voices__write" onClick={onWrite}>
        ご意見を書く
      </button>

      {FROM_FEEDBACK.length > 0 && (
        <div className="feedback-box__shipped">
          <span className="feedback-box__shipped-title">ご意見から改善した機能</span>
          <ul className="feedback-box__shipped-list">
            {FROM_FEEDBACK.map((item) => (
              <li key={item.change}>
                <span className="feedback-box__shipped-when">{item.when}</span>
                「{item.voice}」という声から、{item.change}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
