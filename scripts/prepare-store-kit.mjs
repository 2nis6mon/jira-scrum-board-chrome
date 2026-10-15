// Assemble la livraison manuelle Store ; ne soumet ni ne publie aucun fichier.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { crc32, inflateRawSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
assert.match(version, /^\d+\.\d+\.\d+$/);
const output = join(root, "release", `chrome-store-bilingual-${version}`);
const packageName = `sprint-goals-board-${version}.zip`;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

function safePath(path) {
  const resolved = resolve(path);
  assert.ok(resolved.startsWith(`${root}${sep}`), "Chemin de livraison hors du dépôt");
  let current = root;
  for (const part of relative(root, resolved).split(sep)) {
    current = join(current, part);
    if (!existsSync(current)) continue;
    const info = lstatSync(current);
    assert.ok(
      !info.isSymbolicLink() && (!info.isFile() || info.nlink === 1),
      `Lien refusé : ${current}`,
    );
  }
  return resolved;
}

function read(path) {
  return readFileSync(safePath(join(root, path)));
}

// Lecture du répertoire central ZIP : le contrôle n’extrait et n’exécute aucun contenu.
function zipFiles(zip) {
  let end = zip.length - 22;
  while (end >= Math.max(0, zip.length - 65557) && zip.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0 && zip.readUInt32LE(end) === 0x06054b50, "ZIP sans répertoire central");
  assert.equal(end + 22 + zip.readUInt16LE(end + 20), zip.length);
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const files = new Map();
  for (let index = 0; index < count; index++) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50, "Entrée ZIP invalide");
    const nameLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    assert.ok(!name.startsWith("/") && !name.includes("\\") && !name.split("/").includes(".."));
    assert.ok(!files.has(name), "Entrée ZIP dupliquée");
    const method = zip.readUInt16LE(offset + 10);
    assert.ok(method === 0 || method === 8, "Compression ZIP non prise en charge");
    const local = zip.readUInt32LE(offset + 42);
    assert.equal(zip.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const compressed = zip.subarray(start, start + zip.readUInt32LE(offset + 20));
    const data = method === 8 ? inflateRawSync(compressed) : compressed;
    assert.equal(data.length, zip.readUInt32LE(offset + 24));
    assert.equal(crc32(data), zip.readUInt32LE(offset + 16));
    files.set(name, data);
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  return files;
}

const archive = read(`release/${packageName}`);
const entries = zipFiles(archive);
const manifest = JSON.parse(entries.get("manifest.json")?.toString() ?? "null");
const expectedManifest = JSON.parse(read("public/manifest.json").toString());
delete expectedManifest.key;
assert.deepEqual(manifest, expectedManifest, "Paquet obsolète : relancer npm run package");
assert.equal(manifest.version, version);
assert.equal(manifest.default_locale, "en");
const metadata = {};
for (const language of ["fr", "en"]) {
  const path = `_locales/${language}/messages.json`;
  assert.ok(entries.has(path), `Langue ${language} absente du paquet`);
  const messages = JSON.parse(entries.get(path).toString());
  assert.deepEqual(messages, JSON.parse(read(`public/${path}`).toString()));
  const name = messages.extensionName.message;
  const summary = messages.extensionDescription.message;
  assert.ok(name.length > 0 && name.length <= 75, "Nom Store trop long");
  assert.ok(summary.length > 0 && summary.length <= 132, "Résumé Store trop long");
  metadata[language] = { name, summary };
}

const files = new Map([[packageName, archive]]);
for (const file of [
  "fiche.md",
  "listing-fr.txt",
  "listing-en.txt",
  "release-notes-fr.txt",
  "release-notes-en.txt",
  "icon-128.png",
  "promo-440x280.png",
  "promo-1400x560.png",
  "promotions.json",
  "captures/captures.json",
]) {
  files.set(file, read(`docs/store/${file}`));
}
files.set("privacy/index.html", read("docs/privacy/index.html"));
files.set(
  "fiche.md",
  Buffer.from(
    files.get("fiche.md").toString().replace("(../privacy/index.html)", "(privacy/index.html)"),
  ),
);
const captures = JSON.parse(files.get("captures/captures.json").toString());
const promotions = JSON.parse(files.get("promotions.json").toString());
for (const capture of captures.captures) {
  assert.match(capture.file, /^\d{2}-[a-z]+\.png$/);
  const data = read(`docs/store/captures/${capture.file}`);
  assert.equal(sha256(data), capture.sha256, "Capture différente de son manifeste");
  files.set(`captures/${capture.file}`, data);
}
for (const promotion of promotions.promotions) {
  assert.equal(
    sha256(files.get(promotion.file)),
    promotion.sha256,
    "Promotion différente de son manifeste",
  );
}
assert.equal(sha256(files.get("captures/01-board.png")), promotions.boardCaptureSha256);
files.set("listing-metadata.json", Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`));
files.set(
  "LIRE-MOI.txt",
  Buffer.from(`SPRINT GOALS BOARD — PUBLICATION BILINGUE ${version}

Mettre à jour l’article Chrome Web Store existant pepbknjnielcbfcoefcdmadmomapicgp.
Téléverser UNIQUEMENT ${packageName} dans Package.
Ce dossier complet n’est pas une archive d’extension à téléverser.

1. Publier d’abord les pages FR/EN du site via le workflow GitHub Pages sur main.
2. Dans l’article Store existant, importer le nouveau paquet ci-dessus.
3. Dans Store listing, vérifier les langues français et anglais et remplir chaque description
   depuis listing-fr.txt / listing-en.txt. Noms et résumés : listing-metadata.json.
4. Conserver les cinq captures françaises de captures/ pour les deux langues.
   Les promotions et l’icône sont communes ; téléverser les PNG dans leurs champs dédiés.
5. Vérifier les liens publics, Privacy practices et les instructions de revue de fiche.md.
6. Relire les deux fiches avant de soumettre la mise à jour à Google.

Site : https://2nis6mon.github.io/jira-scrum-board-chrome/
Guide FR : https://2nis6mon.github.io/jira-scrum-board-chrome/guide.html
Guide EN : https://2nis6mon.github.io/jira-scrum-board-chrome/en/guide.html
Confidentialité : https://2nis6mon.github.io/jira-scrum-board-chrome/confidentialite.html

L’interface suit Jira (français si Jira est en français, anglais sinon), avec choix personnel.
Sprint Planning est désactivé dans ce paquet de distribution.
Les captures sont celles de ${captures.version}, conservées sans traduction comme demandé.
Les notes FR/EN peuvent servir aux communications de version ; pas de champ Store obligatoire.
La langue principale existante du Store est conservée. Aucun nouveau produit n’est créé.
Rien n’a été soumis ni publié automatiquement par ce script.
`),
);

safePath(output);
mkdirSync(output, { recursive: true });
const receipt = {
  version,
  package: packageName,
  locales: ["fr", "en"],
  screenshotSourceVersion: captures.version,
  files: [],
};
for (const [file, data] of files) {
  const destination = safePath(join(output, file));
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, data);
  receipt.files.push({ file, bytes: data.length, sha256: sha256(data) });
}
writeFileSync(safePath(join(output, "manifest.json")), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`✓ Kit bilingue ${version} : ${relative(root, output)}`);
console.log(`✓ ${files.size} fichiers contrôlés ; paquet FR/EN et captures inchangées.`);
