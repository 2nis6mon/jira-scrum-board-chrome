/**
 * Protocole entre la page Jira (hôte), la vue encadrée, le script de contenu, le lanceur et le
 * service worker (AD-7). Chaque message `sprint-goals:*` est déclaré ici une seule fois : type,
 * canal, sens et champs, avec leurs règles de validation en données pures (motifs en source de
 * RegExp, longueurs maximales en nombres).
 *
 * Doublons nommés, imposés par l'absence d'import et comparés à cette déclaration par
 * `tests/integration/messages.test.ts` :
 * - `injectBoard.ts` (copié par `executeScript`) : copie complète entre les marqueurs
 *   `<protocole sprint-goals>`, et même bloc de validation entre `<validation sprint-goals>` ;
 * - `bootstrap.ts` (script de contenu sans import) : `launch` ;
 * - `app/platform/launcherChrome.ts` (`platform` n'importe que des types d'`integration`) :
 *   `prepareLaunch`.
 *
 * Un champ facultatif absent ou invalide est lu `null` ; un champ obligatoire invalide fait ignorer
 * le message. Seuls les champs déclarés sont lus. Origine et fenêtre source restent vérifiées par
 * chaque destinataire, avant toute lecture.
 */
export const PROTOCOL = {
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
} as const;

type Protocol = typeof PROTOCOL;
export type MessageName = keyof Protocol;
export type MessageDirection = Protocol[MessageName]["direction"];

type RuleValue<R> = R extends { readonly kind: "enum"; readonly values: readonly (infer V)[] }
  ? V
  : R extends { readonly kind: "integer" }
    ? number
    : R extends { readonly kind: "string" }
      ? string
      : R extends { readonly kind: "object"; readonly fields: infer F }
        ? ReadFields<F>
        : never;
type ReadFields<F> = {
  -readonly [K in keyof F]: F[K] extends { readonly optional: true }
    ? RuleValue<F[K]> | null
    : RuleValue<F[K]>;
};
type OptionalKeys<F> = {
  [K in keyof F]: F[K] extends { readonly optional: true } ? K : never;
}[keyof F];
type SentFields<F> = { -readonly [K in Exclude<keyof F, OptionalKeys<F>>]: RuleValue<F[K]> } & {
  -readonly [K in OptionalKeys<F>]?: RuleValue<F[K]> | null;
};

/** Message lu et validé : seuls les champs déclarés, les facultatifs invalides à `null`. */
export type ReceivedMessage<N extends MessageName> = { type: Protocol[N]["type"] } & ReadFields<
  Protocol[N]["fields"]
>;
type ReceivedFor<D extends MessageDirection> = {
  [N in MessageName]: Protocol[N]["direction"] extends D ? ReceivedMessage<N> : never;
}[MessageName];

/** Construit un message déclaré ; le destinataire le valide à nouveau à la réception. */
export function message<N extends MessageName>(
  name: N,
  ...fields: keyof Protocol[N]["fields"] extends never ? [] : [SentFields<Protocol[N]["fields"]>]
): { type: Protocol[N]["type"] } & SentFields<Protocol[N]["fields"]> {
  return { type: PROTOCOL[name].type, ...fields[0] } as { type: Protocol[N]["type"] } & SentFields<
    Protocol[N]["fields"]
  >;
}

/** Lit un message reçu dans le sens attendu ; `null` s'il n'est pas déclaré ou invalide. */
export function readMessage<D extends MessageDirection>(
  data: unknown,
  direction: D,
): ReceivedFor<D> | null {
  return readSprintGoalsMessage(PROTOCOL, data, direction) as ReceivedFor<D> | null;
}

// Bloc recopié tel quel dans injectBoard.ts ; le test compare les deux textes.
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
