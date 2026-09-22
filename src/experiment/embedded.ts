import { effect } from "@preact/signals";
import type { AppModel } from "../app/model/AppModel";
import type { Platform } from "../app/platform/types";
import { type EmbeddingTarget, embeddingTarget } from "./embeddingGuard";

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

/** Relie les cartes de l'application embarquée à la page Jira qui l'héberge, déjà vérifiée. */
export function installEmbeddedLinks(model: AppModel, origin: string): void {
  if (window.parent === window) return;

  effect(() => {
    const connection = model.connection.value;
    if (connection.state !== "connected") return;
    const board = connection.board;
    board.nativeTransitionHandler = (key, issueId, transition) => {
      if (board.site.origin !== origin) return false;
      model.exitPresentation();
      window.parent.postMessage(
        {
          type: "sprint-goals:open-issue",
          key,
          // L'écran de la transition du workflow est ouvert par l'identifiant du ticket et celui
          // de la transition, jamais par un libellé.
          issueId,
          transition: { id: transition.id, name: transition.name },
        },
        origin,
      );
      return true;
    };
    return () => {
      board.nativeTransitionHandler = null;
    };
  });

  window.addEventListener("message", (event) => {
    if (
      event.source !== window.parent ||
      event.origin !== origin ||
      event.data?.type !== "sprint-goals:refresh"
    )
      return;
    const connection = model.connection.peek();
    if (connection.state !== "connected" || connection.board.site.origin !== origin) return;
    connection.board.nativeTransitionPending.value = false;
    connection.board.writeNotice.value = null;
    void connection.board.sync();
  });

  document.addEventListener("click", (event) => {
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
    window.parent.postMessage(
      { type: "sprint-goals:open-issue", key: link.dataset.issueKey },
      origin,
    );
  });
}
