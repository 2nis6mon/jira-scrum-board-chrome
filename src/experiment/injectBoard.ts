/** Fonction autonome copiée par Chrome dans le monde isolé de l'onglet Jira. */
export function injectBoard(boardUrl: string, expectedAddress: string): void {
  if (!/^https:\/\/[^/]+\.atlassian\.net$/.test(location.origin)) return;
  const current = new URL(location.href);
  const expected = new URL(expectedAddress);
  if (
    current.origin !== expected.origin ||
    current.pathname !== expected.pathname ||
    current.searchParams.get("sprintGoals") !== "1"
  )
    return;

  const id = "sprint-goals-direct";
  document.getElementById(id)?.remove();
  const host = document.createElement("div");
  host.id = id;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host{position:fixed;inset:0;z-index:2147483000;display:block;background:white}
    section{height:100%;display:flex;flex-direction:column;background:white;overflow:hidden}
    header{display:none}
    :host([data-error]) header{display:flex;padding:8px 12px;color:#ae2a19;background:#ffebe6;font:14px system-ui}
    iframe{border:0;width:100%;min-height:0;flex:1;background:white}
  `;
  const section = document.createElement("section");
  const header = document.createElement("header");
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  const frame = document.createElement("iframe");
  frame.title = "Sprint Goals Board";
  const url = new URL(boardUrl);
  url.searchParams.set("jiraHost", location.origin);
  url.searchParams.set("jiraBoard", location.href);
  frame.src = url.href;

  const refresh = () =>
    frame.contentWindow?.postMessage({ type: "sprint-goals:refresh" }, url.origin);
  let ticketDialog: HTMLDialogElement | null = null;
  let ticketTimer: ReturnType<typeof setInterval> | null = null;
  const closeTicket = () => {
    const wasOpen = ticketDialog !== null;
    if (ticketTimer) clearInterval(ticketTimer);
    ticketTimer = null;
    ticketDialog?.remove();
    ticketDialog = null;
    if (wasOpen) refresh();
  };

  /** Popin modale de la page Jira ; Échap la referme et relit le board. */
  const popin = (label: string, css: string) => {
    closeTicket();
    const dialog = document.createElement("dialog");
    ticketDialog = dialog;
    dialog.setAttribute("aria-label", label);
    dialog.style.cssText = `${css};box-sizing:border-box;margin:auto;padding:0;border:1px solid #dcdfe4;border-radius:10px;background:white;overflow:hidden;z-index:2147483647`;
    const hint = document.createElement("p");
    hint.setAttribute("role", "status");
    hint.style.cssText = "position:absolute;inset:20px auto auto 20px;margin:0;font:14px system-ui";
    const page = document.createElement("iframe");
    page.title = label;
    page.style.cssText = "display:block;border:0;width:100%;height:100%;visibility:hidden";
    dialog.append(hint, page);
    document.body.append(dialog);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeTicket();
    });
    dialog.showModal();
    const reveal = () => {
      page.style.visibility = "visible";
      hint.remove();
    };
    return { dialog, hint, page, reveal };
  };

  const visible = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  /** Clic sur une carte : la fiche Jira complète du ticket, dans une popin. */
  const openTicket = (key: string) => {
    // Dimensions mesurées sur la popin Jira : 1 280 px, avec 60 px de marge verticale.
    const { hint, page, reveal } = popin(
      `Ticket Jira ${key}`,
      "--ticket-margin-x:clamp(16px,4vw,60px);--ticket-margin-y:clamp(16px,5vh,60px);width:1280px;max-width:calc(100vw - var(--ticket-margin-x) - var(--ticket-margin-x));height:calc(100vh - var(--ticket-margin-y) - var(--ticket-margin-y));max-height:calc(100vh - 32px)",
    );
    hint.textContent = `Chargement de ${key}…`;
    const address = new URL(location.href);
    address.searchParams.delete("sprintGoals");
    address.searchParams.set("selectedIssue", key);
    page.src = address.href;

    let ready = false;
    const expires = Date.now() + 30000;
    ticketTimer = setInterval(() => {
      if (!host.isConnected) {
        closeTicket();
        return;
      }
      try {
        const doc = page.contentDocument;
        const win = page.contentWindow;
        if (!doc || !win) throw new Error("frame inaccessible");
        if (ready && !new URL(win.location.href).searchParams.has("selectedIssue")) {
          closeTicket();
          return;
        }
        if (!ready) {
          const label = (element: HTMLElement) =>
            (element.getAttribute("aria-label") ?? element.textContent ?? "").trim();
          const close = [...doc.querySelectorAll<HTMLElement>('button,[role="button"]')].find(
            (element) => /^(Close|Fermer)$/.test(label(element)) && visible(element),
          );
          let panel: HTMLElement | null = null;
          for (
            let parent = close?.parentElement;
            parent && parent !== doc.body;
            parent = parent.parentElement
          ) {
            const box = parent.getBoundingClientRect();
            if (
              box.height > win.innerHeight * 0.45 &&
              box.width > 250 &&
              box.width < win.innerWidth * 0.95
            )
              panel = parent;
          }
          if (
            panel &&
            [...panel.querySelectorAll<HTMLAnchorElement>("a[href]")].some(
              (link) => new URL(link.href).pathname === `/browse/${key}`,
            )
          ) {
            const css = doc.createElement("style");
            css.textContent =
              'body{visibility:hidden!important}[data-sprint-goals-ticket],[data-sprint-goals-ticket] *{visibility:visible!important}[role="dialog"],[role="dialog"] *,[role="menu"],[role="menu"] *,[role="listbox"],[role="listbox"] *{visibility:visible!important}';
            doc.head.append(css);
            panel.setAttribute("data-sprint-goals-ticket", "");
            panel.style.cssText +=
              ";position:fixed!important;inset:0!important;width:100%!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;box-sizing:border-box!important;background:white;z-index:10;overflow:auto";
            reveal();
            ready = true;
          }
        }
      } catch {
        // Jira peut momentanément reconstruire son panneau pendant son chargement.
      }
      if (!ready && Date.now() > expires) {
        closeTicket();
        host.setAttribute("data-error", "");
        status.textContent =
          "Jira n'a pas permis d'afficher ce ticket ici. Rechargez la vue puis réessayez.";
      }
    }, 300);
  };

  /**
   * Transition du workflow qui exige des champs : l'écran de CETTE transition, désignée par son
   * identifiant, tel que Jira l'affiche (`CommentAssignIssue!default.jspa?id=<ticket>&action=<transition>`).
   * `!default` ne fait qu'afficher le formulaire : rien n'est exécuté avant que l'utilisateur ne le
   * valide lui-même. Ni fiche du ticket, ni menu de statut, ni clic de l'extension. La popin est
   * cadrée sur le seul formulaire ; quand Jira quitte cet écran (validé ou annulé), elle se ferme
   * et le board est relu. Si Jira n'affiche pas de formulaire (droits, erreur), sa page est
   * montrée telle quelle.
   */
  const openTransition = (
    key: string,
    issueId: string,
    transition: { id: string; name: string },
  ) => {
    const { dialog, hint, page, reveal } = popin(
      `${transition.name} — ${key}`,
      "width:min(760px,calc(100vw - 32px));height:min(640px,calc(100vh - 32px))",
    );
    hint.textContent = `Ouverture de « ${transition.name} »…`;
    const address = new URL("/secure/CommentAssignIssue!default.jspa", location.origin);
    address.searchParams.set("id", issueId);
    address.searchParams.set("action", transition.id);
    page.src = address.href;

    let shown = false;
    let croppedDocument: Document | null = null;
    let lastHeight = -1;
    let stableTicks = 0;
    const deadline = Date.now() + 10000;
    ticketTimer = setInterval(() => {
      if (!host.isConnected) {
        closeTicket();
        return;
      }
      try {
        const doc = page.contentDocument;
        const win = page.contentWindow;
        if (!doc || !win || win.location.href === "about:blank") return;
        // Jira a quitté l'écran de transition (validé, annulé ou redirigé) : on referme et on
        // relit le board, qui montrera l'état réel du ticket.
        if (!win.location.pathname.startsWith("/secure/CommentAssignIssue")) {
          closeTicket();
          return;
        }
        if (doc.readyState !== "complete") return;
        const form = [...doc.querySelectorAll<HTMLFormElement>("form")].find(
          (candidate) => candidate.action.includes("CommentAssignIssue") && visible(candidate),
        );
        if (form && croppedDocument !== doc) {
          // Nouveau document (premier affichage, ou erreurs de saisie renvoyées par Jira).
          croppedDocument = doc;
          stableTicks = 0;
          lastHeight = -1;
          const crop = doc.createElement("style");
          crop.textContent =
            "body *{visibility:hidden!important}[data-sprint-goals-transition],[data-sprint-goals-transition] *{visibility:visible!important}";
          doc.head.append(crop);
          form.setAttribute("data-sprint-goals-transition", "");
          form.style.cssText +=
            ";position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:auto!important;width:auto!important;height:auto!important;max-width:none!important;max-height:100%!important;margin:0!important;padding:20px 24px!important;box-sizing:border-box!important;overflow:auto!important;background:white!important;z-index:2147483647!important";
        }
        if (form && croppedDocument === doc) {
          // Hauteur de son contenu une fois stable (ses éditeurs se chargent) : celle de la popin.
          // Le formulaire garde sa hauteur naturelle, plafonnée à la popin : `scrollHeight` donne
          // tout son contenu, même quand il dépasse.
          const height = form.scrollHeight;
          stableTicks = height === lastHeight ? stableTicks + 1 : 0;
          lastHeight = height;
          if (stableTicks >= 2) {
            dialog.style.height = `${Math.min(Math.max(height, 240), window.innerHeight - 32)}px`;
            if (!shown) {
              shown = true;
              reveal();
            }
          }
        } else if (!shown && Date.now() > deadline) {
          // Pas de formulaire de transition : Jira a répondu autre chose, montré tel quel.
          shown = true;
          dialog.style.width = "min(1280px,calc(100vw - 32px))";
          dialog.style.height = "calc(100vh - 32px)";
          reveal();
        }
      } catch {
        // Page en cours de chargement ou momentanément inaccessible : on réessaie.
      }
    }, 300);
  };

  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== url.origin) return;
    const data = event.data;
    if (data?.type !== "sprint-goals:open-issue" || !/^[A-Z][A-Z0-9_]*-[1-9]\d*$/.test(data.key))
      return;
    host.removeAttribute("data-error");
    const transition = data.transition;
    if (
      transition &&
      typeof data.issueId === "string" &&
      /^\d+$/.test(data.issueId) &&
      typeof transition.id === "string" &&
      /^\d+$/.test(transition.id) &&
      typeof transition.name === "string" &&
      transition.name.length < 200
    ) {
      openTransition(data.key, data.issueId, { id: transition.id, name: transition.name });
      return;
    }
    openTicket(data.key);
  };
  window.addEventListener("message", onMessage);

  const observer = new MutationObserver(() => {
    if (host.isConnected) return;
    closeTicket();
    observer.disconnect();
    window.removeEventListener("message", onMessage);
  });
  header.append(status);
  section.append(header, frame);
  root.append(style, section);
  document.body.append(host);
  observer.observe(document.body, { childList: true });
}
