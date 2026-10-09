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
      {model.detected.value && <p class="detected">Board Jira reconnu dans cet onglet.</p>}
      {model.offBoard.value && (
        <p class="detected">
          Ouvrez un board Jira dans cet onglet, puis cliquez de nouveau sur l'icône : son adresse
          sera reconnue.
        </p>
      )}
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
            model.detected.value = false;
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
        Au premier accès, Chrome vous demande l'autorisation pour ce site. Ensuite, un bouton «
        Sprint Goals » apparaît sur chacun de ses boards. Votre session Jira habituelle est
        utilisée.
      </p>
    </main>
  );
}

const container = document.getElementById("launcher");
if (!container) throw new Error("Élément #launcher introuvable dans launcher.html");
const model = new LauncherModel(chromeLauncherPlatform());
render(<Launcher model={model} />, container);
void model.start();
