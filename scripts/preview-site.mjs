// Prévisualisation locale du dossier public, sous le même chemin que GitHub Pages.
import { createReadStream, existsSync, lstatSync, realpathSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSite, SITE_BASE_PATH, SITE_DIRECTORY } from "./build-site.mjs";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

function createSiteServer() {
  const allowed = new Set(checkSite().files);
  const realRoot = realpathSync(SITE_DIRECTORY);
  return createServer((request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    const finish = (status, text) => {
      response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : text);
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      finish(405, "Méthode non autorisée.");
      return;
    }
    let pathname;
    try {
      // Ne pas normaliser les segments avec URL : les traversées doivent être refusées.
      pathname = decodeURIComponent((request.url ?? "").split("?")[0]);
    } catch {
      finish(400, "Adresse invalide.");
      return;
    }
    if (
      !pathname.startsWith("/") ||
      pathname.includes("\\") ||
      [...pathname].some((character) => character.charCodeAt(0) < 32) ||
      pathname.split("/").some((part) => part === "." || part === "..")
    ) {
      finish(400, "Adresse invalide.");
      return;
    }
    if (pathname === "/" || pathname === SITE_BASE_PATH.slice(0, -1)) {
      response.writeHead(302, { Location: SITE_BASE_PATH });
      response.end();
      return;
    }
    if (!pathname.startsWith(SITE_BASE_PATH)) {
      finish(404, "Page introuvable.");
      return;
    }
    const relativePath = pathname.slice(SITE_BASE_PATH.length) || "index.html";
    if (!allowed.has(relativePath)) {
      finish(404, "Page introuvable.");
      return;
    }
    const path = join(SITE_DIRECTORY, relativePath);
    try {
      if (
        !existsSync(path) ||
        !lstatSync(path).isFile() ||
        lstatSync(path).nlink !== 1 ||
        !realpathSync(path).startsWith(`${realRoot}${sep}`)
      ) {
        finish(404, "Page introuvable.");
        return;
      }
      response.writeHead(200, {
        "Content-Type": types[extname(path)] ?? "application/octet-stream",
      });
      if (request.method === "HEAD") response.end();
      else
        createReadStream(path)
          .on("error", () => response.destroy())
          .pipe(response);
    } catch {
      finish(404, "Page introuvable.");
    }
  });
}

export async function startPreviewServer({ port = 4173, host = "127.0.0.1" } = {}) {
  if (host !== "127.0.0.1" || !Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("La prévisualisation exige 127.0.0.1 et un port valide.");
  const server = createSiteServer();
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, host, accept);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Adresse de prévisualisation introuvable.");
  return {
    url: `http://${host}:${address.port}${SITE_BASE_PATH}`,
    close: () =>
      new Promise((accept, reject) => {
        server.close((error) => (error ? reject(error) : accept()));
        server.closeIdleConnections();
      }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startPreviewServer();
  console.log(`Site local : ${server.url}`);
}
