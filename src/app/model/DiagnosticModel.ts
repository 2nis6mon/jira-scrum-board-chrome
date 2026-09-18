import { signal } from "@preact/signals";
import {
  type ActiveSprint,
  findActiveSprint,
  formatReport,
  probeSprintPropertyWrite,
  type ReadDiagnostics,
  runReadProbes,
  type WriteDiagnostics,
} from "../../jira/diagnostics";
import { type JiraSite, parseBoardUrl } from "../../jira/site";
import { JiraTransport } from "../../jira/transport";
import type { Platform } from "../platform/types";
import type { AuditEntry, AuditLog } from "./auditLog";
import type { GraphqlOrigin } from "./graphqlOrigin";
import { toMessage, type UserMessage } from "./messages";

/**
 * Diagnostic de connexion : ce que Jira répond réellement aux requêtes de l'extension. Lectures à
 * l'ouverture ; test d'écriture uniquement sur un geste explicite, sur le sprint affiché.
 */
export class DiagnosticModel {
  readonly site: JiraSite;

  readonly read = signal<ReadDiagnostics | null>(null);
  readonly readRunning = signal(false);

  readonly sprint = signal<ActiveSprint | null>(null);
  readonly sprintError = signal<UserMessage | null>(null);
  readonly sprintLoading = signal(false);

  readonly write = signal<WriteDiagnostics | null>(null);
  readonly writeRunning = signal(false);

  readonly reportCopied = signal(false);

  /** Journal local des écritures faites depuis le board, du plus récent au plus ancien. */
  readonly journal = signal<readonly AuditEntry[]>([]);

  readonly #platform: Platform;
  readonly #transport: JiraTransport;
  readonly #audit: AuditLog;
  readonly #origin: GraphqlOrigin | null;

  constructor(
    site: JiraSite,
    platform: Platform,
    audit: AuditLog,
    origin: GraphqlOrigin | null = null,
  ) {
    this.site = site;
    this.#platform = platform;
    this.#audit = audit;
    this.#origin = origin;
    // Une seule tentative par requête : le diagnostic doit rapporter ce que Jira répond,
    // pas ce qu'il finit par répondre.
    this.#transport = new JiraTransport({ site, fetch: platform.fetch, maxGetAttempts: 1 });
  }

  async runReads(): Promise<void> {
    if (this.readRunning.value) return;
    this.readRunning.value = true;
    this.reportCopied.value = false;
    const origin = this.#origin;
    try {
      const read = await runReadProbes(this.#transport, origin);
      // La variante que la passerelle a acceptée devient celle du site.
      if (origin && read.graphqlOrigin) await origin.remember(read.graphqlOrigin);
      this.read.value = read;
    } finally {
      // Les sondes ont changé la règle : on repose celle retenue pour le site.
      await origin?.restore().catch(() => {});
      this.readRunning.value = false;
    }
  }

  /** Cherche le sprint actif du board désigné : c'est lui qui portera le test d'écriture. */
  async findSprint(rawBoardUrl: string): Promise<void> {
    if (this.sprintLoading.value) return;
    this.sprint.value = null;
    this.write.value = null;
    this.sprintError.value = null;

    const parsed = parseBoardUrl(rawBoardUrl);
    if (!parsed) {
      this.sprintError.value = {
        text: "Cette adresse ne désigne pas un board Jira.",
        suggestion: `Collez l'adresse complète du board, par exemple ${this.site.origin}/jira/software/c/projects/ABC/boards/123`,
      };
      return;
    }
    if (parsed.site.origin !== this.site.origin) {
      this.sprintError.value = {
        text: `Ce board appartient à ${parsed.site.host}, pas à ${this.site.host}.`,
        suggestion: "L'extension n'a accès qu'au site auquel vous êtes connecté.",
      };
      return;
    }

    this.sprintLoading.value = true;
    try {
      const sprint = await findActiveSprint(this.#transport, parsed.boardId);
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
    const sprint = this.sprint.value;
    if (!sprint || this.writeRunning.value) return;
    this.writeRunning.value = true;
    this.reportCopied.value = false;
    try {
      this.write.value = await probeSprintPropertyWrite(this.#transport, sprint.id);
    } finally {
      this.writeRunning.value = false;
    }
  }

  async loadJournal(): Promise<void> {
    this.journal.value = await this.#audit.list(this.site.origin);
  }

  async clearJournal(): Promise<void> {
    await this.#audit.forgetSite(this.site.origin);
    this.journal.value = [];
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
}
