import { effect } from "@preact/signals";
import type { AppModel } from "../app/model/AppModel";

/** Relie les cartes de l'application embarquée à la page Jira qui l'héberge. */
export function installEmbeddedLinks(model: AppModel): void {
  if (window.parent === window) return;
  const origin = new URL(location.href).searchParams.get("jiraHost");
  if (!origin || !/^https:\/\/[a-z0-9-]+\.atlassian\.net$/.test(origin)) return;

  effect(() => {
    const connection = model.connection.value;
    if (connection.state !== "connected") return;
    const board = connection.board;
    board.nativeTransitionHandler = (key, transition) => {
      if (board.site.origin !== origin) return false;
      model.exitPresentation();
      window.parent.postMessage(
        {
          type: "sprint-goals:open-issue",
          key,
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
    event.preventDefault();
    window.parent.postMessage(
      { type: "sprint-goals:open-issue", key: link.dataset.issueKey },
      origin,
    );
  });
}
