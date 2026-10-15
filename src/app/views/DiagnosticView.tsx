import { useState } from "preact/hooks";
import { type ProbeResult, writeConclusion } from "../../jira/diagnostics";
import { SPRINT_PROPERTY_KEYS } from "../../jira/writes";
import { language, localize, t } from "../i18n";
import type { DiagnosticModel } from "../model/DiagnosticModel";
import { ErrorMessage } from "./Message";

/**
 * Diagnostic affiché : Denis l'a masqué puis rétabli le 24/09/2026, le bandeau « Invalid CORS
 * request » y renvoyant — c'est le seul écran qui essaie les variantes de l'en-tête Origin et
 * retient celle que la passerelle des Goals accepte. Le masquer coupe cette issue de secours.
 * Il s'ouvre depuis « Site Jira », en pied de barre latérale (0.31.0).
 */
export const DIAGNOSTIC_ENABLED = true;

const MARK = { ok: "✓", failed: "✗", skipped: "–" } as const;
const STATUS_LABEL = { ok: "réussi", failed: "échec", skipped: "non lancé" } as const;

function ProbeList({ probes }: { probes: readonly ProbeResult[] }) {
  return (
    <ul class="probes">
      {probes.map((probe) => (
        <li key={probe.id} class={`probe probe-${probe.status}`}>
          <span class="probe-mark" role="img" aria-label={localize(STATUS_LABEL[probe.status])}>
            {MARK[probe.status]}
          </span>
          <span class="probe-label">{localize(probe.label)}</span>
          {probe.httpStatus !== null && <span class="probe-code">{probe.httpStatus}</span>}
          <span class="probe-detail">{localize(probe.detail)}</span>
        </li>
      ))}
    </ul>
  );
}

export function DiagnosticView({ diagnostic }: { diagnostic: DiagnosticModel }) {
  const site = diagnostic.site;
  const [boardUrl, setBoardUrl] = useState("");
  const read = diagnostic.read.value;
  const write = diagnostic.write.value;
  const sprint = diagnostic.sprint.value;

  return (
    <div class="page">
      <section class="panel">
        <header class="panel-header">
          <h2>{t("1 · Lectures")}</h2>
          <button
            type="button"
            onClick={() => void diagnostic.runReads()}
            disabled={diagnostic.readRunning.value}
          >
            {diagnostic.readRunning.value ? t("En cours…") : t("Relancer")}
          </button>
        </header>
        <p class="hint">
          {t(
            "Requêtes en lecture seule : votre compte, l'analyse d'un JQL par POST, puis l'identifiant du site par la passerelle GraphQL d'Atlassian (API des Goals), essayé avec l'en-tête Origin de l'extension, sans lui, puis remplacé par l'adresse du site. La variante acceptée est retenue pour ce site. Rien n'est modifié dans Jira.",
          )}
        </p>
        {read ? <ProbeList probes={read.probes} /> : <p class="hint">{t("En cours…")}</p>}
        {read?.displayName && (
          <p class="hint">
            {t("Compte reconnu :")} {read.displayName}
          </p>
        )}
        {read && !read.sessionRecognized && (
          <p class="hint">
            <a href={site.origin} target="_blank" rel="noopener noreferrer">
              {t("Ouvrir")} {site.host}
            </a>{" "}
            {t("pour vous y connecter, puis relancez.")}
          </p>
        )}
      </section>

      <section class="panel">
        <header class="panel-header">
          <h2>{t("2 · Test d'écriture")}</h2>
        </header>
        <p class="hint">
          {t(
            "Ce test est réservé aux boards Scrum avec un sprint actif. Les contrôles de lecture restent disponibles pour les boards Kanban.",
          )}
        </p>
        <p class="hint">
          {t(
            "Seul un essai réel dit si Jira accepte une écriture venant de l'extension. Le test écrit la propriété technique",
          )}{" "}
          <code>{SPRINT_PROPERTY_KEYS.diagnostic}</code>{" "}
          {t(
            "sur le sprint actif, la relit, puis la supprime. Cette propriété est invisible dans Jira. Aucun ticket, aucun champ du sprint n'est touché. Si Jira refuse le premier essai pour cause d'origine (XSRF), un second est fait avec l'en-tête",
          )}{" "}
          <code>X-Atlassian-Token: no-check</code>.
        </p>

        <form
          class="row"
          onSubmit={(event) => {
            event.preventDefault();
            void diagnostic.findSprint(boardUrl);
          }}
        >
          <input
            type="text"
            inputMode="url"
            autocomplete="off"
            spellcheck={false}
            aria-label={t("Adresse du board Jira")}
            placeholder={`${site.origin}/jira/software/c/projects/ABC/boards/123`}
            value={boardUrl}
            onInput={(event) => setBoardUrl(event.currentTarget.value)}
          />
          <button type="submit" disabled={diagnostic.sprintLoading.value || boardUrl.trim() === ""}>
            {diagnostic.sprintLoading.value ? t("Recherche…") : t("Trouver le sprint actif")}
          </button>
        </form>
        <ErrorMessage message={diagnostic.sprintError.value} />

        {sprint && (
          <div class="row">
            <p class="sprint">
              {t("Sprint actif :")} <strong>{sprint.name}</strong>
            </p>
            <button
              type="button"
              class="primary"
              onClick={() => void diagnostic.runWriteTest()}
              disabled={diagnostic.writeRunning.value || !read?.sessionRecognized}
            >
              {diagnostic.writeRunning.value
                ? t("Test en cours…")
                : t("Tester l'écriture sur ce sprint")}
            </button>
          </div>
        )}
        {write && (
          <>
            <ProbeList probes={write.probes} />
            <p class={`conclusion ${write.acceptedWith ? "conclusion-ok" : "conclusion-failed"}`}>
              {localize(writeConclusion(write))}
            </p>
          </>
        )}
      </section>

      <section class="panel">
        <header class="panel-header">
          <h2>{t("Journal des écritures")}</h2>
          <button
            type="button"
            onClick={() => void diagnostic.clearJournal()}
            disabled={diagnostic.journal.value.length === 0}
          >
            {t("Effacer le journal")}
          </button>
        </header>
        <p class="hint">
          {t(
            "Chaque écriture tentée depuis le board (transition, classement, rattachement, épinglage), avec la réponse de Jira. Le journal reste dans ce navigateur ; il ne contient ni secret ni nom de personne, et il est effacé à la déconnexion.",
          )}
        </p>
        {diagnostic.journal.value.length === 0 ? (
          <p class="hint">{t("Aucune écriture pour l'instant.")}</p>
        ) : (
          <table class="journal">
            <thead>
              <tr>
                <th>{t("Date")}</th>
                <th>{t("Action")}</th>
                <th>{t("Cible")}</th>
                <th>{t("Vers")}</th>
                <th>{t("Résultat")}</th>
                <th>{t("Détail")}</th>
              </tr>
            </thead>
            <tbody>
              {diagnostic.journal.value.map((entry) => (
                <tr
                  key={`${entry.at}-${entry.issueKey}-${localize(entry.action)}`}
                  class={`journal-${entry.outcome === "réussi" ? "ok" : "ko"}`}
                >
                  <td>
                    {new Date(entry.at).toLocaleString(language.value === "fr" ? "fr-FR" : "en-GB")}
                  </td>
                  <td>{localize(entry.action)}</td>
                  <td>{entry.issueKey ?? "sprint"}</td>
                  <td>{entry.to ?? ""}</td>
                  <td>{localize(entry.outcome)}</td>
                  <td>{localize(entry.detail ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section class="panel">
        <header class="panel-header">
          <h2>{t("3 · Rapport")}</h2>
          <button type="button" onClick={() => void diagnostic.copyReport()} disabled={!read}>
            {diagnostic.reportCopied.value ? t("Copié") : t("Copier le rapport")}
          </button>
        </header>
        <p class="hint">
          {t(
            "Le rapport ne contient ni l'adresse du site, ni votre nom, ni le nom du sprint : seulement les sondes, les codes HTTP et les messages renvoyés par Jira. Relisez-le avant de le transmettre.",
          )}
        </p>
        {read && <pre class="report">{diagnostic.report()}</pre>}
      </section>
    </div>
  );
}
