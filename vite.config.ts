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
      // .tmp holds throwaway browser profiles from headless test runs;
      // watching them crashes the dev server on locked cookie files.
      ignored: ["**/.tmp/**"],
    },
  },
});
