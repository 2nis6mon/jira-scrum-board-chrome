import { useState } from "preact/hooks";
import { type BoardConfiguration, colorRules } from "../../../core/boardConfiguration";
import {
  CARD_COLOR_LABEL,
  CARD_COLOR_PALETTE,
  type CardColorRule,
  cleanedColorRules,
  nextRuleColor,
} from "../../../core/cardColors";
import type { BoardModel } from "../../model/BoardModel";
import { plural } from "../format";

/**
 * Règles de couleur des cartes : un JQL, une couleur. Le JQL est soumis tel quel à Jira, restreint
 * aux sprints actifs ; l'extension ne l'interprète pas. Portage de `CardColorsAdminView` (Mac).
 */
export function CardColorSettings({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const kanban = configuration.boardType === "kanban";
  const stored = colorRules(configuration);
  const [rules, setRules] = useState<readonly CardColorRule[]>(stored);
  const visibleRules = rules.filter((rule) => !kanban || rule.kind !== "addedAfterSprintStart");
  const [applying, setApplying] = useState(false);
  const changed = JSON.stringify(rules) !== JSON.stringify(stored);

  // Chaque modification repart de la liste COURANTE.
  const edit = (id: string, parts: Partial<CardColorRule>) =>
    setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...parts } : rule)));
  const move = (id: string, offset: number) =>
    setRules((current) => {
      const visible = current.filter((rule) => !kanban || rule.kind !== "addedAfterSprintStart");
      const destination = visible[visible.findIndex((rule) => rule.id === id) + offset];
      if (!destination) return current;
      const index = current.findIndex((rule) => rule.id === id);
      const target = current.findIndex((rule) => rule.id === destination.id);
      const result = [...current];
      const [moved] = result.splice(index, 1);
      if (moved) result.splice(target, 0, moved);
      return result;
    });

  const apply = async () => {
    setApplying(true);
    try {
      await board.applyColorRules(cleanedColorRules(rules));
      const saved = board.configuration.value;
      if (saved) setRules(colorRules(saved));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div class="settings-section">
      <section class="panel" aria-labelledby="settings-card-colors">
        <h2 id="settings-card-colors">Couleur de fond des cartes</h2>
        <p class="hint">
          Chaque règle colore les cartes des tickets qui satisfont son JQL, par exemple{" "}
          <code>priority = Highest</code> ou <code>"Priorité incident" = P2</code>. Jira évalue la
          requête à chaque actualisation,{" "}
          {kanban ? "dans le périmètre du board Kanban" : "sur les sprints actifs"} ; l'extension ne
          l'interprète pas.
        </p>
        <p class="hint">
          L'ordre de la liste est l'ordre de priorité : quand plusieurs règles s'appliquent au même
          ticket, la plus haute l'emporte.
          {!kanban && " La règle « Ajouté en cours de sprint » se place comme les autres."}
        </p>
        <div class="row">
          <button
            type="button"
            onClick={() =>
              setRules((current) => [
                {
                  id: crypto.randomUUID(),
                  name: "",
                  jql: "",
                  color: nextRuleColor(current),
                  enabled: true,
                  kind: null,
                },
                ...current,
              ])
            }
          >
            Ajouter une règle
          </button>
        </div>
      </section>

      <ol class="color-rules">
        {visibleRules.map((rule, index) => {
          const builtIn = rule.kind !== null;
          const label = rule.name.trim() || (builtIn ? rule.name : `Règle ${index + 1}`);
          return (
            <li key={rule.id} class="panel color-rule" data-card-color={rule.color}>
              <div class="color-rule-head">
                <span class="color-rule-rank" title="Rang de priorité : 1 = la plus prioritaire">
                  {index + 1}
                </span>
                <input
                  type="checkbox"
                  aria-label={`Activer la règle ${label}`}
                  title="Activer ou suspendre cette règle"
                  checked={rule.enabled}
                  onChange={(event) => {
                    const enabled = event.currentTarget.checked;
                    edit(rule.id, { enabled });
                  }}
                />
                {builtIn ? (
                  <strong class="color-rule-name">{rule.name}</strong>
                ) : (
                  <input
                    type="text"
                    class="color-rule-name"
                    aria-label={`Nom de la règle ${index + 1}`}
                    placeholder="Nom (ex. Incident P2)"
                    value={rule.name}
                    onInput={(event) => {
                      const name = event.currentTarget.value;
                      edit(rule.id, { name });
                    }}
                  />
                )}
                <fieldset class="settings-swatches">
                  <legend class="visually-hidden">Couleur de la règle {label}</legend>
                  {CARD_COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      class="swatch card-swatch"
                      data-card-color={color}
                      aria-label={CARD_COLOR_LABEL[color] ?? color}
                      title={CARD_COLOR_LABEL[color] ?? color}
                      aria-pressed={rule.color === color}
                      onClick={() => edit(rule.id, { color })}
                    />
                  ))}
                </fieldset>
                <span class="color-rule-actions">
                  <button
                    type="button"
                    aria-label={`Rendre la règle ${label} plus prioritaire`}
                    disabled={index === 0}
                    onClick={() => move(rule.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Rendre la règle ${label} moins prioritaire`}
                    disabled={index === visibleRules.length - 1}
                    onClick={() => move(rule.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Supprimer la règle ${label}`}
                    title={
                      builtIn
                        ? "Règle intégrée : décochez-la pour la suspendre"
                        : "Supprimer cette règle"
                    }
                    disabled={builtIn}
                    onClick={() => setRules((current) => current.filter((r) => r.id !== rule.id))}
                  >
                    ×
                  </button>
                </span>
              </div>
              {builtIn ? (
                <p class="hint">
                  Règle intégrée, sans JQL : ticket entré dans le sprint après son démarrage,
                  d'après l'historique Jira.
                </p>
              ) : (
                <textarea
                  class="color-rule-jql"
                  aria-label={`JQL de la règle ${label}`}
                  rows={2}
                  spellcheck={false}
                  placeholder='JQL — ex. "Priorité incident" = P2'
                  value={rule.jql}
                  onInput={(event) => {
                    const jql = event.currentTarget.value;
                    edit(rule.id, { jql });
                  }}
                />
              )}
              <RuleStatus board={board} rule={rule} stored={stored} />
            </li>
          );
        })}
      </ol>

      <div class="settings-actions">
        <span class="hint">
          {changed
            ? "Modifications non appliquées. Une règle sans JQL n'est pas enregistrée."
            : "Aucune modification en cours."}
        </span>
        <button type="button" disabled={!changed || applying} onClick={() => setRules(stored)}>
          Annuler
        </button>
        <button
          type="button"
          class="primary"
          disabled={!changed || applying}
          onClick={() => void apply()}
        >
          {applying ? "Évaluation par Jira…" : "Appliquer"}
        </button>
      </div>
    </div>
  );
}

/** Résultat de la dernière évaluation de la règle ENREGISTRÉE. */
function RuleStatus(props: {
  board: BoardModel;
  rule: CardColorRule;
  stored: readonly CardColorRule[];
}) {
  const { board, rule } = props;
  const saved = props.stored.find((candidate) => candidate.id === rule.id);
  if (!saved || JSON.stringify(saved) !== JSON.stringify(rule)) {
    return <p class="hint">Non appliquée : « Appliquer » la fait évaluer par Jira.</p>;
  }
  if (!rule.enabled) return <p class="hint">Suspendue.</p>;
  const refusal = board.colorRuleIssues.value[rule.id];
  if (refusal) {
    return (
      <p class="color-rule-error" role="status">
        Jira a refusé cette requête : {refusal}
      </p>
    );
  }
  const count = board.colorRuleCounts.value[rule.id];
  if (count === undefined) return null;
  return (
    <p class={count > 0 ? "color-rule-ok" : "hint"}>
      {plural(count, "ticket affiché satisfait", "tickets affichés satisfont")} cette règle.
    </p>
  );
}
