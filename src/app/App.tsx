import type { AppModel } from "./model/AppModel";
import { ConnectionView } from "./views/ConnectionView";
import { DiagnosticView } from "./views/DiagnosticView";

/** Racine de l'interface. Sans site Jira connecté, elle n'affiche aucune donnée. */
export function App({ model }: { model: AppModel }) {
  const connection = model.connection.value;

  return (
    <>
      <header class="app-header">
        <h1>Scrum Board</h1>
        <span class="app-version">{model.extensionVersion}</span>
        {connection.state === "connected" && (
          <div class="app-site">
            <span>{connection.site.host}</span>
            <button type="button" onClick={() => void model.disconnect()}>
              Se déconnecter
            </button>
          </div>
        )}
      </header>
      {connection.state === "loading" && <main class="centered" aria-busy="true" />}
      {connection.state === "disconnected" && (
        <ConnectionView model={model} lastInput={connection.lastInput} />
      )}
      {connection.state === "connected" && <DiagnosticView model={model} site={connection.site} />}
    </>
  );
}
