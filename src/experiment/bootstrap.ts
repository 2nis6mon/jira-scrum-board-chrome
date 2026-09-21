// Script isolé et sans import : il reste inerte sur toutes les pages Jira ordinaires.
(() => {
  if (window.top !== window) return;
  const marker = "sprint-goals-direct-bootstrap";
  if (document.documentElement.hasAttribute(marker)) return;
  document.documentElement.setAttribute(marker, "");

  let previous = "";
  let busy = false;
  const check = async () => {
    const address = location.href;
    if (busy || previous === address) return;
    previous = address;
    if (new URL(address).searchParams.get("sprintGoals") !== "1") {
      document.getElementById("sprint-goals-direct")?.remove();
      return;
    }
    busy = true;
    try {
      await chrome.runtime.sendMessage({ type: "sprint-goals:launch" });
    } catch {
      clearInterval(timer);
      document.documentElement.removeAttribute(marker);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void check(), 500);
  window.addEventListener("popstate", () => void check());
  void check();
})();
