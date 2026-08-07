import type { ThemePreference } from '../hooks/useTheme.js';

/**
 * Three states rather than a two-way toggle, because "follow the OS" is a real
 * choice and the default one — a plain toggle would strand anyone who wants it
 * back after tapping once.
 */

const ICON = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  'aria-hidden': true as const,
  focusable: 'false' as const,
};

function SystemIcon() {
  return (
    <svg {...ICON} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M9 20.5h6" strokeLinecap="round" />
    </svg>
  );
}

function LightIcon() {
  return (
    <svg {...ICON} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </svg>
  );
}

function DarkIcon() {
  return (
    <svg {...ICON} fill="currentColor">
      <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.8 8.8 0 1 0 11.1 11.1z" />
    </svg>
  );
}

const OPTIONS: { key: ThemePreference; label: string; Icon: () => React.JSX.Element }[] = [
  { key: 'system', label: '端末の設定に合わせる', Icon: SystemIcon },
  { key: 'light', label: 'ライトモード', Icon: LightIcon },
  { key: 'dark', label: 'ダークモード', Icon: DarkIcon },
];

export interface ThemeSwitcherProps {
  preference: ThemePreference;
  onChange: (next: ThemePreference) => void;
}

export function ThemeSwitcher({ preference, onChange }: ThemeSwitcherProps) {
  return (
    <div className="theme-switch" role="group" aria-label="表示テーマ">
      {OPTIONS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          className="theme-switch__button"
          aria-pressed={preference === key}
          title={label}
          onClick={() => onChange(key)}
        >
          <Icon />
          <span className="visually-hidden">{label}</span>
        </button>
      ))}
    </div>
  );
}
