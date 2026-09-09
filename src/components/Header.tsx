import { jstTimeLabel, type LoungeHours } from '../../shared/hours.js';
import type { NotifyState } from '../hooks/useNotifications.js';
import type { ThemePreference } from '../hooks/useTheme.js';
import { ThemeSwitcher } from './ThemeSwitcher.js';

/** Solid bell, struck through while the browser has the site blocked. */
function BellIcon({ blocked }: { blocked: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M12 2.5c.9 0 1.6.7 1.6 1.6v.5A6.6 6.6 0 0 1 18.6 11v3.6l1.7 2.6a1.2 1.2 0 0 1-1 1.9H4.7a1.2 1.2 0 0 1-1-1.9l1.7-2.6V11a6.6 6.6 0 0 1 5-6.4v-.5c0-.9.7-1.6 1.6-1.6z" />
      <path d="M9.8 20.4h4.4a2.2 2.2 0 0 1-4.4 0z" />
      {blocked && (
        <path d="M4 3 21 21" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
      )}
    </svg>
  );
}

const NOTIFY_LABEL: Record<Exclude<NotifyState, 'unsupported'>, string> = {
  on: '通知 ON',
  off: '通知 OFF',
  denied: '通知 ブロック中',
};

const NOTIFY_TITLE: Record<Exclude<NotifyState, 'unsupported'>, string> = {
  on: '新しい投稿の通知をやめる',
  off: '新しい投稿があったらプッシュ通知を受け取る（タブを閉じていても届きます）',
  denied: 'ブラウザの設定でこのサイトの通知がブロックされています。アドレスバーの鍵アイコンから許可に変更してください',
};

/** Set to null once this stops being a pilot. */
const BADGE: string | null = 'デモ';

export interface HeaderProps {
  /** 「最新の投稿」 — when somebody last reported on the machine or supplies. */
  lastUpdated: string;
  autoOn: boolean;
  onToggleAuto: () => void;
  /** Server time of the last snapshot the board adopted; null before the first. */
  fetchedAt: number | null;
  onRefresh: () => void;
  hours: LoungeHours;
  notifyState: NotifyState;
  onToggleNotify: () => void;
  themePreference: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
}

export function Header({
  lastUpdated,
  autoOn,
  onToggleAuto,
  fetchedAt,
  onRefresh,
  hours,
  notifyState,
  onToggleNotify,
  themePreference,
  onThemeChange,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="shell header__inner">
        <div className="header__brand">
          <div className="header__dot" aria-hidden="true" />
          <span className="header__title">4Fドリンク速報</span>
          <span className="header__place">弘済ビル 4Fラウンジ</span>
          {BADGE && <span className="header__badge">{BADGE}</span>}
        </div>
        <div className="header__meta">
          {/* Opening hours sit next to the clock, since both answer 「いま行けるか」. */}
          <span className={`header__hours header__hours--${hours.state}`}>
            <span className="header__hours-dot" aria-hidden="true" />
            {hours.badge}
            <span className="header__hours-range">{hours.rangeLabel}</span>
          </span>
          {/* Two different kinds of fresh. 「最新の投稿」 is about the machine —
              when a person last reported on it. The fetch time is about the
              connection, and only worth showing when polling is off and the
              board is knowingly standing still. */}
          <span className="header__updated">
            最新の投稿 <strong>{lastUpdated}</strong>
          </span>
          <button
            type="button"
            className="header__toggle"
            onClick={onToggleAuto}
            aria-pressed={autoOn}
          >
            自動更新 {autoOn ? 'ON' : 'OFF'}
          </button>
          {!autoOn && (
            <>
              <span className="header__updated">
                最後に取得 <strong>{fetchedAt === null ? '—' : jstTimeLabel(fetchedAt)}</strong>
              </span>
              <button type="button" className="header__toggle" onClick={onRefresh}>
                今すぐ更新
              </button>
            </>
          )}
          {notifyState !== 'unsupported' && (
            <button
              type="button"
              className="header__toggle header__toggle--icon"
              aria-pressed={notifyState === 'on'}
              onClick={onToggleNotify}
              title={NOTIFY_TITLE[notifyState]}
            >
              <BellIcon blocked={notifyState === 'denied'} />
              {NOTIFY_LABEL[notifyState]}
            </button>
          )}
          <ThemeSwitcher preference={themePreference} onChange={onThemeChange} />
        </div>
      </div>
    </header>
  );
}
