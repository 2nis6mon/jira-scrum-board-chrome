import { useState } from "preact/hooks";
import type { BoardConfiguration } from "../../../core/boardConfiguration";
import type { BoardModel } from "../../model/BoardModel";
import { PinGoalsDialog } from "../board/PinGoalsDialog";
import { BoardSettings } from "./BoardSettings";
import { CardColorSettings } from "./CardColorSettings";
import { CardFieldSettings } from "./CardFieldSettings";
import { GoalSettings } from "./GoalSettings";

type Section = "board" | "goals" | "cardFields" | "cardColors";

const SECTIONS: readonly { id: Section; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "goals", label: "Objectifs" },
  { id: "cardFields", label: "Champs des cartes" },
  { id: "cardColors", label: "Couleurs des cartes" },
];

/**
 * Réglages du board affiché, portés de l'administration du Mac. Tous restent dans ce navigateur
 * (`chrome.storage.local`) : aucun n'est écrit dans Jira.
 */
export function SettingsView({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const [section, setSection] = useState<Section>("board");

  return (
    <main class="settings">
      <nav class="settings-nav" aria-label="Sections des réglages">
        <p class="settings-board">{configuration.boardName}</p>
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            class="settings-tab"
            aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
        <p class="hint settings-local">
          Réglages de ce navigateur, pour ce board. Rien n'est écrit dans Jira.
        </p>
      </nav>
      {/* Un autre board : les brouillons repartent de sa configuration. */}
      <div class="settings-content" key={configuration.boardId}>
        {section === "board" && <BoardSettings board={board} configuration={configuration} />}
        {section === "goals" && <GoalSettings board={board} configuration={configuration} />}
        {section === "cardFields" && (
          <CardFieldSettings board={board} configuration={configuration} />
        )}
        {section === "cardColors" && (
          <CardColorSettings board={board} configuration={configuration} />
        )}
      </div>
      <PinGoalsDialog board={board} />
    </main>
  );
}
