"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

/** How long the stagger tail is allowed to run before every remaining item just animates together. */
export const STAGGER_CAP = 8;
export const STAGGER_STEP_MS = 40;

/** Fades + lifts one item of a list into place on mount. Wrap individual rows/cards in a `.map()` — for a whole section entering at once, use `Reveal` instead. */
export function StaggerItem({
  children,
  index,
  className,
}: {
  children: React.ReactNode;
  /** Position in the list — delay is capped so a long list doesn't take seconds to finish staggering in. */
  index: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.32,
        delay: (Math.min(index, STAGGER_CAP) * STAGGER_STEP_MS) / 1000,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
