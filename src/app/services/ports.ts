import type { BoardConfiguration } from "../../core/boardConfiguration";
import type { JiraWriter } from "../../core/boardWrites";
import type { GoalsClient } from "../../jira/goals";
import type { AuditEntry } from "../model/auditLog";

/** Accès d'état minimal : aucune dépendance au moteur de signaux ni aux vues. */
export interface ReadableValue<T> {
  readonly value: T;
}
export interface StateValue<T> {
  value: T;
  peek(): T;
}
export interface BoardScope {
  generation(): number;
  disposed(): boolean;
}
export type ConfigurationChange = (configuration: BoardConfiguration) => BoardConfiguration;
export type RecordWrite = (entry: Omit<AuditEntry, "at" | "site">) => Promise<void>;

/** Ce que la porte d'écriture du board remet à un geste, pour sa seule durée. */
export interface BoardWriteAccess {
  /** Décorateur du transport : péremption du board, et `canEdit` pour E6 seulement. */
  readonly writer: JiraWriter;
  readonly goals: Pick<GoalsClient, "setLink">;
}
/**
 * Raison d'un refus de la porte : `stale`, geste préparé pour un board quitté ou rechargé ;
 * `cannotEdit`, propriété du board (E6) sans `canEdit`.
 */
export type BoardWriteRefusal = "stale" | "cannotEdit";
/**
 * Refus de la porte, levé AVANT tout envoi : rien n'est parti vers Jira. Les services le
 * distinguent d'un refus de Jira ; son texte vient du catalogue (`model/coreText.ts`), le
 * message de l'erreur n'est qu'une trace technique.
 */
export class BoardWriteRefused extends Error {
  readonly reason: BoardWriteRefusal;
  constructor(reason: BoardWriteRefusal) {
    super(`Écriture refusée avant l'envoi (${reason})`);
    this.name = "BoardWriteRefused";
    this.reason = reason;
  }
}
/** Porte unique d'écriture du board (AD-6) : un geste qui écrit attend la fin du précédent. */
export interface BoardWriteGateway {
  run<T>(task: (access: BoardWriteAccess) => Promise<T>): Promise<T>;
}
