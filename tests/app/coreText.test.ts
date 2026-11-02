import { describe, expect, it } from "vitest";
import { isAppMessage, renderMessage, sourceText } from "../../src/app/model/appMessage";
import {
  planningCarryOverMessage,
  planningOutcomeMessage,
  reasonMessage,
} from "../../src/app/model/coreText";
import { BoardWriteRefused } from "../../src/app/services/ports";
import type { CoreReason, PlanningRefusal } from "../../src/core/reasons";
import type { PlanningStep } from "../../src/core/sprintPlanning";
import { JiraError } from "../../src/jira/errors";

// Un exemple par raison : le type `Record` impose d'en ajouter un pour toute nouvelle raison.
const SAMPLES: { [Code in CoreReason["code"]]: Extract<CoreReason, { code: Code }> } = {
  goalGone: { code: "goalGone" },
  rankRefused: { code: "rankRefused", issueKey: "ABC-1" },
  sprintGoalsUnreadable: { code: "sprintGoalsUnreadable", reason: "notObject" },
  teamSettingsNotObject: { code: "teamSettingsNotObject" },
  teamSettingsUnknownFormat: { code: "teamSettingsUnknownFormat" },
  goalsReadFailed: {
    code: "goalsReadFailed",
    warning: { kind: "failed", operation: "workItems", error: new Error("refus") },
    gap: { goalFieldId: null },
  },
  kanbanGoalsUnavailable: { code: "kanbanGoalsUnavailable" },
  kanbanGoalsFailed: { code: "kanbanGoalsFailed", error: new Error("refus") },
  planningOtherSprint: { code: "planningOtherSprint" },
  planningUnreadableProperty: { code: "planningUnreadableProperty" },
  planningGoalTextUnconfirmed: { code: "planningGoalTextUnconfirmed" },
  planningPropertyUnconfirmed: { code: "planningPropertyUnconfirmed" },
  planningIssueUnconfirmed: { code: "planningIssueUnconfirmed", issueKey: "ABC-1" },
  planningEstimateUnconfirmed: { code: "planningEstimateUnconfirmed", issueKey: "ABC-1" },
  planningGoalLinkRefused: { code: "planningGoalLinkRefused", messages: ["Goal archivé"] },
  planningRefused: { code: "planningRefused", refusal: { reason: "goalsChanged" } },
};

describe("textes des raisons de core", () => {
  it.each(Object.values(SAMPLES))("$code a un message du catalogue, en fr, en et es", (reason) => {
    const text = sourceText(reasonMessage(reason));
    expect(text).not.toBe(reason.code);
    expect(text).not.toContain(reason.code);
    for (const language of ["en", "es"] as const) {
      expect(renderMessage(reasonMessage(reason), language)).not.toContain(reason.code);
    }
  });
});

// Un exemple par refus du planning : le type `Record` impose d'en ajouter un pour tout nouveau refus.
const REFUSALS: {
  [Reason in PlanningRefusal["reason"]]: Extract<PlanningRefusal, { reason: Reason }>;
} = {
  notFuture: { reason: "notFuture" },
  goalTextChanged: { reason: "goalTextChanged" },
  goalsChanged: { reason: "goalsChanged" },
  invalidGoals: { reason: "invalidGoals" },
  issueUnavailable: { reason: "issueUnavailable", issueKey: "ABC-1" },
  issueInActiveSprint: { reason: "issueInActiveSprint", issueKey: "ABC-1" },
  issueNotInSprint: { reason: "issueNotInSprint", issueKey: "ABC-1" },
  linkChanged: { reason: "linkChanged", issueKey: "ABC-1" },
  velocityChanged: { reason: "velocityChanged" },
  invalidVelocity: { reason: "invalidVelocity" },
  sprintNotClosed: { reason: "sprintNotClosed" },
  batchTooLarge: { reason: "batchTooLarge", count: 51 },
  estimateChanged: { reason: "estimateChanged", issueKey: "ABC-1" },
  estimateUnavailable: { reason: "estimateUnavailable", issueKey: "ABC-1" },
  invalidEstimate: { reason: "invalidEstimate" },
  failed: { reason: "failed", error: new JiraError({ kind: "timeout" }) },
};

const STEPS: Record<PlanningStep, true> = {
  goalText: true,
  goalProperty: true,
  issueAdded: true,
  issueLinked: true,
  goalUnlinked: true,
  issueMoved: true,
  pinned: true,
  velocity: true,
  estimate: true,
};

const NOTHING_SENT = "Rien n'a été envoyé à Jira : le board a changé avant l'envoi.";

describe("avis du Sprint Planning", () => {
  it.each(Object.values(REFUSALS))(
    "refus $reason : rien n'a été écrit, en fr, en et es",
    (reason) => {
      const notice = planningOutcomeMessage({ kind: "refused", reason });
      expect(sourceText(notice)).toContain("Rien n’a été écrit");
      for (const language of ["en", "es"] as const) {
        const text = renderMessage(notice, language);
        expect(text).not.toContain(reason.reason);
        expect(text).not.toMatch(/Rien n|écrit/);
      }
    },
  );

  it("chaque étape confirmée a son libellé, sans code, dans les trois langues", () => {
    const notice = planningOutcomeMessage({
      kind: "partial",
      confirmed: Object.keys(STEPS) as PlanningStep[],
      error: new JiraError({ kind: "timeout" }),
    });
    for (const language of ["fr", "en", "es"] as const) {
      const text = renderMessage(notice, language);
      // Codes en camelCase : « pinned » ou « velocity » sont aussi des mots anglais.
      for (const step of Object.keys(STEPS).filter((code) => /[A-Z]/.test(code)))
        expect(text).not.toContain(step);
    }
    expect(sourceText(notice)).toMatch(/^Étapes confirmées : texte des objectifs, /);
  });

  it("un refus de la porte avant toute écriture se lit « rien n'a été envoyé »", () => {
    const stale = new BoardWriteRefused("stale");
    expect(
      sourceText(planningOutcomeMessage({ kind: "partial", confirmed: [], error: stale })),
    ).toBe(NOTHING_SENT);
    expect(
      sourceText(
        planningOutcomeMessage({ kind: "refused", reason: { reason: "failed", error: stale } }),
      ),
    ).toBe(NOTHING_SENT);
  });

  it("une étape confirmée avant un refus de la porte reste annoncée", () => {
    const notice = planningOutcomeMessage({
      kind: "partial",
      confirmed: ["goalText"],
      error: new BoardWriteRefused("stale"),
    });
    expect(sourceText(notice)).toBe(
      `Étapes confirmées : texte des objectifs. ${NOTHING_SENT} Aucune écriture n’a été rejouée ; la page a été relue dans Jira.`,
    );
  });

  it("un refus constaté après une écriture ne prétend pas que rien n'a été écrit", () => {
    const notice = reasonMessage({ code: "planningRefused", refusal: { reason: "goalsChanged" } });
    expect(sourceText(notice)).toBe(
      "Les objectifs du sprint ont changé dans Jira depuis leur affichage.",
    );
  });

  it("le report après clôture nomme le sprint en préparation", () => {
    expect(
      sourceText(planningCarryOverMessage({ kind: "done", confirmed: ["goalText"] }, "Sprint 43")),
    ).toBe("Objectifs non atteints reportés dans Sprint 43.");
    expect(sourceText(planningCarryOverMessage({ kind: "unchanged" }, "Sprint 43"))).toBe(
      "Sprint clos : rien de nouveau à reporter.",
    );
  });
});

describe("messages stockés", () => {
  it.each([
    { key: "réussi", list: "pas un tableau" },
    { key: "réussi", text: 3 },
    { list: [{ key: "réussi" }] },
    { list: [{ text: 1 }], separator: ", " },
    { key: "réussi", params: { p0: { list: 1 } } },
  ])("rejette une forme incomplète qui ferait échouer l'affichage : %j", (value) => {
    expect(isAppMessage(value)).toBe(false);
  });

  it("accepte les trois formes", () => {
    for (const value of [
      { key: "après {p0}", params: { p0: "ABC-1" } },
      { text: "Connexion à Jira impossible." },
      { list: [{ key: "réussi" }], separator: " ; " },
    ])
      expect(isAppMessage(value)).toBe(true);
  });
});
