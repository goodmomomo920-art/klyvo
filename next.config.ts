import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // cacheComponents was disabled pragmatically: it flags every dashboard
  // render that touches sessions or clocks (Supabase auth internally calls
  // Date.now, client pages compute date ranges) as an unstable prerender
  // value, breaking /dashboard routes in dev. The existing app architecture
  // (plain App Router with server actions and client pages) predates these
  // constraints. Revisit only alongside a dedicated cache-components audit.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
