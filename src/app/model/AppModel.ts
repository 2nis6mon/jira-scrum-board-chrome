import { type Signal, signal } from "@preact/signals";
import {
  type ActiveSprint,
  findActiveSprint,
  formatReport,
  probeSprintPropertyWrite,
  type ReadDiagnostics,
  runReadProbes,
  type WriteDiagnostics,
} from "../../jira/diagnostics";
import { JiraError } from "../../jira/errors";
import { isRecord } from "../../jira/json";
import { type JiraSite, normalizeSiteUrl, parseBoardUrl } from "../../jira/site";
import { JiraTransport } from "../../jira/transport";
import type { Platform } from "../platform/types";

const CONNECTION_KEY = "connection.v1";

export type Connection =
  | { state: "loading" }
  | { state: "disconnected"; lastInput: string }
  | { state: "connected"; site: JiraSite };

export interface UserMessage {
  readonly text: string;
  readonly suggestion: string | null;
}

/** État de l'interface à l'étape 1 : connexion à un site et diagnostic. */
export class AppModel {
  readonly connection: Signal<Connection> = signal({ state: "loading" });
  readonly connectionError: Signal<UserMessage | null> = signal(null);

  readonly read: Signal<ReadDiagnostics | null> = signal(null);
  readonly readRunning = signal(false);

  readonly sprint: Signal<ActiveSprint | null> = signal(null);
  readonly sprintError: Signal<UserMessage | null> = signal(null);
  readonly sprintLoading = signal(false);

  readonly write: Signal<WriteDiagnostics | null> = signal(null);
  readonly writeRunning = signal(false);

  readonly reportCopied = signal(false);

  readonly #platform: Platform;

  constructor(platform: Platform) {
    this.#platform = platform;
  }

  get extensionVersion(): string {
    return this.#platform.extensionVersion;
  }

  /** Reprend le site enregistré, si Chrome lui accorde toujours l'accès. */
  async start(): Promise<void> {
    const saved = await this.#platform.store.get(CONNECTION_KEY);
    const origin = isRecord(saved) && typeof saved.origin === "string" ? saved.origin : null;
    if (origin === null) {
      this.connection.value = { state: "disconnected", lastInput: "" };
      return;
    }
    try {
      const site = normalizeSiteUrl(origin);
      if (await this.#platform.permissions.contains(site.permissionPattern)) {
        this.connection.value = { state: "connected", site };
        await this.runReads();
        return;
      }
      // L'accès a été retiré depuis chrome://extensions : on le redemandera sur un geste.
      this.connection.value = { state: "disconnected", lastInput: site.host };
    } catch {
      this.connection.value = { state: "disconnected", lastInput: "" };
    }
  }

  /**
   * À appeler depuis un geste de l'utilisateur. La saisie est validée de façon synchrone :
   * un hôte hors *.atlassian.net est refusé avant toute demande de permission, et la
   * demande de permission est le premier appel asynchrone (Chrome l'exige).
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
    this.#resetDiagnostics();
    this.connection.value = { state: "connected", site };
    await this.runReads();
  }

  /** Rend l'accès au site à Chrome et oublie le site. Rien n'est conservé. */
  async disconnect(): Promise<void> {
    const current = this.connection.value;
    if (current.state !== "connected") return;
    await this.#platform.permissions.remove(current.site.permissionPattern);
    await this.#platform.store.remove(CONNECTION_KEY);
    this.#resetDiagnostics();
    this.connectionError.value = null;
    this.connection.value = { state: "disconnected", lastInput: current.site.host };
  }

  async runReads(): Promise<void> {
    const transport = this.#transport();
    if (!transport || this.readRunning.value) return;
    this.readRunning.value = true;
    this.reportCopied.value = false;
    try {
      this.read.value = await runReadProbes(transport);
    } finally {
      this.readRunning.value = false;
    }
  }

  /** Cherche le sprint actif du board désigné : c'est lui qui portera le test d'écriture. */
  async findSprint(rawBoardUrl: string): Promise<void> {
    const transport = this.#transport();
    if (!transport || this.sprintLoading.value) return;
    this.sprint.value = null;
    this.write.value = null;
    this.sprintError.value = null;

    const parsed = parseBoardUrl(rawBoardUrl);
    if (!parsed) {
      this.sprintError.value = {
        text: "Cette adresse ne désigne pas un board Jira.",
        suggestion: `Collez l'adresse complète du board, par exemple ${transport.site.origin}/jira/software/c/projects/ABC/boards/123`,
      };
      return;
    }
    if (parsed.site.origin !== transport.site.origin) {
      this.sprintError.value = {
        text: `Ce board appartient à ${parsed.site.host}, pas à ${transport.site.host}.`,
        suggestion: "L'extension n'a accès qu'au site auquel vous êtes connecté.",
      };
      return;
    }

    this.sprintLoading.value = true;
    try {
      const sprint = await findActiveSprint(transport, parsed.boardId);
      if (sprint) this.sprint.value = sprint;
      else {
        this.sprintError.value = {
          text: "Ce board n'a aucun sprint actif.",
          suggestion:
            "Le test d'écriture a besoin d'un sprint actif pour y poser sa propriété technique.",
        };
      }
    } catch (error) {
      this.sprintError.value = toMessage(error);
    } finally {
      this.sprintLoading.value = false;
    }
  }

  /** Test d'écriture : uniquement sur un geste explicite, uniquement sur le sprint affiché. */
  async runWriteTest(): Promise<void> {
    const transport = this.#transport();
    const sprint = this.sprint.value;
    if (!transport || !sprint || this.writeRunning.value) return;
    this.writeRunning.value = true;
    this.reportCopied.value = false;
    try {
      this.write.value = await probeSprintPropertyWrite(transport, sprint.id);
    } finally {
      this.writeRunning.value = false;
    }
  }

  report(): string {
    return formatReport({
      extensionVersion: this.#platform.extensionVersion,
      userAgent: this.#platform.userAgent,
      read: this.read.value,
      write: this.write.value,
    });
  }

  async copyReport(): Promise<void> {
    await this.#platform.copyText(this.report());
    this.reportCopied.value = true;
  }

  #transport(): JiraTransport | null {
    const current = this.connection.value;
    if (current.state !== "connected") return null;
    // Une seule tentative par requête : le diagnostic doit rapporter ce que Jira répond,
    // pas ce qu'il finit par répondre.
    return new JiraTransport({
      site: current.site,
      fetch: this.#platform.fetch,
      maxGetAttempts: 1,
    });
  }

  #resetDiagnostics(): void {
    this.read.value = null;
    this.sprint.value = null;
    this.sprintError.value = null;
    this.write.value = null;
    this.reportCopied.value = false;
  }
}

function toMessage(error: unknown): UserMessage {
  if (error instanceof JiraError) return { text: error.message, suggestion: error.suggestion };
  return { text: error instanceof Error ? error.message : String(error), suggestion: null };
}
