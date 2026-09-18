import { describeMine, type ContributorsResponse } from '../../shared/contributors.js';
import { ContributorBadge } from './ContributorBadge.js';

export interface ContributorRankingProps {
  contributors: ContributorsResponse;
}

/**
 * 投稿の常連さん — who has posted on the most days lately.
 *
 * Days, not postings, and the bar is drawn against the window itself (「30日中
 * 8日」) rather than against the leader: a relative bar would make the top row
 * full every time, including the week one person posted twice. The absolute
 * denominator also matches the footnote, so the picture and the words agree.
 *
 * Built on the .popularity layout the drink ranking already uses — same row
 * grid, same rank circle, same wrap-the-bar breakpoint — because it is the
 * same kind of object and a second ranking style would be one more thing to
 * keep in step.
 */
export function ContributorRanking({ contributors }: ContributorRankingProps) {
  const { top, mine, active, windowDays } = contributors;

  if (top.length === 0) {
    return (
      <p className="popularity__empty">
        直近{windowDays}日に投稿した端末はまだありません。最初の投稿がここに載ります。
      </p>
    );
  }

  return (
    <div className="popularity contributors">
      <ol className="popularity__list">
        {top.map((r, i) => {
          const name = r.isMe ? '利用者（あなた）' : r.label;
          return (
            // Labels can collide (two devices registering in the same instant
            // share 利用者X), so position carries the key.
            <li
              className="popularity__row"
              key={`${i}-${r.label}`}
              aria-label={`${i + 1}位 ${name}：直近${windowDays}日のうち${r.recentDays}日に投稿（${r.recentPostings}件）`}
            >
              <span className="popularity__rank" aria-hidden="true">
                {i + 1}
              </span>
              <span className="popularity__name" aria-hidden="true">
                {name}
                <ContributorBadge tier={r.tier} />
                {i === 0 && <span className="popularity__top">{windowDays}日間No.1</span>}
              </span>
              <span
                className="popularity__bar"
                aria-hidden="true"
                title={`${windowDays}日中${r.recentDays}日`}
              >
                <span
                  className="popularity__seg popularity__seg--days"
                  style={{ width: `${(r.recentDays / windowDays) * 100}%` }}
                />
              </span>
              <span className="popularity__count" aria-hidden="true">
                {r.recentDays}日・{r.recentPostings}件
              </span>
            </li>
          );
        })}
      </ol>
      <p className="contributors__mine">{describeMine(mine, active, windowDays)}</p>
    </div>
  );
}
