import { effect } from "@preact/signals";
import type { AppModel } from "../app/model/AppModel";
import { boardPageAddress } from "./launchAddress";

/**
 * Premier lancement du paquet d'essai. Sans board enregistré, l'icône ouvre la page de
 * l'extension : on y saisit le site, puis on y cherche le board. La configuration finie, rien ne
 * menait jusqu'ici à Jira — il fallait recliquer sur l'icône. L'onglet rejoint désormais lui-même
 * la page Jira du board choisi, où la vue Sprint Goals se superpose.
 *
 * Seul le PREMIER board configuré déclenche ce saut : une page rouverte sur un board déjà
 * enregistré reste dans l'onglet, sans quoi son administration deviendrait inatteignable.
 */
export function followBoardToJira(
  model: AppModel,
  go: (address: string) => void = (address) => location.replace(address),
): () => void {
  /** `null` tant que le board n'a pas été relu : on ne sait pas encore d'où l'on part. */
  let startedWithoutBoard: boolean | null = null;
  let left = false;
  return effect(() => {
    if (left) return;
    const connection = model.connection.value;
    if (connection.state !== "connected") return;
    const board = connection.board;
    if (!board.loaded.value) return;
    const configuration = board.configuration.value;
    if (startedWithoutBoard === null) startedWithoutBoard = configuration === null;
    if (!startedWithoutBoard || configuration === null) return;
    const address = boardPageAddress(configuration);
    // Board sans clé de projet utilisable : on reste dans l'onglet plutôt que d'échouer ailleurs.
    if (address === null) return;
    left = true;
    go(address);
  });
}
