import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { integrationMessagesEs } from "./src/i18n/es/integration";
import { integrationMessages } from "./src/i18n/integration";

const root = fileURLToPath(new URL(".", import.meta.url));

// L'extension ne tourne jamais sur le serveur de développement de Vite : sa CSP
// interdit les scripts en ligne et toute connexion hors *.atlassian.net. On construit
// dans dist/ (`npm run build` ou `npm run watch`) et Chrome charge ce dossier.
export default defineConfig(({ mode }) => {
  return {
    root,
    base: "",
    publicDir: "public",
    // Fonction expérimentale réservée aux builds locaux et aux tests. Aucun réglage
    // utilisateur ni fichier .env ne peut l'activer dans le mode package.
    define: {
      __SPRINT_PLANNING_ENABLED__: ["dist", "development", "test"].includes(mode),
      // Santé du sprint masquée et diagnostic actif, identiques dans dist/ et dans le paquet.
      __SPRINT_HEALTH_ENABLED__: false,
      __DIAGNOSTIC_ENABLED__: true,
      __INTEGRATION_MESSAGES__: JSON.stringify({
        en: integrationMessages,
        es: integrationMessagesEs,
      }),
    },
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
      setupFiles: ["tests/support/language.ts"],
      environment: "node",
      restoreMocks: true,
    },
  };
});
