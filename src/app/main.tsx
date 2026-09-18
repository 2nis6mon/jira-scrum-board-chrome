import { render } from "preact";
import { App } from "./App";
import "./styles/app.css";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Élément #app introuvable dans board.html");
}

render(<App version={chrome.runtime.getManifest().version} />, container);
