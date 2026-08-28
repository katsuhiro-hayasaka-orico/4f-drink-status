import { describe, expect, it } from 'vitest';
import { a2hsHint } from './a2hs.js';

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPADOS_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('a2hsHint', () => {
  it('points iPhones at the iOS share-menu route', () => {
    expect(a2hsHint(IOS_UA, false, false)).toBe('ios');
  });

  it('catches iPadOS masquerading as macOS via the touchscreen', () => {
    expect(a2hsHint(IPADOS_UA, false, false, 5)).toBe('ios');
    // A real Mac has no touch points and gets no hint.
    expect(a2hsHint(IPADOS_UA, false, false, 0)).toBeNull();
  });

  it('points Android at the browser-menu route', () => {
    expect(a2hsHint(ANDROID_UA, false, false)).toBe('android');
  });

  it('shows nothing on desktop — MobileInvite covers PC', () => {
    expect(a2hsHint(WINDOWS_UA, false, false)).toBeNull();
  });

  it('stays quiet once installed or dismissed', () => {
    expect(a2hsHint(IOS_UA, true, false)).toBeNull();
    expect(a2hsHint(IOS_UA, false, true)).toBeNull();
    expect(a2hsHint(ANDROID_UA, true, false)).toBeNull();
  });
});
