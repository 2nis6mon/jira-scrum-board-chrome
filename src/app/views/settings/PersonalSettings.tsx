import { useState } from "preact/hooks";
import type { AppModel } from "../../model/AppModel";

export function PersonalSettings({ model }: { model: AppModel }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const reset = async () => {
    setBusy(true);
    setMessage("");
    try {
      await model.resetJiraButtonPosition();
      setMessage("Le bouton retrouvera sa position en bas à droite dans Jira.");
    } catch {
      setMessage("Impossible de réinitialiser la position. Réessayez.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section class="panel">
      <h2>Préférences personnelles</h2>
      <p>
        Sur ce site Jira, déplacez le bouton Sprint Goals par sa poignée. Sa position est conservée
        dans ce navigateur pour tous les boards du site.
      </p>
      <p class="hint">
        Au clavier : sélectionnez la poignée avec Tab, puis utilisez les flèches. Maj permet un
        déplacement plus précis.
      </p>
      <button type="button" disabled={busy} onClick={() => void reset()}>
        Réinitialiser la position du bouton Jira
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
