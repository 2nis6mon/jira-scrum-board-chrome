import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { boardSiteJira, SPRINT_GOAL_TEXT } from "./boardFixture";
import { type FakeJira, isWriteRequest, type RecordedRequest, type Reply } from "./fakeJira";
import { issueJson } from "./jiraFixtures";

// Sprint Planning FICTIF et évolutif. Les écritures du navigateur restent dans cette mémoire.
export const PLANNING_GOAL_TEXT = "🎯 Simplifier le paiement\n🎯 Rendre le panier plus rapide";

export const PLANNING_BACKLOG = [
  issueJson("ABC-201", {
    summary: "Mémoriser le moyen de paiement préféré",
    statusId: "1",
    statusName: "À faire",
    category: "new",
    points: 5,
    parent: "ABC-90",
  }),
  issueJson("ABC-202", {
    summary: "Charger le panier sans attendre les recommandations",
    statusId: "1",
    statusName: "À faire",
    category: "new",
    points: 3,
    parent: "ABC-91",
  }),
  issueJson("ABC-203", {
    summary: "Rendre les erreurs de paiement compréhensibles",
    statusId: "1",
    statusName: "À faire",
    category: "new",
  }),
  issueJson("ABC-204", {
    summary: "Conserver le panier entre deux visites",
    statusId: "1",
    statusName: "À faire",
    category: "new",
    points: 8,
  }),
];

const ALREADY_PLANNED = issueJson("ABC-210", {
  summary: "Ajouter un récapitulatif du panier accessible",
  statusId: "1",
  statusName: "À faire",
  category: "new",
  points: 2,
});

/** Ticket du sprint futur 44 (option `otherFutureSprint`). */
const IN_OTHER_SPRINT = issueJson("ABC-220", {
  summary: "Afficher les frais de livraison avant le paiement",
  statusId: "1",
  statusName: "À faire",
  category: "new",
  points: 3,
});

/** Ticket non terminé du second sprint actif 45 (option `secondActiveSprint`). */
const IN_SECOND_ACTIVE = issueJson("ABC-301", {
  summary: "Envoyer la confirmation de commande par SMS",
  statusId: "3",
  statusName: "En cours",
  category: "indeterminate",
  points: 5,
});

/** Objectif du sprint actif 45, rattaché à son ticket non terminé. */
export const SECOND_ACTIVE_GOAL = "Fiabiliser les notifications";

/**
 * Installe les routes après celles du board, pour préserver les lectures du sprint actif 42.
 * `issueFields` ajoute des champs à des tickets (par clé), sur une copie ; `otherFutureSprint`
 * ajoute le sprint futur 44 et son ticket, où l'on peut prendre ou envoyer des tickets ;
 * `secondActiveSprint` ajoute le sprint actif 45, dont l'objectif a un ticket non terminé.
 */
export function planningFixture(
  jira: FakeJira = boardSiteJira(),
  options: {
    issueFields?: Readonly<Record<string, Record<string, unknown>>>;
    otherFutureSprint?: boolean;
    secondActiveSprint?: boolean;
    /**
     * Sprints clos 41 et 40, dont l'objectif « Simplifier le paiement » (`g-pay`) a été reporté
     * jusqu'au sprint 43 ; sa propriété porte alors les identifiants `g-pay` et `g-cart`.
     */
    closedSprints?: boolean;
    /**
     * Sprint futur 46 d'un autre board (origine 9, projet XYZ), remonté par le filtre, avec un ticket
     * du board ; `"empty"` : sans aucun ticket du board ; `"done"` : son seul ticket du board est
     * dans la dernière colonne.
     */
    foreignFutureSprint?: boolean | "empty" | "done";
    /**
     * Droits de l'utilisateur : administrateur de Jira, et « Gérer les sprints » par projet
     * (`error` : lecture refusée). Par défaut : non administrateur, droit sur ABC, pas sur XYZ.
     */
    permissions?: {
      administrator?: boolean;
      manageSprints?: Readonly<Record<string, boolean | "error">>;
    };
  } = {},
) {
  const sprint = {
    id: 43,
    name: "Sprint 43 — Paiement sans friction",
    state: "future",
    originBoardId: 7,
    goal: PLANNING_GOAL_TEXT,
  };
  const activeSprint = {
    id: 42,
    name: "Sprint 42",
    state: "active",
    originBoardId: 7,
    startDate: "2026-09-14T08:00:00.000+0200",
    endDate: "2026-09-25T18:00:00.000+0200",
    goal: SPRINT_GOAL_TEXT,
  };
  const otherSprint = options.otherFutureSprint
    ? {
        id: 44,
        name: "Sprint 44 — Livraison",
        state: "future",
        originBoardId: 7,
        goal: "",
      }
    : null;
  const secondActive = options.secondActiveSprint
    ? {
        id: 45,
        name: "Sprint 45 — Notifications",
        state: "active",
        originBoardId: 7,
        startDate: "2026-09-14T08:00:00.000+0200",
        endDate: "2026-09-25T18:00:00.000+0200",
        goal: `🎯 ${SECOND_ACTIVE_GOAL}`,
      }
    : null;
  const foreign = options.foreignFutureSprint
    ? { id: 46, name: "Sprint 46 — Équipe voisine", state: "future", originBoardId: 9, goal: "" }
    : null;
  const selected = new Set(["ABC-210"]);
  /** Tickets du sprint futur 44 ; un ticket déplacé (E9) quitte l'autre sprint. */
  const other = new Set(otherSprint ? ["ABC-220"] : []);
  const catalog = [
    ALREADY_PLANNED,
    ...PLANNING_BACKLOG,
    ...(otherSprint ? [IN_OTHER_SPRINT] : []),
  ].map((issue) => {
    // Copie par banc : une estimation écrite (E11) ne doit pas passer d'un test à l'autre.
    const fields = structuredClone(issue.fields) as Record<string, unknown>;
    const extra = options.issueFields?.[String(issue.key)];
    return { ...issue, fields: { ...fields, ...extra } } as Record<string, unknown>;
  });
  let document: unknown = options.closedSprints
    ? {
        version: 1,
        goals: [
          { id: "g-pay", title: "Simplifier le paiement", color: "goal1", position: 0 },
          { id: "g-cart", title: "Rendre le panier plus rapide", color: "goal2", position: 1 },
        ],
        links: {},
        atlassianGoalIds: [],
      }
    : null;
  const closedSprints = options.closedSprints
    ? [
        {
          sprint: {
            id: 41,
            name: "Sprint 41",
            state: "closed",
            originBoardId: 7,
            completeDate: "2026-09-11T18:00:00.000+0200",
            goal: "🎯 Simplifier le paiement",
          },
          links: { "ABC-150": "g-pay", "ABC-151": "g-pay" },
          issues: [
            issueJson("ABC-150", {
              summary: "Payer en un clic",
              category: "done",
              statusName: "Terminé",
              statusId: "6",
              points: 3,
            }),
            issueJson("ABC-151", {
              summary: "Afficher le total",
              category: "indeterminate",
              points: 2,
            }),
          ],
        },
        {
          sprint: {
            id: 40,
            name: "Sprint 40",
            state: "closed",
            originBoardId: 7,
            completeDate: "2026-08-28T18:00:00.000+0200",
            goal: "🎯 Simplifier le paiement",
          },
          links: { "ABC-140": "g-pay" },
          issues: [
            issueJson("ABC-140", {
              summary: "Choisir sa carte",
              category: "done",
              statusName: "Terminé",
              statusId: "6",
              points: 5,
            }),
          ],
        },
      ]
    : [];
  const property = `/rest/agile/1.0/sprint/43/properties/${SPRINT_PROPERTY_KEYS.goals}`;
  /** E9 : les tickets rejoignent `target` et quittent `source`, comme un déplacement Jira. */
  const addToSprint =
    (target: Set<string>, source: Set<string>) =>
    (request: RecordedRequest): Reply => {
      const body = request.body as { issues?: unknown } | null;
      if (
        !body ||
        !Array.isArray(body.issues) ||
        body.issues.length === 0 ||
        body.issues.length > 50 ||
        Object.keys(body).length !== 1 ||
        body.issues.some((key) => !catalog.some((issue) => issue.key === key))
      ) {
        return { status: 400, json: { errorMessages: ["Tickets hors du backlog de test"] } };
      }
      for (const key of body.issues) {
        target.add(String(key));
        source.delete(String(key));
      }
      return { status: 204 };
    };

  jira
    .on("GET", "/rest/agile/1.0/board/7/sprint", (request) => {
      const states = request.url.searchParams.get("state")?.split(",") ?? [];
      return {
        status: 200,
        json: {
          isLast: true,
          values: [
            activeSprint,
            ...(secondActive ? [secondActive] : []),
            sprint,
            ...(otherSprint ? [otherSprint] : []),
            ...(foreign ? [foreign] : []),
            ...closedSprints.map((closed) => closed.sprint),
          ].filter((item) => states.length === 0 || states.includes(item.state)),
        },
      };
    })
    .on("GET", "/rest/agile/1.0/sprint/43", () => ({ status: 200, json: sprint }))
    .on("GET", "/rest/agile/1.0/sprint/42", () => ({ status: 200, json: activeSprint }))
    .on("GET", "/rest/software/1.0/board/7/backlog", (request) => {
      // Un ticket renvoyé au backlog (E10) y réapparaît.
      const available = catalog.filter(
        (issue) => !selected.has(String(issue.key)) && !other.has(String(issue.key)),
      );
      const secondPage = request.url.searchParams.get("nextPageToken") === "planning-page-2";
      const issues = secondPage ? available.slice(2) : available.slice(0, 2);
      const isLast = secondPage || available.length <= 2;
      return {
        status: 200,
        json: { issues, isLast, ...(!isLast && { nextPageToken: "planning-page-2" }) },
      };
    })
    .on("GET", "/rest/agile/1.0/board/7/sprint/43/issue", () => {
      const issues = catalog.filter((issue) => selected.has(String(issue.key)));
      return { status: 200, json: { issues, total: issues.length } };
    })
    .on("POST", "/rest/agile/1.0/sprint/43", (request) => {
      const body = request.body as { goal?: unknown } | null;
      if (!body || typeof body.goal !== "string" || Object.keys(body).length !== 1) {
        return { status: 400, json: { errorMessages: ["Seul le texte de l'objectif est permis"] } };
      }
      sprint.goal = body.goal;
      return { status: 200, json: sprint };
    })
    .on("POST", "/rest/agile/1.0/sprint/43/issue", addToSprint(selected, other))
    // Rang du board (E2, story 8.19) : global, il réordonne le catalogue, donc sprints et backlog.
    .on("PUT", "/rest/agile/1.0/issue/rank", (request) => {
      const body = request.body as {
        issues?: unknown;
        rankBeforeIssue?: unknown;
        rankAfterIssue?: unknown;
      } | null;
      const key =
        Array.isArray(body?.issues) && body.issues.length === 1 ? String(body.issues[0]) : null;
      const reference = body?.rankBeforeIssue ?? body?.rankAfterIssue;
      const from = catalog.findIndex((issue) => issue.key === key);
      if (from < 0 || typeof reference !== "string" || reference === key)
        return { status: 400, json: { errorMessages: ["Classement invalide"] } };
      const [moved] = catalog.splice(from, 1);
      const at = catalog.findIndex((issue) => issue.key === reference);
      if (!moved || at < 0) return { status: 400, json: { errorMessages: ["Référence inconnue"] } };
      catalog.splice(body?.rankBeforeIssue !== undefined ? at : at + 1, 0, moved);
      return { status: 204 };
    })
    .on("POST", "/rest/agile/1.0/backlog/issue", (request) => {
      const body = request.body as { issues?: unknown } | null;
      if (!body || !Array.isArray(body.issues) || Object.keys(body).length !== 1)
        return { status: 400, json: { errorMessages: ["Seule la liste des tickets est permise"] } };
      for (const key of body.issues) {
        selected.delete(String(key));
        other.delete(String(key));
      }
      return { status: 204 };
    })
    .on("GET", property, () =>
      document === null ? { status: 404 } : { status: 200, json: { value: document } },
    )
    .on("PUT", property, (request) => {
      document = request.body;
      return { status: 201 };
    });
  // Estimation des tickets (E11) : lue et écrite par la ressource d'estimation du board 7.
  for (const issue of catalog) {
    const path = `/rest/agile/1.0/issue/${String(issue.key)}/estimation`;
    const fields = issue.fields as Record<string, unknown>;
    const reply = (): Reply => ({
      status: 200,
      json: {
        fieldId: "customfield_10016",
        value:
          typeof fields.customfield_10016 === "number" ? String(fields.customfield_10016) : null,
      },
    });
    jira
      .on("GET", path, (request) =>
        request.url.searchParams.get("boardId") === "7" ? reply() : { status: 400 },
      )
      .on("PUT", path, (request) => {
        const body = request.body as { value?: unknown } | null;
        if (
          request.url.searchParams.get("boardId") !== "7" ||
          !body ||
          typeof body.value !== "string" ||
          Object.keys(body).length !== 1
        )
          return { status: 400, json: { errorMessages: ["Seule la valeur est permise"] } };
        fields.customfield_10016 = Number(body.value);
        return reply();
      });
  }

  // Droits de l'utilisateur (lectures seules) : projets des boards 7 et 9, puis `mypermissions`.
  // Relue à chaque requête : un test peut changer les droits entre deux lectures.
  const manageSprints = (): Readonly<Record<string, boolean | "error">> => ({
    ABC: true,
    XYZ: false,
    ...options.permissions?.manageSprints,
  });
  const projectsOf = (keys: readonly string[]) => ({
    status: 200,
    json: {
      isLast: true,
      startAt: 0,
      values: keys.map((key, index) => ({ id: String(10000 + index), key })),
    },
  });
  jira
    .on("GET", "/rest/agile/1.0/board/7/project", projectsOf(["ABC"]))
    .on("GET", "/rest/agile/1.0/board/9/project", projectsOf(["XYZ"]))
    .on("GET", "/rest/api/3/mypermissions", (request): Reply => {
      const keys = request.url.searchParams.get("permissions")?.split(",") ?? [];
      const project = request.url.searchParams.get("projectKey");
      const granted = (key: string): boolean => {
        if (key === "ADMINISTER") return options.permissions?.administrator === true;
        return project !== null && manageSprints()[project] === true;
      };
      if (project !== null && manageSprints()[project] === "error") return { status: 403 };
      return {
        status: 200,
        json: {
          permissions: Object.fromEntries(
            keys.map((key) => [key, { key, havePermission: granted(key) }]),
          ),
        },
      };
    });
  for (const closed of closedSprints) {
    jira
      .on(
        "GET",
        `/rest/agile/1.0/sprint/${closed.sprint.id}/properties/${SPRINT_PROPERTY_KEYS.goals}`,
        {
          status: 200,
          json: {
            key: SPRINT_PROPERTY_KEYS.goals,
            value: {
              version: 1,
              goals: [
                { id: "g-pay", title: "Simplifier le paiement", color: "goal1", position: 0 },
              ],
              links: closed.links,
              atlassianGoalIds: [],
            },
          },
        },
      )
      .on("GET", `/rest/agile/1.0/board/7/sprint/${closed.sprint.id}/issue`, {
        status: 200,
        json: { issues: closed.issues, total: closed.issues.length },
      });
  }
  if (foreign) {
    jira
      .on("GET", "/rest/agile/1.0/sprint/46", () => ({ status: 200, json: foreign }))
      .on("GET", `/rest/agile/1.0/sprint/46/properties/${SPRINT_PROPERTY_KEYS.goals}`, {
        status: 404,
      })
      .on("GET", "/rest/agile/1.0/board/7/sprint/46/issue", () => {
        const finished = options.foreignFutureSprint === "done";
        const issues =
          options.foreignFutureSprint === "empty"
            ? []
            : [
                issueJson("ABC-460", {
                  summary: "Ticket partagé avec l'équipe voisine",
                  statusId: finished ? "6" : "1",
                  statusName: finished ? "Terminé" : "À faire",
                  category: finished ? "done" : "new",
                }),
              ];
        return { status: 200, json: { issues, total: issues.length } };
      });
  }

  if (otherSprint) {
    jira
      .on("GET", "/rest/agile/1.0/sprint/44", () => ({ status: 200, json: otherSprint }))
      .on("GET", "/rest/agile/1.0/board/7/sprint/44/issue", () => {
        const issues = catalog.filter((issue) => other.has(String(issue.key)));
        return { status: 200, json: { issues, total: issues.length } };
      })
      .on("GET", `/rest/agile/1.0/sprint/44/properties/${SPRINT_PROPERTY_KEYS.goals}`, {
        status: 404,
      })
      .on("POST", "/rest/agile/1.0/sprint/44/issue", addToSprint(other, selected));
  }

  if (secondActive) {
    jira
      .on("GET", "/rest/agile/1.0/sprint/45", () => ({ status: 200, json: secondActive }))
      .on("GET", "/rest/agile/1.0/board/7/sprint/45/issue", {
        status: 200,
        json: { issues: [IN_SECOND_ACTIVE], total: 1 },
      })
      .on("GET", `/rest/agile/1.0/sprint/45/properties/${SPRINT_PROPERTY_KEYS.goals}`, {
        status: 200,
        json: {
          key: SPRINT_PROPERTY_KEYS.goals,
          value: {
            version: 1,
            goals: [
              { id: "g-notifications", title: SECOND_ACTIVE_GOAL, color: "goal4", position: 0 },
            ],
            links: { "ABC-301": "g-notifications" },
            atlassianGoalIds: [],
          },
        },
      });
  }

  return {
    jira,
    /** Sprint actif 42, que la fenêtre native de clôture fictive peut clore. */
    activeSprint,
    /** Second sprint actif 45 (option `secondActiveSprint`), ou `null`. */
    secondActiveSprint: secondActive,
    /** Texte de l'objectif modifié dans Jira par quelqu'un d'autre (conflit). */
    changeGoalText(text: string) {
      sprint.goal = text;
    },
    inspect: () => ({
      sprint,
      issueKeys: [...selected],
      otherSprintKeys: [...other],
      document,
      writes: jira.requests.filter(isWriteRequest).map(({ method, path, body }) => ({
        method,
        path,
        body,
      })),
    }),
  };
}
