import { useEffect, useRef, useState } from 'react';
import { MOOD_KEYS, MOOD_META, type FeedbackEntry } from '../../shared/domain.js';
import { relativeTime } from '../../shared/time.js';

export interface VoicesProps {
  entries: readonly FeedbackEntry[];
  now: number;
  onLike: (id: string) => void;
  onWrite: () => void;
  onEdit: (entry: FeedbackEntry) => void;
  onDelete: (id: string) => void;
}

/**
 * みんなの声 — the public feedback list.
 *
 * Mood-only submissions feed the tally in the header but render no public
 * card: a card containing a lone 😊 says nothing a counter doesn't. Your own
 * mood-only entry does get a card, visible only to you — otherwise it would
 * be uneditable and undeletable, an opinion you could never take back.
 */
export function Voices({ entries, now, onLike, onWrite, onEdit, onDelete }: VoicesProps) {
  const visible = entries.filter((e) => e.body !== '' || e.mine);
  const tally = MOOD_KEYS.map((key) => ({
    key,
    emoji: MOOD_META[key].emoji,
    label: MOOD_META[key].label,
    count: entries.filter((e) => e.mood === key).length,
  }));

  // Delete is two taps: 削除 arms the button, 本当に削除 fires. The armed
  // state disarms itself after a moment so a stray first tap can't turn a
  // much later tap into a deletion.
  const [armedId, setArmedId] = useState<string | null>(null);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
  }, []);
  const arm = (id: string) => {
    setArmedId(id);
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    disarmTimer.current = setTimeout(() => setArmedId(null), 4_000);
  };

  return (
    <>
      <div className="voices__bar">
        {entries.length > 0 && (
          <div className="voices__tally" aria-label="満足度の内訳">
            {tally.map((t) => (
              <span className="voices__tally-item" key={t.key} title={t.label}>
                <span aria-hidden="true">{t.emoji}</span>
                <span className="visually-hidden">{t.label}</span>
                {t.count}
              </span>
            ))}
          </div>
        )}
        <button type="button" className="voices__write" onClick={onWrite}>
          ご意見を書く
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="voices__empty">まだ感想はありません。最初の声を聞かせてください。</p>
      ) : (
        <div className="voices__list">
          {visible.map((e) => (
            <article className="card voice" key={e.id}>
              <div className="voice__head">
                <span className="voice__mood" aria-label={MOOD_META[e.mood].label}>
                  {MOOD_META[e.mood].emoji}
                </span>
                <span className="voice__who">
                  {e.userLabel}
                  {e.mine && <span className="voice__mine">自分</span>}
                </span>
                <span className="voice__when">
                  {relativeTime(e.createdAt, now)}
                  {e.editedAt !== null && <span className="voice__edited">編集済み</span>}
                </span>
              </div>
              {e.body !== '' ? (
                <p className="voice__body">{e.body}</p>
              ) : (
                <p className="voice__body voice__body--empty">
                  満足度のみの投稿です（他の人には表示されません）
                </p>
              )}
              <div className="voice__foot">
                {e.mine && (
                  <span className="voice__own-actions">
                    <button
                      type="button"
                      className="voice__action"
                      onClick={() => onEdit(e)}
                    >
                      編集
                    </button>
                    {armedId === e.id ? (
                      <button
                        type="button"
                        className="voice__action voice__action--danger"
                        onClick={() => {
                          setArmedId(null);
                          onDelete(e.id);
                        }}
                      >
                        本当に削除する
                      </button>
                    ) : (
                      <button type="button" className="voice__action" onClick={() => arm(e.id)}>
                        削除
                      </button>
                    )}
                  </span>
                )}
                <button
                  type="button"
                  className={`voice__like${e.likedByMe ? ' voice__like--on' : ''}`}
                  aria-pressed={e.likedByMe}
                  aria-label={`いいね（現在${e.likes}件）`}
                  onClick={() => onLike(e.id)}
                >
                  <span aria-hidden="true">♥</span>
                  {e.likes}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
