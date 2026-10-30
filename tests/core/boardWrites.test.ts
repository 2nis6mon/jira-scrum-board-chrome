import { describe, expect, it } from "vitest";
import {
  linkToTextGoal,
  moveToColumn,
  pinAtlassianGoals,
  rankFailures,
  rankIssue,
  withPinnedGoals,
  withTextGoalLink,
} from "../../src/core/boardWrites";
import { makeSprintGoal, makeSprintGoalDocument } from "../../src/core/sprintGoals";
import { JiraClient } from "../../src/jira/client";
import { JiraError } from "../../src/jira/errors";
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

  it("plusieurs actions vers le même statut : écrit seulement la première dans l'ordre Jira", async () => {
    const jira = new FakeJira()
      .on("GET", ISSUE, status("3", "En cours"))
      .on("GET", TRANSITIONS, {
        status: 200,
        json: {
          transitions: [
            { ...transition("91", "5"), name: "Z terminer" },
            { ...transition("11", "5"), name: "A terminer" },
          ],
        },
      })
      .on("POST", TRANSITIONS, { status: 204 });
    expect(await move(jira)).toMatchObject({ kind: "moved", transition: { id: "91" } });
    expect(jira.sent("POST").map((request) => request.body)).toEqual([
      { transition: { id: "91" } },
    ]);
  });

  it("plusieurs statuts dans une colonne : garde un choix par statut et n'écrit rien", async () => {
    const jira = new FakeJira().on("GET", ISSUE, status("3", "En cours")).on("GET", TRANSITIONS, {
      status: 200,
      json: {
        transitions: [transition("91", "4"), transition("71", "5"), transition("11", "4")],
      },
    });
    const outcome = await move(jira, ["4", "5"]);
    expect(outcome.kind === "choose" && outcome.available.map((item) => item.id)).toEqual([
      "91",
      "71",
    ]);
    expect(jira.sent("POST")).toEqual([]);
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

  it("l'action par défaut a un formulaire : demande Jira sans utiliser l'autre action", async () => {
    const jira = new FakeJira().on("GET", ISSUE, status("3", "En cours")).on("GET", TRANSITIONS, {
      status: 200,
      json: {
        transitions: [{ ...transition("91", "5"), hasScreen: true }, transition("11", "5")],
      },
    });
    expect(await move(jira)).toMatchObject({ kind: "requiresFields", transition: { id: "91" } });
    expect(jira.sent("POST")).toEqual([]);
  });

  it("pas de transition directe : refus sans autre destination", async () => {
    const jira = new FakeJira()
      .on("GET", ISSUE, status("3", "En cours"))
      .on("GET", TRANSITIONS, { status: 200, json: { transitions: [transition("11", "4")] } });
    const outcome = await move(jira);
    expect(outcome.kind).toBe("noTransition");
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
        .on("GET", TRANSITIONS, {
          status: 200,
          json: { transitions: [transition("21", "5"), transition("22", "5")] },
        })
        .on("POST", TRANSITIONS, reply);
      await expect(move(jira)).rejects.toMatchObject({ isOutcomeUnknown: true });
      expect(jira.sent("POST").map((request) => request.body)).toEqual([
        { transition: { id: "21" } },
      ]);
    }
  });

  it("refus de Jira (400) : l'erreur remonte avec son message", async () => {
    const jira = new FakeJira()
      .on("GET", ISSUE, status("3", "En cours"))
      .on("GET", TRANSITIONS, {
        status: 200,
        json: { transitions: [transition("21", "5"), transition("22", "5")] },
      })
      .on("POST", TRANSITIONS, {
        status: 400,
        json: { errorMessages: ["Validation du workflow refusée"] },
      });
    await expect(move(jira)).rejects.toThrowError("Validation du workflow refusée");
    expect(jira.sent("POST").map((request) => request.body)).toEqual([
      { transition: { id: "21" } },
    ]);
  });

  it("transition choisie : relecture puis une seule écriture avec cet identifiant", async () => {
    const jira = new FakeJira()
      .on("GET", ISSUE, status("3", "En cours"))
      .on("GET", TRANSITIONS, {
        status: 200,
        json: { transitions: [transition("12", "4"), transition("11", "4")] },
      })
      .on("POST", TRANSITIONS, { status: 204 });
    const { reader, writer } = setup(jira);
    await moveToColumn(reader, writer, {
      issueKey: "ABC-1",
      knownStatusId: "3",
      targetStatusIds: ["4"],
      transitionId: "11",
    });
    expect(jira.sent("POST").map((r) => r.body)).toEqual([{ transition: { id: "11" } }]);
  });

  it.each([
    { name: "disparue", selected: null, transitionId: "11" },
    {
      name: "indisponible",
      selected: { ...transition("11", "4"), isAvailable: false },
      transitionId: "11",
    },
    { name: "destination changée", selected: transition("11", "5"), transitionId: "11" },
    { name: "identifiant vide", selected: null, transitionId: "" },
  ])(
    "action retenue $name : refuse sans choisir une autre transition",
    async ({ selected, transitionId }) => {
      const jira = new FakeJira().on("GET", ISSUE, status("3", "En cours")).on("GET", TRANSITIONS, {
        status: 200,
        json: { transitions: [...(selected ? [selected] : []), transition("12", "4")] },
      });
      const { reader, writer } = setup(jira);
      expect(
        await moveToColumn(reader, writer, {
          issueKey: "ABC-1",
          knownStatusId: "3",
          targetStatusIds: ["4"],
          transitionId,
        }),
      ).toMatchObject({ kind: "noTransition" });
      expect(jira.sent("POST")).toEqual([]);
    },
  );
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
    knownGoalId: null,
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

  it("objectif d'un autre sprint du board : lien écrit ici, sans copier cet objectif", async () => {
    const jira = new FakeJira()
      .on("GET", GOALS, {
        status: 200,
        json: { value: { version: 1, goals: [], links: { "ABC-7": "g-autre" } } },
      })
      .on("PUT", GOALS, { status: 200 });
    const { reader, writer } = setup(jira);
    await linkToTextGoal(reader, writer, {
      ...input("g-pixel"),
      linkableGoalIds: ["g-pixel", "g-autre"],
    });

    const body = jira.sent("PUT")[0]?.body as { goals: { id: string }[]; links: unknown };
    expect(body.goals.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(body.links).toEqual({ "ABC-7": "g-autre", "ABC-1": "g-pixel" });
    expect(jira.sent("PUT")).toHaveLength(1);
  });

  it("n'écrit que la propriété des objectifs, jamais le sprint lui-même", async () => {
    const jira = new FakeJira().on("GET", GOALS, { status: 404 }).on("PUT", GOALS, { status: 201 });
    const { reader, writer } = setup(jira);
    await linkToTextGoal(reader, writer, input("g1"));
    expect(jira.requests.filter((r) => r.method !== "GET").map((r) => r.path)).toEqual([GOALS]);
  });
});

describe("épinglage de Goals Atlassian au sprint", () => {
  const PAIEMENT = "ari:cloud:townsquare:c:goal/paiement";
  const STABILITE = "ari:cloud:townsquare:c:goal/stabilite";
  const stored = (value: unknown) => ({ status: 200, json: { key: "k", value } });
  const pin = (
    jira: FakeJira,
    goalIds: readonly string[],
    shownGoalIds: readonly string[] = [],
  ) => {
    const { reader, writer } = setup(jira);
    return pinAtlassianGoals(reader, writer, {
      sprintId: 42,
      shownGoalIds,
      goalIds,
      accountId: "compte-1",
      now: NOW,
    });
  };

  it("relit la propriété et n'y change que la sélection : objectifs, liens et clés inconnues gardés", async () => {
    const jira = new FakeJira()
      .on(
        "GET",
        GOALS,
        stored({
          version: 1,
          goals: [{ id: "g1", title: "Paiement", color: "goal4", position: 0 }],
          links: { "ABC-7": "g1" },
          atlassianGoalIds: [PAIEMENT],
          updatedBy: "compte-mac",
          ajoutAutreVersion: { conserve: true },
        }),
      )
      .on("PUT", GOALS, { status: 200 });

    const outcome = await pin(jira, [PAIEMENT, STABILITE], [PAIEMENT]);

    expect(outcome).toEqual({ kind: "pinned", goalIds: [PAIEMENT, STABILITE] });
    expect(jira.sent("PUT")).toHaveLength(1);
    expect(jira.sent("PUT")[0]?.body).toEqual({
      ajoutAutreVersion: { conserve: true },
      version: 1,
      goals: [{ id: "g1", title: "Paiement", color: "goal4", position: 0 }],
      links: { "ABC-7": "g1" },
      atlassianGoalIds: [PAIEMENT, STABILITE],
      updatedAt: "2026-09-18T10:15:30Z",
      updatedBy: "compte-1",
    });
  });

  it("n'écrit que la propriété des objectifs : ni le sprint, ni son champ « Objectif »", async () => {
    const jira = new FakeJira().on("GET", GOALS, { status: 404 }).on("PUT", GOALS, { status: 201 });
    await pin(jira, [PAIEMENT]);
    expect(jira.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${GOALS}`,
      `PUT ${GOALS}`,
    ]);
    expect(jira.sent("PUT")[0]?.body).toEqual({
      version: 1,
      goals: [],
      links: {},
      atlassianGoalIds: [PAIEMENT],
      updatedAt: "2026-09-18T10:15:30Z",
      updatedBy: "compte-1",
    });
  });

  it("désépingler tout écrit une sélection vide, sans toucher au reste", async () => {
    const jira = new FakeJira()
      .on("GET", GOALS, stored({ links: { "ABC-7": "g1" }, atlassianGoalIds: [PAIEMENT] }))
      .on("PUT", GOALS, { status: 200 });
    await pin(jira, [], [PAIEMENT]);
    expect(jira.sent("PUT")[0]?.body).toMatchObject({
      links: { "ABC-7": "g1" },
      atlassianGoalIds: [],
    });
  });

  it("sélection modifiée dans Jira depuis l'affichage : rien n'est écrit, la sélection lue remonte", async () => {
    const jira = new FakeJira().on("GET", GOALS, stored({ atlassianGoalIds: [STABILITE] }));
    const outcome = await pin(jira, [PAIEMENT], []);
    expect(outcome).toEqual({ kind: "conflict", current: [STABILITE] });
    expect(jira.requests.filter((r) => r.method !== "GET")).toEqual([]);
  });

  it("l'ordre compte : il fixe celui des swimlanes", async () => {
    const jira = new FakeJira().on(
      "GET",
      GOALS,
      stored({ atlassianGoalIds: [STABILITE, PAIEMENT] }),
    );
    const outcome = await pin(jira, [STABILITE], [PAIEMENT, STABILITE]);
    expect(outcome.kind).toBe("conflict");
  });

  it("sélection identique à celle de Jira : aucune écriture", async () => {
    const jira = new FakeJira().on("GET", GOALS, stored({ atlassianGoalIds: [PAIEMENT] }));
    expect(await pin(jira, [` ${PAIEMENT} `, PAIEMENT], [PAIEMENT])).toEqual({
      kind: "unchanged",
    });
    expect(jira.sent("PUT")).toEqual([]);
  });

  it("identifiants vides ou en double écartés, ordre d'épinglage conservé", () => {
    const document = withPinnedGoals(null, {
      goalIds: [STABILITE, " ", PAIEMENT, STABILITE],
      accountId: null,
      now: NOW,
    });
    expect(document.atlassianGoalIds).toEqual([STABILITE, PAIEMENT]);
  });

  it("relecture impossible : rien n'est écrit", async () => {
    const jira = new FakeJira().on("GET", GOALS, { status: 403, json: {} });
    await expect(pin(jira, [PAIEMENT])).rejects.toMatchObject({ info: { kind: "forbidden" } });
    expect(jira.sent("PUT")).toEqual([]);
  });

  it("valeur stockée qui n'est pas un objet JSON : elle n'est pas écrasée", async () => {
    const jira = new FakeJira().on("GET", GOALS, stored(["inattendu"]));
    await expect(pin(jira, [PAIEMENT])).rejects.toMatchObject({ info: { kind: "decoding" } });
    expect(jira.sent("PUT")).toEqual([]);
  });

  it("refus de droits à l'écriture : une seule tentative, l'erreur remonte", async () => {
    const jira = new FakeJira()
      .on("GET", GOALS, { status: 404 })
      .on("PUT", GOALS, { status: 403, json: { errorMessages: ["Manage Sprints requis"] } });
    await expect(pin(jira, [PAIEMENT])).rejects.toMatchObject({ info: { kind: "forbidden" } });
    expect(jira.sent("PUT")).toHaveLength(1);
  });

  it("réseau coupé pendant l'écriture : issue incertaine, jamais rejouée", async () => {
    const jira = new FakeJira()
      .on("GET", GOALS, { status: 404 })
      .on("PUT", GOALS, { networkError: "Failed to fetch" });
    const error = await pin(jira, [PAIEMENT]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(JiraError);
    expect((error as JiraError).isOutcomeUnknown).toBe(true);
    expect(jira.sent("PUT")).toHaveLength(1);
  });

  it("sélection au-delà de la limite Atlassian de 32 Ko : refusée avant tout envoi", async () => {
    const jira = new FakeJira().on("GET", GOALS, { status: 404 });
    // Volume irréaliste, uniquement pour prouver que la limite s'applique.
    const ids = Array.from(
      { length: 400 },
      (_, index) => `ari:cloud:townsquare:site:goal/${"x".repeat(100)}-${index}`,
    );
    await expect(pin(jira, ids)).rejects.toMatchObject({ info: { kind: "propertyTooLarge" } });
    expect(jira.sent("PUT")).toEqual([]);
  });
});

describe("document Jira partagé entre versions", () => {
  it("un rattachement du mode texte garde les clés que cette version ne connaît pas", async () => {
    const jira = new FakeJira()
      .on("GET", GOALS, {
        status: 200,
        json: { value: { version: 1, goals: [], links: {}, futurChamp: [1, 2] } },
      })
      .on("PUT", GOALS, { status: 200 });
    const { reader, writer } = setup(jira);
    await linkToTextGoal(reader, writer, {
      sprintId: 42,
      issueKey: "ABC-1",
      goalId: "g1",
      knownGoalId: null,
      goals: [makeSprintGoal({ id: "g1", title: "Paiement", position: 0, color: "goal1" })],
      accountId: null,
      now: NOW,
    });
    expect(jira.sent("PUT")[0]?.body).toMatchObject({
      futurChamp: [1, 2],
      links: { "ABC-1": "g1" },
    });
  });

  it("un rattachement du mode texte n'écrase pas une valeur qui n'est pas un objet JSON", async () => {
    const jira = new FakeJira().on("GET", GOALS, { status: 200, json: { value: "texte" } });
    const { reader, writer } = setup(jira);
    await expect(
      linkToTextGoal(reader, writer, {
        sprintId: 42,
        issueKey: "ABC-1",
        goalId: null,
        knownGoalId: null,
        goals: [],
        accountId: null,
        now: NOW,
      }),
    ).rejects.toMatchObject({ info: { kind: "decoding" } });
    expect(jira.sent("PUT")).toEqual([]);
  });
});

describe("rattachement du texte : matrice de la propriété partagée", () => {
  const goals = [
    makeSprintGoal({ id: "g1", title: "Paiement", position: 0 }),
    makeSprintGoal({ id: "g2", title: "Stabilité", position: 1 }),
    makeSprintGoal({ id: "g3", title: "Recherche", position: 2 }),
  ];
  const link = (jira: FakeJira, goalId: string | null, knownGoalId: string | null = null) => {
    const { reader, writer } = setup(jira);
    return linkToTextGoal(reader, writer, {
      sprintId: 42,
      issueKey: "ABC-1",
      goalId,
      knownGoalId,
      goals,
      accountId: "compte-1",
      now: NOW,
    });
  };
  const stored = (value: unknown) => ({ status: 200, json: { key: "k", value } });

  it("version inconnue : rien n'est écrit, refus de décodage, aucune nouvelle tentative", async () => {
    const jira = new FakeJira().on(
      "GET",
      GOALS,
      stored({ version: 2, goals: [], links: {}, nouveau: true }),
    );
    await expect(link(jira, "g1")).rejects.toMatchObject({ info: { kind: "decoding" } });
    expect(jira.sent("PUT")).toEqual([]);
    expect(jira.sent("GET", GOALS)).toHaveLength(1);
  });

  it("champs inconnus d'un objectif et de la racine écrits inchangés", async () => {
    const jira = new FakeJira()
      .on(
        "GET",
        GOALS,
        stored({
          version: 1,
          goals: [{ id: "g1", title: "Paiement", color: "goal1", position: 0, extra: 1 }],
          links: {},
          future: {},
        }),
      )
      .on("PUT", GOALS, { status: 200 });
    expect(await link(jira, "g1")).toEqual({ kind: "linked" });
    expect(jira.sent("PUT")[0]?.body).toMatchObject({
      future: {},
      goals: [{ id: "g1", extra: 1 }, { id: "g2" }, { id: "g3" }],
      links: { "ABC-1": "g1" },
    });
  });

  it("autre lien modifié dans Jira : fusion, le lien du collègue est conservé", async () => {
    const jira = new FakeJira()
      .on("GET", GOALS, stored({ version: 1, goals: [], links: { "ABC-2": "g2" } }))
      .on("PUT", GOALS, { status: 200 });
    expect(await link(jira, "g1")).toEqual({ kind: "linked" });
    expect(jira.sent("PUT")[0]?.body).toMatchObject({ links: { "ABC-1": "g1", "ABC-2": "g2" } });
    expect(jira.sent("PUT")).toHaveLength(1);
  });

  it("même lien modifié dans Jira depuis le chargement : conflit, rien n'est écrit", async () => {
    const jira = new FakeJira().on(
      "GET",
      GOALS,
      stored({ version: 1, goals: [], links: { "ABC-1": "g3" } }),
    );
    expect(await link(jira, "g2", "g1")).toEqual({ kind: "conflict", current: "g3" });
    expect(jira.requests.filter((r) => r.method !== "GET")).toEqual([]);
  });

  it("détachement refusé si le lien du ticket a changé dans Jira", async () => {
    const jira = new FakeJira().on(
      "GET",
      GOALS,
      stored({ version: 1, goals: [], links: { "ABC-1": "g3" } }),
    );
    expect(await link(jira, null, "g1")).toEqual({ kind: "conflict", current: "g3" });
    expect(jira.sent("PUT")).toEqual([]);
  });

  it("lien connu retiré dans Jira depuis le chargement : conflit", async () => {
    const jira = new FakeJira().on("GET", GOALS, stored({ version: 1, goals: [], links: {} }));
    expect(await link(jira, "g2", "g1")).toEqual({ kind: "conflict", current: null });
    expect(jira.sent("PUT")).toEqual([]);
  });

  it("base inconnue (knownGoalId absent) : fusion sur Jira frais, sans contrôle", async () => {
    const jira = new FakeJira()
      .on("GET", GOALS, stored({ version: 1, goals: [], links: { "ABC-1": "g3", "ABC-2": "g2" } }))
      .on("PUT", GOALS, { status: 200 });
    const { reader, writer } = setup(jira);
    const outcome = await linkToTextGoal(reader, writer, {
      sprintId: 42,
      issueKey: "ABC-1",
      goalId: "g1",
      goals,
      accountId: "compte-1",
      now: NOW,
    });
    expect(outcome).toEqual({ kind: "linked" });
    expect(jira.sent("PUT")[0]?.body).toMatchObject({ links: { "ABC-1": "g1", "ABC-2": "g2" } });
    expect(jira.sent("PUT")).toHaveLength(1);
  });

  it("rien à changer hors horodatage : aucune écriture", async () => {
    const jira = new FakeJira().on(
      "GET",
      GOALS,
      stored({
        version: 1,
        goals: goals.map(({ id, title, position }) => ({
          id,
          title,
          position,
          color: `goal${position + 1}`,
        })),
        links: { "ABC-1": "g1" },
        atlassianGoalIds: [],
        updatedAt: "2026-01-01T00:00:00Z",
      }),
    );
    expect(await link(jira, "g1", "g1")).toEqual({ kind: "unchanged" });
    expect(jira.sent("PUT")).toEqual([]);
  });
});

describe("épinglage : matrice de la propriété partagée", () => {
  const PAIEMENT = "ari:cloud:townsquare:c:goal/paiement";
  const stored = (value: unknown) => ({ status: 200, json: { key: "k", value } });
  const pin = (jira: FakeJira) => {
    const { reader, writer } = setup(jira);
    return pinAtlassianGoals(reader, writer, {
      sprintId: 42,
      shownGoalIds: [],
      goalIds: [PAIEMENT],
      accountId: "compte-1",
      now: NOW,
    });
  };

  it("version inconnue : rien n'est écrit", async () => {
    const jira = new FakeJira().on("GET", GOALS, stored({ version: 2, atlassianGoalIds: [] }));
    await expect(pin(jira)).rejects.toMatchObject({ info: { kind: "decoding" } });
    expect(jira.sent("PUT")).toEqual([]);
  });

  it("champs inconnus d'un objectif conservés", async () => {
    const jira = new FakeJira()
      .on(
        "GET",
        GOALS,
        stored({
          version: 1,
          goals: [{ id: "g1", title: "Paiement", color: "goal1", position: 0, extra: 1 }],
          future: {},
        }),
      )
      .on("PUT", GOALS, { status: 200 });
    expect((await pin(jira)).kind).toBe("pinned");
    expect(jira.sent("PUT")[0]?.body).toMatchObject({
      future: {},
      goals: [{ id: "g1", extra: 1 }],
      atlassianGoalIds: [PAIEMENT],
    });
  });
});
