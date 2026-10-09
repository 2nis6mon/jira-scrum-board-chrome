import { render } from "preact";
import { embeddedBoardTarget, installEmbeddedLinks } from "../experiment/embedded";
import { App } from "./App";
import { AppModel } from "./model/AppModel";
import { chromePlatform } from "./platform/chrome";
import "./styles/app.css";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Élément #app introuvable dans board.html");
}

async function startInJira(container: HTMLElement): Promise<void> {
  const refused =
    "Sprint Goals s'utilise dans Jira. Ouvrez votre board Jira, puis cliquez sur l'icône de l'extension.";
  // Aucun modèle, accès au stockage ni appel réseau depuis une page ouverte seule.
  if (window.parent === window) {
    container.textContent = refused;
    return;
  }
  const platform = chromePlatform();
  const target = await embeddedBoardTarget(platform, location).catch(() => null);
  if (!target) {
    container.textContent = refused;
    return;
  }
  const model = new AppModel(platform, target.address);
  render(<App model={model} />, container);
  installEmbeddedLinks(model, target.origin, target.address);
  await model.start(target.address);
}

void startInJira(container);
