import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
  server: {
    watch: {
      // .tmp* holds throwaway browser profiles from headless test runs
      // (e.g. .tmp-v2-chrome); watching them crashes the dev server on
      // locked cookie/lock files mid-run.
      ignored: ["**/.tmp/**", "**/.tmp-*/**"],
    },
  },
});
