import { signal } from "@preact/signals";
import type { Platform } from "../app/platform/types";
import { normalizeSiteUrl } from "../jira/site";
import { configuredBoardAddress, launchBoardAddress } from "./launchAddress";

export interface LauncherTab {
  readonly id?: number | undefined;
  /** Chrome ne fournit l'adresse que pour les sites déjà autorisés. */
  readonly url?: string | undefined;
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

/** Le lanceur n'a ni modèle de board ni transport Jira : il prépare seulement sa page hôte. */
export class LauncherModel {
  readonly address = signal("");
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  #tab: LauncherTab | null = null;
  readonly #platform: LauncherPlatform;

  constructor(platform: LauncherPlatform) {
    this.#platform = platform;
  }

  async start(): Promise<void> {
    try {
      const [tab, connection, boards, lastAddress] = await Promise.all([
        this.#platform.currentTab(),
        this.#platform.store.get("connection.v1"),
        this.#platform.store.get("boards.v1"),
        this.#platform.store.get("launcher.v1"),
      ]);
      this.#tab = tab;
      this.address.value =
        (tab?.url ? launchBoardAddress(tab.url) : null) ??
        configuredBoardAddress(connection, boards) ??
        (typeof lastAddress === "string" ? launchBoardAddress(lastAddress) : null) ??
        "";
      if (
        this.address.value &&
        (await this.#platform.hasPermission(normalizeSiteUrl(this.address.value).permissionPattern))
      ) {
        // L'icône conserve son ouverture directe pour un board déjà autorisé.
        // Aucune demande Chrome n'est déclenchée en dehors du clic sur le formulaire.
        this.busy.value = true;
        try {
          await this.#enter(this.address.value);
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
    const address = launchBoardAddress(this.address.value);
    if (!address) {
      this.error.value =
        "Collez l'adresse complète d'un board Jira Cloud : https://votre-site.atlassian.net/jira/…/boards/…";
      return;
    }
    const site = normalizeSiteUrl(address);
    this.busy.value = true;
    try {
      if (!(await this.#platform.requestPermission(site.permissionPattern))) {
        this.error.value = `L'accès à ${site.host} n'a pas été autorisé. Vous pouvez réessayer.`;
        return;
      }
      await this.#enter(address);
    } catch {
      this.error.value = "Impossible d'ouvrir le board dans Jira. Réessayez depuis l'extension.";
    } finally {
      this.busy.value = false;
    }
  }

  async #enter(address: string): Promise<void> {
    await this.#platform.prepareLaunch();
    await this.#platform.store.set("connection.v1", { origin: new URL(address).origin });
    await this.#platform.store.set("launcher.v1", address);
    await this.#platform.navigate(address, this.#tab);
    this.#platform.close();
  }
}
