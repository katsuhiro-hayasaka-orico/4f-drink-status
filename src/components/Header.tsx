/** Set to null once this stops being a pilot. */
const BADGE: string | null = 'デモ';

export interface HeaderProps {
  lastUpdated: string;
  autoOn: boolean;
  onToggleAuto: () => void;
}

export function Header({ lastUpdated, autoOn, onToggleAuto }: HeaderProps) {
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
        </div>
      </div>
    </header>
  );
}
