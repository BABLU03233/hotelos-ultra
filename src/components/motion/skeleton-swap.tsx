"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Fades from a skeleton to real content — but only once. `useFetch`'s `loading` flips back to
 * true on every poll/reload while the previous `data` is still valid, so guarding naively on
 * `loading || !data` would re-show the skeleton (and re-flash it) on every background refresh.
 * This latches the first time `showSkeleton` goes false and never shows the skeleton branch
 * again for this mounted instance — later re-renders just update `children` in place.
 */
export function SkeletonSwap({
  showSkeleton,
  skeleton,
  children,
  className,
}: {
  showSkeleton: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  /** Applied to the wrapper around whichever branch is showing — pass e.g. "h-full" if a caller's content relies on filling its parent's height. */
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [revealed, setRevealed] = React.useState(false);
  const showContent = revealed || !showSkeleton;
  if (!showSkeleton && !revealed) setRevealed(true);

  if (reduceMotion) return <div className={className}>{showContent ? children : skeleton}</div>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {showContent ? (
        <motion.div
          key="content"
          className={className}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.div>
      ) : (
        <motion.div
          key="skeleton"
          className={className}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {skeleton}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
