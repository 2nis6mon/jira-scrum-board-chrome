import { describe, expect, it } from "vitest";
import { renderMessage, sourceText } from "../../src/app/model/appMessage";
import { planningCarryOverMessage, planningOutcomeMessage } from "../../src/app/model/coreText";
import { BoardWriteRefused } from "../../src/app/services/ports";
import { CoreError } from "../../src/core/reasons";
import { localize } from "../../src/i18n";

describe("messages métier bilingues", () => {
  it("traduit les erreurs imbriquées sans modifier les identifiants et adresses", () => {
    expect(
      localize(
        "Objectifs du board Kanban indisponibles : Tickets rattachés aux objectifs : le schéma Atlassian n'expose pas de lien Goal → tickets exploitable",
        "en",
      ),
    ).toBe(
      "Kanban board goals unavailable: Issues linked to goals: the Atlassian schema does not expose a usable Goal → issue link",
    );
    expect(localize("Introuvable dans Jira : les tickets du sprint 42 sur le board 7.", "en")).toBe(
      "Not found in Jira: issues in sprint 42 on board 7.",
    );
    expect(
      localize("Ce board appartient à acme.atlassian.net, pas à autre.atlassian.net.", "en"),
    ).toBe("This board belongs to acme.atlassian.net, not autre.atlassian.net.");
  });

  it("préserve les noms de statut et de transition même s'ils correspondent à un libellé traduit", () => {
    expect(localize("ABC-12 a changé dans Jira : il est maintenant « À organiser ».", "en")).toBe(
      "ABC-12 changed in Jira: its status is now ‘À organiser’.",
    );
    expect(localize("Complétez « Actualiser » dans Jira pour ABC-12.", "en")).toBe(
      "Complete ‘Actualiser’ in Jira for ABC-12.",
    );
    expect(
      localize(
        "Réglage non enregistré : Quelqu'un a modifié les réglages du board au même moment.",
        "en",
      ),
    ).toBe("Setting not saved: Quelqu'un changed the board settings at the same time.");
  });

  it("traduit une cause dont le point final a été retiré dans un message d'enregistrement", () => {
    expect(
      localize(
        "Jira n'a pas confirmé l'écriture sur ABC-12 (Jira n'a pas répondu dans le délai imparti).",
        "en",
      ),
    ).toBe("Jira did not confirm the write to ABC-12 (Jira did not respond in time).");
    expect(
      localize(
        "Réglage appliqué, mais pas enregistré dans ce navigateur (Connexion à Jira impossible).",
        "en",
      ),
    ).toBe("Setting applied but not saved in this browser (Cannot connect to Jira).");
    expect(localize("Complétez « Connexion à Jira impossible » dans Jira pour ABC-12.", "en")).toBe(
      "Complete ‘Connexion à Jira impossible’ in Jira for ABC-12.",
    );
  });

  it("traduit une publication partielle et ses étapes confirmées tout en gardant le texte français historique", () => {
    const historical =
      "Étapes confirmées : texte des objectifs, 2 ticket(s) ajouté(s). Les rattachements n’ont pas été confirmés par Jira. Aucune écriture n’a été rejouée. Vérifiez Jira avant de reprendre ; votre brouillon est conservé.";
    expect(localize(historical, "en")).toBe(
      "Confirmed steps: goal text, 2 issue(s) added. Jira did not confirm the issue links. No write was retried. Check Jira before continuing; your draft has been kept.",
    );
    expect(localize(historical, "fr")).toBe(historical);
  });

  it("traduit les avis du planning en direct en anglais et en espagnol", () => {
    const partial = planningOutcomeMessage({
      kind: "partial",
      confirmed: ["goalText"],
      error: new CoreError({ code: "planningPropertyUnconfirmed" }),
    });
    expect(sourceText(partial)).toBe(
      "Étapes confirmées : texte des objectifs. Jira n'a pas relu la propriété des objectifs du sprint telle qu'elle a été écrite. Aucune écriture n’a été rejouée ; la page a été relue dans Jira.",
    );
    expect(renderMessage(partial, "en")).toBe(
      "Confirmed steps: goal text. Jira did not read the sprint goals property back as it was written. No write was retried; the page was reloaded from Jira.",
    );
    expect(renderMessage(partial, "es")).toBe(
      "Etapas confirmadas: texto de los objetivos. Jira no ha vuelto a leer la propiedad de objetivos del sprint tal como se escribió. No se ha repetido ninguna escritura; la página se ha vuelto a cargar desde Jira.",
    );

    const conflict = planningOutcomeMessage({
      kind: "refused",
      reason: { reason: "goalTextChanged" },
    });
    expect(renderMessage(conflict, "en")).toBe(
      "The goal text changed in Jira after it was displayed. Nothing was written: the page was reloaded, make your change again.",
    );
    expect(renderMessage(conflict, "es")).toBe(
      "El texto de los objetivos ha cambiado en Jira desde que se mostró. No se ha escrito nada: la página se ha vuelto a cargar, repite tu cambio.",
    );

    const active = planningOutcomeMessage({
      kind: "refused",
      reason: { reason: "issueInActiveSprint", issueKey: "ABC-12" },
    });
    expect(renderMessage(active, "en")).toBe(
      "ABC-12 is in the active sprint: it stays there, read-only. Nothing was written.",
    );
    expect(renderMessage(active, "es")).toBe(
      "ABC-12 está en el sprint activo: permanece allí en solo lectura. No se ha escrito nada.",
    );

    const linkRefused = planningOutcomeMessage({
      kind: "partial",
      confirmed: ["issueAdded"],
      error: new CoreError({ code: "planningGoalLinkRefused", messages: ["Goal archivé"] }),
    });
    // Le message d'Atlassian est un contenu Jira : jamais traduit.
    expect(renderMessage(linkRefused, "en")).toBe(
      "Confirmed steps: issue added to the sprint. Atlassian refused the link to the Goal: Goal archivé No write was retried; the page was reloaded from Jira.",
    );

    const gate = planningOutcomeMessage({
      kind: "partial",
      confirmed: [],
      error: new BoardWriteRefused("stale"),
    });
    expect(renderMessage(gate, "en")).not.toMatch(/confirm/i);
    expect(renderMessage(gate, "es")).not.toMatch(/confirm/i);

    const carried = planningCarryOverMessage({ kind: "done", confirmed: ["pinned"] }, "Sprint 43");
    expect(renderMessage(carried, "en")).toBe("Unmet goals carried over to Sprint 43.");
    expect(renderMessage(carried, "es")).toBe("Objetivos no alcanzados trasladados a Sprint 43.");
  });

  it("traduit une sonde composée sans interpréter le corps de réponse Jira", () => {
    expect(
      localize(
        "refus XSRF sans en-tête, puis réponse reçue avec l'en-tête X-Atlassian-Token: no-check",
        "en",
      ),
    ).toBe(
      "XSRF rejection without a header, then response received with the X-Atlassian-Token: no-check header",
    );
    expect(localize("refus XSRF — Retourner au travail", "en")).toBe(
      "XSRF rejection — Retourner au travail",
    );
  });
});
