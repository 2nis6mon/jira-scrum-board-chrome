import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Serveur du banc d'essai visuel (données fictives des tests). Ne produit jamais dist/.
export default defineConfig({
  root: fileURLToPath(new URL("./tests/harness", import.meta.url)),
  // Les icônes de l'extension, comme dans dist/.
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  server: {
    port: 5199,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL(".", import.meta.url))] },
  },
});
