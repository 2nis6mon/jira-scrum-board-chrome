import { effect } from "@preact/signals";
import { SPRINT_PLANNING_ENABLED } from "../app/featureFlags";
import { language } from "../app/i18n";
import type { AppModel } from "../app/model/AppModel";
import type { Platform } from "../app/platform/types";
import { parseBoardUrl } from "../jira/site";
import { type EmbeddingTarget, embeddingTarget } from "./embeddingGuard";
import { message, PROTOCOL, readMessage } from "./messages";

/**
 * Hébergement demandé à la page du board affichée dans un cadre : admis seulement dans la page
 * Jira de premier niveau du site connecté et autorisé (voir `embeddingTarget`). `null` : la page
 * ne doit rien lire ni rien afficher du board.
 */
export async function embeddedBoardTarget(
  platform: Pick<Platform, "permissions">,
  place: { readonly search: string; readonly ancestorOrigins?: ArrayLike<string> },
): Promise<EmbeddingTarget | null> {
  const params = new URLSearchParams(place.search);
  const target = embeddingTarget({
    jiraHost: params.get("jiraHost"),
    jiraBoard: params.get("jiraBoard"),
    ancestors: Array.from(place.ancestorOrigins ?? []),
  });
  if (!target) return null;
  // Un site non autorisé n'est jamais proposé à la connexion depuis une page qui l'encadre.
  return (await platform.permissions.contains(target.permissionPattern)) ? target : null;
}

/** Clé de projet utilisable dans une adresse de board Jira, telle que l'hôte la valide. */
const PROJECT_KEY = new RegExp(PROTOCOL.openBoard.fields.projectKey.pattern);

/** Relie les cartes de l'application embarquée à la page Jira qui l'héberge, déjà vérifiée. */
export function installEmbeddedLinks(model: AppModel, origin: string, address: string): () => void {
  if (window.parent === window) return () => {};
  const stopLanguage = effect(() => {
    window.parent.postMessage(message("language", { language: language.value }), origin);
  });
  const hostBoardId = parseBoardUrl(address)?.boardId ?? null;
  // « Retour à Jira » : la page hôte retire elle-même le marqueur de sa propre adresse.
  model.hostReturn.value = async () => {
    const current = model.connection.peek();
    if (current.state !== "connected" || !current.board.canSwitchBoard.value) return;
    model.exitPresentation();
    window.parent.postMessage(message("close"), origin);
  };

  const stopConnection = effect(() => {
    const connection = model.connection.value;
    if (connection.state !== "connected") return;
    const board = connection.board;
    board.nativeIssueHandler = (key) => {
      if (board.site.origin !== origin || board.planning.busy.value) return;
      window.parent.postMessage(message("openIssue", { key }), origin);
    };
    board.nativeTransitionHandler = (key, transition) => {
      if (board.site.origin !== origin) return false;
      model.exitPresentation();
      window.parent.postMessage(
        message("openIssue", {
          key,
          // Identifiant, nom et statut d'arrivée de la transition : la page hôte ouvre le menu de
          // statut de Jira et n'y clique que l'élément qui désigne à coup sûr CETTE transition.
          transition: { id: transition.id, name: transition.name, to: transition.to.name },
        }),
        origin,
      );
      return true;
    };
    // Clôture ou démarrage par la fenêtre native de Jira : seuls l'action et le nom du sprint
    // partent, la page hôte forme elle-même l'adresse de son backlog et n'y clique qu'un bouton.
    // Sprint Planning coupé (paquet) : aucune fenêtre native de sprint ne peut être demandée.
    board.nativeSprintDialogHandler = SPRINT_PLANNING_ENABLED
      ? (action, sprint) => {
          if (board.site.origin !== origin) return false;
          model.exitPresentation();
          window.parent.postMessage(
            message("sprintDialog", {
              action,
              // Nom tronqué à la longueur maximale du protocole : l'hôte le reconnaît alors comme
              // préfixe du nom de la ligne du sprint (sans limite de mot à droite).
              sprintName: sprint.name.slice(0, PROTOCOL.sprintDialog.fields.sprintName.maxLength),
            }),
            origin,
          );
          return true;
        }
      : null;
    // Changer de board, c'est changer de page Jira : l'adresse et le board affiché derrière
    // suivent. Seuls l'identifiant et la clé de projet partent ; la page hôte forme l'adresse.
    board.hostBoardNavigator = (target) => {
      if (board.site.origin !== origin) return "unreachable";
      if (target.boardId === hostBoardId) return "current";
      const projectKey = target.projectKeys.find((key) => PROJECT_KEY.test(key));
      if (!projectKey) return "unreachable";
      model.exitPresentation();
      window.parent.postMessage(
        message("openBoard", { boardId: target.boardId, projectKey }),
        origin,
      );
      return "leaving";
    };
    return () => {
      board.nativeTransitionHandler = null;
      board.nativeIssueHandler = null;
      board.nativeSprintDialogHandler = null;
      board.hostBoardNavigator = null;
    };
  });

  const onMessage = (event: MessageEvent) => {
    if (
      event.source !== window.parent ||
      event.origin !== origin ||
      readMessage(event.data, "host-to-view")?.type !== PROTOCOL.refresh.type
    )
      return;
    const connection = model.connection.peek();
    if (connection.state !== "connected" || connection.board.site.origin !== origin) return;
    connection.board.nativeTransitionPending.value = false;
    connection.board.writeNotice.value = null;
    void connection.board.sync();
    // Fenêtre native fermée : la clôture demandée par le planning reporte ses objectifs non
    // atteints si le sprint relu est clos, puis le planning est relu.
    const planning = connection.board.planning;
    if (model.view.peek() === "planning" || planning.pendingClosure.peek())
      void planning.afterNativeDialog();
  };
  window.addEventListener("message", onMessage);

  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    const target = event.target;
    const link =
      target instanceof Element
        ? target.closest<HTMLAnchorElement>("a.card[data-issue-key]")
        : null;
    if (!link) return;
    // La clé d'un ticket ne part que vers la page Jira du site connecté.
    const connection = model.connection.peek();
    if (connection.state !== "connected" || connection.board.site.origin !== origin) return;
    event.preventDefault();
    // Clé envoyée telle quelle : l'hôte la valide (le sélecteur garantit l'attribut).
    window.parent.postMessage(message("openIssue", { key: link.dataset.issueKey ?? "" }), origin);
  };
  document.addEventListener("click", onClick);
  return () => {
    stopLanguage();
    stopConnection();
    window.removeEventListener("message", onMessage);
    document.removeEventListener("click", onClick);
    model.hostReturn.value = null;
  };
}
