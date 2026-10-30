// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { type AuditEntry, AuditLog } from "../../src/app/model/auditLog";
import { DiagnosticModel } from "../../src/app/model/DiagnosticModel";
import { DiagnosticView } from "../../src/app/views/DiagnosticView";
import { setLanguage } from "../../src/i18n";
import { normalizeSiteUrl } from "../../src/jira/site";
import { FakeJira } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const SITE = normalizeSiteUrl("acme.atlassian.net");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  render(null, document.body);
  setLanguage("fr");
});

const base = {
  at: "2026-10-30T10:00:00.000Z",
  site: SITE.origin,
  from: null,
  outcome: "échec",
} as const;

// Entrée d'une version précédente : phrases françaises dans `to` et `detail`.
const legacy: AuditEntry = {
  ...base,
  action: "transition",
  issueKey: "ABC-1",
  to: "Terminé",
  detail: "conflit : statut modifié dans Jira",
};
// Entrée de 0.36.2 : textes de l'extension en clés du catalogue.
const modern: AuditEntry = {
  ...base,
  action: "classement",
  issueKey: "ABC-2",
  to: null,
  toMessage: { key: "après {p0}", params: { p0: "ABC-1" } },
  detail: null,
  detailMessage: { key: "conflit : statut modifié dans Jira" },
};

async function journalCells(): Promise<string[][]> {
  const platform = fakePlatform(new FakeJira());
  const audit = new AuditLog(platform.store);
  await audit.append(legacy);
  await audit.append(modern);
  const diagnostic = new DiagnosticModel(SITE, platform, audit);
  await diagnostic.loadJournal();
  render(<DiagnosticView diagnostic={diagnostic} />, document.body);
  await tick();
  return [...document.querySelectorAll(".journal tbody tr")].map((row) =>
    [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? ""),
  );
}

describe("tableau du journal des écritures", () => {
  it("affiche les anciennes et les nouvelles entrées en français", async () => {
    const rows = await journalCells();
    // Plus récente d'abord ; colonnes : date, action, cible, vers, résultat, détail.
    expect(rows.map((cells) => cells.slice(1))).toEqual([
      ["classement", "ABC-2", "après ABC-1", "échec", "conflit : statut modifié dans Jira"],
      ["transition", "ABC-1", "Terminé", "échec", "conflit : statut modifié dans Jira"],
    ]);
  });

  it("traduit les deux formes en anglais, contenu Jira intact", async () => {
    setLanguage("en");
    const rows = await journalCells();
    expect(rows.map((cells) => cells.slice(1))).toEqual([
      ["ranking", "ABC-2", "after ABC-1", "failed", "conflict: status changed in Jira"],
      ["transition", "ABC-1", "Terminé", "failed", "conflict: status changed in Jira"],
    ]);
  });
});
