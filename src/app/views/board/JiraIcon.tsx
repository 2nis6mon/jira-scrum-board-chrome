import type { ImageCache } from "../../model/ImageCache";

/** Icône Jira téléchargée avec la session ; à défaut, l'initiale du libellé. */
export function JiraIcon(props: { url: string | null; label: string; images: ImageCache }) {
  const src = props.images.get(props.url)?.value ?? null;
  if (src) {
    return <img class="jira-icon" src={src} alt={props.label} title={props.label} />;
  }
  return (
    <span
      class="jira-icon jira-icon-fallback"
      role="img"
      aria-label={props.label}
      title={props.label}
    >
      {[...props.label][0]?.toUpperCase() ?? "?"}
    </span>
  );
}
