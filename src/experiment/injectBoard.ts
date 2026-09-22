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

  const openTicket = (key: string, transition: { id: string; name: string } | null = null) => {
    closeTicket();
    const dialog = document.createElement("dialog");
    ticketDialog = dialog;
    dialog.setAttribute("aria-label", `Ticket Jira ${key}`);
    // Dimensions mesurées sur la popin Jira : 1 280 px, avec 60 px de marge verticale.
    dialog.style.cssText =
      "--ticket-margin-x:clamp(16px,4vw,60px);--ticket-margin-y:clamp(16px,5vh,60px);box-sizing:border-box;width:1280px;max-width:calc(100vw - var(--ticket-margin-x) - var(--ticket-margin-x));height:calc(100vh - var(--ticket-margin-y) - var(--ticket-margin-y));max-height:calc(100vh - 32px);margin:auto;padding:0;border:1px solid #dcdfe4;border-radius:10px;background:white;overflow:hidden;z-index:2147483647";
    const hint = document.createElement("p");
    hint.setAttribute("role", "status");
    hint.style.cssText = "position:absolute;inset:20px auto auto 20px;font:14px system-ui";
    hint.textContent = `Chargement de ${key}…`;
    const ticket = document.createElement("iframe");
    ticket.title = `Ticket Jira ${key}`;
    ticket.style.cssText = "display:block;border:0;width:100%;height:100%;visibility:hidden";
    const address = new URL(location.href);
    address.searchParams.delete("sprintGoals");
    address.searchParams.set("selectedIssue", key);
    ticket.src = address.href;
    dialog.append(hint, ticket);
    document.body.append(dialog);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeTicket();
    });
    dialog.showModal();

    let ready = false;
    let ticketPanel: HTMLElement | null = null;
    let transitionMenuOpened = false;
    let transitionMenuAttemptedAt = 0;
    let transitionOpened = false;
    let focusedTransitionDialog: HTMLElement | null = null;
    // Fenêtres déjà présentes au choix de la transition (fiche du ticket comprise) : celle du
    // formulaire est celle qui apparaît ensuite.
    let dialogsBefore: Set<Element> | null = null;
    let lastDialogSize = "";
    let stableTicks = 0;
    // Transition : la fiche reste cachée jusqu'à ce que son formulaire soit isolé ; passé ce délai
    // sans formulaire reconnu, elle est montrée pour que l'utilisateur agisse lui-même.
    let transitionDeadline = 0;
    const revealTicket = () => {
      ticket.style.visibility = "visible";
      hint.remove();
    };
    let transitionDialogMissingSince = 0;
    const expires = Date.now() + 30000;
    ticketTimer = setInterval(() => {
      if (!host.isConnected) {
        closeTicket();
        return;
      }
      try {
        const doc = ticket.contentDocument;
        const win = ticket.contentWindow;
        if (!doc || !win) throw new Error("frame inaccessible");
        if (ready && !new URL(win.location.href).searchParams.has("selectedIssue")) {
          closeTicket();
          return;
        }
        const visible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const label = (element: HTMLElement) =>
          (element.getAttribute("aria-label") ?? element.textContent ?? "").trim();
        const normalized = (value: string) =>
          value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLocaleLowerCase();
        if (!ready) {
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
            if (transition) {
              hint.textContent = `Ouverture de « ${transition.name} »…`;
              transitionDeadline = Date.now() + 8000;
            } else {
              revealTicket();
            }
            ready = true;
            ticketPanel = panel;
          }
        }
        if (ready && transition && !transitionOpened) {
          const transitionName = normalized(transition.name);
          const items = [
            ...doc.querySelectorAll<HTMLElement>(
              '[role="menuitem"],[role="option"],[role="menu"] button,[role="listbox"] button',
            ),
          ].filter(visible);
          // Cliquer un élément de ce menu exécute la transition dans Jira si elle n'a pas d'écran :
          // une erreur d'élément serait une écriture non voulue. On ne clique donc que sur un
          // élément sûr : il porte l'identifiant exact de la transition (valeur d'attribut
          // délimitée) et son nom, ou, à défaut, son libellé est exactement le nom de la
          // transition, sans autre candidat. Sinon, le menu reste ouvert : l'utilisateur choisit.
          const idPattern = new RegExp(`(?:^|\\D)${transition.id}(?:\\D|$)`);
          const mentions = items.filter((element) =>
            normalized(label(element)).includes(transitionName),
          );
          if (mentions.length > 0) {
            const identified = mentions.filter((element) =>
              [...element.attributes].some(({ value }) => idPattern.test(value)),
            );
            const exact = items.filter((element) => normalized(label(element)) === transitionName);
            const choice =
              identified.length === 1
                ? identified[0]
                : identified.length === 0 && exact.length === 1
                  ? exact[0]
                  : null;
            // Choix automatique ou manuel, plus aucun clic n'est tenté pour cette transition.
            transitionOpened = true;
            dialogsBefore = new Set(doc.querySelectorAll('[role="dialog"]'));
            // Sans choix sûr, la fiche est montrée : l'utilisateur choisit dans le menu de Jira.
            if (choice) choice.click();
            else revealTicket();
          } else if (
            !transitionMenuOpened ||
            (Date.now() - transitionMenuAttemptedAt > 1500 &&
              ![...doc.querySelectorAll<HTMLElement>('[role="menu"],[role="listbox"]')].some(
                visible,
              ))
          ) {
            const scope = ticketPanel ?? doc.body;
            const statusButtons = [
              ...scope.querySelectorAll<HTMLElement>('button,[role="button"]'),
            ].filter((element) => {
              if (!visible(element)) return false;
              const description = normalized(
                `${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("title") ?? ""}`,
              );
              const testId = normalized(
                `${element.getAttribute("data-testid") ?? ""} ${element.getAttribute("data-test-id") ?? ""}`,
              );
              return (
                /(?:change|changer|modifier).*(?:status|statut)|(?:status|statut).*(?:change|changer|modifier)/.test(
                  description,
                ) ||
                (testId.includes("status") && element.getAttribute("aria-haspopup") !== null)
              );
            });
            if (statusButtons.length === 1) {
              transitionMenuOpened = true;
              transitionMenuAttemptedAt = Date.now();
              statusButtons[0]?.click();
            }
          }
        }
        if (ready && transition && transitionOpened) {
          if (!focusedTransitionDialog) {
            const transitionName = normalized(transition.name);
            // Fenêtre apparue depuis le choix de la transition, avec un formulaire ou une iframe :
            // Jira affiche certains écrans de transition « classiques » (temps passé, estimation
            // restante, commentaire) dans une iframe de même origine, où se trouvent les champs
            // et même le titre.
            const fresh = [...doc.querySelectorAll<HTMLElement>('[role="dialog"]')].filter(
              (element) =>
                !dialogsBefore?.has(element) &&
                element !== ticketPanel &&
                !(ticketPanel && element.contains(ticketPanel)) &&
                visible(element) &&
                Boolean(
                  element.querySelector(
                    'form,input,textarea,select,[role="combobox"],[contenteditable="true"],iframe',
                  ),
                ),
            );
            const text = (element: HTMLElement) => {
              let content = element.textContent ?? "";
              for (const frame of element.querySelectorAll("iframe")) {
                try {
                  content += ` ${frame.contentDocument?.body?.textContent ?? ""}`;
                } catch {
                  // Iframe d'une autre origine : son texte n'est pas lisible, on s'en passe.
                }
              }
              return normalized(content);
            };
            const named = fresh.filter((element) => text(element).includes(transitionName));
            const candidate = named.length === 1 ? named[0] : fresh.length === 1 ? fresh[0] : null;
            // La taille de la fenêtre donne celle de la popin.
            const box = candidate?.getBoundingClientRect();
            const size = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "";
            // Iframes chargées et taille inchangée pendant trois passages (environ une seconde) : un
            // écran classique grandit après le chargement de son iframe.
            const loaded =
              candidate !== null &&
              candidate !== undefined &&
              [...candidate.querySelectorAll("iframe")].every((frame) => {
                try {
                  return frame.contentDocument?.readyState === "complete";
                } catch {
                  return true;
                }
              });
            stableTicks = loaded && size === lastDialogSize ? stableTicks + 1 : 0;
            lastDialogSize = size;
            if (stableTicks >= 3 && box && candidate) {
              revealTicket();
              focusedTransitionDialog = candidate;
              const crop = doc.createElement("style");
              crop.setAttribute("data-sprint-goals-transition-style", "");
              crop.textContent =
                'body *,[data-sprint-goals-ticket],[data-sprint-goals-ticket] *{visibility:hidden!important}[data-sprint-goals-transition],[data-sprint-goals-transition] *{visibility:visible!important}[role="menu"],[role="menu"] *,[role="listbox"],[role="listbox"] *{visibility:visible!important}';
              doc.head.append(crop);
              focusedTransitionDialog.setAttribute("data-sprint-goals-transition", "");
              focusedTransitionDialog.style.cssText +=
                ";position:fixed!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;box-sizing:border-box!important;overflow:auto!important";
              const width = Math.max(320, Math.min(box.width, win.innerWidth - 32));
              const height = Math.max(240, Math.min(box.height, win.innerHeight - 32));
              dialog.style.width = `${Math.round(width)}px`;
              dialog.style.height = `${Math.round(height)}px`;
              dialog.style.maxWidth = "calc(100vw - 32px)";
              dialog.style.maxHeight = "calc(100vh - 32px)";
            }
          } else if (!focusedTransitionDialog.isConnected || !visible(focusedTransitionDialog)) {
            if (transitionDialogMissingSince === 0) transitionDialogMissingSince = Date.now();
            else if (Date.now() - transitionDialogMissingSince > 600) closeTicket();
          } else {
            transitionDialogMissingSince = 0;
          }
        }
        // Menu ou formulaire jamais reconnu : la fiche est montrée, l'utilisateur agit dans Jira.
        if (ready && transition && !focusedTransitionDialog && Date.now() > transitionDeadline)
          revealTicket();
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

  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== url.origin) return;
    const data = event.data;
    if (data?.type !== "sprint-goals:open-issue" || !/^[A-Z][A-Z0-9_]*-[1-9]\d*$/.test(data.key))
      return;
    const transition =
      data.transition &&
      typeof data.transition.id === "string" &&
      /^\d+$/.test(data.transition.id) &&
      typeof data.transition.name === "string" &&
      data.transition.name.length < 200
        ? { id: data.transition.id, name: data.transition.name }
        : null;
    host.removeAttribute("data-error");
    openTicket(data.key, transition);
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
