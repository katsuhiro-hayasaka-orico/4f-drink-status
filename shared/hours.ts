/**
 * When the lounge is open.
 *
 * Fixed to JST rather than the viewer's clock: the lounge opens at 9:00 in
 * Tokyo whether you are looking from Tokyo or not, and a board that says
 * 「開放中」 because your laptop is set to another timezone is worse than no
 * board. The server stores epoch milliseconds, so this converts once, here.
 */

import { CONFIG } from './config.js';

const HOUR = 3_600_000;
const JST_OFFSET = 9 * HOUR;

export type LoungeState = 'open' | 'closingSoon' | 'closed';

export interface LoungeHours {
  state: LoungeState;
  /** 「9:00–17:00」 */
  rangeLabel: string;
  /** Short status for the header badge. */
  badge: string;
  /** A sentence for the summary panel when the lounge is shut. */
  note: string;
  /** Minutes until close, when the lounge is open. */
  minutesToClose: number | null;
}

/** Wall-clock hour and minute in Tokyo. */
export function jstClock(now: number): { hour: number; minute: number; minutes: number } {
  const d = new Date(now + JST_OFFSET);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  return { hour, minute, minutes: hour * 60 + minute };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function hoursLabel(): string {
  return `${CONFIG.openHour}:00–${CONFIG.closeHour}:00`;
}

export function loungeHours(now: number): LoungeHours {
  const { minutes } = jstClock(now);
  const open = CONFIG.openHour * 60;
  const close = CONFIG.closeHour * 60;
  const rangeLabel = hoursLabel();

  if (minutes < open) {
    const wait = open - minutes;
    return {
      state: 'closed',
      rangeLabel,
      badge: '時間外',
      note: `${CONFIG.openHour}:00に開きます（あと${formatDuration(wait)}）`,
      minutesToClose: null,
    };
  }

  if (minutes >= close) {
    return {
      state: 'closed',
      rangeLabel,
      badge: '時間外',
      note: `本日は終了しました。明日${CONFIG.openHour}:00に開きます`,
      minutesToClose: null,
    };
  }

  const left = close - minutes;
  if (left <= CONFIG.closingSoonMin) {
    return {
      state: 'closingSoon',
      rangeLabel,
      badge: 'まもなく終了',
      note: `${CONFIG.closeHour}:00に閉まります（あと${formatDuration(left)}）`,
      minutesToClose: left,
    };
  }

  return {
    state: 'open',
    rangeLabel,
    badge: '開放中',
    note: `${CONFIG.closeHour}:00まで開いています`,
    minutesToClose: left,
  };
}

/** 「45分」「1時間20分」 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/** 「09:15」 in Tokyo — used where an absolute time is clearer than a relative one. */
export function jstTimeLabel(at: number): string {
  const { hour, minute } = jstClock(at);
  return `${pad(hour)}:${pad(minute)}`;
}
