import { render } from "preact";
import { t } from "../i18n";
import { embeddedBoardTarget, installEmbeddedLinks } from "../integration/embedded";
import { App } from "./App";
import { AppModel } from "./model/AppModel";
import { chromePlatform } from "./platform/chrome";
import "./styles/app.css";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Élément #app introuvable dans board.html");
}

async function startInJira(container: HTMLElement): Promise<void> {
  const refused = t(
    "Sprint Goals s'utilise dans Jira. Ouvrez votre board Jira, puis cliquez sur l'icône de l'extension.",
  );
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
  const model = new AppModel(
    platform,
    target.address,
    new URLSearchParams(location.search).get("jiraLocale"),
  );
  await model.prepareLanguage();
  render(<App model={model} />, container);
  installEmbeddedLinks(model, target.origin, target.address);
  // Origine de la mesure : navigation du document de l'extension, pas celle de la page Jira.
  await model.start(target.address, performance.now());
}

void startInJira(container);
