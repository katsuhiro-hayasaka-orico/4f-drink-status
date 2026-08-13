import { useEffect, useRef, useState } from 'react';

/**
 * Whether the element carrying the returned ref is currently on screen.
 * Drives the floating 投稿する button (shown only when `inView === false`)
 * and the one-shot report_view metric (fired only when `inView === true`).
 *
 * `null` means "not judged yet" — consumers must treat it as neither, so
 * the FAB doesn't flash before the first measurement and the metric can't
 * fire from a default. Without IntersectionObserver the value settles on
 * `true`, which hides the FAB rather than pinning it forever.
 */
export function useInView<T extends HTMLElement>(): {
  ref: React.RefObject<T>;
  inView: boolean | null;
} {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState<boolean | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      // A sliver of the form counts as "visible" — the FAB should get out
      // of the way as soon as the real thing is reachable.
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, inView };
}
