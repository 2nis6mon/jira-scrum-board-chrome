import { render } from "preact";
import { App } from "./App";
import { AppModel } from "./model/AppModel";
import { chromePlatform } from "./platform/chrome";
import "./styles/app.css";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Élément #app introuvable dans board.html");
}

const model = new AppModel(chromePlatform());
render(<App model={model} />, container);
void model.start();
