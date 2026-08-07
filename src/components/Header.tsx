import type { LoungeHours } from '../../shared/hours.js';
import type { ThemePreference } from '../hooks/useTheme.js';
import { ThemeSwitcher } from './ThemeSwitcher.js';

/** Set to null once this stops being a pilot. */
const BADGE: string | null = 'デモ';

export interface HeaderProps {
  lastUpdated: string;
  autoOn: boolean;
  onToggleAuto: () => void;
  hours: LoungeHours;
  themePreference: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
}

export function Header({
  lastUpdated,
  autoOn,
  onToggleAuto,
  hours,
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
          <span className="header__updated">
            最終更新 <strong>{lastUpdated}</strong>
          </span>
          <button
            type="button"
            className="header__toggle"
            onClick={onToggleAuto}
            aria-pressed={autoOn}
          >
            自動更新 {autoOn ? 'ON' : 'OFF'}
          </button>
          <ThemeSwitcher preference={themePreference} onChange={onThemeChange} />
        </div>
      </div>
    </header>
  );
}
