"use client";

import * as React from "react";
import { animate, useReducedMotion } from "framer-motion";

/** Counts up from 0 to `value` on mount. Renders the static value first (SSR/pre-hydration-safe) and only starts animating in an effect, so hydration never mismatches. */
export function AnimatedValue({ value, className }: { value: number | string; className?: string }) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = typeof value === "number" && !reduceMotion;

  const [display, setDisplay] = React.useState(value);
  const [prevValue, setPrevValue] = React.useState(value);
  if (!shouldAnimate && value !== prevValue) {
    setPrevValue(value);
    setDisplay(value);
  }

  React.useEffect(() => {
    if (!shouldAnimate) return;

    const controls = animate(0, value as number, {
      duration: 0.65,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });

    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only re-runs when the animated value itself changes
  }, [value]);

  return <p className={className}>{typeof display === "number" ? display.toLocaleString() : display}</p>;
}
