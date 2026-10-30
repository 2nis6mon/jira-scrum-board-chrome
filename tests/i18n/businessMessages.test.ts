import { describe, expect, it } from "vitest";
import { renderMessage, sourceText } from "../../src/app/model/appMessage";
import { planningMessage } from "../../src/app/model/coreText";
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

  it("produit le même texte depuis le résultat typé du planning, puis le traduit sans motifs", () => {
    const historical =
      "Étapes confirmées : texte des objectifs, 2 ticket(s) ajouté(s). Les rattachements n’ont pas été confirmés par Jira. Aucune écriture n’a été rejouée. Vérifiez Jira avant de reprendre ; votre brouillon est conservé.";
    const typed = planningMessage({
      code: "unconfirmed",
      confirmed: [{ kind: "goalText" }, { kind: "issuesAdded", count: 2 }],
      error: new CoreError({ code: "planningLinksUnconfirmed" }),
    });
    expect(sourceText(typed)).toBe(historical);
    expect(renderMessage(typed, "en")).toBe(localize(historical, "en"));
    // Chaque étape est traduite seule : en espagnol, son libellé est celui de l'étape isolée.
    expect(renderMessage(typed, "es")).toMatch(
      /^Etapas confirmadas: texto de los objetivos, 2 incidencia\(s\) añadida\(s\)\. /,
    );
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
