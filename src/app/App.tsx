interface AppProps {
  version: string;
}

/** Racine de l'interface. Sans site Jira connecté, elle n'affiche aucune donnée. */
export function App({ version }: AppProps) {
  return (
    <>
      <header class="app-header">
        <h1>Scrum Board</h1>
        <span class="app-version">{version}</span>
      </header>
      <main class="empty-state">
        <h2>Aucun site Jira connecté</h2>
        <p>
          L'extension n'a accès à aucun site : aucune permission d'hôte n'a été demandée ni
          accordée.
        </p>
      </main>
    </>
  );
}
