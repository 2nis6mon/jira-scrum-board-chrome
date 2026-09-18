import { describe, expect, it } from "vitest";
import { type AuditEntry, AuditLog, MAX_AUDIT_ENTRIES } from "../../src/app/model/auditLog";
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
