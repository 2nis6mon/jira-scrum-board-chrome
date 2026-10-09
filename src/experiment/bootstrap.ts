// Script isolé et sans import. Sur un board Jira, il propose un bouton d'ouverture ; sur les
// autres pages Jira, il reste inerte.
(() => {
  if (window.top !== window) return;
  const marker = "sprint-goals-direct-bootstrap";
  if (document.documentElement.hasAttribute(marker)) return;
  document.documentElement.setAttribute(marker, "");

  const buttonId = "sprint-goals-open";
  /** Même forme d'adresse que `sprintGoalsBoardRoute` (boardRoute.ts), sans le marqueur. */
  const isBoardPage = (url: URL) => /^\/jira\/.*\/boards\/[1-9]\d*(?:\/|$)/.test(url.pathname);

  /** Adresse courante marquée pour la vue Sprint Goals ; la page Jira n'est pas rechargée. */
  const open = () => {
    const url = new URL(location.href);
    if (!isBoardPage(url)) return;
    url.searchParams.set("sprintGoals", "1");
    // Une fiche ticket ouverte sur le board ne doit pas remplacer le board au lancement.
    url.searchParams.delete("selectedIssue");
    history.pushState(history.state, "", url.href);
    void check();
  };

  /** Bouton flottant, isolé des styles de Jira ; rien n'est inséré dans son interface. */
  const showButton = () => {
    if (document.getElementById(buttonId)) return;
    const host = document.createElement("div");
    host.id = buttonId;
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host{position:fixed;right:24px;bottom:24px;z-index:2147482000;display:block}
      button{display:flex;align-items:center;gap:8px;padding:8px 14px 8px 10px;border:1px solid #dcdfe4;border-radius:20px;background:white;color:#172b4d;font:600 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(9,30,66,.25)}
      button:hover{background:#f1f2f4}
      button:focus-visible{outline:2px solid #0c66e4;outline-offset:2px}
      img{display:block;width:20px;height:20px}
    `;
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Ouvrir ce board dans Sprint Goals";
    const icon = document.createElement("img");
    icon.alt = "";
    icon.src = chrome.runtime.getURL("icons/icon-32.png");
    button.append(icon, "Sprint Goals");
    button.addEventListener("click", open);
    root.append(style, button);
    document.body.append(host);
  };
  const hideButton = () => document.getElementById(buttonId)?.remove();

  /** Extension rechargée ou retirée : ce script n'a plus de contexte, il s'efface. */
  const stop = () => {
    clearInterval(timer);
    hideButton();
    document.documentElement.removeAttribute(marker);
  };

  let previous = "";
  let busy = false;
  const check = async () => {
    const address = location.href;
    if (busy || previous === address) return;
    previous = address;
    const url = new URL(address);
    if (url.searchParams.get("sprintGoals") !== "1") {
      document.getElementById("sprint-goals-direct")?.remove();
      if (!isBoardPage(url)) hideButton();
      else
        try {
          showButton();
        } catch {
          stop();
        }
      return;
    }
    hideButton();
    busy = true;
    try {
      await chrome.runtime.sendMessage({ type: "sprint-goals:launch" });
    } catch {
      stop();
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void check(), 500);
  window.addEventListener("popstate", () => void check());
  void check();
})();
