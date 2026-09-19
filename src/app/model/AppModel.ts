import { signal } from "@preact/signals";
import { isRecord } from "../../jira/json";
import { type JiraSite, normalizeSiteUrl } from "../../jira/site";
import type { Platform } from "../platform/types";
import { AuditLog } from "./auditLog";
import { BoardModel } from "./BoardModel";
import { forgetSite } from "./boardStore";
import { DiagnosticModel } from "./DiagnosticModel";
import { GraphqlOrigin } from "./graphqlOrigin";
import { toMessage, type UserMessage } from "./messages";

const CONNECTION_KEY = "connection.v1";
/** Préférences d'affichage de ce navigateur, communes à tous les sites et boards. */
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
 * Vues de la barre latérale : le sprint (swimlanes, et la santé du sprint dans un panneau
 * repliable) et l'administration.
 */
export type View = "board" | "admin";

/** Sections de l'administration : réglages du board, diagnostic, compte. */
export type AdminSection = "team" | "board" | "goals" | "cardFields" | "cardColors" | "diagnostic";

/** Racine de l'état de l'interface : connexion à un site, puis board ou administration. */
export class AppModel {
  readonly connection = signal<Connection>({ state: "loading" });
  readonly connectionError = signal<UserMessage | null>(null);
  readonly view = signal<View>("board");
  readonly adminSection = signal<AdminSection>("board");
  /** Barre latérale repliée par son bouton. Réglage de la session. */
  readonly sidebarCollapsed = signal(false);
  /** Largeur de la barre latérale choisie en tirant sa bordure ; gardée dans ce navigateur. */
  readonly sidebarWidth = signal<number>(SIDEBAR_WIDTH.default);
  /** Panneau « Santé du sprint » déplié au-dessus des swimlanes ; gardé dans ce navigateur. */
  readonly healthOpen = signal(false);

  readonly #platform: Platform;
  readonly #audit: AuditLog;

  constructor(platform: Platform) {
    this.#platform = platform;
    this.#audit = new AuditLog(platform.store);
  }

  get extensionVersion(): string {
    return this.#platform.extensionVersion;
  }

  /** Reprend le site enregistré, si Chrome lui accorde toujours l'accès. */
  async start(): Promise<void> {
    await this.#restoreInterface();
    const saved = await this.#platform.store.get(CONNECTION_KEY);
    const origin = isRecord(saved) && typeof saved.origin === "string" ? saved.origin : null;
    if (origin === null) {
      this.connection.value = { state: "disconnected", lastInput: "" };
      return;
    }
    let site: JiraSite;
    try {
      site = normalizeSiteUrl(origin);
    } catch {
      this.connection.value = { state: "disconnected", lastInput: "" };
      return;
    }
    if (!(await this.#platform.permissions.contains(site.permissionPattern))) {
      // L'accès a été retiré depuis chrome://extensions : on le redemandera sur un geste.
      this.connection.value = { state: "disconnected", lastInput: site.host };
      return;
    }
    await this.#enter(site);
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

    await this.#platform.store.set(CONNECTION_KEY, { origin: site.origin });
    await this.#enter(site);
  }

  /** Rend l'accès au site à Chrome et oublie le site, boards et réglages compris. */
  async disconnect(): Promise<void> {
    const current = this.connection.value;
    if (current.state !== "connected") return;
    current.board.dispose();
    await new GraphqlOrigin(this.#platform, current.site).forget().catch(() => {});
    await this.#platform.permissions.remove(current.site.permissionPattern);
    await this.#platform.store.remove(CONNECTION_KEY);
    await forgetSite(this.#platform.store, current.site.origin);
    await this.#audit.forgetSite(current.site.origin);
    this.connectionError.value = null;
    this.view.value = "board";
    this.adminSection.value = "board";
    this.connection.value = { state: "disconnected", lastInput: current.site.host };
  }

  showBoard(): void {
    this.view.value = "board";
  }

  /** Déplie ou replie la santé du sprint, dans la vue du sprint. */
  async toggleHealth(): Promise<void> {
    this.healthOpen.value = !this.healthOpen.value;
    // Un stockage indisponible n'empêche pas le panneau : il ne sera simplement pas retenu.
    await this.#saveInterface().catch(() => {});
  }

  /** Administration : réglages locaux du board, diagnostic, déconnexion. */
  showAdmin(section: AdminSection = this.adminSection.value): void {
    if (section === "diagnostic") {
      this.showDiagnostic();
      return;
    }
    this.adminSection.value = section;
    this.view.value = "admin";
  }

  /** Ouvre le diagnostic ; ses lectures sont lancées à la première ouverture. */
  showDiagnostic(): void {
    this.adminSection.value = "diagnostic";
    this.view.value = "admin";
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
    const saved = await this.#platform.store.get(INTERFACE_KEY).catch(() => null);
    if (!isRecord(saved)) return;
    const width = saved.sidebarWidth;
    // Le maximum dépend de la fenêtre : il est appliqué à l'affichage, pas ici.
    if (typeof width === "number" && Number.isFinite(width) && width >= SIDEBAR_WIDTH.min) {
      this.sidebarWidth.value = Math.round(width);
    }
    this.healthOpen.value = saved.healthOpen === true;
  }

  async #saveInterface(): Promise<void> {
    await this.#platform.store.set(INTERFACE_KEY, {
      sidebarWidth: this.sidebarWidth.value,
      healthOpen: this.healthOpen.value,
    });
  }

  async #enter(site: JiraSite): Promise<void> {
    // Règle `Origin` du site (passerelle GraphQL). Un échec (permission absente, par exemple
    // si l'extension n'a pas été rechargée) n'empêche pas le board : le diagnostic le montrera.
    const origin = new GraphqlOrigin(this.#platform, site);
    await origin.restore().catch(() => {});
    const board = new BoardModel(site, this.#platform, { audit: this.#audit });
    const diagnostic = new DiagnosticModel(site, this.#platform, this.#audit, origin);
    this.connection.value = { state: "connected", site, board, diagnostic };
    await board.load();
  }
}
