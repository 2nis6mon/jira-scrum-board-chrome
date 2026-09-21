import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

// L'extension ne tourne jamais sur le serveur de développement de Vite : sa CSP
// interdit les scripts en ligne et toute connexion hors *.atlassian.net. On construit
// dans dist/ (`npm run build` ou `npm run watch`) et Chrome charge ce dossier.
export default defineConfig(({ mode }) => ({
  root,
  base: "",
  publicDir: "public",
  plugins:
    mode === "jira-direct-test"
      ? [
          {
            name: "manifest-vue-jira-directe",
            closeBundle() {
              const manifest = JSON.parse(readFileSync(`${root}public/manifest.json`, "utf8"));
              delete manifest.key;
              manifest.name = "Sprint Goals — test ouverture Jira";
              manifest.version = `${manifest.version}.1`;
              manifest.permissions.push("scripting");
              manifest.background.service_worker = "jira-direct-worker.js";
              manifest.web_accessible_resources = [
                {
                  resources: ["board.html", "assets/*", "icons/*"],
                  matches: ["https://*.atlassian.net/*"],
                },
              ];
              manifest.content_security_policy.extension_pages =
                manifest.content_security_policy.extension_pages.replace(
                  "frame-ancestors 'none'",
                  "frame-ancestors https://*.atlassian.net",
                );
              writeFileSync(
                `${root}dist-jira-direct-test/manifest.json`,
                JSON.stringify(manifest, null, 2),
              );
            },
          },
        ]
      : [],
  build: {
    outDir: mode === "jira-direct-test" ? "dist-jira-direct-test" : "dist",
    emptyOutDir: true,
    target: "chrome116",
    sourcemap: mode === "development",
    minify: mode !== "development",
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        board: `${root}board.html`,
        "service-worker": `${root}src/background/service-worker.ts`,
        ...(mode === "jira-direct-test"
          ? {
              "jira-direct-worker": `${root}src/experiment/worker.ts`,
              "jira-direct-bootstrap": `${root}src/experiment/bootstrap.ts`,
            }
          : {}),
      },
      output: {
        // Le manifest désigne le service worker par un nom fixe, à la racine.
        entryFileNames: (chunk) =>
          chunk.name === "service-worker" || chunk.name.startsWith("jira-direct-")
            ? "[name].js"
            : "assets/[name]-[hash].js",
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
}));
