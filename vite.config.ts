import { defineConfig } from "vitest/config";
import reactSwc from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Vitest + @vitejs/plugin-react-swc can stall at high CPU while transforming
// very large TSX (AISidebar). In test mode, skip both SWC and Babel React plugins
// and rely on Vite's esbuild JSX transform (fast path for big files).
// Keep a single vite.config.ts so Vitest always loads this file.

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  esbuild: mode === "test" ? { jsx: "automatic" } : undefined,
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    mode !== "test" && reactSwc(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    /** Default 5s is tight when many files run in parallel (transform + jsdom). */
    testTimeout: 10_000,
  },
}));
