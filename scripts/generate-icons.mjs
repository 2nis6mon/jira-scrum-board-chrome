// Déclinaison fidèle de la marque SVG du site, sans dépendance de rendu supplémentaire.
// Usage : node scripts/generate-icons.mjs ; CHROME_PATH permet de choisir Chrome/Chromium.
// Le navigateur utilise un profil temporaire vierge, sans requête réseau ni session Jira.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
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
    const result = await browser.evaluate(
      sessionId,
      `(async () => {
        const size = ${size};
        const svg = new DOMParser().parseFromString(${JSON.stringify(source)}, 'image/svg+xml');
        if (svg.querySelector('parsererror')) throw new Error('SVG de marque invalide');
        svg.documentElement.setAttribute('width', String(size));
        svg.documentElement.setAttribute('height', String(size));
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
        context.drawImage(image, 0, 0, size, size);
        const pixel = (x, y) => [...context.getImageData(x, y, 1, 1).data];
        return {
          png: canvas.toDataURL('image/png').split(',')[1],
          corners: [pixel(0, 0)[3], pixel(size - 1, 0)[3],
            pixel(0, size - 1)[3], pixel(size - 1, size - 1)[3]],
          blue: pixel(Math.floor(size / 2), Math.floor(size / 8)),
          mint: pixel(Math.floor(size * 45.5 / 64), Math.floor(size * 18.5 / 64))
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
    rendered.push({ size, png });
  }
  // Remplacer les fichiers seulement après la validation de toutes les tailles.
  for (const { size, png } of rendered) {
    writeFileSync(join(root, `public/icons/icon-${size}.png`), png);
    console.log(`✓ Icône ${size} × ${size} : marque SVG, couleurs fidèles, coins transparents`);
  }
} finally {
  await browser.close();
}
