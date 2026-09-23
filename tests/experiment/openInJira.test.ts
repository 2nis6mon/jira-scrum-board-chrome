import { describe, expect, it } from "vitest";
import { AppModel } from "../../src/app/model/AppModel";
import type { BoardConfiguration } from "../../src/core/boardConfiguration";
import { followBoardToJira } from "../../src/experiment/openInJira";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { fakePlatform } from "../support/fakePlatform";

// Données FICTIVES. Paquet d'essai : après le choix du premier board, l'onglet rejoint Jira.

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Site connecté avec le raccord installé ; `platform` permet de rouvrir sur le même stockage. */
async function openPage(platform = fakePlatform(boardSiteJira())) {
  const model = new AppModel(platform);
  const visited: string[] = [];
  const stop = followBoardToJira(model, (address) => visited.push(address));
  return { platform, model, visited, stop };
}

async function connected(platform?: ReturnType<typeof fakePlatform>) {
  const page = await openPage(platform);
  await page.model.connect("acme.atlassian.net");
  const connection = page.model.connection.value;
  if (connection.state !== "connected") throw new Error("connexion attendue");
  await tick();
  return { ...page, board: connection.board };
}

describe("premier lancement du paquet d'essai", () => {
  it("rejoint la page Jira du board dès qu'un premier board est choisi", async () => {
    const { board, visited, stop } = await connected();
    // Tant qu'aucun board n'est configuré, on reste dans la page de l'extension.
    expect(visited).toEqual([]);

    await board.detect(BOARD_URL);
    await tick();
    const configuration = board.configuration.value;
    if (!configuration) throw new Error("board attendu");
    expect(visited).toEqual([
      `https://acme.atlassian.net/jira/software/c/projects/${configuration.projectKeys[0]}/boards/${configuration.boardId}?sprintGoals=1`,
    ]);

    // Une seule fois : un board rechargé ensuite ne relance pas la navigation.
    board.configuration.value = { ...configuration };
    await tick();
    expect(visited).toHaveLength(1);
    stop();
    board.dispose();
  });

  it("reste dans l'onglet quand le board était déjà enregistré", async () => {
    const first = await connected();
    await first.board.detect(BOARD_URL);
    await tick();
    first.stop();
    first.board.dispose();

    // Réouverture sur le même stockage : le board est relu au démarrage, l'onglet ne bouge pas —
    // sinon son administration deviendrait inatteignable.
    const again = await openPage(first.platform);
    await again.model.start();
    await tick();
    expect(again.visited).toEqual([]);
    again.stop();
  });

  it("reste dans l'onglet si l'adresse Jira n'est pas constructible", async () => {
    // Board sans clé de projet utilisable : l'adresse Jira ne peut pas être formée.
    const source = await connected();
    await source.board.detect(BOARD_URL);
    const detected = source.board.configuration.value;
    if (!detected) throw new Error("board attendu");
    source.stop();
    source.board.dispose();

    const { board, visited, stop } = await connected();
    board.configuration.value = { ...detected, projectKeys: [] } satisfies BoardConfiguration;
    await tick();
    expect(visited).toEqual([]);
    stop();
    board.dispose();
  });
});
