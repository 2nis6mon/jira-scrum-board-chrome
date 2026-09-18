import { type Signal, signal } from "@preact/signals";

/**
 * Icônes Jira (types, priorités) téléchargées une fois avec la session, puis servies en `blob:`
 * — la politique de sécurité de l'extension n'autorise aucune image distante. Un échec laisse
 * l'icône absente : l'interface montre alors le libellé.
 */
export class ImageCache {
  readonly #load: (url: string) => Promise<Blob>;
  readonly #entries = new Map<string, Signal<string | null>>();
  readonly #objectUrls: string[] = [];
  #disposed = false;

  constructor(load: (url: string) => Promise<Blob>) {
    this.#load = load;
  }

  get(url: string | null): Signal<string | null> | null {
    if (url === null || this.#disposed) return null;
    const existing = this.#entries.get(url);
    if (existing) return existing;

    const entry = signal<string | null>(null);
    this.#entries.set(url, entry);
    this.#load(url).then(
      (blob) => {
        if (this.#disposed) return;
        const objectUrl = URL.createObjectURL(blob);
        this.#objectUrls.push(objectUrl);
        entry.value = objectUrl;
      },
      () => {
        // Icône absente : le libellé suffit.
      },
    );
    return entry;
  }

  dispose(): void {
    this.#disposed = true;
    for (const objectUrl of this.#objectUrls) URL.revokeObjectURL(objectUrl);
    this.#objectUrls.length = 0;
    this.#entries.clear();
  }
}
