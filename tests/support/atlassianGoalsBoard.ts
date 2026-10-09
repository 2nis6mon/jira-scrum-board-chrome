import { BoardModel } from "../../src/app/model/BoardModel";
import { loadBoard } from "../../src/app/model/boardStore";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_URL, boardSiteJira } from "./boardFixture";
import { type FakePlatform, fakePlatform } from "./fakePlatform";

// Données FICTIVES. Un board Scrum prend par défaut le texte du sprint pour objectifs : les tests
// des Goals Atlassian partent d'un board déjà réglé sur cette source.

const SITE = normalizeSiteUrl("acme.atlassian.net");

/**
 * Enregistre d'avance le board 7 réglé sur les Goals Atlassian, sans le rendre actif : la
 * découverte du board (`detect`) garde ce réglage, et aucune requête ne s'ajoute au faux Jira du test.
 */
export async function preferAtlassianGoals(platform: FakePlatform): Promise<void> {
  const scratch = fakePlatform(boardSiteJira());
  const model = new BoardModel(SITE, scratch);
  await model.load();
  await model.detect(BOARD_URL);
  model.dispose();
  const configuration = await loadBoard(scratch.store, SITE.origin, 7);
  if (!configuration) throw new Error("board de la fixture attendu");
  await platform.store.set("boards.v1", {
    [SITE.origin]: {
      activeBoardId: null,
      boards: {
        // Comme un board jamais lu : aucun objectif connu, aucune couleur attribuée.
        "7": {
          ...configuration,
          goalSource: "atlassianGoals",
          goalColorIndex: {},
          hiddenGoalIds: [],
          blockOrder: [],
        },
      },
    },
  });
}

/** Fausse plateforme dont le board 7 lira les Goals Atlassian. */
export async function atlassianGoalsPlatform(
  jira: Parameters<typeof fakePlatform>[0],
): Promise<FakePlatform> {
  const platform = fakePlatform(jira);
  await preferAtlassianGoals(platform);
  return platform;
}
