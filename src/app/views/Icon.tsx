import type { ComponentChildren } from "preact";

// Icônes de l'interface, dessinées ici (traits sur une grille 24 × 24) : aucune ressource externe,
// aucune bibliothèque. Elles reprennent le sens des symboles de l'app Mac, pas leur dessin.
// Décoratives : le libellé ou l'`aria-label` du bouton qui les porte dit ce qu'elles font.

const PATHS = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 20.5 20.5" />
    </>
  ),
  blocked: (
    <>
      <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" />
      <path d="M12 7.5v5.5M12 16.5v.1" />
    </>
  ),
  added: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  jiraFilters: <path d="M4 7h16M7 12h10M10 17h4" />,
  done: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.8 2.8L16 9.8" />
    </>
  ),
  points: <path d="M4 20V11M9.3 20V6M14.7 20V13M20 20V4" />,
  bug: (
    <>
      <rect x="7.5" y="8" width="9" height="12.5" rx="4.5" />
      <path d="M9.5 8.2a2.5 2.5 0 0 1 5 0M12 11.5v9M3.5 13h4M16.5 13h4M4.5 8.5l3 2M19.5 8.5l-3 2M4.5 19l3-2M19.5 19l-3-2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c.6-3.8 3.6-6 7.5-6s6.9 2.2 7.5 6" />
    </>
  ),
  type: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
    </>
  ),
  parent: <path d="M12 3.5 20.5 8 12 12.5 3.5 8zM3.5 12 12 16.5 20.5 12M3.5 16 12 20.5 20.5 16" />,
  priority: (
    <>
      <path d="M12 3.5 21.5 20h-19z" />
      <path d="M12 9.5v4.5M12 17v.1" />
    </>
  ),
  goal: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
  status: <path d="M5.5 21V3.5M5.5 4h12l-2.5 4.5 2.5 4.5h-12" />,
  label: (
    <>
      <path d="M3.5 3.5h8l9 9-8 8-9-9z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  reset: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  refresh: <path d="M20 12a8 8 0 1 1-3-6.24M17.5 1.8v4.5H13" />,
  sidebar: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M9 4.5v15" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M9 4.5v15M15 4.5v15" />
    </>
  ),
  health: <path d="M2.5 12H7l2.5-6.5 4 13L16 12h5.5" />,
  // Roue dentée à huit dents, calculée (rayons 7,3 et 10).
  settings: (
    <>
      <path
        stroke-width="1.7"
        d="M9.68 5.08L10.86 4.79L10.87 2.06L13.13 2.06L13.14 4.79L15.26 5.47L16.29 6.09L18.23 4.17L19.83 5.77L17.91 7.71L18.92 9.68L19.21 10.86L21.94 10.87L21.94 13.13L19.21 13.14L18.53 15.26L17.91 16.29L19.83 18.23L18.23 19.83L16.29 17.91L14.32 18.92L13.14 19.21L13.13 21.94L10.87 21.94L10.86 19.21L8.74 18.53L7.71 17.91L5.77 19.83L4.17 18.23L6.09 16.29L5.08 14.32L4.79 13.14L2.06 13.13L2.06 10.87L4.79 10.86L5.47 8.74L6.09 7.71L4.17 5.77L5.77 4.17L7.71 6.09z"
      />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  build: (
    <>
      <path d="M12.5 6.5 16 3l5 5-3.5 3.5z" />
      <path d="M14.3 9.7 4 20" stroke-width="2.6" />
    </>
  ),
  run: (
    <path d="M12 21.5c-3.8 0-6.5-2.6-6.5-6.2 0-3.3 2.2-5.3 3.6-7.6.3 1.8 1.2 3 2.4 3.6-.2-3.2 1.1-6 3.5-8.3.2 3 1.4 4.8 2.7 6.5 1.1 1.5 1.8 3.2 1.8 5.3 0 3.7-2.8 6.7-7.5 6.7z" />
  ),
  boards: (
    <>
      <rect x="3" y="8.5" width="18" height="12" rx="2" />
      <path d="M5.5 5.5h13M8 2.5h8" />
    </>
  ),
  chevrons: <path d="M8 9.5 12 5.5l4 4M8 14.5l4 4 4-4" />,
  chevronUp: <path d="M6 15l6-6 6 6" />,
  /** Chevalet de présentation : entrer en mode présentation. */
  present: <path d="M3 4h18M4.5 4v10.5h15V4M12 14.5V18M8 21l4-3 4 3" />,
  /** Flèches rentrantes : quitter le mode présentation. */
  exitPresent: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  /** Lecture : lancer la daily. */
  play: <path d="M7 4.5v15l12-7.5z" />,
  pause: <path d="M8.5 5v14M15.5 5v14" />,
  /** Carré : terminer la daily. */
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  /** Coins sortants : passer en plein écran. */
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  /** Liste cochée : les sous-tâches d'un ticket. */
  subtasks: (
    <>
      <rect x="3.5" y="4.5" width="3.5" height="3.5" rx="0.8" />
      <rect x="3.5" y="10.25" width="3.5" height="3.5" rx="0.8" />
      <rect x="3.5" y="16" width="3.5" height="3.5" rx="0.8" />
      <path d="M10 6.25h10.5M10 12h10.5M10 17.75h10.5" />
    </>
  ),
  signOut: <path d="M10 4H5v16h5M9.5 12h11M16.5 8l4 4-4 4" />,
} satisfies Record<string, ComponentChildren>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      class={`icon icon-${name}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
