import { MOOD_KEYS, MOOD_META, type FeedbackEntry } from '../../shared/domain.js';
import { relativeTime } from '../../shared/time.js';

export interface VoicesProps {
  entries: readonly FeedbackEntry[];
  now: number;
  onLike: (id: string) => void;
  onWrite: () => void;
}

/**
 * みんなの声 — the public feedback list.
 *
 * Mood-only submissions feed the tally in the header but render no card: a
 * card containing a lone 😊 says nothing a counter doesn't. Cards are for
 * entries someone took the time to write.
 */
export function Voices({ entries, now, onLike, onWrite }: VoicesProps) {
  const withBody = entries.filter((e) => e.body !== '');
  const tally = MOOD_KEYS.map((key) => ({
    key,
    emoji: MOOD_META[key].emoji,
    label: MOOD_META[key].label,
    count: entries.filter((e) => e.mood === key).length,
  }));

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

      {withBody.length === 0 ? (
        <p className="voices__empty">まだ感想はありません。最初の声を聞かせてください。</p>
      ) : (
        <div className="voices__list">
          {withBody.map((e) => (
            <article className="card voice" key={e.id}>
              <div className="voice__head">
                <span className="voice__mood" aria-label={MOOD_META[e.mood].label}>
                  {MOOD_META[e.mood].emoji}
                </span>
                <span className="voice__who">
                  {e.userLabel}
                  {e.mine && <span className="voice__mine">自分</span>}
                </span>
                <span className="voice__when">{relativeTime(e.createdAt, now)}</span>
              </div>
              <p className="voice__body">{e.body}</p>
              <div className="voice__foot">
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
