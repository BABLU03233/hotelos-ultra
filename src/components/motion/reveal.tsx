"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

/** Fades + lifts children into place the first time they scroll into view. Wrap a section/card in this — not table rows or form fields, which should feel instant. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Stagger offset in ms — e.g. index * 60 for a list. */
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      // Positive bottom margin (not negative) — expands the trigger zone
      // *below* the visible viewport instead of shrinking it. A negative
      // margin here was causing a real bug: content sitting near the
      // bottom of the initial viewport (e.g. the second row of dashboard
      // cards) never got a same-frame IntersectionObserver hit on mount
      // and stayed invisible until the user nudged the scroll position by
      // even a few pixels. Content already on-screen at mount should never
      // depend on scrolling to appear.
      viewport={{ once: true, margin: "0px 0px 200px 0px" }}
      transition={{ duration: 0.5, delay: delay / 1000, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
