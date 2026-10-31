import { type ReadonlySignal, signal } from "@preact/signals";
import type { JiraWriter } from "../../core/boardWrites";
import type { GoalsClient } from "../../jira/goals";
import type {
  BoardScope,
  BoardWriteAccess,
  BoardWriteGateway,
  BoardWriteOptions,
} from "../services/ports";

/** Refus par défaut d'une écriture préparée pour un board quitté, ou d'E6 sans `canEdit`. */
export const BOARD_CHANGED_REFUSAL = "Le board ou ses droits ont changé avant l'enregistrement.";

export interface BoardWriteGateDependencies {
  /** Transport (ou décorateur) Jira : seule la porte le voit, jamais `core` ni les services. */
  readonly writer: JiraWriter;
  readonly goals: Pick<GoalsClient, "setLink">;
  readonly scope: BoardScope;
  /** Faux seulement si Jira a dit que le compte ne peut pas modifier le board. */
  canEditSettings(): boolean;
}

/**
 * Porte unique d'écriture d'un board (AD-6). Chaque geste qui écrit (déplacement, rattachement,
 * réglages, épinglage, publication du planning) l'acquiert : il attend la fin du précédent, puis
 * reçoit un `JiraWriter` et un `setLink` décorés. Le décorateur refuse avant l'envoi une écriture
 * préparée pour une génération de board dépassée, et `boardProperty.put` (E6) quand `canEdit` est
 * faux ; les autres écritures restent aux droits Jira. Une seule tentative : rien n'est rejoué.
 */
export class BoardWriteGate implements BoardWriteGateway {
  readonly #dependencies: BoardWriteGateDependencies;
  #queue: Promise<void> = Promise.resolve();
  readonly #busy = signal(0);
  /** Gestes acquis ou en attente de la porte. */
  readonly busy: ReadonlySignal<number> = this.#busy;

  constructor(dependencies: BoardWriteGateDependencies) {
    this.#dependencies = dependencies;
  }

  run<T>(
    task: (access: BoardWriteAccess) => Promise<T>,
    options: BoardWriteOptions = {},
  ): Promise<T> {
    const { scope } = this.#dependencies;
    // Le geste est préparé pour le board affiché maintenant : un changement pendant l'attente
    // le rend périmé.
    const generation = scope.generation();
    const refusal = options.refusal ?? BOARD_CHANGED_REFUSAL;
    const stale = () => scope.disposed() || generation !== scope.generation();
    const access = this.#access(stale, refusal);
    this.#busy.value += 1;
    const result = this.#queue.then(() => task(access));
    // Une tâche rejetée ne bloque pas la suivante.
    this.#queue = result.then(
      () => {},
      () => {},
    );
    return result.finally(() => {
      this.#busy.value -= 1;
    });
  }

  /**
   * Se résout quand aucun geste n'est plus acquis ni en attente, y compris ceux arrivés pendant
   * l'attente. Jamais rejetée : une tâche en échec compte comme terminée.
   */
  async idle(): Promise<void> {
    // `busy` baisse juste après la fin de la file : on attend de nouveau tant qu'il reste un geste.
    while (this.#busy.peek() > 0) await this.#queue;
  }

  #access(stale: () => boolean, refusal: string): BoardWriteAccess {
    const { writer, goals, canEditSettings } = this.#dependencies;
    return {
      writer: {
        write: async (write, options) => {
          if (stale() || (write.kind === "boardProperty.put" && !canEditSettings()))
            throw new Error(refusal);
          return writer.write(write, options);
        },
      },
      goals: {
        setLink: async (kind, goalId, issueId) => {
          if (stale()) throw new Error(refusal);
          return goals.setLink(kind, goalId, issueId);
        },
      },
    };
  }
}
