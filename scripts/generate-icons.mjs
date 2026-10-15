// Déclinaison fidèle de la marque SVG du site, sans dépendance de rendu supplémentaire.
// Usage : node scripts/generate-icons.mjs ; CHROME_PATH permet de choisir Chrome/Chromium.
// Le navigateur utilise un profil temporaire vierge, sans requête réseau ni session Jira.
import assert from "node:assert/strict";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launchIsolatedBrowser } from "./browser-check.mjs";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(join(root, "site/assets/brand-mark.svg"), "utf8");
const sizes = [16, 32, 48, 64, 128];
const browser = launchIsolatedBrowser("128,128");

try {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const rendered = [];
  for (const size of sizes) {
    // Format Store : dessin 96 × 96 centré dans 128 × 128 ; petites icônes à pleine taille.
    // https://developer.chrome.com/docs/webstore/images#extension-icon
    const padding = size === 128 ? 16 : 0;
    const result = await browser.evaluate(
      sessionId,
      `(async () => {
        const size = ${size};
        const padding = ${padding};
        const artworkSize = size - padding * 2;
        const svg = new DOMParser().parseFromString(${JSON.stringify(source)}, 'image/svg+xml');
        if (svg.querySelector('parsererror')) throw new Error('SVG de marque invalide');
        svg.documentElement.setAttribute('width', String(artworkSize));
        svg.documentElement.setAttribute('height', String(artworkSize));
        const image = new Image();
        const loaded = new Promise((accept, reject) => {
          image.onload = accept;
          image.onerror = () => reject(new Error('Chargement du SVG impossible'));
        });
        image.src = 'data:image/svg+xml;charset=utf-8,' +
          encodeURIComponent(new XMLSerializer().serializeToString(svg));
        await loaded;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Rendu Canvas indisponible');
        context.drawImage(image, padding, padding, artworkSize, artworkSize);
        const pixel = (x, y) => [...context.getImageData(x, y, 1, 1).data];
        const pixels = context.getImageData(0, 0, size, size).data;
        const bounds = [size, size, -1, -1];
        let transparentPadding = true;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (pixels[(y * size + x) * 4 + 3] === 0) continue;
            bounds[0] = Math.min(bounds[0], x);
            bounds[1] = Math.min(bounds[1], y);
            bounds[2] = Math.max(bounds[2], x);
            bounds[3] = Math.max(bounds[3], y);
            if (x < padding || y < padding || x >= size - padding || y >= size - padding)
              transparentPadding = false;
          }
        }
        return {
          png: canvas.toDataURL('image/png').split(',')[1],
          corners: [pixel(0, 0)[3], pixel(size - 1, 0)[3],
            pixel(0, size - 1)[3], pixel(size - 1, size - 1)[3]],
          blue: pixel(padding + Math.floor(artworkSize / 2),
            padding + Math.floor(artworkSize / 8)),
          mint: pixel(padding + Math.floor(artworkSize * 45.5 / 64),
            padding + Math.floor(artworkSize * 18.5 / 64)),
          transparentPadding, bounds
        };
      })()`,
    );
    const png = Buffer.from(result.png, "base64");
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.deepEqual(result.corners, [0, 0, 0, 0], "Les coins doivent rester transparents");
    assert.deepEqual(result.blue, [75, 92, 255, 255], "Le bleu de la marque doit être conservé");
    assert.deepEqual(result.mint, [183, 245, 208, 255], "La menthe doit être conservée");
    assert.equal(result.transparentPadding, true, "Toute la marge doit être transparente");
    assert.deepEqual(
      result.bounds,
      [padding, padding, size - padding - 1, size - padding - 1],
      "Le dessin doit remplir exactement le carré centré prévu",
    );
    rendered.push({ size, png });
  }
  // Remplacer les fichiers seulement après la validation de toutes les tailles.
  for (const { size, png } of rendered) {
    writeFileSync(join(root, `public/icons/icon-${size}.png`), png);
    const layout = size === 128 ? "dessin 96 × 96, marge transparente de 16 px" : "pleine taille";
    console.log(`✓ Icône ${size} × ${size} : couleurs fidèles, coins transparents, ${layout}`);
  }
  copyFileSync(join(root, "public/icons/icon-128.png"), join(root, "docs/store/icon-128.png"));
  console.log("✓ Icône Store : copie identique de public/icons/icon-128.png");
} finally {
  await browser.close();
}
