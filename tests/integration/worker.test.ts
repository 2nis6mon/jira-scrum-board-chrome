import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Faux Chrome en mémoire : aucun navigateur, aucun site réel.
const EXTENSION_ID = "extension-fictive";
const EXTENSION = `chrome-extension://${EXTENSION_ID}`;
const BOARD = "https://acme.atlassian.net/jira/software/c/projects/ABC/boards/7?sprintGoals=1";

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (response: unknown) => void,
) => boolean;
let listener: Listener;
const executeScript = vi.fn(async () => []);
const event = () => ({ addListener: vi.fn() });

beforeAll(async () => {
  Object.assign(globalThis, {
    chrome: {
      runtime: {
        id: EXTENSION_ID,
        getURL: (path: string) => `${EXTENSION}/${path}`,
        onMessage: {
          addListener: (callback: Listener) => {
            listener = callback;
          },
        },
        onInstalled: event(),
        onStartup: event(),
      },
      permissions: {
        contains: vi.fn(async () => true),
        getAll: vi.fn(async () => ({ origins: [] })),
        onAdded: event(),
        onRemoved: event(),
      },
      scripting: {
        executeScript,
        getRegisteredContentScripts: vi.fn(async () => []),
        registerContentScripts: vi.fn(async () => {}),
        updateContentScripts: vi.fn(async () => {}),
        unregisterContentScripts: vi.fn(async () => {}),
      },
      storage: { local: { get: vi.fn(async () => ({})) } },
      tabs: { create: vi.fn() },
    },
  });
  await import("../../src/integration/worker");
});

beforeEach(() => executeScript.mockClear());

const launcher = { id: EXTENSION_ID, url: `${EXTENSION}/launcher.html?bienvenue=1` };
const tab = { id: EXTENSION_ID, frameId: 0, tab: { id: 4 }, url: BOARD } as const;

function send(message: unknown, sender: chrome.runtime.MessageSender) {
  const respond = vi.fn();
  const kept = listener(message, sender, respond);
  return { kept, respond };
}

describe("service worker et messages sprint-goals", () => {
  it("prépare le lancement demandé par le lanceur", async () => {
    const { kept, respond } = send({ type: "sprint-goals:prepare-launch" }, launcher);
    expect(kept).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }));
  });

  it("injecte la vue demandée par le cadre principal d'un onglet", async () => {
    const { kept, respond } = send({ type: "sprint-goals:launch" }, tab as never);
    expect(kept).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }));
    expect(executeScript).toHaveBeenCalledOnce();
  });

  it("ignore un type croisé, inconnu ou un expéditeur étranger", () => {
    for (const [message, sender] of [
      [{ type: "sprint-goals:launch" }, launcher],
      [{ type: "sprint-goals:prepare-launch" }, tab],
      [{ type: "sprint-goals:unknown" }, tab],
      [{ type: "sprint-goals:refresh" }, tab],
      [{ type: "sprint-goals:prepare-launch" }, { ...launcher, id: "autre" }],
      [
        { type: "sprint-goals:prepare-launch" },
        { id: EXTENSION_ID, url: `${EXTENSION}/board.html` },
      ],
      [{ type: "sprint-goals:launch" }, { ...tab, frameId: 3 }],
      [{ type: "sprint-goals:launch" }, { ...tab, id: "autre" }],
    ] as const) {
      const { kept, respond } = send(message, sender as never);
      expect(kept, JSON.stringify({ message, sender })).toBe(false);
      expect(respond).not.toHaveBeenCalled();
    }
    expect(executeScript).not.toHaveBeenCalled();
  });
});
