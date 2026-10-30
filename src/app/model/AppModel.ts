import { signal } from "@preact/signals";
import { type DailySession, startDaily } from "../../core/daily";
import {
  LANGUAGE_PREFERENCE_KEY,
  type LanguagePreference,
  languagePreference,
  normalizeLocale,
  resolveLanguage,
  setLanguage,
} from "../../i18n/language";
import { JiraClient } from "../../jira/client";
import { isRecord } from "../../jira/json";
import { type JiraSite, normalizeSiteUrl, parseBoardUrl } from "../../jira/site";
import { JiraTransport } from "../../jira/transport";
import {
  DIAGNOSTIC_ENABLED,
  SPRINT_HEALTH_ENABLED,
  SPRINT_PLANNING_ENABLED,
} from "../featureFlags";
import type { Platform } from "../platform/types";
import { AuditLog } from "./auditLog";
import { BoardModel } from "./BoardModel";
import { loadConnectedOrigin, saveConnection } from "./connectionStore";
import { DiagnosticModel } from "./DiagnosticModel";
import { GraphqlOrigin } from "./graphqlOrigin";
import { LoadDiagnostics } from "./LoadDiagnostics";
import { toMessage, type UserMessage } from "./messages";
import { forgetSiteData } from "./siteData";

/**
 * Préférences d'affichage de ce navigateur, communes à tous les sites et boards. Non liées à un
 * site : la déconnexion les garde (voir `NOT_SITE_DATA_KEYS` de siteData.ts).
 */
const INTERFACE_KEY = "interface.v1";

/** Largeur de la barre latérale, en pixels : 248 par défaut, 200 au moins. */
export const SIDEBAR_WIDTH = { default: 248, min: 200 } as const;

/** Largeur permise : au moins le minimum, au plus la moitié de la fenêtre. */
export function clampSidebarWidth(width: number, viewportWidth: number): number {
  const max = Math.max(SIDEBAR_WIDTH.min, Math.floor(viewportWidth / 2));
  return Math.round(Math.min(max, Math.max(SIDEBAR_WIDTH.min, width)));
}

export type Connection =
  | { state: "loading" }
  | { state: "disconnected"; lastInput: string }
  | { state: "connected"; site: JiraSite; board: BoardModel; diagnostic: DiagnosticModel };

/**
 * Vues de l'espace de travail : le sprint (swimlanes, et la santé du sprint dans un panneau
 * repliable), les réglages du board affiché et le diagnostic du site.
 */
export type View = "board" | "planning" | "settings" | "diagnostic" | "preferences";

/**
 * Onglets des réglages du board affiché. Depuis 0.31.0, ils s'ouvrent depuis le board (en-tête,
 * barre latérale, menus) et non plus depuis l'administration : ils portent sur CE board.
 */
export type SettingsSection = "board" | "goals" | "cardFields" | "cardColors";

/** Racine de l'état de l'interface : connexion à un site, puis board, réglages ou diagnostic. */
export class AppModel {
  readonly loadDiagnostics: LoadDiagnostics;
  readonly connection = signal<Connection>({ state: "loading" });
  readonly connectionError = signal<UserMessage | null>(null);
  readonly view = signal<View>("board");
  readonly settingsSection = signal<SettingsSection>("board");
  /** Bloc « Site Jira » déplié en pied de barre latérale : diagnostic, site et déconnexion. */
  readonly siteMenuOpen = signal(false);
  /** Barre latérale repliée par son bouton. Réglage de la session. */
  readonly sidebarCollapsed = signal(false);
  /** Largeur de la barre latérale choisie en tirant sa bordure ; gardée dans ce navigateur. */
  readonly sidebarWidth = signal<number>(SIDEBAR_WIDTH.default);
  /** Panneau « Santé du sprint » déplié au-dessus des swimlanes ; gardé dans ce navigateur. */
  readonly healthOpen = signal(false);
  readonly languagePreference = signal<LanguagePreference>("auto");
  readonly languagePreferenceError = signal<string | null>(null);
  /**
   * Mode présentation : barre latérale et en-tête masqués, restent les filtres et le board. Le temps
   * de la page seulement : une réouverture repart en mode normal.
   */
  readonly presenting = signal(false);
  /**
   * Dans une page Jira : referme la vue et rend la page du board Jira. `null` hors d'une page hôte.
   */
  readonly hostReturn = signal<(() => void) | null>(null);
  /**
   * Daily en cours : board présenté swimlane par swimlane, minuteur. Le temps de la page seulement,
   * comme la présentation.
   */
  readonly daily = signal<DailySession | null>(null);

  readonly #platform: Platform;
  readonly #audit: AuditLog;
  /** Site de la page Jira hôte : la connexion ne peut pas en sortir dans ce cadre. */
  readonly hostSite: JiraSite | null;
  readonly #hostBoardAddress: string | undefined;
  #jiraLocale: string | null;
  #interfaceReady: Promise<void> | null = null;
  #interfaceWrite: Promise<void> = Promise.resolve();
  #languageWrite: Promise<void> = Promise.resolve();
  #languageRevision = 0;
  #localeGeneration = 0;

  constructor(platform: Platform, hostBoardAddress?: string, hostLocale?: string | null) {
    this.#platform = platform;
    this.loadDiagnostics = new LoadDiagnostics(platform);
    this.#audit = new AuditLog(platform.store);
    this.#hostBoardAddress = hostBoardAddress;
    this.hostSite = hostBoardAddress ? (parseBoardUrl(hostBoardAddress)?.site ?? null) : null;
    this.#jiraLocale = normalizeLocale(hostLocale);
  }

  /** Préférence restaurée avant le premier texte affiché, sans requête Jira. */
  prepareLanguage(): Promise<void> {
    this.#interfaceReady ??= this.#restoreInterface();
    return this.#interfaceReady;
  }

  async setLanguagePreference(value: LanguagePreference): Promise<void> {
    await this.prepareLanguage();
    const revision = ++this.#languageRevision;
    this.languagePreference.value = languagePreference(value);
    this.languagePreferenceError.value = null;
    this.#applyLanguage();
    const preference = this.languagePreference.value;
    const write = this.#languageWrite
      .catch(() => {})
      .then(() => this.#platform.store.set(LANGUAGE_PREFERENCE_KEY, preference));
    this.#languageWrite = write;
    try {
      await write;
    } catch {
      if (revision === this.#languageRevision)
        this.languagePreferenceError.value =
          "La langue est appliquée, mais n'a pas pu être enregistrée dans ce navigateur.";
    }
  }

  #applyLanguage(): void {
    setLanguage(resolveLanguage(this.languagePreference.value, this.#jiraLocale));
  }

  /** Les préférences personnelles n'exigent aucun droit d'administration Jira. */
  showPreferences(): void {
    if (this.#planningPublishing()) return;
    this.#leaveDiagnostic();
    this.presenting.value = false;
    this.view.value = "preferences";
  }

  get extensionVersion(): string {
    return this.#platform.extensionVersion;
  }

  /** Reprend le site enregistré, si Chrome lui accorde toujours l'accès. */
  async start(boardAddress?: string, initialMs = 0): Promise<void> {
    boardAddress = this.#hostBoardAddress ?? boardAddress;
    if (boardAddress) this.loadDiagnostics.begin("opening", initialMs);
    void this.loadDiagnostics.loadHistory();
    try {
      const connection = await this.loadDiagnostics.measure("startup", () =>
        this.#restoreConnection(boardAddress),
      );
      if (connection) await this.#enter(connection.site, connection.address);
      else this.loadDiagnostics.finish("cancelled");
    } catch (error) {
      this.loadDiagnostics.finish("error");
      throw error;
    }
  }

  async #restoreConnection(
    boardAddress?: string,
  ): Promise<{ site: JiraSite; address: string | undefined } | null> {
    await this.prepareLanguage();
    const saved = await loadConnectedOrigin(this.#platform.store);
    const target = boardAddress ? parseBoardUrl(boardAddress) : null;
    const origin = target?.site.origin ?? saved;
    if (origin === null) {
      this.connection.value = { state: "disconnected", lastInput: "" };
      return null;
    }
    let site: JiraSite;
    try {
      site = normalizeSiteUrl(origin);
    } catch {
      this.connection.value = { state: "disconnected", lastInput: "" };
      return null;
    }
    if (!(await this.#platform.permissions.contains(site.permissionPattern))) {
      // L'accès a été retiré depuis chrome://extensions : on le redemandera sur un geste.
      this.connection.value = { state: "disconnected", lastInput: site.host };
      return null;
    }
    return { site, address: target ? boardAddress : undefined };
  }

  /**
   * À appeler depuis un geste de l'utilisateur. La saisie est validée de façon synchrone : un
   * hôte hors *.atlassian.net est refusé avant toute demande de permission, et la demande de
   * permission est le premier appel asynchrone (Chrome l'exige).
   */
  async connect(rawInput: string): Promise<void> {
    this.connectionError.value = null;
    let site: JiraSite;
    try {
      site = normalizeSiteUrl(rawInput);
    } catch (error) {
      this.connectionError.value = toMessage(error);
      return;
    }
    if (this.hostSite && site.origin !== this.hostSite.origin) {
      this.connectionError.value = {
        text: "La connexion doit rester sur le site Jira qui héberge ce board.",
        suggestion: "Pour changer de site, ouvrez son board Jira puis cliquez sur l'extension.",
      };
      return;
    }

    let granted: boolean;
    try {
      granted = await this.#platform.permissions.request(site.permissionPattern);
    } catch (error) {
      this.connectionError.value = toMessage(error);
      return;
    }
    if (!granted) {
      this.connectionError.value = {
        text: `Chrome n'a pas accordé l'accès à ${site.host}.`,
        suggestion:
          "Sans cet accès, l'extension ne peut rien lire. Recommencez et acceptez la demande de Chrome.",
      };
      return;
    }

    await saveConnection(this.#platform.store, site.origin);
    await this.#enter(site, this.#hostBoardAddress);
  }

  /** Rend l'accès au site à Chrome et oublie le site, boards et réglages compris. */
  async disconnect(): Promise<void> {
    const current = this.connection.value;
    if (current.state !== "connected") return;
    if (current.board.planning.publishing.value) return;
    this.#localeGeneration++;
    await current.board.planning.flushDraft().catch(() => {});
    current.board.dispose();
    // Un brouillon mis en file pendant la fermeture est écrit avant l'effacement, jamais après.
    await current.board.planning.flushDraft().catch(() => {});
    // Liste unique des propriétaires de données du site (AD-4) : chacun efface les siennes, un
    // échec n'empêche ni les autres ni la déconnexion. Le journal passe par la file de ses ajouts.
    await forgetSiteData(this.#platform.store, current.site.origin);
    await this.loadDiagnostics.clear();
    await new GraphqlOrigin(this.#platform, current.site).removeRule().catch(() => {});
    await this.#platform.permissions.remove(current.site.permissionPattern);
    this.connectionError.value = null;
    this.view.value = "board";
    this.settingsSection.value = "board";
    this.siteMenuOpen.value = false;
    this.presenting.value = false;
    this.daily.value = null;
    this.connection.value = { state: "disconnected", lastInput: current.site.host };
  }

  showBoard(): void {
    if (this.#planningPublishing()) return;
    this.#leaveDiagnostic();
    this.view.value = "board";
  }

  /** Ouvre le planning sans charger son backlog pour les autres vues. */
  showPlanning(): void {
    if (!SPRINT_PLANNING_ENABLED) return;
    const current = this.connection.value;
    if (
      current.state !== "connected" ||
      current.board.configuration.value?.boardType !== "scrum" ||
      !current.board.canSwitchBoard.value
    )
      return;
    this.#leaveDiagnostic();
    this.presenting.value = false;
    this.daily.value = null;
    this.view.value = "planning";
    void current.board.planning.load();
  }

  #planningPublishing(): boolean {
    const current = this.connection.value;
    return (
      SPRINT_PLANNING_ENABLED &&
      current.state === "connected" &&
      current.board.planning.publishing.value
    );
  }

  /** Quitter le diagnostic replie le menu « Site Jira » qui le contient. */
  #leaveDiagnostic(): void {
    if (this.view.value === "diagnostic") this.siteMenuOpen.value = false;
  }

  /**
   * Déplie ou replie la santé du sprint, dans la vue du sprint. Interrupteur coupé : rien ne change
   * ni n'est enregistré ; l'état déjà retenu reste relu et conservé tel quel.
   */
  async toggleHealth(): Promise<void> {
    if (!SPRINT_HEALTH_ENABLED) return;
    this.healthOpen.value = !this.healthOpen.value;
    // Un stockage indisponible n'empêche pas le panneau : il ne sera simplement pas retenu.
    await this.#saveInterface().catch(() => {});
  }

  /** Mode présentation, sur la vue du sprint. La barre latérale retrouve ensuite son état. */
  enterPresentation(): void {
    if (this.#planningPublishing()) return;
    this.#leaveDiagnostic();
    this.view.value = "board";
    this.presenting.value = true;
  }

  exitPresentation(): void {
    this.presenting.value = false;
  }

  /** Lance la daily sur la vue du sprint ; elle remplace le mode présentation. */
  startDaily(durationMinutes: number, firstStepId: string | null, now = Date.now()): void {
    if (this.#planningPublishing()) return;
    this.#leaveDiagnostic();
    this.view.value = "board";
    this.presenting.value = false;
    this.daily.value = startDaily(durationMinutes, firstStepId, now);
  }

  /** Remplace la daily en cours (étape, pause) ; sans effet si elle a été arrêtée entre-temps. */
  updateDaily(change: (session: DailySession) => DailySession): void {
    const current = this.daily.value;
    if (current) this.daily.value = change(current);
  }

  stopDaily(): void {
    this.daily.value = null;
  }

  /**
   * Réglages du board affiché, sur un onglet (par défaut le dernier ouvert). Ils remplacent le board
   * dans la page ; la barre latérale reste.
   */
  showSettings(section: SettingsSection = this.settingsSection.value): void {
    if (this.#planningPublishing()) return;
    this.#leaveDiagnostic();
    this.presenting.value = false;
    this.daily.value = null;
    this.settingsSection.value = section;
    this.view.value = "settings";
  }

  /**
   * Bloc « Site Jira » du pied de barre latérale : le déplie ou le replie. Replié pendant le
   * diagnostic, il ramène au sprint : le diagnostic en fait partie.
   */
  toggleSiteMenu(): void {
    const open = !this.siteMenuOpen.value;
    this.siteMenuOpen.value = open;
    if (!open && this.view.value === "diagnostic") this.showBoard();
  }

  /** Ouvre le diagnostic ; ses lectures sont lancées à la première ouverture. */
  showDiagnostic(): void {
    if (!DIAGNOSTIC_ENABLED || this.#planningPublishing()) return;
    this.presenting.value = false;
    this.daily.value = null;
    this.siteMenuOpen.value = true;
    this.view.value = "diagnostic";
    const current = this.connection.value;
    if (current.state !== "connected") return;
    if (current.diagnostic.read.value === null) void current.diagnostic.runReads();
    void current.diagnostic.loadJournal();
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.value = !this.sidebarCollapsed.value;
  }

  /** Change la largeur de la barre latérale, bornée ; `save` la garde pour les prochaines fois. */
  async resizeSidebar(width: number, viewportWidth: number, save: boolean): Promise<void> {
    this.sidebarWidth.value = clampSidebarWidth(width, viewportWidth);
    if (save) await this.#saveInterface();
  }

  async resetSidebarWidth(): Promise<void> {
    this.sidebarWidth.value = SIDEBAR_WIDTH.default;
    await this.#saveInterface();
  }

  async #restoreInterface(): Promise<void> {
    const [saved, preference] = await Promise.all([
      this.#platform.store.get(INTERFACE_KEY).catch(() => null),
      this.#platform.store.get(LANGUAGE_PREFERENCE_KEY).catch(() => null),
    ]);
    this.languagePreference.value = languagePreference(preference);
    this.#applyLanguage();
    if (!isRecord(saved)) return;
    const width = saved.sidebarWidth;
    // Le maximum dépend de la fenêtre : il est appliqué à l'affichage, pas ici.
    if (typeof width === "number" && Number.isFinite(width) && width >= SIDEBAR_WIDTH.min) {
      this.sidebarWidth.value = Math.round(width);
    }
    this.healthOpen.value = saved.healthOpen === true;
  }

  async #saveInterface(): Promise<void> {
    // Les écritures rapides sont ordonnées ; les autres préférences restent intactes.
    const values = {
      sidebarWidth: this.sidebarWidth.value,
      healthOpen: this.healthOpen.value,
    };
    const write = this.#interfaceWrite
      .catch(() => {})
      .then(async () => {
        const saved = await this.#platform.store.get(INTERFACE_KEY);
        await this.#platform.store.set(INTERFACE_KEY, {
          ...(isRecord(saved) ? saved : {}),
          ...values,
        });
      });
    this.#interfaceWrite = write;
    await write;
  }

  async #enter(site: JiraSite, boardAddress?: string): Promise<void> {
    const generation = ++this.#localeGeneration;
    // Le DOM de Jira suffit normalement. Le repli API est facultatif et ne retarde pas le board.
    if (!this.#jiraLocale && boardAddress) {
      const client = new JiraClient(
        new JiraTransport({
          site,
          fetch: this.#platform.fetch,
          timeoutMs: 2500,
          maxGetAttempts: 1,
        }),
      );
      void client
        .locale()
        .then((locale) => {
          if (generation !== this.#localeGeneration) return;
          this.#jiraLocale = normalizeLocale(locale);
          this.#applyLanguage();
        })
        .catch(() => {});
    }
    // Règle `Origin` du site (passerelle GraphQL). Un échec (permission absente, par exemple
    // si l'extension n'a pas été rechargée) n'empêche pas le board : le diagnostic le montrera.
    const origin = new GraphqlOrigin(this.#platform, site);
    await this.loadDiagnostics.measure("startup", () => origin.restore()).catch(() => {});
    const board = new BoardModel(site, this.#platform, {
      audit: this.#audit,
      loadDiagnostics: this.loadDiagnostics,
    });
    const diagnostic = new DiagnosticModel(site, this.#platform, this.#audit, origin);
    this.connection.value = { state: "connected", site, board, diagnostic };
    await board.load(boardAddress);
  }
}
