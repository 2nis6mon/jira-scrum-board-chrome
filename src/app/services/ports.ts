import type { BoardConfiguration } from "../../core/boardConfiguration";
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
