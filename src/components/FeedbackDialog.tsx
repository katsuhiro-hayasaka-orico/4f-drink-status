import { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../../shared/config.js';
import { MOOD_KEYS, MOOD_META, type MoodKey } from '../../shared/domain.js';
import { ApiError } from '../lib/api.js';

export interface FeedbackDialogProps {
  /** `auto` = opened itself after a post; `manual` = the user asked for it. */
  variant: 'auto' | 'manual';
  onSubmit: (mood: MoodKey, body: string) => Promise<void>;
  onClose: () => void;
}

const TITLES = {
  auto: '投稿ありがとうございます！',
  manual: 'ご意見箱',
} as const;

/**
 * The feedback form (ご意見箱). A mood is required, the comment is not —
 * one tap on 😊 and 送信 is a complete submission, which is what makes the
 * form cheap enough to answer. The form states plainly that bodies stay
 * admin-only: people write differently when they know who is reading.
 */
export function FeedbackDialog({ variant, onSubmit, onClose }: FeedbackDialogProps) {
  const [mood, setMood] = useState<MoodKey | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The auto-close timer must only die with the dialog itself. Tying it to
  // the effect above would cancel it whenever the parent re-renders with a
  // fresh onClose — which is exactly what the submit's own list refresh
  // causes, leaving the dialog stuck open on its thank-you screen.
  useEffect(() => () => {
    if (doneTimer.current) clearTimeout(doneTimer.current);
  }, []);

  const remaining = CONFIG.feedbackMaxLength - body.length;

  const submit = async () => {
    if (!mood || sending || sent) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(mood, body);
      setSent(true);
      // Long enough to read the thanks, short enough not to feel stuck.
      doneTimer.current = setTimeout(onClose, 1_400);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '送信に失敗しました');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="feedback-title" className="dialog">
        <div className="dialog__head">
          <div className="dialog__dot" aria-hidden="true" />
          <h2 id="feedback-title" className="dialog__title">
            {TITLES[variant]}
          </h2>
        </div>

        {sent ? (
          <p className="dialog__body feedback__done">
            ご意見ありがとうございました！今後の改善に役立てます。
          </p>
        ) : (
          <>
            <p className="dialog__body">
              このサイトの使い心地はいかがですか？困ったことや改善してほしい点があれば、
              ぜひ聞かせてください。満足度だけの送信でも助かります。
              <strong className="feedback__privacy">
                お寄せいただいた内容はサイト上には公開されず、管理者だけが確認します。
              </strong>
            </p>

            <div className="feedback__moods" role="radiogroup" aria-label="満足度">
              {MOOD_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={mood === key}
                  className={`feedback__mood${mood === key ? ' feedback__mood--on' : ''}`}
                  onClick={() => setMood(key)}
                >
                  <span className="feedback__mood-emoji" aria-hidden="true">
                    {MOOD_META[key].emoji}
                  </span>
                  {MOOD_META[key].label}
                </button>
              ))}
            </div>

            <textarea
              className="feedback__textarea"
              value={body}
              maxLength={CONFIG.feedbackMaxLength}
              rows={4}
              placeholder="改善してほしい点や困ったことがあれば（任意）"
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="feedback__counter" aria-hidden="true">
              あと{remaining}文字
            </div>

            {error && (
              <p role="alert" className="feedback__error">
                {error}
              </p>
            )}

            <div className="dialog__foot">
              <button type="button" ref={closeRef} className="feedback__skip" onClick={onClose}>
                また今度
              </button>
              <button
                type="button"
                className="dialog__close"
                disabled={!mood || sending}
                onClick={() => void submit()}
              >
                {sending ? '送信中…' : '送信する'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
