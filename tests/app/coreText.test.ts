import { describe, expect, it } from "vitest";
import { isAppMessage, renderMessage, sourceText } from "../../src/app/model/appMessage";
import { reasonMessage } from "../../src/app/model/coreText";
import type { CoreReason } from "../../src/core/reasons";

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
  planningDuplicateSelection: { code: "planningDuplicateSelection" },
  planningExistingIssuesKept: { code: "planningExistingIssuesKept" },
  planningIssueUnavailable: { code: "planningIssueUnavailable", issueKey: "ABC-1" },
  planningGoalTextUnconfirmed: { code: "planningGoalTextUnconfirmed" },
  planningIssueLeftBacklog: { code: "planningIssueLeftBacklog" },
  planningAdditionsUnconfirmed: { code: "planningAdditionsUnconfirmed" },
  planningLinksChanged: { code: "planningLinksChanged" },
  planningLinksUnconfirmed: { code: "planningLinksUnconfirmed" },
  planningFinalCheckChanged: { code: "planningFinalCheckChanged" },
  planningSprintChanged: { code: "planningSprintChanged" },
  planningInvalidGoals: { code: "planningInvalidGoals" },
  planningLinkMismatch: { code: "planningLinkMismatch" },
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
