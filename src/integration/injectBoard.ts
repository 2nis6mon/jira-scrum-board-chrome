/** Fonction autonome copiée par Chrome dans le monde isolé de l'onglet Jira. */
export function injectBoard(
  boardUrl: string,
  expectedAddress: string,
  localization?: {
    preference: "auto" | "fr" | "en" | "es";
    messages: Readonly<Record<"en" | "es", Readonly<Record<string, string>>>>;
  },
): void {
  if (!/^https:\/\/[^/]+\.atlassian\.net$/.test(location.origin)) return;
  const current = new URL(location.href);
  const expected = new URL(expectedAddress);
  if (
    current.origin !== expected.origin ||
    current.pathname !== expected.pathname ||
    current.searchParams.get("sprintGoals") !== "1"
  )
    return;

  // Tout reste autonome : Chrome copie cette fonction sans ses imports ni son module.
  const rawLocale = document.documentElement.lang.trim().replaceAll("_", "-").toLowerCase();
  const jiraLocale = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(rawLocale) ? rawLocale : "";
  let language =
    localization?.preference === "fr" ||
    localization?.preference === "en" ||
    localization?.preference === "es"
      ? localization.preference
      : jiraLocale.split("-")[0] === "fr"
        ? "fr"
        : jiraLocale.split("-")[0] === "es"
          ? "es"
          : "en";
  const t = (source: string, params: Readonly<Record<string, string>> = {}) =>
    (language === "fr" ? source : (localization?.messages[language][source] ?? source)).replace(
      /\{([a-zA-Z]\w*)\}/g,
      (token, name: string) => params[name] ?? token,
    );

  // Doublons nommés de src/integration/messages.ts, comparés par tests/integration/messages.test.ts.
  // <protocole sprint-goals>
  const PROTOCOL = {
    refresh: {
      type: "sprint-goals:refresh",
      channel: "postMessage",
      direction: "host-to-view",
      fields: {},
    },
    language: {
      type: "sprint-goals:language",
      channel: "postMessage",
      direction: "view-to-host",
      fields: { language: { kind: "enum", values: ["fr", "en", "es"] } },
    },
    close: {
      type: "sprint-goals:close",
      channel: "postMessage",
      direction: "view-to-host",
      fields: {},
    },
    openBoard: {
      type: "sprint-goals:open-board",
      channel: "postMessage",
      direction: "view-to-host",
      fields: {
        boardId: { kind: "integer", min: 1 },
        projectKey: { kind: "string", pattern: "^[A-Z][A-Z0-9_]*$" },
      },
    },
    openIssue: {
      type: "sprint-goals:open-issue",
      channel: "postMessage",
      direction: "view-to-host",
      fields: {
        key: { kind: "string", pattern: "^[A-Z][A-Z0-9_]*-[1-9]\\d*$" },
        transition: {
          kind: "object",
          optional: true,
          fields: {
            id: { kind: "string", pattern: "^\\d+$" },
            name: { kind: "string", maxLength: 199 },
            to: { kind: "string", maxLength: 199, optional: true },
          },
        },
      },
    },
    sprintDialog: {
      type: "sprint-goals:sprint-dialog",
      channel: "postMessage",
      direction: "view-to-host",
      fields: {
        action: { kind: "enum", values: ["complete", "start"] },
        sprintName: { kind: "string", maxLength: 199 },
      },
    },
    launch: {
      type: "sprint-goals:launch",
      channel: "runtime",
      direction: "content-to-worker",
      fields: {},
    },
    prepareLaunch: {
      type: "sprint-goals:prepare-launch",
      channel: "runtime",
      direction: "launcher-to-worker",
      fields: {},
    },
  };
  // </protocole sprint-goals>
  // <validation sprint-goals>
  type SprintGoalsRule = {
    readonly kind: string;
    readonly optional?: boolean;
    readonly values?: readonly string[];
    readonly min?: number;
    readonly pattern?: string;
    readonly maxLength?: number;
    readonly fields?: Readonly<Record<string, SprintGoalsRule>>;
  };
  type SprintGoalsDeclaration = {
    readonly type: string;
    readonly direction: string;
    readonly fields: Readonly<Record<string, SprintGoalsRule>>;
  };
  function readSprintGoalsValue(rule: SprintGoalsRule, value: unknown): unknown {
    if (rule.kind === "enum")
      return typeof value === "string" && rule.values?.includes(value) ? value : undefined;
    if (rule.kind === "integer")
      return Number.isSafeInteger(value) && (rule.min === undefined || Number(value) >= rule.min)
        ? value
        : undefined;
    if (rule.kind === "string")
      return typeof value === "string" &&
        (rule.pattern === undefined || new RegExp(rule.pattern).test(value)) &&
        (rule.maxLength === undefined || value.length <= rule.maxLength)
        ? value
        : undefined;
    if (rule.kind === "object") return readSprintGoalsFields(rule.fields ?? {}, value) ?? undefined;
    return undefined;
  }
  function readSprintGoalsFields(
    fields: Readonly<Record<string, SprintGoalsRule>>,
    value: unknown,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== "object") return null;
    const read: Record<string, unknown> = {};
    for (const [name, rule] of Object.entries(fields)) {
      const field = readSprintGoalsValue(rule, (value as Record<string, unknown>)[name]);
      if (field === undefined && !rule.optional) return null;
      read[name] = field === undefined ? null : field;
    }
    return read;
  }
  function readSprintGoalsMessage(
    protocol: Readonly<Record<string, SprintGoalsDeclaration>>,
    data: unknown,
    direction: string,
  ): Record<string, unknown> | null {
    if (!data || typeof data !== "object") return null;
    const type = (data as { type?: unknown }).type;
    const declaration = Object.values(protocol).find(
      (candidate) => candidate.type === type && candidate.direction === direction,
    );
    const fields = declaration ? readSprintGoalsFields(declaration.fields, data) : null;
    return declaration && fields ? { type: declaration.type, ...fields } : null;
  }
  // </validation sprint-goals>

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
    :host([data-leaving]) header{display:flex;padding:8px 12px;color:#172b4d;background:#e9f2ff;font:14px system-ui}
    iframe{border:0;width:100%;min-height:0;flex:1;background:white}
  `;
  const section = document.createElement("section");
  const header = document.createElement("header");
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  const frame = document.createElement("iframe");
  frame.title = "Sprint Goals Board";
  // Le mode Daily demande le plein écran depuis la page du board : sans cette délégation, le
  // navigateur le refuse à un cadre (la daily se déroule alors dans la page).
  frame.allow = "fullscreen";
  const url = new URL(boardUrl);
  url.searchParams.set("jiraHost", location.origin);
  url.searchParams.set("jiraBoard", location.href);
  if (jiraLocale) url.searchParams.set("jiraLocale", jiraLocale);
  frame.src = url.href;

  const refresh = () =>
    frame.contentWindow?.postMessage({ type: PROTOCOL.refresh.type }, url.origin);
  let ticketSession: { dialog: HTMLDialogElement; stop: () => void } | null = null;
  const closeTicket = () => {
    const session = ticketSession;
    if (!session) return;
    ticketSession = null;
    session.stop();
    session.dialog.remove();
    refresh();
  };

  /** Élément réellement affiché (les mesures viennent de la page Jira encadrée). */
  const visible = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  /** Popin modale posée sur la page Jira ; Échap la referme et relit le board. */
  const popin = (label: string) => {
    closeTicket();
    const dialog = document.createElement("dialog");
    const session = { dialog, stop: () => {} };
    ticketSession = session;
    dialog.setAttribute("aria-label", label);
    // Le viewport encadré doit rester celui de l'onglet : Jira dimensionne lui-même sa fiche,
    // son en-tête et ses colonnes. Un cadre déjà réduit soustrairait ses marges une seconde fois.
    dialog.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;box-sizing:border-box;margin:auto;padding:0;border:0;background:transparent;overflow:hidden;z-index:2147483647";
    const hint = document.createElement("p");
    hint.setAttribute("role", "status");
    hint.style.cssText =
      "position:absolute;inset:20px auto auto 20px;margin:0;padding:8px 12px;border-radius:6px;background:white;font:14px system-ui";
    const page = document.createElement("iframe");
    page.title = label;
    page.style.cssText =
      "display:block;border:0;width:100%;height:100%;background:transparent;visibility:hidden";
    dialog.append(hint, page);
    document.body.append(dialog);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (ticketSession === session) closeTicket();
    });
    dialog.showModal();
    const reveal = () => {
      page.style.visibility = "visible";
      hint.remove();
    };
    return { dialog, hint, page, reveal, session };
  };

  /**
   * Trace locale, dans la console de l'onglet : c'est le seul moyen de savoir où l'ouverture
   * s'arrête sur un Jira auquel le développeur n'a pas accès.
   */
  const trace = (step: string, detail: unknown = "") =>
    // biome-ignore lint/suspicious/noConsole: journal de diagnostic de l'intégration Jira.
    console.info("Sprint Goals —", step, detail);

  type Transition = { id: string; name: string; to: string | null };
  const label = (element: HTMLElement) =>
    (element.getAttribute("aria-label") ?? element.textContent ?? "").trim();
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase();

  /** La fiche doit réunir bouton de fermeture, taille de panneau et lien du ticket demandé. */
  const findTicketPanel = (doc: Document, win: Window, key: string): HTMLElement | null => {
    const closes = [...doc.querySelectorAll<HTMLElement>('button,[role="button"]')].filter(
      (element) => /^(Close|Fermer|Cerrar)$/.test(label(element)) && visible(element),
    );
    let fallback: HTMLElement | null = null;
    for (const close of closes) {
      let panel: HTMLElement | null = null;
      for (
        let parent = close.parentElement;
        parent && parent !== doc.body;
        parent = parent.parentElement
      ) {
        const box = parent.getBoundingClientRect();
        if (
          box.height <= win.innerHeight * 0.45 ||
          box.width <= 250 ||
          ![...parent.querySelectorAll<HTMLAnchorElement>("a[href]")].some(
            (link) => new URL(link.href).pathname === `/browse/${key}`,
          )
        )
          continue;
        // Une modale native peut occuper toute la largeur sur un petit écran. La limite
        // géométrique ne sert qu'au repli pour un panneau sans sémantique de dialogue.
        if (parent.getAttribute("role") === "dialog" || parent.tagName === "DIALOG") return parent;
        if (box.width < win.innerWidth * 0.95) panel = parent;
      }
      fallback ??= panel;
    }
    return fallback;
  };

  const isolateTicketPanel = (doc: Document, panel: HTMLElement) => {
    if (!doc.querySelector("[data-sprint-goals-ticket-style]")) {
      const css = doc.createElement("style");
      css.setAttribute("data-sprint-goals-ticket-style", "");
      // Masquer le board sans modifier sa géométrie ni celle de la fiche. Les portails Jira
      // restent dans le viewport entier : menus et fenêtres secondaires ne sont pas rognés.
      css.textContent =
        'html,body{background:transparent!important}body{visibility:hidden!important}[data-sprint-goals-ticket],[data-sprint-goals-ticket] *{visibility:visible!important}[role="dialog"],[role="dialog"] *,[role="menu"],[role="menu"] *,[role="listbox"],[role="listbox"] *{visibility:visible!important}';
      doc.head.append(css);
    }
    panel.setAttribute("data-sprint-goals-ticket", "");
  };

  const statusButtons = (scope: HTMLElement) =>
    [...scope.querySelectorAll<HTMLElement>('button,[role="button"]')].filter((element) => {
      if (!visible(element)) return false;
      const description = normalized(
        `${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("title") ?? ""}`,
      );
      const testId = normalized(
        `${element.getAttribute("data-testid") ?? ""} ${element.getAttribute("data-test-id") ?? ""}`,
      );
      return (
        /(?:change|changer|modifier|cambiar).*(?:status|statut|estado)|(?:status|statut|estado).*(?:change|changer|modifier|cambiar)/.test(
          description,
        ) ||
        (testId.includes("status") && element.getAttribute("aria-haspopup") !== null)
      );
    });

  /**
   * Un clic peut écrire dans Jira : exiger un identifiant délimité avec le nom, ou un libellé
   * exact et unique (nom seul ou suivi du statut). Toute ambiguïté rend la main à l'utilisateur.
   */
  const transitionChoice = (doc: Document, transition: Transition) => {
    const squashed = (value: string) => normalized(value).replace(/[^\p{L}\p{N}]+/gu, "");
    const texts = (element: HTMLElement) =>
      [element.getAttribute("aria-label"), element.textContent]
        .filter((value): value is string => Boolean(value))
        .map(squashed);
    const transitionName = squashed(transition.name);
    const wanted = [
      transitionName,
      ...(transition.to ? [squashed(`${transition.name} ${transition.to}`)] : []),
    ];
    const items = [
      ...doc.querySelectorAll<HTMLElement>(
        '[role="menuitem"],[role="option"],[role="menu"] button,[role="listbox"] button',
      ),
    ].filter(visible);
    const mentions = items.filter((element) =>
      texts(element).some((text) => text.includes(transitionName)),
    );
    if (mentions.length === 0) return { kind: "waiting" as const };
    const idPattern = new RegExp(`(?:^|\\D)${transition.id}(?:\\D|$)`);
    const identified = mentions.filter((element) =>
      [...element.attributes].some(({ value }) => idPattern.test(value)),
    );
    const exact = items.filter((element) => texts(element).some((text) => wanted.includes(text)));
    const choice =
      identified.length === 1
        ? identified[0]
        : identified.length === 0 && exact.length === 1
          ? exact[0]
          : null;
    return choice
      ? { kind: "automatic" as const, element: choice }
      : { kind: "manual" as const, wanted, labels: items.map(label) };
  };

  /** Formulaire Jira nouveau, moderne ou classique dans une iframe de même origine. */
  const findTransitionForm = (
    doc: Document,
    panel: HTMLElement,
    previous: Set<Element>,
    transition: Transition,
  ): HTMLElement | null => {
    const fresh = [...doc.querySelectorAll<HTMLElement>('[role="dialog"]')].filter(
      (element) =>
        !previous.has(element) &&
        element !== panel &&
        !element.contains(panel) &&
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
    const named = fresh.filter((element) => text(element).includes(normalized(transition.name)));
    return (named.length === 1 ? named[0] : fresh.length === 1 ? fresh[0] : null) ?? null;
  };

  const formFramesLoaded = (candidate: HTMLElement) =>
    [...candidate.querySelectorAll("iframe")].every((frame) => {
      try {
        return frame.contentDocument?.readyState === "complete";
      } catch {
        return true;
      }
    });

  const isolateTransitionForm = (doc: Document, form: HTMLElement) => {
    const css = doc.createElement("style");
    css.setAttribute("data-sprint-goals-transition-style", "");
    // Comme la fiche, le formulaire garde son viewport, ses dimensions et ses zones de
    // défilement natifs. Ne pas déplacer ses en-tête/pied ni redimensionner une iframe classique.
    css.textContent =
      'body *,[data-sprint-goals-ticket],[data-sprint-goals-ticket] *{visibility:hidden!important}[data-sprint-goals-transition],[data-sprint-goals-transition] *{visibility:visible!important}[role="menu"],[role="menu"] *,[role="listbox"],[role="listbox"] *{visibility:visible!important}';
    doc.head.append(css);
    form.setAttribute("data-sprint-goals-transition", "");
  };

  /**
   * Fiche du ticket, chargée cachée dans la popin. Sans transition, elle est montrée telle quelle.
   * Avec une transition qui exige des champs, la fiche reste cachée : on ouvre le menu de statut de
   * Jira, on y choisit la transition, et la fenêtre que Jira dessine lui-même (moderne ou
   * « classique » dans son iframe) est isolée dans la popin. C'est le seul chemin qui fait ouvrir sa
   * fenêtre à Jira Cloud : elle n'a pas d'adresse à laquelle la demander.
   */
  const openTicket = (key: string, transition: Transition | null = null) => {
    const { hint, page: ticket, session, reveal } = popin(t("Ticket Jira {key}", { key }));
    hint.textContent = t("Chargement de {key}…", { key });
    const address = new URL(location.href);
    address.searchParams.delete("sprintGoals");
    address.searchParams.set("selectedIssue", key);
    ticket.src = address.href;

    type NativeStep =
      | { kind: "waiting-ticket" }
      | { kind: "ticket-visible"; panel: HTMLElement }
      | {
          kind: "choosing-transition";
          panel: HTMLElement;
          deadline: number;
          menuAttemptedAt: number | null;
          missingButtonTraced: boolean;
        }
      | {
          kind: "waiting-form";
          panel: HTMLElement;
          deadline: number;
          dialogsBefore: Set<Element>;
          lastSize: string;
          stableTicks: number;
        }
      | { kind: "form-visible"; form: HTMLElement; missingSince: number | null }
      | { kind: "closed" };
    let step: NativeStep = { kind: "waiting-ticket" };
    let reachable = false;
    const revealAt = Date.now() + 12000;
    const expires = Date.now() + 20000;

    const recognizeTicket = (doc: Document, win: Window) => {
      const panel = findTicketPanel(doc, win, key);
      if (!panel) return;
      isolateTicketPanel(doc, panel);
      if (!transition) {
        step = { kind: "ticket-visible", panel };
        reveal();
        return;
      }
      hint.textContent = t("Ouverture de « {name} »…", { name: transition.name });
      step = {
        kind: "choosing-transition",
        panel,
        deadline: Date.now() + 8000,
        menuAttemptedAt: null,
        missingButtonTraced: false,
      };
      trace("fiche reconnue, ouverture du menu de statut", transition.name);
    };

    const chooseTransition = (
      current: Extract<NativeStep, { kind: "choosing-transition" }>,
      doc: Document,
    ) => {
      if (!transition) return;
      const choice = transitionChoice(doc, transition);
      if (choice.kind !== "waiting") {
        // Avant tout clic : mémoriser les fenêtres existantes et interdire un second choix.
        step = {
          kind: "waiting-form",
          panel: current.panel,
          deadline: current.deadline,
          dialogsBefore: new Set(doc.querySelectorAll('[role="dialog"]')),
          lastSize: "",
          stableTicks: 0,
        };
        if (choice.kind === "automatic") {
          trace("transition choisie dans le menu de Jira", label(choice.element));
          choice.element.click();
        } else {
          trace("aucun élément sûr, le menu reste au choix de l'utilisateur", {
            attendu: choice.wanted,
            proposés: choice.labels,
          });
          reveal();
        }
        return;
      }
      const menuVisible = [
        ...doc.querySelectorAll<HTMLElement>('[role="menu"],[role="listbox"]'),
      ].some(visible);
      if (
        current.menuAttemptedAt !== null &&
        (Date.now() - current.menuAttemptedAt <= 1500 || menuVisible)
      )
        return;
      const buttons = statusButtons(current.panel);
      if (buttons.length === 1) {
        current.menuAttemptedAt = Date.now();
        buttons[0]?.click();
      } else if (!current.missingButtonTraced) {
        current.missingButtonTraced = true;
        trace("bouton de statut pas encore reconnu, candidats", buttons.length);
      }
    };

    const recognizeForm = (
      current: Extract<NativeStep, { kind: "waiting-form" }>,
      doc: Document,
    ) => {
      if (!transition) return;
      const candidate = findTransitionForm(doc, current.panel, current.dialogsBefore, transition);
      const box = candidate?.getBoundingClientRect();
      const size = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "";
      // Trois passages stables après la première mesure ; une iframe classique peut agrandir Jira.
      const loaded = candidate !== null && formFramesLoaded(candidate);
      current.stableTicks = loaded && size === current.lastSize ? current.stableTicks + 1 : 0;
      current.lastSize = size;
      if (current.stableTicks < 3 || !box || !candidate) return;
      trace("fenêtre de Jira isolée", size);
      step = { kind: "form-visible", form: candidate, missingSince: null };
      reveal();
      isolateTransitionForm(doc, candidate);
    };

    const monitorFormClosure = (current: Extract<NativeStep, { kind: "form-visible" }>) => {
      if (current.form.isConnected && visible(current.form)) {
        current.missingSince = null;
      } else if (current.missingSince === null) {
        current.missingSince = Date.now();
      } else if (Date.now() - current.missingSince > 600) {
        closeTicket();
      }
    };

    const tick = () => {
      if (step.kind === "closed") return;
      if (!host.isConnected) {
        closeTicket();
        return;
      }
      try {
        const doc = ticket.contentDocument;
        const win = ticket.contentWindow;
        if (!doc || !win) throw new Error("frame inaccessible");
        reachable = true;
        if (
          step.kind !== "waiting-ticket" &&
          !new URL(win.location.href).searchParams.has("selectedIssue")
        ) {
          closeTicket();
          return;
        }
        if (step.kind === "waiting-ticket") recognizeTicket(doc, win);
        // Jira peut remplacer la fiche après une édition : retrouver sa racine sans toucher
        // aux styles ni perdre le défilement d'une fiche qui est toujours en place.
        if (step.kind === "ticket-visible" && !step.panel.isConnected) recognizeTicket(doc, win);
        // Chaque étape peut débloquer la suivante dans le même passage, comme le fait Jira.
        if (step.kind === "choosing-transition") chooseTransition(step, doc);
        if (step.kind === "waiting-form") recognizeForm(step, doc);
        if (step.kind === "form-visible") monitorFormClosure(step);
        // Repli sans clic supplémentaire imposé : afficher Jira pour une action manuelle.
        if (
          (step.kind === "choosing-transition" || step.kind === "waiting-form") &&
          Date.now() > step.deadline
        )
          reveal();
        if (step.kind === "waiting-ticket" && Date.now() > revealAt) reveal();
      } catch {
        // Jira peut momentanément reconstruire son panneau pendant son chargement.
      }
      if (!reachable && Date.now() > expires) {
        trace("page du ticket inaccessible dans un cadre");
        closeTicket();
        host.setAttribute("data-error", "");
        status.textContent = t(
          "Jira n'a pas permis d'afficher ce ticket ici. Rechargez la vue puis réessayez.",
        );
      }
    };
    const timer = setInterval(tick, 300);
    session.stop = () => {
      step = { kind: "closed" };
      clearInterval(timer);
    };
  };

  type SprintAction = "complete" | "start";
  /** Libellés exacts, normalisés, du bouton natif de la page backlog en fr/en/es. */
  const sprintButtonLabels: Readonly<Record<SprintAction, readonly string[]>> = {
    complete: ["complete sprint", "terminer le sprint", "completar sprint"],
    start: ["start sprint", "demarrer le sprint", "iniciar sprint"],
  };
  const sprintError = () => {
    // Toujours une seule relecture, popin ouverte ou non : la vue ne garde jamais de clôture
    // en attente.
    if (ticketSession) closeTicket();
    else refresh();
    host.setAttribute("data-error", "");
    status.textContent = t(
      "Jira n'a pas permis d'ouvrir la fenêtre du sprint ici. Ouvrez le backlog du board dans Jira.",
    );
  };

  /** Fenêtre réellement nouvelle et affichée, apparue après `previous`. */
  const freshDialogs = (doc: Document, previous: Set<Element>) =>
    [...doc.querySelectorAll<HTMLElement>('[role="dialog"]')].filter(
      (element) => !previous.has(element) && visible(element),
    );

  /**
   * Bouton « Terminer/Démarrer le sprint » à cliquer, seulement s'il est unique. Pour démarrer,
   * le plus grand conteneur qui ne contient que ce bouton (la ligne du sprint) doit nommer le
   * sprint ; pour terminer, ce nom départage plusieurs sprints actifs.
   */
  const sprintButtonChoice = (doc: Document, action: SprintAction, sprintName: string) => {
    const wanted = sprintButtonLabels[action];
    const matches = (element: HTMLElement) =>
      [element.getAttribute("aria-label"), element.textContent].some(
        (text) => text !== null && wanted.includes(normalized(text)),
      );
    const all = [...doc.querySelectorAll<HTMLElement>('button,[role="button"]')].filter(matches);
    const candidates = all.filter(visible);
    // Nom entier, délimité : « Sprint 1 » ne désigne pas la ligne de « Sprint 13 ».
    const name = normalized(sprintName);
    // Nom reçu à la longueur maximale du protocole : la vue l'a tronqué, il est reconnu comme
    // préfixe, sans limite de mot à droite.
    const truncated = sprintName.length >= PROTOCOL.sprintDialog.fields.sprintName.maxLength;
    const wordCharacter = /[\p{L}\p{N}]/u;
    const mentions = (value: string) => {
      if (!name) return false;
      for (let at = value.indexOf(name); at >= 0; at = value.indexOf(name, at + 1))
        if (
          !wordCharacter.test(value[at - 1] ?? "") &&
          (truncated || !wordCharacter.test(value[at + name.length] ?? ""))
        )
          return true;
      return false;
    };
    // Textes séparés par une espace : un titre et un compteur voisins ne se collent pas.
    const text = (element: HTMLElement) => {
      const parts: string[] = [];
      const walker = doc.createTreeWalker(element, 4 /* NodeFilter.SHOW_TEXT */);
      for (let node = walker.nextNode(); node; node = walker.nextNode())
        parts.push(node.nodeValue ?? "");
      return normalized(parts.join(" "));
    };
    const named = candidates.filter((button) => {
      let row: HTMLElement = button;
      for (
        let parent = button.parentElement;
        parent &&
        parent !== doc.body &&
        all.filter((other) => parent?.contains(other)).length === 1;
        parent = parent.parentElement
      )
        row = parent;
      return mentions(text(row));
    });
    const choice =
      named.length === 1
        ? named[0]
        : action === "complete" && candidates.length === 1
          ? candidates[0]
          : null;
    return { choice: choice ?? null, candidates: candidates.length, named: named.length };
  };

  const isolateSprintDialog = (doc: Document, dialog: HTMLElement) => {
    dialog.setAttribute("data-sprint-goals-sprint-dialog", "");
    // Fenêtre remontée ou fenêtre de suite : le style posé pour la première suffit.
    if (doc.querySelector("style[data-sprint-goals-sprint-dialog-style]")) return;
    const css = doc.createElement("style");
    css.setAttribute("data-sprint-goals-sprint-dialog-style", "");
    // La fenêtre garde son viewport et ses dimensions natifs ; le backlog derrière est masqué.
    // Ses listes et menus, ouverts dans des portails de Jira, restent visibles.
    css.textContent =
      'html,body{background:transparent!important}body *{visibility:hidden!important}[data-sprint-goals-sprint-dialog],[data-sprint-goals-sprint-dialog] *{visibility:visible!important}[role="dialog"],[role="dialog"] *,[role="menu"],[role="menu"] *,[role="listbox"],[role="listbox"] *{visibility:visible!important}';
    doc.head.append(css);
  };

  /** Fenêtres les plus extérieures : une fenêtre peut en imbriquer une autre (calendrier). */
  const outermost = (dialogs: HTMLElement[]) =>
    dialogs.filter(
      (element) => !dialogs.some((other) => other !== element && other.contains(element)),
    );

  /**
   * Clôture ou démarrage par la fenêtre native de Jira (S13) : la page backlog du board de cet
   * onglet est chargée cachée dans la popin, son unique bouton reconnu est cliqué, ce qui ouvre
   * la fenêtre de Jira sans rien écrire, et cette fenêtre seule est montrée. Elle n'est jamais
   * remplie ni validée ici. Bouton absent ou ambigu : la page est rendue à l'utilisateur.
   */
  const openSprintDialog = (action: SprintAction, sprintName: string) => {
    const address = new URL(location.href);
    // Mêmes adresses que bootstrap.ts : le board ou l'une de ses sous-pages.
    const board = /^(.*\/boards\/\d+)(?:\/.*)?$/.exec(address.pathname);
    if (!board) {
      trace("page hôte sans adresse de board, fenêtre du sprint impossible", address.pathname);
      sprintError();
      return;
    }
    address.pathname = `${board[1]}/backlog`;
    address.searchParams.delete("sprintGoals");
    const title =
      action === "complete"
        ? t("Terminer le sprint « {name} »", { name: sprintName })
        : t("Démarrer le sprint « {name} »", { name: sprintName });
    const { hint, page: backlog, session, reveal } = popin(title);
    hint.textContent = t("Ouverture de la fenêtre de Jira…");
    backlog.src = address.href;

    type SprintStep =
      | {
          kind: "searching";
          deadline: number;
          last: HTMLElement | null;
          stableTicks: number;
          traced: string;
        }
      | {
          kind: "waiting-dialog";
          deadline: number;
          dialogsBefore: Set<Element>;
          last: HTMLElement | null;
          stableTicks: number;
        }
      | {
          kind: "dialog-visible";
          /** Fenêtres d'avant le clic, puis celles déjà suivies : jamais reprises. */
          dialogsBefore: Set<Element>;
          dialog: HTMLElement;
          missingSince: number | null;
        }
      | {
          kind: "manual";
          dialogsBefore: Set<Element>;
          dialog: HTMLElement | null;
          missingSince: number | null;
        }
      | { kind: "closed" };
    let step: SprintStep = {
      kind: "searching",
      // Le clic attend la page chargée et 1,2 s de stabilité : 15 s pour un backlog volumineux.
      deadline: Date.now() + 15000,
      last: null,
      stableTicks: 0,
      traced: "",
    };
    /**
     * Chemin de la page au clic ou à la page rendue. Jira qui en sort (après « Start », son board
     * avec `?sprintStarted=true`) a fini avec sa fenêtre : la popin se ferme et la vue relit Jira.
     */
    let departure: string | null = null;
    const opened = Date.now();
    /** Chemin d'une page backlog ; pas celui du cadre encore vide (`about:blank`). */
    const backlogPath = () => {
      const path = backlog.contentWindow?.location.pathname ?? "";
      return path.endsWith("/backlog") ? path : null;
    };
    let reachable = false;
    const expires = Date.now() + 20000;
    const escapeWatched = new WeakSet<Document>();

    /**
     * Page montrée telle quelle ; la prochaine fenêtre de Jira refermée referme aussi la popin.
     * Après le clic, `before` reste l'état d'avant : une fenêtre ouverte mais non reconnue est
     * alors suivie elle aussi.
     */
    const handOver = (
      doc: Document,
      why: string,
      detail: unknown,
      before = new Set(doc.querySelectorAll('[role="dialog"]')),
    ) => {
      trace(why, detail);
      departure ??= backlogPath();
      step = { kind: "manual", dialogsBefore: before, dialog: null, missingSince: null };
      reveal();
    };

    const search = (current: Extract<SprintStep, { kind: "searching" }>, doc: Document) => {
      const { choice, candidates, named } = sprintButtonChoice(doc, action, sprintName);
      const seen = `${candidates}/${named}`;
      if (seen !== current.traced) {
        current.traced = seen;
        trace("boutons de sprint reconnus (tous/nommés)", seen);
      }
      // Même bouton pendant 1,2 s, page chargée : Jira a fini de dessiner ses sprints et répond
      // au clic. Un clic trop tôt part sans ouvrir de fenêtre et n'est jamais rejoué (essai 8.10).
      current.stableTicks = choice && choice === current.last ? current.stableTicks + 1 : 0;
      current.last = choice;
      if (choice && current.stableTicks >= 4 && doc.readyState === "complete") {
        if (choice.hasAttribute("disabled") || choice.getAttribute("aria-disabled") === "true") {
          handOver(doc, "bouton de sprint désactivé dans Jira", label(choice));
          return;
        }
        // Avant le seul clic : mémoriser les fenêtres existantes et interdire un second clic.
        // Jira met 4 à 6 s à ouvrir sa fenêtre (essai 8.10) : l'attente lui laisse 20 s.
        step = {
          kind: "waiting-dialog",
          deadline: Date.now() + 20000,
          dialogsBefore: new Set(doc.querySelectorAll('[role="dialog"]')),
          last: null,
          stableTicks: 0,
        };
        departure = backlogPath();
        // Constat à vérifier sur un vrai Jira : délai entre l'ouverture et le clic (essai 8.10).
        trace("bouton de sprint cliqué", `${label(choice)} après ${Date.now() - opened} ms`);
        choice.click();
        return;
      }
      if (Date.now() > current.deadline)
        handOver(doc, "aucun bouton de sprint sûr, page rendue à l'utilisateur", {
          action,
          candidats: candidates,
          nommés: named,
        });
    };

    const recognizeDialog = (
      current: Extract<SprintStep, { kind: "waiting-dialog" }>,
      doc: Document,
    ) => {
      // Une fenêtre peut en imbriquer une autre (calendrier) : seule compte la plus extérieure.
      const fresh = outermost(freshDialogs(doc, current.dialogsBefore));
      const candidate = fresh.length === 1 ? (fresh[0] ?? null) : null;
      // La même fenêtre sur trois passages, quelle que soit sa taille : un bandeau d'avertissement
      // (« Start Sprint ») peut la redimensionner sans fin (essai 8.10).
      current.stableTicks = candidate && candidate === current.last ? current.stableTicks + 1 : 0;
      current.last = candidate;
      if (candidate && current.stableTicks >= 3) {
        const box = candidate.getBoundingClientRect();
        trace(
          "fenêtre de sprint de Jira isolée",
          `${Math.round(box.width)}x${Math.round(box.height)}`,
        );
        step = {
          kind: "dialog-visible",
          dialogsBefore: current.dialogsBefore,
          dialog: candidate,
          missingSince: null,
        };
        reveal();
        isolateSprintDialog(doc, candidate);
      } else if (Date.now() > current.deadline) {
        handOver(
          doc,
          "fenêtre de sprint non reconnue, page rendue à l'utilisateur",
          fresh.length,
          current.dialogsBefore,
        );
      }
    };

    /**
     * Fenêtre suivie disparue : Jira peut la remonter, ou ouvrir après la clôture sa fenêtre de
     * suite (rétrospective, page Confluence). Une seule nouvelle fenêtre extérieure est alors
     * suivie, et montrée seule si la page était isolée ; rien n'y est cliqué ni rempli. Aucune
     * plus de 600 ms : fermée par Jira, la popin se ferme et la vue relit le board.
     */
    const monitorClosure = (
      current: {
        dialogsBefore: Set<Element>;
        dialog: HTMLElement | null;
        missingSince: number | null;
      },
      doc: Document,
      isolate: boolean,
    ) => {
      if (!current.dialog) return;
      if (current.dialog.isConnected && visible(current.dialog)) {
        current.missingSince = null;
        return;
      }
      const previous = current.dialog;
      const next = outermost(
        freshDialogs(doc, current.dialogsBefore).filter((element) => element !== previous),
      );
      if (next.length === 1 && next[0]) {
        trace("nouvelle fenêtre de Jira suivie", label(next[0]).slice(0, 80));
        current.dialogsBefore.add(previous);
        current.dialog = next[0];
        current.missingSince = null;
        if (isolate) isolateSprintDialog(doc, next[0]);
      } else if (current.missingSince === null) {
        current.missingSince = Date.now();
      } else if (Date.now() - current.missingSince > 600) {
        closeTicket();
      }
    };

    const watchManual = (current: Extract<SprintStep, { kind: "manual" }>, doc: Document) => {
      if (!escapeWatched.has(doc)) {
        escapeWatched.add(doc);
        // Page rendue : Échap dans Jira, hors de ses fenêtres, referme aussi la popin.
        doc.addEventListener("keydown", (event) => {
          if (
            event.key === "Escape" &&
            step === current &&
            current.dialog === null &&
            freshDialogs(doc, current.dialogsBefore).length === 0
          )
            closeTicket();
        });
      }
      if (current.dialog === null) {
        const fresh = outermost(freshDialogs(doc, current.dialogsBefore));
        if (fresh.length === 1) current.dialog = fresh[0] ?? null;
      }
      // Page rendue telle quelle : la fenêtre suivante est suivie sans rien masquer.
      monitorClosure(current, doc, false);
    };

    const tick = () => {
      if (step.kind === "closed") return;
      if (!host.isConnected) {
        closeTicket();
        return;
      }
      try {
        const doc = backlog.contentDocument;
        if (!doc || !backlog.contentWindow) throw new Error("frame inaccessible");
        reachable = true;
        // Page rendue sur un cadre encore vide : le départ est le backlog, une fois chargé.
        if (step.kind === "manual") departure ??= backlogPath();
        const path = backlog.contentWindow.location.pathname;
        if (departure !== null && path !== departure) {
          trace("Jira a quitté la page du sprint, popin refermée", path);
          closeTicket();
          return;
        }
        if (step.kind === "searching") search(step, doc);
        if (step.kind === "waiting-dialog") recognizeDialog(step, doc);
        else if (step.kind === "dialog-visible") monitorClosure(step, doc, true);
        else if (step.kind === "manual") watchManual(step, doc);
      } catch {
        // Jira peut momentanément reconstruire sa page pendant son chargement.
      }
      if (!reachable && Date.now() > expires) {
        trace("page backlog inaccessible dans un cadre");
        sprintError();
      }
    };
    const timer = setInterval(tick, 300);
    session.stop = () => {
      step = { kind: "closed" };
      clearInterval(timer);
    };
  };

  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== url.origin) return;
    // Champs relus selon la copie du protocole : jamais d'adresse ni de valeur non déclarée.
    const data = readSprintGoalsMessage(PROTOCOL, event.data, "view-to-host");
    if (!data) return;
    if (data.type === PROTOCOL.language.type) {
      language = data.language as typeof language;
      return;
    }
    if (data.type === PROTOCOL.close.type) {
      // Retour à Jira : la même adresse sans le marqueur, rechargée (voir bootstrap.ts, 0.26.2).
      const plain = new URL(location.href);
      plain.searchParams.delete("sprintGoals");
      closeTicket();
      host.setAttribute("data-leaving", "");
      status.textContent = t("Retour à Jira…");
      location.assign(plain.href);
      return;
    }
    if (data.type === PROTOCOL.openBoard.type) {
      // Jamais d'adresse reçue : la page hôte construit elle-même celle du board, sur son site.
      const board = new URL(
        `/jira/software/c/projects/${data.projectKey}/boards/${data.boardId}`,
        location.origin,
      );
      board.searchParams.set("sprintGoals", "1");
      closeTicket();
      host.setAttribute("data-leaving", "");
      status.textContent = t("Ouverture du board dans Jira…");
      location.assign(board.href);
      return;
    }
    if (data.type === PROTOCOL.sprintDialog.type) {
      host.removeAttribute("data-error");
      openSprintDialog(data.action as SprintAction, data.sprintName as string);
      return;
    }
    if (data.type !== PROTOCOL.openIssue.type) return;
    const transition = data.transition as Transition | null;
    host.removeAttribute("data-error");
    openTicket(data.key as string, transition);
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
