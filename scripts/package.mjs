// Paquet Chrome Web Store de l'extension intégrée à Jira. La construction utilise un dossier
// temporaire sous release/ : dist/ et les livraisons précédentes restent disponibles.
// Le Store attribue son identifiant : seul le champ public `key` est retiré du manifest.
// Le mode package désactive les fonctions expérimentales, notamment Sprint Planning.
// Usage : npm run package → release/sprint-goals-board-<version>.zip

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const release = join(root, "release");
mkdirSync(release, { recursive: true });
const temporary = mkdtempSync(join(release, ".package-"));
const build = join(temporary, "build");

function removeTemporaryBuild() {
  // Seul le dossier créé par cette exécution peut être supprimé, jamais release/ lui-même.
  if (
    dirname(resolve(temporary)) !== resolve(release) ||
    !relative(release, temporary).startsWith(".package-")
  ) {
    throw new Error("Nettoyage refusé : dossier temporaire hors du répertoire de livraison.");
  }
  rmSync(temporary, { recursive: true, force: true });
}

try {
  // L'exécutable Node évite les différences entre npx et npx.cmd sous Windows.
  execFileSync(
    process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "build", "--mode", "package", "--outDir", build],
    {
      cwd: root,
      stdio: "inherit",
    },
  );

  const failures = [];
  const check = (ok, message) => {
    if (!ok) failures.push(message);
  };
  const manifestPath = join(build, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  delete manifest.key;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  check(
    manifest.version === version,
    `version du manifest ${manifest.version} ≠ package.json ${version}`,
  );
  check(!("key" in manifest), "le champ key est encore présent");
  check(
    JSON.stringify([...(manifest.permissions ?? [])].sort()) ===
      JSON.stringify(["activeTab", "declarativeNetRequestWithHostAccess", "scripting", "storage"]),
    "permissions différentes de l'onglet actif, du stockage, de l'injection Jira et de la règle d'en-tête",
  );
  check(!manifest.host_permissions?.length, "accès à un hôte accordé dès l'installation");
  check(
    JSON.stringify(manifest.optional_host_permissions) ===
      JSON.stringify(["https://*.atlassian.net/*"]),
    "les hôtes facultatifs ne sont pas limités à Jira Cloud",
  );
  check(manifest.background?.service_worker === "jira-worker.js", "service worker Jira absent");
  check(manifest.action?.default_popup === "launcher.html", "lanceur Jira absent de l'action");
  const resources = manifest.web_accessible_resources ?? [];
  check(
    resources.length === 1 &&
      JSON.stringify(resources[0].matches) === JSON.stringify(["https://*.atlassian.net/*"]) &&
      JSON.stringify([...(resources[0].resources ?? [])].sort()) ===
        JSON.stringify(["assets/*", "board.html", "icons/*"]),
    "ressources exposées différentes du board et de ses ressources, limités à Jira Cloud",
  );
  const csp = new Map(
    (manifest.content_security_policy?.extension_pages ?? "").split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values.join(" ")];
    }),
  );
  check(
    csp.get("frame-ancestors") === "https://*.atlassian.net",
    "encadrement non limité à Jira Cloud",
  );
  check(
    csp.get("connect-src") === "https://*.atlassian.net",
    "connexions non limitées à Jira Cloud",
  );

  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      // Vite recopie public/ : les métadonnées du Finder ne font pas partie de l'extension.
      if (name === ".DS_Store") {
        rmSync(path);
        continue;
      }
      if (statSync(path).isDirectory()) walk(path);
      else files.push(relative(build, path).replaceAll("\\", "/"));
    }
  };
  walk(build);
  for (const required of ["board.html", "launcher.html", "jira-worker.js", "jira-bootstrap.js"]) {
    check(files.includes(required), `ressource de l'intégration Jira absente : ${required}`);
  }
  check(!files.includes("service-worker.js"), "ancien service worker autonome encore livré");
  for (const file of files) {
    check(!file.endsWith(".map"), `carte de sources embarquée : ${file}`);
    check(!/\.(pem|crx|key)$/.test(file), `fichier de clé embarqué : ${file}`);
    check(!/harness|tests?\//i.test(file), `fichier du banc d'essai ou des tests : ${file}`);
    if (/\.(js|html|json)$/.test(file)) {
      const text = readFileSync(join(build, file), "utf8");
      check(!text.includes("PRIVATE KEY"), `clé privée dans ${file}`);
    }
  }
  if (failures.length > 0)
    throw new Error(`Paquet refusé :\n${failures.map((message) => `✗ ${message}`).join("\n")}`);

  const temporaryZip = join(temporary, "package.zip");
  if (process.platform === "win32") {
    // .NET produit un ZIP standard et conserve tous les fichiers, y compris cachés. Les chemins
    // passent par l'environnement, jamais par une interpolation de commande PowerShell.
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        [
          "$ErrorActionPreference = 'Stop'",
          "Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem",
          "$packageRoot = (Resolve-Path -LiteralPath $env:SPRINT_GOALS_PACKAGE_BUILD).Path",
          "$packageArchive = [System.IO.Compression.ZipFile]::Open($env:SPRINT_GOALS_PACKAGE_ZIP, [System.IO.Compression.ZipArchiveMode]::Create)",
          // PowerShell 5/.NET écrit sinon des antislashs : les noms ZIP utilisent toujours '/'.
          "try { foreach ($packageFile in [System.IO.Directory]::EnumerateFiles($packageRoot, '*', [System.IO.SearchOption]::AllDirectories)) { $packageEntry = $packageFile.Substring($packageRoot.Length + 1).Replace([char]92, [char]47); [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($packageArchive, $packageFile, $packageEntry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null } } finally { $packageArchive.Dispose() }",
        ].join("; "),
      ],
      {
        env: {
          ...process.env,
          SPRINT_GOALS_PACKAGE_BUILD: build,
          SPRINT_GOALS_PACKAGE_ZIP: temporaryZip,
        },
        windowsHide: true,
        stdio: "inherit",
      },
    );
  } else {
    execFileSync("zip", ["-q", "-r", "-X", temporaryZip, "."], { cwd: build });
  }
  const zip = join(release, `sprint-goals-board-${version}.zip`);
  renameSync(temporaryZip, zip);
  console.log(`\n✓ ${relative(root, zip)} (${Math.round(statSync(zip).size / 1024)} Ko)`);
  console.log(`  ${manifest.name} ${manifest.version} — ${files.length} fichiers :`);
  for (const file of files.sort()) console.log(`  · ${file}`);
} finally {
  removeTemporaryBuild();
}
