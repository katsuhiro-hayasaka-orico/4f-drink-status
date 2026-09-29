import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ForwardedRef,
  type ReactNode,
} from 'react';

export interface DialogContentProps {
  children: ReactNode;
  /** The dialog title's id — names the region once it becomes a tab stop. */
  labelledBy?: string;
  /**
   * Whether the region itself joins the tab order while it scrolls. On for
   * prose, which has nothing inside to tab to; off when the content holds
   * controls, since focusing one already scrolls it into view.
   */
  focusable?: boolean;
}

interface Edges {
  above: boolean;
  below: boolean;
}

/**
 * Whether text is hidden past each edge. The inner wrapper's own padding
 * (room for focus rings) is allowed for: when only that padding runs past the
 * edge, every line is still on screen, and a "more below" shadow over a fully
 * visible last line read as a clipping bug.
 */
function edgesOf(scroller: HTMLElement): Edges {
  const inner = scroller.firstElementChild;
  const style = inner ? getComputedStyle(inner) : null;
  const padTop = style ? parseFloat(style.paddingTop) || 0 : 0;
  const padBottom = style ? parseFloat(style.paddingBottom) || 0 : 0;
  const max = scroller.scrollHeight - scroller.clientHeight;
  return {
    above: scroller.scrollTop > padTop + 1,
    below: scroller.scrollTop < max - padBottom - 1,
  };
}

/**
 * The middle of a dialog: the one part that scrolls, between a head and a
 * button row that never move (see .dialog in src/styles.css for why).
 *
 * It measures itself rather than leaving everything to CSS, for two things
 * CSS alone got wrong in review:
 *
 *   - The "more text this way" shadows. Drawn as backgrounds they sat beneath
 *     the content, so an opaque child at the fold — the textarea, a mood
 *     button, the QR card — hid the cue exactly where it was needed. They are
 *     now sticky overlays (::before/::after) shown from data-more-above /
 *     data-more-below, which this component keeps in step with the scroll
 *     position and with any change in the content's size.
 *
 *   - The tab stop. Prose needs one so the keyboard can scroll it (Safari does
 *     not make a scroller focusable by itself), but only while there is
 *     something to scroll; a stop that does nothing is noise. So tabIndex is 0
 *     only while the content overflows, with role=region named by the dialog's
 *     title, and -1 otherwise — still focusable from script, which is how the
 *     dialog puts initial focus here when the text is long.
 */
export const DialogContent = forwardRef(function DialogContent(
  { children, labelledBy, focusable = true }: DialogContentProps,
  forwarded: ForwardedRef<HTMLDivElement>,
) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState<Edges>({ above: false, below: false });
  // Held while the region itself has focus, so a window that grows mid-read
  // does not strip the role and name from under a focused element (and leave
  // a ring on something that is no longer a stop).
  const [focused, setFocused] = useState(false);

  const setScroller = useCallback(
    (node: HTMLDivElement | null) => {
      scroller.current = node;
      if (typeof forwarded === 'function') forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [forwarded],
  );

  useLayoutEffect(() => {
    const el = scroller.current;
    const body = inner.current;
    if (!el || !body) return;
    const measure = () => {
      const next = edgesOf(el);
      setEdges((prev) => (prev.above === next.above && prev.below === next.below ? prev : next));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    // The scroller changes size with the window; the inner wrapper changes
    // size with the content (a resized textarea, text reflowing). Watching
    // both covers every way the overflow can appear or go away.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(body);
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, []);

  const scrolls = edges.above || edges.below;
  const stop = focusable && (scrolls || focused);

  return (
    <div
      ref={setScroller}
      className="dialog__content"
      data-more-above={edges.above ? '' : undefined}
      data-more-below={edges.below ? '' : undefined}
      tabIndex={focusable ? (stop ? 0 : -1) : undefined}
      role={stop ? 'region' : undefined}
      aria-labelledby={stop ? labelledBy : undefined}
      onFocus={focusable ? (e) => e.target === e.currentTarget && setFocused(true) : undefined}
      onBlur={focusable ? (e) => e.target === e.currentTarget && setFocused(false) : undefined}
    >
      <div ref={inner} className="dialog__inner">
        {children}
      </div>
    </div>
  );
});

/**
 * Where a dialog should put focus when it opens: its scrolling text when there
 * is more of it than fits — so the first PageDown or arrow press reads on
 * instead of scrolling the page behind — and otherwise its close button.
 * Measured the same way as the shadows, so the two never disagree.
 *
 * Callers focus with preventScroll: in a window so short that the backdrop
 * itself scrolls, focusing a button at the bottom would open the dialog
 * scrolled past its own title.
 */
export function initialFocus(
  content: HTMLElement | null,
  fallback: HTMLElement | null,
): HTMLElement | null {
  if (content && edgesOf(content).below) return content;
  return fallback;
}
