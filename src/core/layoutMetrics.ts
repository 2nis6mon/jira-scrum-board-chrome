/**
 * Calcul de la largeur des colonnes du board.
 *
 * Les colonnes se partagent toute la largeur disponible, pour que le board tienne dans la
 * fenêtre sans défilement horizontal. En dessous d'une largeur minimale par colonne, elles
 * cessent de rétrécir et le défilement horizontal reprend.
 */
/** Largeur minimale pour qu'une clé longue tienne sur sa carte. */
export const MINIMUM_COLUMN_WIDTH = 170;
export const MINIMUM_COLUMN_WIDTH_PRESENTATION = 190;
/** Espace entre deux colonnes, et habillage horizontal propre à chaque colonne. */
export const COLUMN_SPACING = 10;
export const COLUMN_CHROME = 12;

/** Largeur du CONTENU d'une colonne (hors habillage). */
export function columnWidth(available: number, columnCount: number, minimum: number): number {
  if (columnCount <= 0 || available <= 0) return minimum;
  const spacing = COLUMN_SPACING * (columnCount - 1);
  const fitted = (available - spacing) / columnCount - COLUMN_CHROME;
  return Math.max(minimum, Math.floor(fitted));
}
