"use client";

import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // enableSystem turns on the "Match device" option. defaultTheme stays
    // "light" on purpose rather than becoming "system": the dark palette has
    // never been the default for anyone, and flipping every existing user to
    // dark because their laptop is set that way is a change they did not ask
    // for. Anyone who wants it can now pick it, and that choice persists.
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
