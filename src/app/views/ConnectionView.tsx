import { useState } from "preact/hooks";
import { t } from "../i18n";
import type { AppModel } from "../model/AppModel";
import { ErrorMessage } from "./Message";

interface Props {
  model: AppModel;
  lastInput: string;
}

export function ConnectionView({ model, lastInput }: Props) {
  const [input, setInput] = useState(lastInput);
  const [busy, setBusy] = useState(false);

  const submit = (event: Event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    // Pas d'await avant connect() : Chrome n'affiche sa demande d'accès que dans le geste.
    void model.connect(input).finally(() => setBusy(false));
  };

  return (
    <main class="centered">
      <form class="panel connection" onSubmit={submit}>
        <h2>{t("Connexion à Jira")}</h2>
        <label for="site">{t("Adresse de votre site Jira")}</label>
        <input
          id="site"
          type="text"
          inputMode="url"
          autocomplete="off"
          spellcheck={false}
          placeholder={t("votre-societe.atlassian.net")}
          value={input}
          readOnly={model.hostSite !== null}
          onInput={(event) => setInput(event.currentTarget.value)}
        />
        <ErrorMessage message={model.connectionError.value} />
        <button type="submit" class="primary" disabled={busy || input.trim() === ""}>
          {t("Se connecter")}
        </button>
        <ul class="notes">
          <li>
            {t("Chrome va vous demander d'autoriser l'extension à accéder à")}{" "}
            <strong>{t("ce site, et à lui seul")}</strong>.
          </li>
          <li>
            {t(
              "L'extension utilise votre session Jira ouverte dans ce navigateur. Elle ne demande et ne voit ni mot de passe ni jeton.",
            )}
          </li>
          <li>{t("Seuls les sites *.atlassian.net sont acceptés.")}</li>
        </ul>
      </form>
    </main>
  );
}
