import { useEffect, useState } from "preact/hooks";
import { t } from "../i18n";
import { Icon } from "./Icon";

// Plein écran du navigateur, pour la daily et le mode présentation (demandes de Denis du
// 24/09/2026). Toujours demandé sur un geste de l'utilisateur, comme l'exige le navigateur. Refusé
// (cadre sans délégation, réglage du navigateur), le mode se déroule simplement dans la fenêtre.

/** Demande le plein écran de la page. À appeler dans le gestionnaire d'un clic. */
export function requestFullscreen(): void {
  document.documentElement.requestFullscreen?.().catch(() => {});
}

/** Rend le plein écran, s'il est actif. */
export function exitFullscreen(): void {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

/** La page est-elle en plein écran ? Suit les entrées et sorties, Échap compris. */
export function useFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(() => document.fullscreenElement != null);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  return fullscreen;
}

/** Bouton pour revenir en plein écran après en être sorti (Échap) ; absent en plein écran. */
export function FullscreenButton({ fullscreen }: { fullscreen: boolean }) {
  if (fullscreen || !document.fullscreenEnabled) return null;
  return (
    <button
      type="button"
      class="icon-button"
      aria-label={t("Plein écran")}
      title={t("Plein écran")}
      onClick={requestFullscreen}
    >
      <Icon name="fullscreen" size={17} />
    </button>
  );
}
