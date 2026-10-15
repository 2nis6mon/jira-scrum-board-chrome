// Site public indépendant de l'extension : seules les sources énumérées ici sont publiées.
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { guidePaths, renderGuidePages } from "./render-guide.mjs";

const root = resolve(import.meta.dirname, "..");
export const SITE_DIRECTORY = join(root, ".vite", "site-dist");
export const SITE_BASE_PATH = "/jira-scrum-board-chrome/";
const screenshots = [
  "01-board.png",
  "02-kanban.png",
  "03-swimlanes.png",
  "04-couleurs.png",
  "05-daily.png",
];
const icons = ["icon-16.png", "icon-32.png", "icon-48.png", "icon-64.png", "icon-128.png"];
const assetExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".svg",
  ".ico",
  ".woff2",
  ".ttf",
  ".txt",
]);
const privacyPaths = { fr: "confidentialite.html", en: "en/privacy.html" };
const generatedFiles = [...guidePaths, ...Object.values(privacyPaths), ".nojekyll"];
const sourceFiles = [
  "index.html",
  "en/index.html",
  "styles.css",
  "main.js",
  "guide.css",
  "guide.js",
  "language.css",
  "language.js",
];

function assertPlainPath(path) {
  const resolved = resolve(path);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`))
    throw new Error(`Chemin hors du dépôt : ${path}`);
  let current = root;
  for (const part of relative(root, resolved).split(sep).filter(Boolean)) {
    current = join(current, part);
    if (!existsSync(current))
      throw new Error(`Fichier ou dossier absent : ${relative(root, current)}`);
    const info = lstatSync(current);
    if (info.isSymbolicLink() || (info.isFile() && info.nlink !== 1))
      throw new Error(`Lien symbolique ou physique refusé : ${relative(root, current)}`);
  }
}

function sourceAssets(directory = join(root, "site", "assets")) {
  if (!existsSync(directory)) return [];
  assertPlainPath(directory);
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assertPlainPath(path);
    if (entry.name.startsWith("."))
      throw new Error(`Fichier caché interdit dans site/assets : ${entry.name}`);
    if (entry.isDirectory()) files.push(...sourceAssets(path));
    else if (entry.isFile() && assetExtensions.has(extname(entry.name).toLowerCase()))
      files.push(path);
    else throw new Error(`Type de ressource interdit : ${relative(root, path)}`);
  }
  return files;
}

function inventory() {
  assertPlainPath(join(root, "docs", "manuel-utilisateur.md"));
  assertPlainPath(join(root, "docs", "user-guide.en.md"));
  const sources = new Map(sourceFiles.map((file) => [file, join(root, "site", file)]));
  for (const file of sourceAssets()) {
    const target = relative(join(root, "site"), file).replaceAll("\\", "/");
    if (/^assets\/(?:screenshots|icons)\//.test(target))
      throw new Error(`Emplacement réservé aux ressources du dépôt : ${target}`);
    sources.set(target, file);
  }
  for (const file of screenshots)
    sources.set(`assets/screenshots/${file}`, join(root, "docs/store/captures", file));
  for (const file of icons) sources.set(`assets/icons/${file}`, join(root, "public/icons", file));
  for (const source of sources.values()) assertPlainPath(source);
  return sources;
}

const decodeEntities = (value) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

function privacyHtml(language) {
  const file = join(root, "docs", "privacy", "index.html");
  assertPlainPath(file);
  const original = readFileSync(file, "utf8");
  const article = original.match(
    new RegExp(`<article id="${language}" lang="${language}">[\\s\\S]*?</article>`),
  )?.[0];
  if (!article) throw new Error("Structure de la politique de confidentialité inconnue.");
  // Le texte juridique de chaque article est repris à l’identique dans son habillage localisé.
  const prefix = language === "en" ? "../" : "";
  const title = language === "fr" ? "Politique de confidentialité" : "Privacy policy";
  const back = language === "fr" ? "Retour au site" : "Back to the website";
  const label = language === "fr" ? "Langue du site" : "Website language";
  const base = "https://2nis6mon.github.io/jira-scrum-board-chrome/";
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Sprint Goals Board</title>
  <meta name="description" content="${language === "fr" ? "Données, stockage et permissions de Sprint Goals Board pour Jira Cloud." : "Data, storage and permissions of Sprint Goals Board for Jira Cloud."}">
  <link rel="canonical" href="${base}${privacyPaths[language]}">
  <link rel="alternate" hreflang="fr" href="${base}confidentialite.html">
  <link rel="alternate" hreflang="en" href="${base}en/privacy.html">
  <link rel="alternate" hreflang="x-default" href="${base}en/privacy.html">
  <link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${prefix}styles.css">
  <link rel="stylesheet" href="${prefix}language.css">
  <script src="${prefix}language.js" defer></script>
</head>
<body class="privacy-page">
  <header class="privacy-header">
    <a class="brand" href="index.html?lang=${language}"><img src="${prefix}assets/brand-mark.svg" alt="" width="36" height="36">Sprint Goals Board</a>
    <nav class="language-switch" aria-label="${label}">
      <a href="${prefix}confidentialite.html" data-language="fr" lang="fr" hreflang="fr"${language === "fr" ? ' aria-current="page"' : ""}>FR</a>
      <a href="${prefix}en/privacy.html" data-language="en" lang="en" hreflang="en"${language === "en" ? ' aria-current="page"' : ""}>EN</a>
    </nav>
  </header>
  <main><a class="privacy-return" href="index.html?lang=${language}">← ${back}</a>
${article}
  </main>
</body>
</html>
`;
}

function outputFiles(directory = SITE_DIRECTORY) {
  assertPlainPath(directory);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    assertPlainPath(path);
    return entry.isDirectory()
      ? outputFiles(path)
      : [relative(SITE_DIRECTORY, path).replaceAll("\\", "/")];
  });
}

function attributes(text, name) {
  return [...text.matchAll(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "gis"))].map((match) =>
    decodeEntities(match[2]),
  );
}

export function checkSite() {
  const expected = new Set([...inventory().keys(), ...generatedFiles]);
  const files = outputFiles();
  for (const file of expected)
    if (!files.includes(file)) throw new Error(`Fichier public absent : ${file}`);
  for (const file of files)
    if (!expected.has(file)) throw new Error(`Fichier non autorisé dans le site : ${file}`);
  const html = new Map(
    files
      .filter((file) => file.endsWith(".html"))
      .map((file) => [file, readFileSync(join(SITE_DIRECTORY, file), "utf8")]),
  );
  const anchors = new Map([...html].map(([file, text]) => [file, new Set(attributes(text, "id"))]));
  let links = 0;
  function checkLink(value, file) {
    if (!value) return;
    if (/^(?:https?:|mailto:|tel:|data:)/i.test(value)) return;
    if (/^[a-z][\w+.-]*:/i.test(value) || value.startsWith("//") || value.includes("\\"))
      throw new Error(`Lien interdit dans ${file} : ${value}`);
    const url = new URL(value, `https://site.invalid${SITE_BASE_PATH}${file}`);
    if (!url.pathname.startsWith(SITE_BASE_PATH))
      throw new Error(`Lien hors du sous-chemin Pages dans ${file} : ${value}`);
    const target = decodeURIComponent(url.pathname.slice(SITE_BASE_PATH.length)) || "index.html";
    if (!expected.has(target)) throw new Error(`Lien local absent dans ${file} : ${value}`);
    if (
      url.hash &&
      anchors.has(target) &&
      !anchors.get(target).has(decodeURIComponent(url.hash.slice(1)))
    )
      throw new Error(`Ancre absente dans ${file} : ${value}`);
    links++;
  }
  for (const file of files.filter((file) => /\.(?:html|css|js|svg|txt)$/.test(file))) {
    const text = readFileSync(join(SITE_DIRECTORY, file), "utf8");
    if (
      /-----BEGIN [^-]*PRIVATE KEY-----|https?:\/\/[^\s"'<>]*\.atlassian\.net\/wiki\//i.test(text)
    )
      throw new Error(`Clé privée ou lien Confluence privé dans ${file}`);
    if (file.endsWith(".html") || file.endsWith(".svg")) {
      if (/github\.com\/2nis6mon|raw\.githubusercontent\.com\/2nis6mon/i.test(text))
        throw new Error(`Référence au dépôt privé dans la page publique : ${file}`);
      if (/^(?:en\/)?guide(?:\.html|\/)/.test(file)) {
        if (
          /référence fonctionnelle|functional reference|\.zip\b|chrome:\/\/extensions|dist\/|\.\/DEVELOPER\.md/i.test(
            text,
          )
        )
          throw new Error(`Instruction réservée au développement dans le guide public : ${file}`);
      }
      if (file.endsWith(".html")) {
        const language = file.startsWith("en/") ? "en" : "fr";
        if (!text.includes(`<html lang="${language}">`))
          throw new Error(`Langue HTML incorrecte : ${file}`);
        for (const alternate of ["fr", "en", "x-default"])
          if (!text.includes(`hreflang="${alternate}"`))
            throw new Error(`Alternative ${alternate} absente : ${file}`);
        for (const targetLanguage of ["fr", "en"])
          if (!text.includes(`data-language="${targetLanguage}"`))
            throw new Error(`Sélecteur ${targetLanguage} absent : ${file}`);
      }
      for (const name of ["href", "src", "poster"])
        for (const value of attributes(text, name)) checkLink(value, file);
      for (const value of attributes(text, "srcset"))
        for (const candidate of value.split(",")) checkLink(candidate.trim().split(/\s+/)[0], file);
    }
    if (file.endsWith(".css")) {
      for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi))
        checkLink(match[1].trim(), file);
      for (const match of text.matchAll(/@import\s+["']([^"']+)["']/gi)) checkLink(match[1], file);
    }
  }
  for (const [file, content] of renderGuidePages())
    if (html.get(file) !== content)
      throw new Error(`Fiche générée différente du manuel source : ${file}`);
  for (const [language, file] of Object.entries(privacyPaths))
    if (html.get(file) !== privacyHtml(language))
      throw new Error(
        `La politique ${language} générée ne correspond pas au texte juridique source.`,
      );
  console.log(
    `✓ Site vérifié : ${files.length} fichiers publics, ${links} liens locaux et ancres valides.`,
  );
  return { files, links };
}

function createArchive(files) {
  const release = join(root, "release");
  mkdirSync(release, { recursive: true });
  assertPlainPath(release);
  const contents = [];
  const directory = [];
  let offset = 0;
  // ZIP standard, UTF-8, sans ZIP64 : le site public est petit et autonome.
  for (const file of [...files].sort()) {
    const name = Buffer.from(file, "utf8");
    const data = readFileSync(join(SITE_DIRECTORY, file));
    const compressed = deflateRawSync(data);
    if (Math.max(data.length, compressed.length, offset) >= 0xffffffff || name.length > 0xffff)
      throw new Error("Site trop volumineux pour cette archive ZIP.");
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(33, 12); // 1er janvier 1980 : construction reproductible.
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    contents.push(header, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += header.length + name.length + compressed.length;
  }
  if (files.length > 0xffff) throw new Error("Trop de fichiers pour cette archive ZIP.");
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  const archive = join(release, "sprint-goals-site.zip");
  if (existsSync(archive)) assertPlainPath(archive);
  writeFileSync(archive, Buffer.concat([...contents, central, end]));
  console.log(`✓ Archive autonome : ${relative(root, archive)}`);
}

export function buildSite() {
  const sources = inventory();
  const guides = renderGuidePages();
  const privacy = Object.entries(privacyPaths).map(([language, file]) => [
    file,
    privacyHtml(language),
  ]);
  const temporaryRoot = join(root, ".vite");
  mkdirSync(temporaryRoot, { recursive: true });
  assertPlainPath(temporaryRoot);
  // Cible fixe et vérifiée avant suppression : ne jamais nettoyer le dépôt, dist/ ou release/.
  if (dirname(SITE_DIRECTORY) !== temporaryRoot || realpathSync(temporaryRoot) !== temporaryRoot)
    throw new Error("Répertoire de construction du site invalide.");
  if (existsSync(SITE_DIRECTORY)) {
    assertPlainPath(SITE_DIRECTORY);
    rmSync(SITE_DIRECTORY, { recursive: true, force: true });
  }
  mkdirSync(SITE_DIRECTORY);
  for (const [target, source] of sources) {
    const destination = join(SITE_DIRECTORY, target);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  for (const [file, content] of guides) {
    mkdirSync(dirname(join(SITE_DIRECTORY, file)), { recursive: true });
    writeFileSync(join(SITE_DIRECTORY, file), content);
  }
  for (const [file, content] of privacy) {
    mkdirSync(dirname(join(SITE_DIRECTORY, file)), { recursive: true });
    writeFileSync(join(SITE_DIRECTORY, file), content);
  }
  writeFileSync(join(SITE_DIRECTORY, ".nojekyll"), "");
  const result = checkSite();
  createArchive(result.files);
  console.log(`✓ Site construit dans ${relative(root, SITE_DIRECTORY)}`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some((argument) => argument !== "--check"))
    throw new Error("Usage : node scripts/build-site.mjs [--check]");
  buildSite();
}
