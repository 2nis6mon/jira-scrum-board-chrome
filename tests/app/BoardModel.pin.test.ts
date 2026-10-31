import { describe, expect, it, vi } from "vitest";
import { auditText } from "../../src/app/model/auditLog";
import { BoardModel } from "../../src/app/model/BoardModel";
import { loadActiveBoard } from "../../src/app/model/boardStore";
import { withLocalPins } from "../../src/core/boardPreferences";
import { boardLocalPinnedGoalIds } from "../../src/core/pinnedGoals";
import { localize } from "../../src/i18n";
import { normalizeSiteUrl } from "../../src/jira/site";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { atlassianGoalsPlatform } from "../support/atlassianGoalsBoard";
import { BOARD_URL, boardSiteJira, GOALS_DOCUMENT } from "../support/boardFixture";
import { isWriteRequest, type RecordedRequest, type Reply } from "../support/fakeJira";
import { type FakeGoal, goalsGateway } from "../support/goalsGateway";
import { issueJson } from "../support/jiraFixtures";

const SITE = normalizeSiteUrl("acme.atlassian.net");
const PROPERTY = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`;
const PAIEMENT = "ari:cloud:townsquare:c:goal/paiement";
const STABILITE = "ari:cloud:townsquare:c:goal/stabilite";
const SECURITE = "ari:cloud:townsquare:c:goal/securite";
const ARCHIVE = "ari:cloud:townsquare:c:goal/archive";

// Données FICTIVES. « Sécurité » n'a aucun ticket : seul l'épinglage l'affiche.
const GOALS: FakeGoal[] = [
  { id: PAIEMENT, key: "GOAL-1", name: "Paiement en une étape", workItems: ["ABC-101"] },
  { id: STABILITE, key: "GOAL-2", name: "Zéro incident", workItems: ["ABC-103"] },
  { id: SECURITE, key: "GOAL-3", name: "Sécurité des comptes", status: "on_track" },
  { id: ARCHIVE, key: "GOAL-4", name: "Ancien objectif", isArchived: true },
];

/** Propriété du sprint qui garde ce qu'on y écrit, comme Jira. */
function sprintProperty(initial: Record<string, unknown>) {
  const state = { value: initial as unknown };
  return {
    state,
    get: (): Reply => ({
      status: 200,
      json: { key: SPRINT_PROPERTY_KEYS.goals, value: state.value },
    }),
    put: (request: RecordedRequest): Reply => {
      state.value = request.body;
      return { status: 200 };
    },
  };
}

async function pinBoard(options: { put?: Reply; initial?: Record<string, unknown> } = {}) {
  const property = sprintProperty(options.initial ?? { ...GOALS_DOCUMENT });
  const jira = boardSiteJira({ graphql: goalsGateway({ goals: GOALS }) })
    .on("GET", PROPERTY, () => property.get())
    .on("PUT", PROPERTY, (request) => options.put ?? property.put(request));
  const board = new BoardModel(SITE, await atlassianGoalsPlatform(jira), {
    now: () => new Date("2026-09-18T10:00:00Z"),
  });
  await board.load();
  await board.detect(BOARD_URL);
  return { board, jira, property };
}

async function openWithSiteGoals(board: BoardModel) {
  board.openPinEditor();
  await vi.waitFor(() => expect(board.siteGoals.value).not.toBeNull());
}

describe("BoardModel — épinglage de Goals au sprint", () => {
  it("Scrum : le droit de modifier le board reste distinct du droit de gérer les sprints", async () => {
    const { board } = await pinBoard();
    board.canEditBoard.value = false;
    expect(board.canPinGoals.value).toBe(true);
    board.openPinEditor();
    expect(board.pinEditor.value?.sprintId).toBe(42);
  });

  it("la fenêtre part de la sélection lue dans Jira et charge les Goals du site", async () => {
    const { board } = await pinBoard({
      initial: { ...GOALS_DOCUMENT, atlassianGoalIds: [STABILITE] },
    });
    expect(board.canPinGoals.value).toBe(true);

    await openWithSiteGoals(board);

    expect(board.pinEditor.value).toMatchObject({
      sprintId: 42,
      sprintName: "Sprint 42",
      base: [STABILITE],
      selection: [STABILITE],
      saving: false,
      notice: null,
    });
    expect(board.siteGoals.value?.map((goal) => goal.id)).toEqual([
      PAIEMENT,
      STABILITE,
      SECURITE,
      ARCHIVE,
    ]);
  });

  it("composer la sélection n'écrit rien ; fermer la fenêtre non plus", async () => {
    const { board, jira } = await pinBoard();
    const before = jira.requests.length;
    await openWithSiteGoals(board);
    board.togglePinned(SECURITE);
    board.togglePinned(PAIEMENT);
    board.togglePinned(SECURITE);
    expect(board.pinEditor.value?.selection).toEqual([PAIEMENT]);

    board.closePinEditor();
    expect(board.pinEditor.value).toBeNull();
    expect(jira.requests.slice(before).filter(isWriteRequest)).toEqual([]);
  });

  it("enregistrer : UNE écriture de la propriété, puis le Goal sans ticket apparaît", async () => {
    const { board, jira } = await pinBoard();
    await openWithSiteGoals(board);
    board.togglePinned(SECURITE);
    const before = jira.requests.length;

    await board.savePinnedGoals();

    const writes = jira.requests.slice(before).filter(isWriteRequest);
    expect(writes.map((r) => `${r.method} ${r.path}`)).toEqual([`PUT ${PROPERTY}`]);
    expect(writes[0]?.body).toMatchObject({
      goals: GOALS_DOCUMENT.goals,
      links: GOALS_DOCUMENT.links,
      atlassianGoalIds: [SECURITE],
      updatedBy: "u1",
    });
    expect(board.pinEditor.value).toBeNull();
    expect(board.snapshot.value?.pinnedGoalIds).toEqual([SECURITE]);
    // L'épinglé en premier ; ceux que portent les tickets restent affichés.
    expect(board.layout.value?.lanes.map((lane) => lane.title)).toEqual([
      "Sécurité des comptes",
      "Paiement en une étape",
      "Zéro incident",
      "Build",
      "Anomalie Prod",
    ]);
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({
      action: "épinglage",
      issueKey: null,
      to: null,
      toMessage: { key: "{p0} Goal épinglé", params: { p0: 1 } },
      outcome: "réussi",
    });
  });

  it("sélection modifiée dans Jira entre-temps : rien n'est écrasé, la fenêtre repart de Jira", async () => {
    const { board, jira, property } = await pinBoard();
    await openWithSiteGoals(board);
    board.togglePinned(SECURITE);
    // Quelqu'un épingle un autre Goal depuis un autre poste pendant ce temps.
    property.state.value = { ...GOALS_DOCUMENT, atlassianGoalIds: [STABILITE] };

    await board.savePinnedGoals();

    expect(jira.sent("PUT", PROPERTY)).toEqual([]);
    expect(board.pinEditor.value).toMatchObject({
      base: [STABILITE],
      selection: [STABILITE],
      saving: false,
      notice: { tone: "warning" },
    });
    expect(board.pinEditor.value?.notice?.suggestion).toContain("Rien n'a été écrit");
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({ action: "épinglage", outcome: "échec" });
    expect(entry && auditText(entry, "detail", "fr")).toBe(
      "conflit : sélection modifiée dans Jira",
    );
  });

  it("refus de droits : une seule tentative, la fenêtre reste ouverte et dit pourquoi", async () => {
    const { board, jira } = await pinBoard({
      put: { status: 403, json: { errorMessages: ["Manage Sprints requis"] } },
    });
    await openWithSiteGoals(board);
    board.togglePinned(SECURITE);

    await board.savePinnedGoals();

    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(board.pinEditor.value?.selection).toEqual([SECURITE]);
    expect(board.pinEditor.value?.notice).toMatchObject({ tone: "error" });
    expect(board.pinEditor.value?.notice?.suggestion).toContain("gérer les sprints");
    expect(board.snapshot.value?.pinnedGoalIds).toEqual([]);
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({ action: "épinglage", outcome: "échec", detail: null });
    // La cause gardée au journal est le texte de l'erreur Jira, comme dans la fenêtre.
    expect(entry && auditText(entry, "detail", "fr")).toBe(board.pinEditor.value?.notice?.text);
    expect(entry && auditText(entry, "detail", "fr")).toContain("Manage Sprints requis");
  });

  it("issue incertaine : jamais rejouée, et on le dit", async () => {
    const { board, jira } = await pinBoard({ put: { networkError: "Failed to fetch" } });
    await openWithSiteGoals(board);
    board.togglePinned(SECURITE);

    await board.savePinnedGoals();

    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(board.pinEditor.value?.notice).toMatchObject({ tone: "warning" });
    expect(board.pinEditor.value?.notice?.text).toContain("n'a pas confirmé");
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({ action: "épinglage", outcome: "incertain" });
    expect(entry && auditText(entry, "detail", "fr")).toBe("Connexion à Jira impossible.");
    expect(entry && auditText(entry, "detail", "en")).toBe(
      localize("Connexion à Jira impossible.", "en"),
    );
  });

  it("changement de board pendant l'enregistrement : la fenêtre de l'ancien sprint ne revient pas", async () => {
    const { board, jira } = await pinBoard();
    await openWithSiteGoals(board);
    board.togglePinned(SECURITE);
    // Pendant la requête, l'utilisateur change de board (`detect` ferme la fenêtre), puis Jira
    // refuse : le refus ne doit pas rouvrir la fenêtre du sprint précédent.
    jira.on("PUT", PROPERTY, () => {
      board.pinEditor.value = null;
      return { status: 403, json: {} };
    });

    await board.savePinnedGoals();

    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(board.pinEditor.value).toBeNull();
  });

  it("indisponible quand les objectifs affichés sont ceux du texte du sprint", async () => {
    const board = new BoardModel(SITE, await atlassianGoalsPlatform(boardSiteJira()));
    await board.load();
    await board.detect(BOARD_URL);
    expect(board.snapshot.value?.goalsOrigin).toBe("sprintText");
    expect(board.canPinGoals.value).toBe(false);
    board.openPinEditor();
    expect(board.pinEditor.value).toBeNull();
  });

  it("indisponible quand la propriété du sprint n'a pas pu être lue", async () => {
    const jira = boardSiteJira({ graphql: goalsGateway({ goals: GOALS }) }).on("GET", PROPERTY, {
      status: 400,
      json: { errorMessages: ["Refus"] },
    });
    const board = new BoardModel(SITE, await atlassianGoalsPlatform(jira));
    await board.load();
    await board.detect(BOARD_URL);
    expect(board.snapshot.value?.goalsOrigin).toBe("atlassianGoals");
    expect(board.snapshot.value?.pinnedGoalIds).toBeNull();
    expect(board.canPinGoals.value).toBe(false);
  });
});

describe("BoardModel — épinglage gardé dans ce navigateur quand Jira refuse", () => {
  /** Board dont la propriété refuse l'écriture tant que `refuse` est vrai (droits manquants). */
  async function refusingBoard() {
    const property = sprintProperty({ ...GOALS_DOCUMENT });
    const rights = { refuse: true };
    const jira = boardSiteJira({ graphql: goalsGateway({ goals: GOALS }) })
      .on("GET", PROPERTY, () => property.get())
      .on("PUT", PROPERTY, (request) =>
        rights.refuse
          ? { status: 403, json: { errorMessages: ["Manage Sprints requis"] } }
          : property.put(request),
      );
    const platform = await atlassianGoalsPlatform(jira);
    const board = new BoardModel(SITE, platform, { now: () => new Date("2026-09-18T10:00:00Z") });
    await board.load();
    await board.detect(BOARD_URL);
    return { board, jira, property, rights, platform };
  }

  const laneTitles = (board: BoardModel) => board.layout.value?.lanes.map((lane) => lane.title);

  it("refus de droits : la sélection peut être gardée localement, sans rien écrire de plus", async () => {
    const { board, jira, platform } = await refusingBoard();
    await openWithSiteGoals(board);
    board.togglePinned(SECURITE);
    await board.savePinnedGoals();
    expect(board.pinEditor.value?.canKeepLocally).toBe(true);
    const puts = jira.sent("PUT", PROPERTY).length;

    await board.keepPinnedLocally();

    expect(jira.sent("PUT", PROPERTY)).toHaveLength(puts);
    expect(board.pinEditor.value).toBeNull();
    expect(board.snapshot.value?.pinnedGoalIds).toEqual([]);
    expect(board.snapshot.value?.localPinnedGoalIds).toEqual([SECURITE]);
    expect(laneTitles(board)?.[0]).toBe("Sécurité des comptes");
    const stored = await loadActiveBoard(platform.store, SITE.origin);
    expect(stored?.localPinnedGoalIds).toEqual({ "42": [SECURITE] });
  });

  it("la sélection de Jira fait foi : la sélection locale ne sert que si Jira n'en a aucune", async () => {
    const { board, property } = await refusingBoard();
    await openWithSiteGoals(board);
    board.togglePinned(SECURITE);
    await board.savePinnedGoals();
    await board.keepPinnedLocally();

    property.state.value = { ...GOALS_DOCUMENT, atlassianGoalIds: [STABILITE] };
    await board.sync();
    expect(board.snapshot.value?.localPinnedGoalIds).toBeNull();
    expect(board.snapshot.value?.pinnedGoalIds).toEqual([STABILITE]);
    expect(laneTitles(board)).not.toContain("Sécurité des comptes");
  });

  it("réessayer : la fenêtre repart de la sélection locale ; enregistrée dans Jira, elle est oubliée", async () => {
    const { board, rights, platform } = await refusingBoard();
    await openWithSiteGoals(board);
    board.togglePinned(SECURITE);
    await board.savePinnedGoals();
    await board.keepPinnedLocally();

    rights.refuse = false;
    board.openPinEditor();
    expect(board.pinEditor.value).toMatchObject({
      base: [],
      selection: [SECURITE],
      fromLocal: true,
    });
    await board.savePinnedGoals();

    expect(board.pinEditor.value).toBeNull();
    expect(board.snapshot.value?.pinnedGoalIds).toEqual([SECURITE]);
    expect(board.snapshot.value?.localPinnedGoalIds).toBeNull();
    expect((await loadActiveBoard(platform.store, SITE.origin))?.localPinnedGoalIds).toEqual({});
  });

  it("oublier la sélection locale : l'objectif épinglé sans ticket disparaît", async () => {
    const { board } = await refusingBoard();
    await openWithSiteGoals(board);
    board.togglePinned(SECURITE);
    await board.savePinnedGoals();
    await board.keepPinnedLocally();
    expect(laneTitles(board)).toContain("Sécurité des comptes");

    await board.forgetLocalPins();
    expect(board.snapshot.value?.localPinnedGoalIds).toBeNull();
    expect(laneTitles(board)).not.toContain("Sécurité des comptes");
  });

  it("issue incertaine : pas de repli local proposé", async () => {
    const { board } = await pinBoard({ put: { networkError: "Failed to fetch" } });
    await openWithSiteGoals(board);
    board.togglePinned(SECURITE);
    await board.savePinnedGoals();
    expect(board.pinEditor.value?.canKeepLocally).toBe(false);
    await board.keepPinnedLocally();
    expect(board.pinEditor.value).not.toBeNull();
    expect(board.snapshot.value?.localPinnedGoalIds).toBeNull();
  });
});

describe("BoardModel — épinglage sur le sprint de mon choix", () => {
  const SECOND = `/rest/agile/1.0/sprint/43/properties/${SPRINT_PROPERTY_KEYS.goals}`;
  const sprintJson = (id: number, parts: Record<string, unknown> = {}) => ({
    id,
    name: `Sprint ${id}`,
    state: "active",
    startDate: "2026-09-14T08:00:00.000+0200",
    endDate: "2026-09-25T18:00:00.000+0200",
    ...parts,
  });

  /** Sprints du board 42 et 43, et un sprint étranger 77 remonté par un ticket partagé. */
  async function twoSprintBoard(options: { second?: Reply; secondPut?: Reply } = {}) {
    const main = sprintProperty({ ...GOALS_DOCUMENT });
    const second = sprintProperty({ version: 1, goals: [], links: {} });
    const jira = boardSiteJira({ graphql: goalsGateway({ goals: GOALS }) })
      .on("GET", "/rest/agile/1.0/board/7/sprint", {
        status: 200,
        json: {
          isLast: true,
          values: [
            sprintJson(42),
            sprintJson(43, { startDate: "2026-09-15T08:00:00.000+0200" }),
            sprintJson(77, { originBoardId: 99, startDate: "2026-09-10T08:00:00.000+0200" }),
          ],
        },
      })
      .on("GET", "/rest/agile/1.0/board/7/sprint/43/issue", {
        status: 200,
        json: { issues: [issueJson("ABC-201", { statusId: "1" })], total: 1 },
      })
      .on("GET", "/rest/agile/1.0/board/7/sprint/77/issue", {
        status: 200,
        json: { issues: [issueJson("ABC-301", { statusId: "1" })], total: 1 },
      })
      .on("GET", PROPERTY, () => main.get())
      .on("PUT", PROPERTY, (request) => main.put(request))
      .on("GET", SECOND, () => options.second ?? second.get())
      .on("PUT", SECOND, (request) => options.secondPut ?? second.put(request));
    const platform = await atlassianGoalsPlatform(jira);
    const board = new BoardModel(SITE, platform, { now: () => new Date("2026-09-18T10:00:00Z") });
    await board.load();
    await board.detect(BOARD_URL);
    return { board, jira, main, second, platform };
  }

  it("propose les sprints du board, le principal présélectionné, jamais l'étranger", async () => {
    const { board } = await twoSprintBoard();
    expect(board.snapshot.value?.activeSprints.map((sprint) => sprint.id)).toEqual([42, 43, 77]);
    expect(board.pinnableSprints.value.map((sprint) => sprint.id)).toEqual([42, 43]);
    expect(board.pinStorage.value).toMatchObject({ kind: "sprint", sprintId: 42 });
    board.choosePinSprint(77);
    expect(board.pinSprintId.value).toBeNull();
  });

  it("enregistrer sur le second sprint : une écriture sur 43, 42 inchangé, swimlane affichée", async () => {
    const { board, jira, main } = await twoSprintBoard();
    await openWithSiteGoals(board);
    board.choosePinSprint(43);
    expect(board.pinEditor.value).toMatchObject({ sprintId: 43, base: [], selection: [] });
    board.togglePinned(SECURITE);
    const before = jira.requests.length;

    await board.savePinnedGoals();

    const writes = jira.requests.slice(before).filter(isWriteRequest);
    expect(writes.map((r) => `${r.method} ${r.path}`)).toEqual([`PUT ${SECOND}`]);
    expect(writes[0]?.body).toMatchObject({ atlassianGoalIds: [SECURITE] });
    expect(main.state.value).toEqual({ ...GOALS_DOCUMENT });
    expect(board.snapshot.value?.sprintPinnedGoalIds).toEqual({ 42: [], 43: [SECURITE] });
    expect(board.layout.value?.lanes.map((lane) => lane.title)).toContain("Sécurité des comptes");
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({ action: "épinglage", outcome: "réussi" });
    // Le journal nomme le sprint qui a reçu l'écriture.
    expect(entry && auditText(entry, "detail", "fr")).toBe("propriété du sprint « Sprint 43 »");
    expect(entry && auditText(entry, "detail", "en")).toBe("property of sprint ‘Sprint 43’");

    // Après relecture, le brouillon non modifié se recale sur 43, pas sur le sprint principal.
    await board.sync();
    board.openPinEditor();
    expect(board.pinEditor.value).toMatchObject({ sprintId: 43, base: [SECURITE] });
  });

  it("brouillon modifié ou en cours d'écriture : le choix du sprint est sans effet", async () => {
    const { board } = await twoSprintBoard();
    await openWithSiteGoals(board);
    board.togglePinned(SECURITE);
    expect(board.pinSprintLocked.value).toBe(true);
    board.choosePinSprint(43);
    expect(board.pinSprintId.value).toBeNull();
    expect(board.pinEditor.value).toMatchObject({ sprintId: 42, selection: [SECURITE] });

    // Annuler libère le choix.
    board.openPinEditor();
    expect(board.pinSprintLocked.value).toBe(false);
    board.choosePinSprint(43);
    expect(board.pinEditor.value?.sprintId).toBe(43);
  });

  it("brouillon parti du repli local : le choix du sprint reste libre sans modification", async () => {
    const { board } = await twoSprintBoard();
    await board.applySettings((current) => withLocalPins(current, 43, [SECURITE]), {
      resync: true,
    });
    await openWithSiteGoals(board);
    board.choosePinSprint(43);
    expect(board.pinEditor.value).toMatchObject({
      sprintId: 43,
      base: [],
      selection: [SECURITE],
      fromLocal: true,
    });
    expect(board.pinSprintLocked.value).toBe(false);
    board.togglePinned(PAIEMENT);
    expect(board.pinSprintLocked.value).toBe(true);
    // « Annuler » repart du repli local et libère le choix.
    board.openPinEditor();
    expect(board.pinSprintLocked.value).toBe(false);
    board.choosePinSprint(42);
    expect(board.pinEditor.value?.sprintId).toBe(42);
  });

  it("propriété du sprint choisi devenue illisible avec un brouillon modifié : choix libéré", async () => {
    const options: { second?: Reply } = {};
    const { board } = await twoSprintBoard(options);
    await openWithSiteGoals(board);
    board.choosePinSprint(43);
    board.togglePinned(SECURITE);
    expect(board.pinSprintLocked.value).toBe(true);

    options.second = { status: 400, json: {} };
    await board.sync();

    expect(board.canPinGoals.value).toBe(false);
    expect(board.pinSprintLocked.value).toBe(false);
    board.choosePinSprint(42);
    expect(board.pinEditor.value).toMatchObject({ sprintId: 42, base: [], selection: [] });
  });

  it("sprint choisi disparu avec un brouillon modifié : le brouillon de l'ancien sprint est fermé", async () => {
    const { board, jira } = await twoSprintBoard();
    await openWithSiteGoals(board);
    board.choosePinSprint(43);
    board.togglePinned(SECURITE);
    jira.on("GET", "/rest/agile/1.0/board/7/sprint", {
      status: 200,
      json: { isLast: true, values: [sprintJson(42)] },
    });

    await board.sync();

    expect(board.pinSprintId.value).toBeNull();
    expect(board.pinEditor.value).toBeNull();
    await board.savePinnedGoals();
    expect(jira.sent("PUT", SECOND)).toEqual([]);
  });

  it("conflit sur le second sprint : rien d'écrit, brouillon recalé sur Jira", async () => {
    const { board, jira, second } = await twoSprintBoard();
    await openWithSiteGoals(board);
    board.choosePinSprint(43);
    board.togglePinned(SECURITE);
    second.state.value = { version: 1, goals: [], links: {}, atlassianGoalIds: [STABILITE] };

    await board.savePinnedGoals();

    expect(jira.sent("PUT", SECOND)).toEqual([]);
    expect(jira.sent("PUT", PROPERTY)).toEqual([]);
    expect(board.pinEditor.value).toMatchObject({
      sprintId: 43,
      base: [STABILITE],
      selection: [STABILITE],
      notice: { tone: "warning" },
    });
  });

  it("propriété du second sprint illisible : il n'est pas épinglable", async () => {
    const { board } = await twoSprintBoard({ second: { status: 400, json: {} } });
    expect(board.pinnableSprints.value.map((sprint) => sprint.id)).toEqual([42, 43]);
    board.choosePinSprint(43);
    expect(board.pinStorage.value).toMatchObject({ sprintId: 43 });
    expect(board.canPinGoals.value).toBe(false);
    board.openPinEditor();
    expect(board.pinEditor.value).toBeNull();
    // Retour au sprint principal possible.
    board.choosePinSprint(42);
    expect(board.canPinGoals.value).toBe(true);
  });

  it("sprint choisi disparu après relecture : retour au sprint principal", async () => {
    const { board, jira } = await twoSprintBoard();
    board.choosePinSprint(43);
    expect(board.pinSprintId.value).toBe(43);
    jira.on("GET", "/rest/agile/1.0/board/7/sprint", {
      status: 200,
      json: { isLast: true, values: [sprintJson(42)] },
    });
    await board.sync();
    expect(board.pinSprintId.value).toBeNull();
    expect(board.pinStorage.value).toMatchObject({ sprintId: 42 });
  });

  it("repli local par sprint : gardé pour 43, bannière cumulée, « Oublier » efface tout", async () => {
    const { board, jira, platform } = await twoSprintBoard({
      secondPut: { status: 403, json: { errorMessages: ["Manage Sprints requis"] } },
    });
    await openWithSiteGoals(board);
    board.choosePinSprint(43);
    board.togglePinned(SECURITE);
    await board.savePinnedGoals();
    expect(jira.sent("PUT", SECOND)).toHaveLength(1);
    expect(board.pinEditor.value?.canKeepLocally).toBe(true);

    await board.keepPinnedLocally();

    expect((await loadActiveBoard(platform.store, SITE.origin))?.localPinnedGoalIds).toEqual({
      "43": [SECURITE],
    });
    expect(board.snapshot.value?.sprintLocalPinnedGoalIds).toEqual({ 43: [SECURITE] });
    expect(board.snapshot.value?.localPinnedGoalIds).toBeNull();
    expect(board.layout.value?.lanes.map((lane) => lane.title)).toContain("Sécurité des comptes");
    board.openPinEditor();
    expect(board.pinEditor.value).toMatchObject({ sprintId: 43, fromLocal: true });

    // Un repli aussi sur le sprint principal : la bannière les cumule.
    await board.applySettings((current) => withLocalPins(current, 42, [PAIEMENT]), {
      resync: true,
    });
    expect(boardLocalPinnedGoalIds(board.snapshot.value)).toEqual([PAIEMENT, SECURITE]);

    await board.forgetLocalPins();
    expect((await loadActiveBoard(platform.store, SITE.origin))?.localPinnedGoalIds).toEqual({});
    expect(boardLocalPinnedGoalIds(board.snapshot.value)).toBeNull();
    expect(board.snapshot.value?.sprintLocalPinnedGoalIds).toBeUndefined();
  });
});
