import { render } from "preact";
import { useEffect } from "preact/hooks";
import { language, localize, t } from "../app/i18n";
import { chromeLauncherPlatform, isWelcomeTab } from "../app/platform/launcherChrome";
import { LauncherModel } from "./LauncherModel";
import "./launcher.css";

function Launcher({ model, welcome }: { model: LauncherModel; welcome: boolean }) {
  const locale = language.value;
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("Sprint Goals dans Jira");
  }, [locale]);
  if (!model.ready.value) return <main aria-busy="true" />;
  return (
    <main>
      <header>
        <img src="/icons/icon-32.png" alt="" width="32" height="32" />
        <h1>{welcome ? t("Sprint Goals est installé") : t("Sprint Goals dans Jira")}</h1>
      </header>
      <p>
        {welcome
          ? t(
              "Indiquez l'adresse de votre Jira pour l'autoriser. Vos objectifs et vos tickets s'ouvriront ensuite directement dans leur board Jira.",
            )
          : t("Ouvrez vos objectifs et vos tickets directement dans leur board Jira.")}
      </p>
      {model.detected.value && <p class="detected">{t("Board Jira reconnu dans cet onglet.")}</p>}
      {model.offBoard.value && (
        <p class="detected">
          {t(
            "Cet onglet n'est pas un board. Autorisez ce site ci-dessous, ou ouvrez un board puis cliquez de nouveau sur l'icône.",
          )}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void model.open();
        }}
      >
        <label for="board-address">{t("Adresse de votre Jira ou d'un board")}</label>
        <input
          id="board-address"
          type="text"
          inputMode="url"
          autocomplete="off"
          spellcheck={false}
          placeholder={t("https://votre-site.atlassian.net")}
          value={model.address.value}
          onInput={(event) => {
            model.address.value = event.currentTarget.value;
            model.error.value = null;
            model.detected.value = false;
          }}
          disabled={!model.ready.value || model.busy.value}
        />
        {model.error.value && <p role="alert">{localize(model.error.value)}</p>}
        <button
          type="submit"
          disabled={!model.ready.value || model.busy.value || !model.address.value.trim()}
        >
          {model.busy.value
            ? t("Ouverture…")
            : welcome
              ? t("Autoriser et ouvrir Jira")
              : t("Ouvrir dans Jira")}
        </button>
      </form>
      <p class="hint">
        {t(
          "Au premier accès, Chrome vous demande l'autorisation pour ce site. Ensuite, un bouton « Sprint Goals » apparaît sur chacun de ses boards. Votre session Jira habituelle est utilisée.",
        )}
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
