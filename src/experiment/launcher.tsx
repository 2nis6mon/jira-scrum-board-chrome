import { render } from "preact";
import { chromeLauncherPlatform } from "../app/platform/launcherChrome";
import { LauncherModel } from "./LauncherModel";
import "./launcher.css";

function Launcher({ model }: { model: LauncherModel }) {
  return (
    <main>
      <header>
        <img src="/icons/icon-32.png" alt="" width="32" height="32" />
        <h1>Sprint Goals dans Jira</h1>
      </header>
      <p>Ouvrez vos objectifs et vos tickets directement dans leur board Jira.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void model.open();
        }}
      >
        <label for="board-address">Adresse du board Jira</label>
        <input
          id="board-address"
          type="text"
          inputMode="url"
          autocomplete="off"
          spellcheck={false}
          placeholder="https://votre-site.atlassian.net/jira/…/boards/…"
          value={model.address.value}
          onInput={(event) => {
            model.address.value = event.currentTarget.value;
            model.error.value = null;
          }}
          disabled={!model.ready.value || model.busy.value}
        />
        {model.error.value && <p role="alert">{model.error.value}</p>}
        <button
          type="submit"
          disabled={!model.ready.value || model.busy.value || !model.address.value.trim()}
        >
          {model.busy.value ? "Ouverture…" : "Ouvrir dans Jira"}
        </button>
      </form>
      <p class="hint">
        Au premier accès, Chrome vous demande l'autorisation pour ce site. Votre session Jira
        habituelle est utilisée.
      </p>
    </main>
  );
}

const container = document.getElementById("launcher");
if (!container) throw new Error("Élément #launcher introuvable dans launcher.html");
const model = new LauncherModel(chromeLauncherPlatform());
render(<Launcher model={model} />, container);
void model.start();
