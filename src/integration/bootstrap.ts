// Script isolé et sans import. Sur un board Jira, il propose un bouton d'ouverture ; sur les
// autres pages Jira, il reste inerte.
declare const __INTEGRATION_MESSAGES__: Readonly<
  Record<"en" | "es", Readonly<Record<string, string>>>
>;
(() => {
  if (window.top !== window) return;
  const marker = "sprint-goals-direct-bootstrap";
  if (document.documentElement.hasAttribute(marker)) return;
  document.documentElement.setAttribute(marker, "");

  // Doublon nommé de src/integration/messages.ts (ce script n'importe aucun module), comparé par
  // tests/integration/messages.test.ts.
  // <protocole sprint-goals>
  const PROTOCOL = {
    launch: {
      type: "sprint-goals:launch",
      channel: "runtime",
      direction: "content-to-worker",
      fields: {},
    },
  };
  // </protocole sprint-goals>

  const buttonId = "sprint-goals-open";
  // Même clé dans AppModel.disconnect ; une entrée par site, jamais partagée avec Jira.
  const positionKey = `jira-button-position.v1:${location.origin}`;
  // Même clé que LANGUAGE_PREFERENCE_KEY ; ce script n'importe aucun module.
  const languageKey = "language.v1";
  type Position = { x: number; y: number };
  let position: Position | null = null;
  let revision = 0;
  let stopped = false;
  let disposeButton = () => {};
  let reposition = () => {};
  let preference: "auto" | "fr" | "en" | "es" = "auto";
  let preferenceRevision = 0;
  let refreshLanguage = () => {};
  const t = (source: string) => {
    const locale = document.documentElement.lang.trim().replaceAll("_", "-").toLowerCase();
    const detected = /^(fr|es)(?:-[a-z0-9]{2,8})*$/.exec(locale)?.[1];
    const language =
      preference === "auto"
        ? detected === "fr" || detected === "es"
          ? detected
          : "en"
        : preference;
    return language === "fr" ? source : (__INTEGRATION_MESSAGES__[language][source] ?? source);
  };
  const readPreference = (value: unknown) => {
    preference = value === "fr" || value === "en" || value === "es" ? value : "auto";
    refreshLanguage();
  };
  const decodePosition = (value: unknown): Position | null => {
    if (!value || typeof value !== "object") return null;
    const { x, y } = value as Position;
    return typeof x === "number" &&
      Number.isFinite(x) &&
      typeof y === "number" &&
      Number.isFinite(y)
      ? { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
      : null;
  };
  /** Même forme d'adresse que `sprintGoalsBoardRoute` (boardRoute.ts), sans le marqueur. */
  const isBoardPage = (url: URL) => /^\/jira\/.*\/boards\/[1-9]\d*(?:\/|$)/.test(url.pathname);

  /**
   * Charge l'adresse courante marquée pour la vue Sprint Goals. C'est un vrai chargement de page :
   * ajouté sans recharger (`history.pushState`), le marqueur ne tenait pas dans le Jira de Denis
   * et la vue ne s'ouvrait pas (0.26.1).
   */
  const open = () => {
    const url = new URL(location.href);
    if (!isBoardPage(url)) return;
    url.searchParams.set("sprintGoals", "1");
    // Une fiche ticket ouverte sur le board ne doit pas remplacer le board au lancement.
    url.searchParams.delete("selectedIssue");
    location.assign(url.href);
  };

  /**
   * Bouton compact, isolé des styles de Jira. La poignée déplace l'ensemble ; seule l'icône
   * ouvre le board. Il peut tenir dans l'en-tête ; le défaut reste à gauche de Rovo.
   */
  const showButton = () => {
    if (document.getElementById(buttonId)) return;
    disposeButton();
    const host = document.createElement("div");
    host.id = buttonId;
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host{position:fixed;z-index:2147482000;display:flex;max-width:calc(100vw - 8px);box-sizing:border-box;border:1px solid #dcdfe4;border-radius:8px;background:white;box-shadow:0 1px 3px rgba(9,30,66,.14)}
      button{display:flex;align-items:center;justify-content:center;box-sizing:border-box;height:32px;padding:0;border:0;border-radius:6px;background:transparent;color:#172b4d;font:600 14px/1 system-ui,sans-serif;cursor:pointer;min-width:0}
      button:hover{background:#f1f2f4}
      button:focus-visible{outline:2px solid #0c66e4;outline-offset:2px}
      .grip{flex:none;width:24px;cursor:grab;touch-action:none;user-select:none;color:#626f86}
      .grip:active{cursor:grabbing}
      .open{width:32px}
      img{display:block;width:20px;height:20px;flex:none}
      .label,.status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    `;
    const grip = document.createElement("button");
    grip.type = "button";
    grip.className = "grip";
    grip.textContent = "⠿";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "open";
    refreshLanguage = () => {
      grip.setAttribute("aria-label", t("Déplacer le bouton Sprint Goals"));
      grip.title = t(
        "Glisser pour déplacer ; flèches du clavier : 10 px, Maj : 1 px ; Échap : annuler le glissement",
      );
      button.title = t("Ouvrir ce board dans Sprint Goals");
      button.setAttribute("aria-label", button.title);
    };
    refreshLanguage();
    const icon = document.createElement("img");
    icon.alt = "";
    icon.src = chrome.runtime.getURL("icons/icon-32.png");
    icon.draggable = false;
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "Sprint Goals";
    const status = document.createElement("span");
    status.className = "status";
    status.setAttribute("role", "status");
    button.append(icon, label);
    button.addEventListener("click", open);
    root.append(style, grip, button, status);
    document.body.append(host);

    const controller = new AbortController();
    const options = { signal: controller.signal };
    // Laisser la place au contour de focus, tout en permettant un placement dans l'en-tête.
    const edge = 4;
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const bounds = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? innerWidth;
      const height = viewport?.height ?? innerHeight;
      host.style.maxWidth = `${Math.max(0, width - 2 * edge)}px`;
      const rect = host.getBoundingClientRect();
      const left =
        (viewport?.offsetLeft ?? 0) + Math.min(edge, Math.max(0, (width - rect.width) / 2));
      const top =
        (viewport?.offsetTop ?? 0) + Math.min(edge, Math.max(0, (height - rect.height) / 2));
      return {
        left,
        top,
        travelX: Math.max(0, width - rect.width - 2 * edge),
        travelY: Math.max(0, height - rect.height - 2 * edge),
      };
    };
    const place = (wanted = position) => {
      const b = bounds();
      // Les redimensionnements ne réécrivent jamais la préférence de l'utilisateur.
      host.style.left = `${b.left + (wanted ? wanted.x * b.travelX : Math.max(0, b.travelX - (96 - edge)))}px`;
      host.style.top = `${b.top + (wanted ? wanted.y * b.travelY : Math.max(0, b.travelY - (28 - edge)))}px`;
    };
    const at = (x: number, y: number): Position => {
      const b = bounds();
      return {
        x: b.travelX ? clamp((x - b.left) / b.travelX, 0, 1) : (position?.x ?? 1),
        y: b.travelY ? clamp((y - b.top) / b.travelY, 0, 1) : (position?.y ?? 1),
      };
    };
    const save = (next: Position) => {
      position = next;
      revision++;
      place();
      status.textContent = t("Position du bouton déplacée.");
      // Un stockage indisponible ne bloque pas le bouton pour cette page.
      void (async () => {
        try {
          await chrome.storage.local.set({ [positionKey]: next });
        } catch {
          status.textContent = t(
            "Position déplacée, mais impossible de l'enregistrer pour la prochaine visite.",
          );
        }
      })();
    };
    let drag: {
      id: number;
      x: number;
      y: number;
      left: number;
      top: number;
      moved: boolean;
      next: Position;
    } | null = null;
    const cancel = () => {
      const current = drag;
      drag = null;
      if (current && grip.hasPointerCapture(current.id)) grip.releasePointerCapture(current.id);
      place();
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      drag.moved = true;
      drag.next = at(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
      place(drag.next);
    };
    grip.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || drag) return;
        event.preventDefault();
        grip.focus({ preventScroll: true });
        revision++;
        const rect = host.getBoundingClientRect();
        drag = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: rect.left,
          top: rect.top,
          moved: false,
          next: at(rect.left, rect.top),
        };
        grip.setPointerCapture(event.pointerId);
      },
      options,
    );
    grip.addEventListener("pointermove", move, options);
    grip.addEventListener(
      "pointerup",
      (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        move(event);
        const finished = drag;
        drag = null;
        if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
        if (finished.moved) save(finished.next);
      },
      options,
    );
    grip.addEventListener("pointercancel", cancel, options);
    grip.addEventListener(
      "lostpointercapture",
      () => {
        if (drag) cancel();
      },
      options,
    );
    // La poignée ne lance jamais Jira, même avec le clic synthétisé après un glissement.
    grip.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      options,
    );
    grip.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && drag) {
          event.preventDefault();
          cancel();
          return;
        }
        if (drag || event.ctrlKey || event.altKey || event.metaKey) return;
        const delta = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        }[event.key];
        if (!delta) return;
        event.preventDefault();
        const rect = host.getBoundingClientRect();
        const step = event.shiftKey ? 1 : 10;
        save(at(rect.left + (delta[0] ?? 0) * step, rect.top + (delta[1] ?? 0) * step));
      },
      options,
    );
    // Zoom, écran et fenêtre : conserver le bouton dans la partie réellement visible.
    reposition = cancel;
    window.addEventListener("resize", cancel, options);
    window.addEventListener("blur", cancel, options);
    window.visualViewport?.addEventListener("resize", cancel, options);
    window.visualViewport?.addEventListener("scroll", cancel, options);
    const observer = new ResizeObserver(() => {
      if (!drag) place();
    });
    observer.observe(host);
    disposeButton = () => {
      controller.abort();
      observer.disconnect();
      drag = null;
      host.remove();
      reposition = () => {};
      refreshLanguage = () => {};
    };
    place();
  };
  const hideButton = () => {
    disposeButton();
    disposeButton = () => {};
  };

  const storageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local") return;
    if (Object.hasOwn(changes, languageKey)) {
      preferenceRevision++;
      readPreference(changes[languageKey]?.newValue);
    }
    if (!Object.hasOwn(changes, positionKey)) return;
    revision++;
    position = decodePosition(changes[positionKey]?.newValue);
    reposition();
  };
  chrome.storage.onChanged.addListener(storageChanged);
  const initialPreferenceRevision = preferenceRevision;
  const preferencesReady = chrome.storage.local
    .get(languageKey)
    .then((saved) => {
      if (!stopped && preferenceRevision === initialPreferenceRevision)
        readPreference(saved[languageKey]);
    })
    .catch(() => {});
  const initialRevision = revision;
  void (async () => {
    try {
      const saved = await chrome.storage.local.get(positionKey);
      if (stopped || revision !== initialRevision) return;
      position = decodePosition(saved[positionKey]);
      reposition();
    } catch {
      /* Position par défaut si le stockage est indisponible. */
    }
  })();

  /** Extension rechargée ou retirée : ce script n'a plus de contexte, il s'efface. */
  const stop = () => {
    stopped = true;
    clearInterval(timer);
    hideButton();
    chrome.storage.onChanged.removeListener(storageChanged);
    window.removeEventListener("popstate", onPopState);
    document.documentElement.removeAttribute(marker);
  };

  let previous = "";
  let busy = false;
  const check = async () => {
    await preferencesReady;
    if (stopped) return;
    refreshLanguage();
    const address = location.href;
    const url = new URL(address);
    const marked = url.searchParams.get("sprintGoals") === "1";
    // Revu à chaque passage, même sans changement d'adresse : Jira peut reconstruire sa page et
    // emporter le bouton, qui est alors reposé.
    if (marked || !isBoardPage(url)) hideButton();
    else
      try {
        showButton();
      } catch {
        stop();
        return;
      }
    if (busy || previous === address) return;
    previous = address;
    if (!marked) {
      document.getElementById("sprint-goals-direct")?.remove();
      return;
    }
    busy = true;
    try {
      await chrome.runtime.sendMessage({ type: PROTOCOL.launch.type });
    } catch {
      stop();
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void check(), 500);
  const onPopState = () => void check();
  window.addEventListener("popstate", onPopState);
  void preferencesReady.then(check);
})();
