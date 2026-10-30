import { signal } from "@preact/signals";
import {
  loadLastLaunchAddress,
  saveConnection,
  saveLastLaunchAddress,
} from "../app/model/connectionStore";
import type { Platform } from "../app/platform/types";
import {
  LANGUAGE_PREFERENCE_KEY,
  languagePreference,
  resolveLanguage,
  setLanguage,
} from "../i18n/language";
import { normalizeSiteUrl } from "../jira/site";
import { configuredBoardAddress, launchBoardAddress } from "./launchAddress";

export interface LauncherTab {
  readonly id?: number | undefined;
  /** Fournie par `activeTab` au clic sur l'icône, ou parce que le site est déjà autorisé. */
  readonly url?: string | undefined;
  readonly locale?: string | null;
}

export interface LauncherPlatform {
  readonly store: Platform["store"];
  readonly hasPermission: (pattern: string) => Promise<boolean>;
  readonly requestPermission: (pattern: string) => Promise<boolean>;
  readonly currentTab: () => Promise<LauncherTab | null>;
  readonly prepareLaunch: () => Promise<void>;
  readonly navigate: (address: string, tab: LauncherTab | null) => Promise<void>;
  readonly close: () => void;
}

function isJiraPage(address: string | undefined): boolean {
  if (!address) return false;
  try {
    normalizeSiteUrl(address);
    return true;
  } catch {
    return false;
  }
}

/** Le lanceur n'a ni modèle de board ni transport Jira : il prépare seulement sa page hôte. */
export class LauncherModel {
  readonly address = signal("");
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /** Board reconnu dans l'onglet courant : l'adresse n'a pas à être saisie. */
  readonly detected = signal(false);
  /** L'onglet est une page Jira qui n'est pas un board. */
  readonly offBoard = signal(false);
  #tab: LauncherTab | null = null;
  readonly #platform: LauncherPlatform;

  constructor(platform: LauncherPlatform) {
    this.#platform = platform;
  }

  async start(): Promise<void> {
    try {
      const [tab, configuredAddress, lastAddress, preferences] = await Promise.all([
        this.#platform.currentTab(),
        configuredBoardAddress(this.#platform.store),
        loadLastLaunchAddress(this.#platform.store),
        this.#platform.store.get(LANGUAGE_PREFERENCE_KEY).catch(() => null),
      ]);
      setLanguage(resolveLanguage(languagePreference(preferences), tab?.locale));
      this.#tab = tab;
      const tabAddress = tab?.url ? launchBoardAddress(tab.url) : null;
      this.detected.value = tabAddress !== null;
      this.offBoard.value = tabAddress === null && isJiraPage(tab?.url);
      const boardAddress =
        tabAddress ??
        configuredAddress ??
        (lastAddress !== null ? launchBoardAddress(lastAddress) : null);
      // Sur une page Jira sans board connu, le site de l'onglet est proposé : l'autoriser suffit
      // pour que le bouton « Sprint Goals » apparaisse sur ses boards.
      this.address.value =
        boardAddress ?? (this.offBoard.value && tab?.url ? new URL(tab.url).origin : "");
      // Seul un board s'ouvre de lui-même ; une adresse de site attend toujours un clic.
      if (
        boardAddress &&
        (await this.#platform.hasPermission(normalizeSiteUrl(boardAddress).permissionPattern))
      ) {
        // L'icône conserve son ouverture directe pour un board déjà autorisé.
        // Aucune demande Chrome n'est déclenchée en dehors du clic sur le formulaire.
        this.busy.value = true;
        try {
          await this.#enter(boardAddress, true);
        } catch {
          this.error.value = "Impossible d'ouvrir le board dans Jira. Vous pouvez réessayer.";
        } finally {
          this.busy.value = false;
        }
      }
    } catch {
      this.error.value = "Impossible de retrouver le dernier board. Saisissez son adresse Jira.";
    } finally {
      this.ready.value = true;
    }
  }

  /** Appel direct du clic : la demande d'accès est le premier appel asynchrone du geste. */
  async open(): Promise<void> {
    if (!this.ready.value || this.busy.value) return;
    this.error.value = null;
    const board = launchBoardAddress(this.address.value);
    // Sans board, l'adresse du site suffit : il est autorisé, puis Jira s'ouvre sur ce site.
    const address = board ?? this.#siteAddress(this.address.value);
    if (!address) {
      this.error.value =
        "Saisissez l'adresse de votre Jira Cloud (https://votre-site.atlassian.net) ou celle d'un de ses boards.";
      return;
    }
    const site = normalizeSiteUrl(address);
    this.busy.value = true;
    try {
      if (!(await this.#platform.requestPermission(site.permissionPattern))) {
        this.error.value = `L'accès à ${site.host} n'a pas été autorisé. Vous pouvez réessayer.`;
        return;
      }
      await this.#enter(address, board !== null);
    } catch {
      this.error.value = "Impossible d'ouvrir Jira. Réessayez depuis l'extension.";
    } finally {
      this.busy.value = false;
    }
  }

  /**
   * Page à ouvrir pour un site Jira Cloud saisi sans board : l'onglet courant s'il est déjà sur ce
   * site (il est rechargé, le bouton y apparaît), sinon l'accueil du site. `null` hors Jira Cloud.
   */
  #siteAddress(raw: string): string | null {
    try {
      const text = raw.trim();
      const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
      if (url.username || url.password) return null;
      const { origin } = normalizeSiteUrl(url.origin);
      const tab = this.#tab?.url;
      return tab && new URL(tab).origin === origin ? tab : `${origin}/`;
    } catch {
      return null;
    }
  }

  async #enter(address: string, isBoard: boolean): Promise<void> {
    await this.#platform.prepareLaunch();
    await saveConnection(this.#platform.store, new URL(address).origin);
    // Seule l'adresse d'un board est mémorisée pour les ouvertures suivantes.
    if (isBoard) await saveLastLaunchAddress(this.#platform.store, address);
    await this.#platform.navigate(address, this.#tab);
    this.#platform.close();
  }
}
