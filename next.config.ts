import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a production build run without fighting a dev server for `.next`.
  //
  // On Windows the dev server holds locks on files inside the build directory,
  // so `next build` dies with EPERM mid-way — and the tempting fix (delete
  // `.next`) corrupts the running dev server's cache instead. Setting
  // NEXT_DIST_DIR gives the build its own directory. Unset everywhere else, so
  // production and CI are untouched.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
