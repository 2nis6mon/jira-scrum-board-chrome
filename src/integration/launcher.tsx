import { render } from "preact";
import { chromeLauncherPlatform, isWelcomeTab } from "../app/platform/launcherChrome";
import { LauncherModel } from "./LauncherModel";
import "./launcher.css";

function Launcher({ model, welcome }: { model: LauncherModel; welcome: boolean }) {
  return (
    <main>
      <header>
        <img src="/icons/icon-32.png" alt="" width="32" height="32" />
        <h1>{welcome ? "Sprint Goals est installé" : "Sprint Goals dans Jira"}</h1>
      </header>
      <p>
        {welcome
          ? "Indiquez l'adresse de votre Jira pour l'autoriser. Vos objectifs et vos tickets s'ouvriront ensuite directement dans leur board Jira."
          : "Ouvrez vos objectifs et vos tickets directement dans leur board Jira."}
      </p>
      {model.detected.value && <p class="detected">Board Jira reconnu dans cet onglet.</p>}
      {model.offBoard.value && (
        <p class="detected">
          Cet onglet n'est pas un board. Autorisez ce site ci-dessous, ou ouvrez un board puis
          cliquez de nouveau sur l'icône.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void model.open();
        }}
      >
        <label for="board-address">Adresse de votre Jira ou d'un board</label>
        <input
          id="board-address"
          type="text"
          inputMode="url"
          autocomplete="off"
          spellcheck={false}
          placeholder="https://votre-site.atlassian.net"
          value={model.address.value}
          onInput={(event) => {
            model.address.value = event.currentTarget.value;
            model.error.value = null;
            model.detected.value = false;
          }}
          disabled={!model.ready.value || model.busy.value}
        />
        {model.error.value && <p role="alert">{model.error.value}</p>}
        <button
          type="submit"
          disabled={!model.ready.value || model.busy.value || !model.address.value.trim()}
        >
          {model.busy.value
            ? "Ouverture…"
            : welcome
              ? "Autoriser et ouvrir Jira"
              : "Ouvrir dans Jira"}
        </button>
      </form>
      <p class="hint">
        Au premier accès, Chrome vous demande l'autorisation pour ce site. Ensuite, un bouton «
        Sprint Goals » apparaît sur chacun de ses boards. Votre session Jira habituelle est
        utilisée.
      </p>
    </main>
  );
}

const container = document.getElementById("launcher");
if (!container) throw new Error("Élément #launcher introuvable dans launcher.html");
const welcome = isWelcomeTab(location.search);
if (welcome) document.documentElement.classList.add("welcome");
const model = new LauncherModel(chromeLauncherPlatform());
render(<Launcher model={model} welcome={welcome} />, container);
void model.start();
