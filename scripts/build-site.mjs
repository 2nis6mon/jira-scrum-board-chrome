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
import { Marked } from "marked";

const root = resolve(import.meta.dirname, "..");
export const SITE_DIRECTORY = join(root, ".vite", "site-dist");
export const SITE_BASE_PATH = "/jira-scrum-board-chrome/";
const repository = "https://github.com/2nis6mon/jira-scrum-board-chrome";
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
const generatedFiles = ["guide.html", "confidentialite.html", ".nojekyll"];
const sourceFiles = ["index.html", "styles.css", "main.js"];

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

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const decodeEntities = (value) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

function guideHtml() {
  const file = join(root, "docs", "manuel-utilisateur.md");
  assertPlainPath(file);
  const markdown = readFileSync(file, "utf8");
  const counts = new Map();
  const parser = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        // Même ancrage que le sommaire Markdown : accents conservés, ponctuation retirée.
        const base = decodeEntities(text.replace(/<[^>]*>/g, ""))
          .toLowerCase()
          .replace(/[^\p{L}\p{N}_\s-]/gu, "")
          .replace(/\s/g, "-");
        const count = counts.get(base) ?? 0;
        counts.set(base, count + 1);
        const id = count ? `${base}-${count}` : base;
        return `<h${depth} id="${escapeHtml(id)}">${text}</h${depth}>\n`;
      },
      // Le manuel est une source Markdown contrôlée, pas une source de scripts HTML.
      html({ text }) {
        return escapeHtml(text);
      },
    },
    walkTokens(token) {
      if (token.type !== "link" && token.type !== "image") return;
      if (token.href.startsWith("store/captures/"))
        token.href = token.href.replace("store/captures/", "assets/screenshots/");
      else if (token.href === "privacy/index.html") token.href = "confidentialite.html";
      else if (token.href === "../DEVELOPER.md")
        token.href = `${repository}/blob/main/DEVELOPER.md`;
    },
  });
  const content = parser.parse(markdown);
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Manuel utilisateur — Sprint Goals Board pour Jira</title>
  <meta name="description" content="Installer Sprint Goals Board, ajouter vos boards Scrum et Kanban, organiser les objectifs et animer votre Daily dans Jira.">
  <link rel="icon" href="assets/icons/icon-32.png" type="image/png">
  <link rel="stylesheet" href="styles.css">
</head>
<body class="documentation-page">
  <a class="skip-link" href="#contenu">Aller au contenu</a>
  <header class="doc-header">
    <a class="brand" href="index.html"><img src="assets/icons/icon-48.png" alt="" width="32" height="32"><span>Sprint Goals Board</span></a>
    <nav aria-label="Navigation du guide"><a href="index.html">Retour au site</a><a href="#sommaire">Sommaire</a><a href="confidentialite.html">Confidentialité</a></nav>
  </header>
  <main id="contenu" class="document-content">${content}</main>
  <footer class="doc-footer"><a href="${repository}/blob/main/docs/manuel-utilisateur.md">Consulter le manuel source sur GitHub</a> · <a href="index.html">Retour au site</a></footer>
</body>
</html>
`;
}

function privacyHtml() {
  const file = join(root, "docs", "privacy", "index.html");
  assertPlainPath(file);
  const original = readFileSync(file, "utf8");
  if (!original.includes("<main>") || !original.includes("</head>"))
    throw new Error("Structure de la politique de confidentialité inconnue.");
  // Navigation et icône uniquement ; le document juridique reste intact, styles compris.
  return original
    .replace("</head>", '<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">\n</head>')
    .replace(
      "<main>",
      '<main>\n<p class="site-return"><a href="index.html">← Retour au site Sprint Goals Board</a></p>',
    );
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
  if (html.get("guide.html") !== guideHtml())
    throw new Error("Le guide généré ne correspond pas au manuel complet.");
  if (html.get("confidentialite.html") !== privacyHtml())
    throw new Error("La politique générée ne correspond pas au texte juridique source.");
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
  const guide = guideHtml();
  const privacy = privacyHtml();
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
  writeFileSync(join(SITE_DIRECTORY, "guide.html"), guide);
  writeFileSync(join(SITE_DIRECTORY, "confidentialite.html"), privacy);
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
