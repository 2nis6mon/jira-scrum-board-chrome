import { render } from "preact";
import { App } from "./App";
import { AppModel } from "./model/AppModel";
import { chromePlatform } from "./platform/chrome";
import "./styles/app.css";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Élément #app introuvable dans board.html");
}

const platform = chromePlatform();
const model = new AppModel(platform);
const embedded = import.meta.env.MODE === "jira-direct-test" && window.parent !== window;
if (embedded) {
  // Paquet d'essai affiché dans une page Jira : rien n'est lu ni affiché avant d'avoir vérifié que
  // la page hôte est bien celle du site connecté (un autre site Atlassian peut encadrer la page).
  void import("../experiment/embedded").then(
    async ({ embeddedBoardTarget, installEmbeddedLinks }) => {
      const target = await embeddedBoardTarget(platform, location).catch(() => null);
      if (!target) {
        container.textContent =
          "Sprint Goals ne s'affiche que dans la page Jira de votre site connecté.";
        return;
      }
      render(<App model={model} />, container);
      installEmbeddedLinks(model, target.origin);
      void model.start(target.address);
    },
  );
} else {
  render(<App model={model} />, container);
  void model.start();
}
