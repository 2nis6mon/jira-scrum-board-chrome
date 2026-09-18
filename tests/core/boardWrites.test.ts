import { describe, expect, it } from "vitest";
import {
  linkToTextGoal,
  moveToColumn,
  performTransition,
  rankFailures,
  rankIssue,
  withTextGoalLink,
} from "../../src/core/boardWrites";
import { makeSprintGoal, makeSprintGoalDocument } from "../../src/core/sprintGoals";
import { JiraClient } from "../../src/jira/client";
import { JiraError } from "../../src/jira/errors";
import { decodeTransition } from "../../src/jira/models";
import { JiraTransport } from "../../src/jira/transport";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { ACME, FakeJira } from "../support/fakeJira";
import { statusJson } from "../support/jiraFixtures";

const ISSUE = "/rest/api/3/issue/ABC-1";
const TRANSITIONS = "/rest/api/3/issue/ABC-1/transitions";
const RANK = "/rest/agile/1.0/issue/rank";
const GOALS = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`;
const NOW = new Date("2026-09-18T10:15:30.123Z");

function setup(jira: FakeJira) {
  const transport = new JiraTransport({ site: ACME, fetch: jira.fetch, sleep: async () => {} });
  return { reader: new JiraClient(transport), writer: transport };
}

const status = (id: string, name: string) => ({
  status: 200,
  json: { fields: { status: statusJson(id, name) } },
});
const transition = (id: string, to: string, fields: Record<string, unknown> | null = null) => ({
  id,
  name: `Vers ${to}`,
  to: statusJson(to, `Statut ${to}`),
  isAvailable: true,
  fields,
});

describe("moveToColumn", () => {
  const move = (jira: FakeJira, targetStatusIds = ["5"]) => {
    const { reader, writer } = setup(jira);
    return moveToColumn(reader, writer, { issueKey: "ABC-1", knownStatusId: "3", targetStatusIds });
  };

  it("relit le statut, lit les transitions, puis écrit UNE fois la transition directe", async () => {
    const jira = new FakeJira()
      .on("GET", ISSUE, status("3", "En cours"))
      .on("GET", TRANSITIONS, {
        status: 200,
        json: { transitions: [transition("11", "4"), transition("21", "5")] },
      })
      .on("POST", TRANSITIONS, { status: 204 });

    const outcome = await move(jira);

    expect(outcome).toMatchObject({ kind: "moved", transition: { id: "21" } });
    expect(jira.sent("GET", ISSUE)[0]?.url.searchParams.get("fields")).toBe("status");
    expect(jira.sent("GET", TRANSITIONS)[0]?.url.searchParams.get("expand")).toBe(
      "transitions.fields",
    );
    expect(jira.sent("POST", TRANSITIONS).map((r) => r.body)).toEqual([
      { transition: { id: "21" } },
    ]);
  });

  it("statut modifié dans Jira entre-temps : conflit, rien n'est écrit", async () => {
    const jira = new FakeJira().on("GET", ISSUE, status("4", "Revue"));
    const outcome = await move(jira);
    expect(outcome).toMatchObject({ kind: "conflict", currentStatus: { name: "Revue" } });
    expect(jira.requests.map((r) => r.method)).toEqual(["GET"]);
  });

  it("déjà dans la colonne : rien n'est écrit", async () => {
    const jira = new FakeJira()
      .on("GET", ISSUE, status("3", "En cours"))
      .on("GET", TRANSITIONS, { status: 200, json: { transitions: [] } });
    expect(await move(jira, ["3", "4"])).toEqual({ kind: "alreadyThere" });
    expect(jira.sent("POST")).toEqual([]);
  });

  it("champs obligatoires : signalés, rien n'est écrit", async () => {
    const jira = new FakeJira().on("GET", ISSUE, status("3", "En cours")).on("GET", TRANSITIONS, {
      status: 200,
      json: {
        transitions: [
          transition("31", "5", { resolution: { required: true, name: "Résolution" } }),
        ],
      },
    });
    expect(await move(jira)).toMatchObject({ kind: "requiresFields", fields: ["Résolution"] });
    expect(jira.sent("POST")).toEqual([]);
  });

  it("pas de transition directe : propose ce que Jira autorise, rien n'est écrit", async () => {
    const jira = new FakeJira()
      .on("GET", ISSUE, status("3", "En cours"))
      .on("GET", TRANSITIONS, { status: 200, json: { transitions: [transition("11", "4")] } });
    const outcome = await move(jira);
    expect(outcome.kind).toBe("choose");
    expect(outcome.kind === "choose" && outcome.available.map((t) => t.id)).toEqual(["11"]);
    expect(jira.sent("POST")).toEqual([]);
  });

  it("aucune transition du tout : le dit", async () => {
    const jira = new FakeJira()
      .on("GET", ISSUE, status("3", "En cours"))
      .on("GET", TRANSITIONS, { status: 200, json: { transitions: [] } });
    expect((await move(jira)).kind).toBe("noTransition");
  });

  it("réponse perdue (503, coupure) : la transition n'est JAMAIS rejouée", async () => {
    for (const reply of [{ status: 503 }, { networkError: "Failed to fetch" }] as const) {
      const jira = new FakeJira()
        .on("GET", ISSUE, status("3", "En cours"))
        .on("GET", TRANSITIONS, { status: 200, json: { transitions: [transition("21", "5")] } })
        .on("POST", TRANSITIONS, reply);
      await expect(move(jira)).rejects.toMatchObject({ isOutcomeUnknown: true });
      expect(jira.sent("POST")).toHaveLength(1);
    }
  });

  it("refus de Jira (400) : l'erreur remonte avec son message", async () => {
    const jira = new FakeJira()
      .on("GET", ISSUE, status("3", "En cours"))
      .on("GET", TRANSITIONS, { status: 200, json: { transitions: [transition("21", "5")] } })
      .on("POST", TRANSITIONS, {
        status: 400,
        json: { errorMessages: ["Validation du workflow refusée"] },
      });
    await expect(move(jira)).rejects.toThrowError("Validation du workflow refusée");
  });

  it("transition choisie : une écriture, l'identifiant choisi", async () => {
    const jira = new FakeJira().on("POST", TRANSITIONS, { status: 204 });
    await performTransition(setup(jira).writer, "ABC-1", decodeTransition(transition("11", "4")));
    expect(jira.sent("POST").map((r) => r.body)).toEqual([{ transition: { id: "11" } }]);
  });
});

describe("rankIssue", () => {
  it("avant ou après un ticket, 204", async () => {
    const jira = new FakeJira().on("PUT", RANK, { status: 204 });
    const { writer } = setup(jira);
    await rankIssue(writer, "ABC-1", { kind: "before", issueKey: "ABC-2" });
    await rankIssue(writer, "ABC-1", { kind: "after", issueKey: "ABC-9" });
    expect(jira.sent("PUT").map((r) => r.body)).toEqual([
      { issues: ["ABC-1"], rankBeforeIssue: "ABC-2" },
      { issues: ["ABC-1"], rankAfterIssue: "ABC-9" },
    ]);
  });

  it("rien à changer : aucune requête", async () => {
    const jira = new FakeJira();
    await rankIssue(setup(jira).writer, "ABC-1", { kind: "none" });
    expect(jira.requests).toEqual([]);
  });

  it("207 avec un refus : erreur, avec le message de Jira", async () => {
    const jira = new FakeJira().on("PUT", RANK, {
      status: 207,
      json: {
        entries: [
          {
            issueId: 1,
            issueKey: "ABC-1",
            status: 503,
            errors: ["Classement impossible pour l'instant."],
          },
        ],
      },
    });
    await expect(
      rankIssue(setup(jira).writer, "ABC-1", { kind: "before", issueKey: "ABC-2" }),
    ).rejects.toThrowError("Classement impossible pour l'instant.");
    expect(jira.sent("PUT")).toHaveLength(1);
  });

  it("403 : refus de droits (permission « Planifier les tickets »)", async () => {
    const jira = new FakeJira().on("PUT", RANK, {
      status: 403,
      json: { errorMessages: ["Permission requise"] },
    });
    await expect(
      rankIssue(setup(jira).writer, "ABC-1", { kind: "after", issueKey: "ABC-2" }),
    ).rejects.toMatchObject({
      info: { kind: "forbidden" },
    });
  });

  it("rankFailures lit un tableau ou un objet d'erreurs, et ignore les succès", () => {
    expect(rankFailures(null)).toBeNull();
    expect(rankFailures({ entries: [{ status: 200 }] })).toBeNull();
    expect(rankFailures({ entries: [{ status: 400, errors: { rank: "Refusé" } }] })).toEqual([
      "Refusé",
    ]);
    expect(rankFailures({ entries: [{ status: 500 }] })).toEqual([]);
  });
});

describe("rattachement à un objectif du texte du sprint", () => {
  const displayed = [
    makeSprintGoal({ id: "g1", title: "Paiement", position: 0, color: "goal6" }),
    makeSprintGoal({ id: "g2", title: "Stabilité", position: 1, color: "goal3" }),
  ];
  const input = (goalId: string | null) => ({
    sprintId: 42,
    issueKey: "ABC-1",
    goalId,
    goals: displayed,
    accountId: "compte-1",
    now: NOW,
  });

  it("relit la propriété, ne change que le lien du ticket, garde le reste", async () => {
    const jira = new FakeJira()
      .on("GET", GOALS, {
        status: 200,
        json: {
          value: {
            version: 1,
            goals: [{ id: "g1", title: "Paiement", color: "goal1", position: 0 }],
            links: { "ABC-7": "g1", "ABC-8": "objectif-disparu" },
            atlassianGoalIds: ["ari:cloud:goal::goal/9"],
          },
        },
      })
      .on("PUT", GOALS, { status: 200 });
    const { reader, writer } = setup(jira);
    await linkToTextGoal(reader, writer, input("g2"));

    const [put] = jira.sent("PUT");
    expect(put?.body).toEqual({
      version: 1,
      goals: [
        { id: "g1", title: "Paiement", color: "goal1", position: 0 },
        { id: "g2", title: "Stabilité", color: "goal2", position: 1 },
      ],
      links: { "ABC-7": "g1", "ABC-1": "g2" },
      atlassianGoalIds: ["ari:cloud:goal::goal/9"],
      updatedAt: "2026-09-18T10:15:30Z",
      updatedBy: "compte-1",
    });
    expect(jira.sent("PUT")).toHaveLength(1);
  });

  it("propriété absente : crée le document avec les objectifs affichés", async () => {
    const jira = new FakeJira().on("GET", GOALS, { status: 404 }).on("PUT", GOALS, { status: 201 });
    const { reader, writer } = setup(jira);
    await linkToTextGoal(reader, writer, input("g1"));
    const body = jira.sent("PUT")[0]?.body as {
      goals: { id: string }[];
      links: unknown;
      atlassianGoalIds: unknown;
    };
    expect(body.goals.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(body.links).toEqual({ "ABC-1": "g1" });
    expect(body.atlassianGoalIds).toEqual([]);
  });

  it("détacher retire le lien du ticket seulement", () => {
    const fresh = makeSprintGoalDocument({
      goals: displayed,
      links: { "ABC-1": "g1", "ABC-2": "g2" },
    });
    expect(withTextGoalLink(fresh, input(null)).links).toEqual({ "ABC-2": "g2" });
  });

  it("n'écrit jamais la couleur choisie localement", () => {
    const document = withTextGoalLink(null, input("g1"));
    expect(document.goals.map((g) => g.color)).toEqual(["goal1", "goal2"]);
  });

  it("objectif disparu du sprint : aucune requête", async () => {
    const jira = new FakeJira();
    const { reader, writer } = setup(jira);
    await expect(linkToTextGoal(reader, writer, input("inconnu"))).rejects.toThrowError(
      /n'existe plus/,
    );
    expect(jira.requests).toEqual([]);
  });

  it("refus de droits sur la propriété : une seule tentative, l'erreur remonte", async () => {
    const jira = new FakeJira()
      .on("GET", GOALS, { status: 404 })
      .on("PUT", GOALS, { status: 403, json: {} });
    const { reader, writer } = setup(jira);
    await expect(linkToTextGoal(reader, writer, input("g1"))).rejects.toBeInstanceOf(JiraError);
    expect(jira.sent("PUT")).toHaveLength(1);
  });

  it("n'écrit que la propriété des objectifs, jamais le sprint lui-même", async () => {
    const jira = new FakeJira().on("GET", GOALS, { status: 404 }).on("PUT", GOALS, { status: 201 });
    const { reader, writer } = setup(jira);
    await linkToTextGoal(reader, writer, input("g1"));
    expect(jira.requests.filter((r) => r.method !== "GET").map((r) => r.path)).toEqual([GOALS]);
  });
});
