// Régénère seulement les visuels de marque communs aux fiches FR/EN/ES.
// Les cinq captures du board restent intactes. Aucun accès réseau ou profil utilisateur.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launchIsolatedBrowser } from "./browser-check.mjs";
import { storePromoHtml } from "./store-promotional.mjs";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "docs/store");
const dataUrl = (path, mime) => `data:${mime};base64,${readFileSync(path).toString("base64")}`;
const assets = {
  logoDataUrl: dataUrl(join(root, "site/assets/brand-mark.svg"), "image/svg+xml"),
  boardDataUrl: dataUrl(join(output, "captures/01-board.png"), "image/png"),
  fontDataUrl: dataUrl(join(root, "site/assets/fonts/manrope-variable.ttf"), "font/ttf"),
};
const browser = launchIsolatedBrowser();
const { send, evaluate, waitFor } = browser;
const promotions = [];
try {
  const { product } = await send("Browser.getVersion");
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  for (const [width, height] of [
    [440, 280],
    [1400, 560],
  ]) {
    const { frameTree } = await send("Page.getFrameTree", {}, sessionId);
    await send(
      "Page.setDocumentContent",
      {
        frameId: frameTree.frame.id,
        html: storePromoHtml({ width, height, ...assets }),
      },
      sessionId,
    );
    await send(
      "Emulation.setDeviceMetricsOverride",
      {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId,
    );
    await waitFor(
      sessionId,
      "document.images.length === 2 && [...document.images].every(image => image.complete && image.naturalWidth > 0)",
      "Les ressources promotionnelles ne sont pas chargées",
    );
    await evaluate(sessionId, "document.fonts.ready");
    assert.equal(await evaluate(sessionId, "document.body.scrollWidth"), width);
    const { data } = await send(
      "Page.captureScreenshot",
      {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
      },
      sessionId,
    );
    const png = Buffer.from(data, "base64");
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
    assert.equal(png[24], 8);
    assert.equal(png[25], 2, "PNG RGB opaque attendu");
    promotions.push({
      file: `promo-${width}x${height}.png`,
      width,
      height,
      png,
      format: "PNG RGB 24 bits, opaque",
      bytes: png.length,
      sha256: createHash("sha256").update(png).digest("hex"),
    });
  }
  for (const { file, png } of promotions) writeFileSync(join(output, file), png);
  const manifest = {
    generatedAt: new Date().toISOString(),
    browser: product,
    source: "Composition HTML/CSS : marque SVG, police Manrope et capture 01-board.png inchangée",
    languages: ["fr", "en", "es"],
    sharedAcrossLocales: true,
    boardCaptureSha256: createHash("sha256")
      .update(readFileSync(join(output, "captures/01-board.png")))
      .digest("hex"),
    promotions: promotions.map(({ png: _png, ...metadata }) => metadata),
  };
  // Le tableau court des langues suit le format JSON du dépôt.
  const manifestJson = JSON.stringify(manifest, null, 2).replace(
    '"languages": [\n    "fr",\n    "en",\n    "es"\n  ]',
    '"languages": ["fr", "en", "es"]',
  );
  writeFileSync(join(output, "promotions.json"), `${manifestJson}\n`);
  // Conserver les preuves de capture d'origine ; seules les métadonnées des promotions changent.
  const captureManifestPath = join(output, "captures/captures.json");
  const captureManifest = JSON.parse(readFileSync(captureManifestPath, "utf8"));
  for (const [index, key] of ["promotion", "marquee"].entries()) {
    const metadata = manifest.promotions[index];
    captureManifest[key] = {
      ...metadata,
      file: `../${metadata.file}`,
      generatedAt: manifest.generatedAt,
      source: manifest.source,
    };
  }
  writeFileSync(captureManifestPath, `${JSON.stringify(captureManifest, null, 2)}\n`);
  console.log(
    "✓ Promotions communes FR/EN/ES : 440 × 280 et 1400 × 560 ; captures du board inchangées.",
  );
} finally {
  await browser.close();
}
