import { describe, expect, it } from "vitest";
import { message } from "../../src/app/model/appMessage";
import {
  type AuditEntry,
  AuditLog,
  auditText,
  MAX_AUDIT_ENTRIES,
} from "../../src/app/model/auditLog";
import { english, localize } from "../../src/i18n";
import { FakeJira } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const entry = (issueKey: string, site = "https://acme.atlassian.net"): AuditEntry => ({
  at: "2026-09-18T10:00:00.000Z",
  site,
  action: "transition",
  issueKey,
  from: "À faire",
  to: "En cours",
  outcome: "réussi",
  detail: null,
});

describe("journal des écritures", () => {
  it("liste les entrées d'un site, de la plus récente à la plus ancienne", async () => {
    const log = new AuditLog(fakePlatform(new FakeJira()).store);
    await log.append(entry("ABC-1"));
    await log.append(entry("ABC-2"));
    await log.append(entry("XYZ-1", "https://autre.atlassian.net"));
    expect((await log.list("https://acme.atlassian.net")).map((e) => e.issueKey)).toEqual([
      "ABC-2",
      "ABC-1",
    ]);
  });

  it("garde une écriture qui porte sur le sprint et non sur un ticket (épinglage)", async () => {
    const log = new AuditLog(fakePlatform(new FakeJira()).store);
    await log.append({ ...entry("ABC-1"), action: "épinglage", issueKey: null });
    expect(await log.list("https://acme.atlassian.net")).toEqual([
      expect.objectContaining({ action: "épinglage", issueKey: null }),
    ]);
  });

  it("ne perd aucune entrée quand deux ajouts se croisent", async () => {
    const log = new AuditLog(fakePlatform(new FakeJira()).store);
    await Promise.all(Array.from({ length: 20 }, (_, i) => log.append(entry(`ABC-${i + 1}`))));
    expect(await log.list("https://acme.atlassian.net")).toHaveLength(20);
  });

  it(`garde les ${MAX_AUDIT_ENTRIES} dernières entrées`, async () => {
    const log = new AuditLog(fakePlatform(new FakeJira()).store);
    for (let i = 1; i <= MAX_AUDIT_ENTRIES + 3; i++) await log.append(entry(`ABC-${i}`));
    const entries = await log.list("https://acme.atlassian.net");
    expect(entries).toHaveLength(MAX_AUDIT_ENTRIES);
    expect(entries.at(-1)?.issueKey).toBe("ABC-4");
  });

  it("oublier un site n'efface que ses entrées", async () => {
    const platform = fakePlatform(new FakeJira());
    const log = new AuditLog(platform.store);
    await log.append(entry("ABC-1"));
    await log.append(entry("XYZ-1", "https://autre.atlassian.net"));
    await log.forgetSite("https://acme.atlassian.net");
    expect(await log.list("https://acme.atlassian.net")).toEqual([]);
    expect(await log.list("https://autre.atlassian.net")).toHaveLength(1);
    await log.forgetSite("https://autre.atlassian.net");
    expect(platform.stored.has("audit.v1")).toBe(false);
  });
});

/** Copie exacte de `isEntry` de 0.36.1 : une version précédente doit lire les nouvelles entrées. */
function isEntry0361(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.at === "string" &&
    typeof entry.site === "string" &&
    typeof entry.action === "string" &&
    (typeof entry.issueKey === "string" || entry.issueKey === null) &&
    typeof entry.outcome === "string"
  );
}

describe("journal en clés du catalogue (0.36.2)", () => {
  const legacy: AuditEntry = {
    ...entry("ABC-1"),
    outcome: "échec",
    to: "Terminé",
    detail: "conflit : statut modifié dans Jira",
  };
  const modern: AuditEntry = {
    ...entry("ABC-2"),
    action: "classement",
    to: null,
    toMessage: { key: "après {p0}", params: { p0: "ABC-1" } },
    detail: null,
    detailMessage: { key: "conflit : statut modifié dans Jira" },
  };

  it("affiche une ancienne entrée comme avant, en fr, en et es", () => {
    expect(auditText(legacy, "detail", "fr")).toBe("conflit : statut modifié dans Jira");
    expect(auditText(legacy, "detail", "en")).toBe("conflict: status changed in Jira");
    expect(auditText(legacy, "detail", "es")).toBe(
      localize("conflit : statut modifié dans Jira", "es"),
    );
    expect(auditText(legacy, "detail", "es")).not.toBe("conflit : statut modifié dans Jira");
    // Le contenu Jira de `to` n'est jamais traduit.
    expect(auditText(legacy, "to", "en")).toBe("Terminé");
  });

  it("traduit une nouvelle entrée dans la langue courante, contenu Jira intact", () => {
    expect(auditText(modern, "to", "fr")).toBe("après ABC-1");
    expect(auditText(modern, "to", "en")).toBe("after ABC-1");
    expect(auditText(modern, "to", "es")).toBe("después de ABC-1");
    expect(auditText(modern, "detail", "en")).toBe("conflict: status changed in Jira");
    const { toMessage: _described, ...raw } = modern;
    expect(auditText({ ...raw, to: "Terminé" }, "to", "en")).toBe("Terminé");
  });

  it("présente une clé absente du catalogue (version plus récente) en texte source, sans échec", () => {
    const newer: AuditEntry = {
      ...modern,
      detailMessage: { key: "Phrase absente du catalogue {p0}", params: { p0: "ABC-1" } },
    };
    expect(auditText(newer, "detail", "fr")).toBe("Phrase absente du catalogue ABC-1");
    expect(auditText(newer, "detail", "en")).toBe("Phrase absente du catalogue ABC-1");
  });

  it("garde les nouvelles entrées lisibles par 0.36.1 et relit les deux formes", async () => {
    const log = new AuditLog(fakePlatform(new FakeJira()).store);
    await log.append(legacy);
    await log.append(modern);
    // Un message d'une forme inconnue n'écarte pas l'entrée : son champ texte est affiché.
    await log.append({ ...legacy, issueKey: "ABC-3", detailMessage: { inconnu: 1 } as never });
    const listed = await log.list("https://acme.atlassian.net");
    expect(listed.map((e) => e.issueKey)).toEqual(["ABC-3", "ABC-2", "ABC-1"]);
    expect(listed.every(isEntry0361)).toBe(true);
    expect(listed[0] && auditText(listed[0], "detail", "fr")).toBe(
      "conflit : statut modifié dans Jira",
    );
  });

  it("n'écrit aucune phrase française dans les champs texte d'une nouvelle écriture", async () => {
    // Rattachement réussi au texte du sprint, tel que le journalise le service.
    const linked: AuditEntry = {
      ...entry("ABC-4"),
      action: "rattachement",
      to: "Objectif du sprint",
      detail: null,
      detailMessage: message("propriété du sprint"),
    };
    expect(linked.detail).toBeNull();
    expect(Object.hasOwn(english, "propriété du sprint")).toBe(true);
    expect(auditText(linked, "detail", "en")).toBe("sprint property");
  });
});
