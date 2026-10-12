import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

// L'extension ne tourne jamais sur le serveur de développement de Vite : sa CSP
// interdit les scripts en ligne et toute connexion hors *.atlassian.net. On construit
// dans dist/ (`npm run build` ou `npm run watch`) et Chrome charge ce dossier.
export default defineConfig(({ mode }) => {
  return {
    root,
    base: "",
    publicDir: "public",
    build: {
      outDir: "dist",
      emptyOutDir: true,
      target: "chrome116",
      sourcemap: mode === "development",
      minify: mode !== "development",
      modulePreload: { polyfill: false },
      rollupOptions: {
        input: {
          board: `${root}board.html`,
          launcher: `${root}launcher.html`,
          "jira-worker": `${root}src/integration/worker.ts`,
          "jira-bootstrap": `${root}src/integration/bootstrap.ts`,
        },
        output: {
          // Le manifest désigne le service worker par un nom fixe, à la racine.
          entryFileNames: (chunk) =>
            chunk.name.startsWith("jira-") ? "[name].js" : "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
    test: {
      include: ["tests/**/*.test.{ts,tsx}"],
      environment: "node",
      restoreMocks: true,
    },
  };
});
