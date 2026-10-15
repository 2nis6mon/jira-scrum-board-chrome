import { localize, t } from "../../i18n";
import type { AppModel } from "../../model/AppModel";
import "../../styles/settings.css";
import { Icon } from "../Icon";
import { Segmented } from "./controls";

/** Préférence du navigateur, disponible même sans droit de configuration du board. */
export function LanguagePreferenceCard({ model }: { model: AppModel }) {
  return (
    <section class="settings-card" aria-labelledby="settings-language-title">
      <header class="settings-card-header">
        <div class="settings-card-title">
          <h2 id="settings-language-title">{t("Langue de l'interface")}</h2>
          <p class="settings-help">
            {t("Préférence personnelle, conservée dans ce navigateur pour tous vos boards.")}
          </p>
        </div>
        <span class="settings-badge settings-badge-personal">{t("Personnel")}</span>
      </header>
      <Segmented
        label={t("Langue de l'interface")}
        name="interface-language"
        value={model.languagePreference.value}
        choices={[
          { id: "auto", label: t("Automatique — suivre Jira") },
          { id: "fr", label: "Français" },
          { id: "en", label: "English" },
          { id: "es", label: "Español" },
        ]}
        onChange={(value) => void model.setLanguagePreference(value)}
      />
      <p class="settings-help">
        {t(
          "Automatique : français si Jira est en français, espagnol si Jira est en espagnol, anglais pour les autres langues.",
        )}
      </p>
      <p class="settings-help">
        {t(
          "Le changement est immédiat. Les contenus et les fenêtres natives de Jira gardent leur langue.",
        )}
      </p>
      {model.languagePreferenceError.value && (
        <p class="notice notice-error" role="alert">
          {localize(model.languagePreferenceError.value)}
        </p>
      )}
    </section>
  );
}

export function PersonalPreferences({ model }: { model: AppModel }) {
  return (
    <main class="settings-screen" aria-labelledby="personal-preferences-title">
      <header class="settings-header">
        <div class="settings-header-bar">
          <button type="button" class="settings-back" onClick={() => model.showBoard()}>
            <Icon name="arrowLeft" size={15} />
            {t("Retour au board")}
          </button>
        </div>
        <h1 id="personal-preferences-title">{t("Préférences personnelles")}</h1>
      </header>
      <div class="settings-body">
        <LanguagePreferenceCard model={model} />
      </div>
    </main>
  );
}
