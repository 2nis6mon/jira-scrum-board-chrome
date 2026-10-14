import { useEffect, useRef, useState } from "preact/hooks";
import { type BoardConfiguration, colorRules } from "../../../core/boardConfiguration";
import { allIssues } from "../../../core/boardIssue";
import {
  CARD_COLOR_LABEL,
  CARD_COLOR_PALETTE,
  type CardColorRule,
  moveColorRule,
  nextRuleColor,
} from "../../../core/cardColors";
import { shiftTarget } from "../../../core/reorder";
import type { BoardModel } from "../../model/BoardModel";
import type { JqlValidation } from "../../services/JqlService";
import { plural } from "../format";
import { Icon } from "../Icon";
import { CardPreview } from "./CardPreview";
import { ColorMenu, Grip, SaveBar, Switch, useReorder } from "./controls";
import { JqlEditor } from "./JqlEditor";

const RULE_DRAG = "application/x-sprint-goals-settings-rule";
const CARD_COLORS = CARD_COLOR_PALETTE.map((id) => ({ id, name: CARD_COLOR_LABEL[id] ?? id }));

/**
 * Onglet Couleurs des cartes : un JQL, une couleur. Le JQL est soumis tel quel à Jira, restreint
 * aux sprints actifs ou au périmètre Kanban ; l'extension ne l'interprète pas. L'ordre de la liste
 * est la priorité (glissé, ou poignée aux flèches). Un brouillon, enregistré sur « Appliquer ».
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
  const storedText = JSON.stringify(stored);
  const [rules, setRules] = useState<readonly CardColorRule[]>(stored);
  const [baseline, setBaseline] = useState(storedText);
  const [sourceBoard, setSourceBoard] = useState(configuration.boardId);
  const generation = useRef(0);
  // En Kanban, la règle « ajouté en cours de sprint » n'a pas de sens : cachée, mais gardée.
  const shown = (rule: CardColorRule) => !kanban || rule.kind !== "addedAfterSprintStart";
  const visibleRules = rules.filter(shown);
  const ids = visibleRules.map((rule) => rule.id);
  const [applying, setApplying] = useState(false);
  const [validations, setValidations] = useState<Readonly<Record<string, JqlValidation>>>({});
  const changed = JSON.stringify(rules) !== baseline;
  const conflict = changed && baseline !== storedText;
  const canEdit = board.canEditSettings.value;
  const validationNeeded = rules.some((rule) => {
    if (rule.kind !== null || !rule.enabled) return false;
    const previous = stored.find((item) => item.id === rule.id);
    if (previous?.enabled && previous.jql === rule.jql) return false;
    const result = validations[rule.id];
    return result?.text !== rule.jql || result.status !== "valid";
  });

  // Une actualisation remplace seulement un formulaire intact, jamais une saisie en cours.
  useEffect(() => {
    if (configuration.boardId === sourceBoard && (changed || baseline === storedText)) return;
    generation.current += 1;
    setSourceBoard(configuration.boardId);
    setRules(stored);
    setBaseline(storedText);
    setValidations({});
    setApplying(false);
  }, [configuration.boardId, storedText]);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const change = (update: (current: readonly CardColorRule[]) => readonly CardColorRule[]) => {
    if (!canEdit || applying) return;
    setRules(update);
  };
  const reset = () => {
    generation.current += 1;
    setRules(stored);
    setBaseline(storedText);
    setValidations({});
  };

  // Chaque modification repart de la liste COURANTE.
  const edit = (id: string, parts: Partial<CardColorRule>) =>
    change((current) => current.map((rule) => (rule.id === id ? { ...rule, ...parts } : rule)));
  const reorder = useReorder(RULE_DRAG, ids, (id, before) =>
    change((current) => moveColorRule(current, id, before, shown)),
  );
  const shift = (id: string, offset: -1 | 1) => {
    const before = shiftTarget(ids, id, offset);
    if (before !== undefined) change((current) => moveColorRule(current, id, before, shown));
  };
  const addRule = () => {
    change((current) => [
      {
        id: crypto.randomUUID(),
        name: "",
        jql: "",
        color: nextRuleColor(current),
        enabled: true,
        kind: null,
      },
      ...current,
    ]);
    // La nouvelle règle, en tête de liste, reçoit la saisie.
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>(".color-rule-name")?.focus(),
    );
  };

  const apply = async () => {
    if (!canEdit || applying || !changed || conflict || validationNeeded) return;
    const request = ++generation.current;
    setApplying(true);
    try {
      const applied = await board.applyColorRules(
        rules.map((rule) => ({ ...rule, name: rule.name.trim(), jql: rule.jql.trim() })),
      );
      if (!applied || generation.current !== request) return;
      const saved = board.configuration.value;
      if (saved?.boardId === sourceBoard) {
        const next = colorRules(saved);
        setRules(next);
        setBaseline(JSON.stringify(next));
      }
    } finally {
      if (generation.current === request) setApplying(false);
    }
  };

  // Aperçu : les cartes colorées par les règles enregistrées, à la dernière évaluation de Jira.
  const tints = board.cardColors.value;
  const snapshot = board.snapshot.value;
  const issues = snapshot ? allIssues(snapshot) : [];
  const colored = issues.filter((issue) => tints[issue.issue.key] !== undefined).slice(0, 3);
  const plain = issues.find((issue) => tints[issue.issue.key] === undefined);
  const sample = plain && colored.length < 3 ? [...colored, plain] : colored;
  const why = (key: string) => {
    const color = tints[key];
    if (color === undefined) return "Aucune règle : carte inchangée.";
    const owners = stored.filter((rule) => rule.enabled && rule.color === color && shown(rule));
    const [owner] = owners;
    return owners.length === 1 && owner
      ? `Règle « ${owner.name || "sans nom"} »`
      : `Couleur ${(CARD_COLOR_LABEL[color] ?? color).toLowerCase()}`;
  };

  return (
    <>
      <div class="settings-columns">
        <section class="settings-card" aria-labelledby="settings-card-colors">
          <header class="settings-card-header">
            <div class="settings-card-title">
              <h2 id="settings-card-colors">Couleur de fond des cartes</h2>
              <p class="settings-help">
                Chaque règle colore les cartes des tickets qui satisfont son JQL, par exemple{" "}
                <code>priority = Highest</code> ou <code>"Priorité incident" = P2</code>. Jira
                évalue la requête à chaque actualisation,{" "}
                {kanban ? "dans le périmètre du board Kanban" : "sur les sprints actifs"} ;
                l'extension ne l'interprète pas.
              </p>
              <p class="settings-help">
                L'ordre de la liste est l'ordre de priorité : quand plusieurs règles s'appliquent au
                même ticket, la plus haute l'emporte. Glissez pour réordonner.
                {!kanban && " La règle « Ajouté en cours de sprint » se place comme les autres."}
              </p>
            </div>
            <button type="button" class="settings-button primary" onClick={addRule}>
              <Icon name="plus" size={14} />
              Nouvelle règle
            </button>
          </header>

          {visibleRules.length === 0 ? (
            <p class="settings-empty">Aucune règle : les cartes gardent leur fond.</p>
          ) : (
            <ol class="settings-list color-rules">
              {visibleRules.map((rule, index) => {
                const builtIn = rule.kind !== null;
                const label = rule.name.trim() || (builtIn ? rule.name : `Règle ${index + 1}`);
                return (
                  <li
                    key={rule.id}
                    class={`settings-rule color-rule${rule.enabled ? "" : " is-disabled"}${reorder.dragged === rule.id ? " is-dragging" : ""}`}
                    data-card-color={rule.color}
                    data-reorder-row
                    data-drop={reorder.marker(rule.id)}
                    onDragOver={reorder.over(rule.id)}
                    onDrop={reorder.drop}
                  >
                    <div class="settings-rule-head">
                      <Grip
                        label={`Déplacer la règle ${label}`}
                        onMove={(offset) => shift(rule.id, offset)}
                        onDragStart={reorder.start(rule.id)}
                        onDragEnd={reorder.end}
                      />
                      <span
                        class="settings-rank"
                        title="Rang de priorité : 1 = la plus prioritaire"
                      >
                        {index + 1}
                      </span>
                      <Switch
                        checked={rule.enabled}
                        label={`Activer la règle ${label}`}
                        onChange={(enabled) => edit(rule.id, { enabled })}
                      />
                      {builtIn ? (
                        <span class="settings-rule-title">
                          <strong>{rule.name}</strong>
                          <span class="settings-badge">
                            <Icon name="lock" size={11} />
                            Règle intégrée
                          </span>
                        </span>
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
                      <ColorMenu
                        label={`Couleur de la règle ${label}`}
                        title="Couleur de fond"
                        choices={CARD_COLORS}
                        selected={rule.color}
                        swatch={(id) => (
                          <span class="settings-swatch settings-swatch-card" data-card-color={id} />
                        )}
                        onPick={(color) => edit(rule.id, { color })}
                      />
                      <button
                        type="button"
                        class="icon-button settings-icon-button"
                        aria-label={`Supprimer la règle ${label}`}
                        title={
                          builtIn
                            ? "Règle intégrée : décochez-la pour la suspendre"
                            : "Supprimer cette règle"
                        }
                        disabled={builtIn}
                        onClick={() => change((current) => current.filter((r) => r.id !== rule.id))}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                    {builtIn ? (
                      <p class="settings-rule-body settings-help">
                        Règle intégrée, sans JQL : ticket entré dans le sprint après son démarrage,
                        d'après l'historique Jira.
                      </p>
                    ) : (
                      <JqlEditor
                        service={board.jql}
                        label={`JQL de la règle ${label}`}
                        placeholder='JQL — ex. "Priorité incident" = P2'
                        value={rule.jql}
                        disabled={applying}
                        onInput={(jql) => edit(rule.id, { jql })}
                        onValidation={(result) =>
                          setValidations((current) => ({ ...current, [rule.id]: result }))
                        }
                      />
                    )}
                    <RuleStatus board={board} rule={rule} stored={stored} />
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside
          class="settings-card settings-preview-card"
          aria-labelledby="settings-colors-preview"
        >
          <header class="settings-card-header">
            <div class="settings-card-title">
              <h2 id="settings-colors-preview">Aperçu</h2>
              <p class="settings-help">D'après la dernière évaluation des règles par Jira.</p>
            </div>
          </header>
          {sample.length > 0 ? (
            <ul class="settings-preview-list">
              {sample.map((issue) => (
                <li key={issue.issue.key} class="settings-preview-item">
                  <CardPreview
                    board={board}
                    configuration={configuration}
                    issues={[issue]}
                    cardFields={[]}
                    tints={tints}
                  />
                  <span class="settings-help">{why(issue.issue.key)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p class="settings-empty">L'aperçu apparaît quand le board a été lu dans Jira.</p>
          )}
        </aside>
      </div>

      <SaveBar
        changed={changed}
        message={
          conflict
            ? "Les couleurs ont changé dans Jira pendant votre saisie. Annuler recharge la version actuelle."
            : changed
              ? validationNeeded
                ? "Vérifiez les JQL des règles activées avant d'appliquer."
                : "Modifications non appliquées."
              : "Aucune modification en cours."
        }
        busy={applying}
        cancelDisabled={!changed || applying}
        onCancel={reset}
        confirm={applying ? "Évaluation par Jira…" : "Appliquer"}
        confirmDisabled={!canEdit || !changed || applying || conflict || validationNeeded}
        onConfirm={() => void apply()}
      />
    </>
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
  const status = (tone: string, text: string, role?: "status") => (
    <p class={`settings-rule-status settings-rule-status-${tone}`} role={role}>
      <span class="settings-status-dot" aria-hidden="true" />
      {text}
    </p>
  );
  if (!rule.enabled) return status("off", "Suspendue.");
  const refusal = board.colorRuleIssues.value[rule.id];
  if (refusal) {
    return (
      <p class="settings-rule-status settings-rule-status-error color-rule-error" role="status">
        <span class="settings-status-dot" aria-hidden="true" />
        Jira a refusé cette requête : {refusal}
      </p>
    );
  }
  if (!saved || JSON.stringify(saved) !== JSON.stringify(rule)) {
    return status("pending", "Non appliquée : « Appliquer » la fait évaluer par Jira.");
  }
  const count = board.colorRuleCounts.value[rule.id];
  if (count === undefined) return null;
  return (
    <p
      class={`settings-rule-status ${count > 0 ? "settings-rule-status-ok color-rule-ok" : "settings-rule-status-off"}`}
    >
      <span class="settings-status-dot" aria-hidden="true" />
      {plural(count, "ticket affiché satisfait", "tickets affichés satisfont")} cette règle.
    </p>
  );
}
