// Paquet du Chrome Web Store : le paquet AUTONOME (jamais le prototype d'ouverture dans Jira),
// construit dans release/ pour ne pas toucher à dist/ (que Denis peut être en train d'essayer).
//
// - le champ `key` du manifest est retiré : le Store attribue son propre identifiant ;
// - contrôles avant d'écrire le zip : aucun droit du prototype, aucune carte de sources, aucune
//   clé privée, aucune trace du banc d'essai, version du manifest = version de package.json.
//
// Usage : npm run package  →  release/sprint-goals-board-<version>.zip

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const release = join(root, "release");
const build = join(release, "build");

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

rmSync(release, { recursive: true, force: true });
execFileSync("npx", ["vite", "build", "--outDir", build, "--emptyOutDir"], {
  cwd: root,
  stdio: "inherit",
});

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
check(!manifest.permissions.includes("scripting"), "permission scripting (prototype) présente");
check(!("web_accessible_resources" in manifest), "ressources exposées (prototype) présentes");
check(
  manifest.content_security_policy.extension_pages.includes("frame-ancestors 'none'"),
  "la page n'est plus protégée contre l'encadrement",
);

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(relative(build, path));
  }
};
walk(build);

for (const file of files) {
  check(!file.endsWith(".map"), `carte de sources embarquée : ${file}`);
  check(!/\.(pem|crx|key)$/.test(file), `fichier de clé embarqué : ${file}`);
  check(!/harness|tests?\//i.test(file), `fichier du banc d'essai ou des tests : ${file}`);
  if (/\.(js|html|json)$/.test(file)) {
    const text = readFileSync(join(build, file), "utf8");
    check(!text.includes("PRIVATE KEY"), `clé privée dans ${file}`);
    check(!text.includes("jira-direct-test"), `code du prototype dans ${file}`);
  }
}

if (failures.length > 0) {
  console.error("\nPaquet refusé :");
  for (const failure of failures) console.error(`✗ ${failure}`);
  process.exit(1);
}

const zip = join(release, `sprint-goals-board-${version}.zip`);
execFileSync("zip", ["-q", "-r", "-X", zip, "."], { cwd: build });

console.log(`\n✓ ${relative(root, zip)} (${Math.round(statSync(zip).size / 1024)} Ko)`);
console.log(`  ${manifest.name} ${manifest.version} — ${files.length} fichiers :`);
for (const file of files.sort()) console.log(`  · ${file}`);
