"use client";

/**
 * Fixed-row-height virtual list. No external deps — just scroll math + a
 * resize observer. Renders only the rows visible in the viewport (plus
 * an overscan buffer) so even a 10,000-row list stays cheap to mount.
 *
 * Usage:
 *
 *   <VirtualList
 *     items={items}
 *     rowHeight={42}
 *     getKey={(i) => i.id}
 *     className="h-[480px] overflow-y-auto rounded-xl border border-app"
 *     renderRow={(i, index) => (
 *       <div className="flex h-[42px] items-center px-3">{i.label}</div>
 *     )}
 *   />
 *
 * Why fixed height? Variable-height windowing requires either a
 * measurement pass per row (jank) or a virtualization library like
 * @tanstack/react-virtual. We don't ship that lib, and every list we're
 * virtualizing here renders into a row template the page author already
 * controls — so making them tell us the row height up front is fine and
 * lets the math collapse to one multiplication per scroll event.
 *
 * Also exports VirtualTableBody for table layouts: renders absolutely-
 * positioned <tr> elements inside a tall container <tbody>, preserving
 * the surrounding <table> chrome.
 */

import {
  type CSSProperties,
  type ReactNode,
  type UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface VirtualListProps<T> {
  items: readonly T[];
  rowHeight: number;
  /** Render one row. Index is the row's position in `items`. */
  renderRow: (item: T, index: number) => ReactNode;
  /** Stable React key for the row. */
  getKey: (item: T, index: number) => string;
  /** Extra rows to render above/below the viewport. Default 6. */
  overscan?: number;
  className?: string;
  style?: CSSProperties;
  /** Optional fallback when items is empty. */
  empty?: ReactNode;
  /** Optional aria-label for the scrolling region. */
  ariaLabel?: string;
}

export default function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  getKey,
  overscan = 6,
  className,
  style,
  empty,
  ariaLabel,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // Initial measurement once mounted, and on resize.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const total = items.length;
  const totalHeight = total * rowHeight;

  // Clamp to a sensible window. When viewportHeight is 0 (pre-measure),
  // render the first overscan worth so SSR/initial-paint shows content.
  const visibleCount =
    viewportHeight > 0 ? Math.ceil(viewportHeight / rowHeight) : overscan;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(total, startIndex + visibleCount + overscan * 2);

  const slice = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  if (total === 0 && empty) {
    return (
      <div className={className} style={style} aria-label={ariaLabel}>
        {empty}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={className}
      style={style}
      aria-label={ariaLabel}
      role="list"
    >
      <div
        style={{ height: totalHeight, position: "relative" }}
      >
        <div
          style={{
            position: "absolute",
            top: startIndex * rowHeight,
            left: 0,
            right: 0,
          }}
        >
          {slice.map((item, i) => {
            const index = startIndex + i;
            return (
              <div
                key={getKey(item, index)}
                role="listitem"
                style={{ height: rowHeight }}
              >
                {renderRow(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Table-friendly variant: renders into a parent <table> as the <tbody>.
 * Uses two spacer rows (top + bottom) so column widths stay aligned and
 * the surrounding <thead> still anchors correctly. The host page owns
 * the scroll container — pass `scrollRef` so we can listen to it.
 */
interface VirtualTableBodyProps<T> {
  items: readonly T[];
  rowHeight: number;
  /** External scroll container ref (the wrapper around the <table>). */
  scrollRef: React.RefObject<HTMLElement | null>;
  renderRow: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
  overscan?: number;
  /** Number of <td>s in the spacer rows so colSpan lines up. */
  columnCount: number;
}

export function VirtualTableBody<T>({
  items,
  rowHeight,
  scrollRef,
  renderRow,
  getKey,
  overscan = 6,
  columnCount,
}: VirtualTableBodyProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    } else {
      window.addEventListener("resize", update);
    }
    return () => {
      el.removeEventListener("scroll", update);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", update);
    };
  }, [scrollRef]);

  const total = items.length;
  const visibleCount =
    viewportHeight > 0 ? Math.ceil(viewportHeight / rowHeight) : overscan;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(total, startIndex + visibleCount + overscan * 2);
  const topPad = startIndex * rowHeight;
  const bottomPad = Math.max(0, (total - endIndex) * rowHeight);

  const slice = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  return (
    <>
      {topPad > 0 && (
        <tr aria-hidden style={{ height: topPad }}>
          <td colSpan={columnCount} style={{ padding: 0, border: 0 }} />
        </tr>
      )}
      {slice.map((item, i) => {
        const index = startIndex + i;
        return (
          <tr key={getKey(item, index)} style={{ height: rowHeight }}>
            {renderRow(item, index)}
          </tr>
        );
      })}
      {bottomPad > 0 && (
        <tr aria-hidden style={{ height: bottomPad }}>
          <td colSpan={columnCount} style={{ padding: 0, border: 0 }} />
        </tr>
      )}
    </>
  );
}
