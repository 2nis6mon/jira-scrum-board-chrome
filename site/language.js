// Préférence propre au site public, indépendante de celle de l’extension.
(() => {
  const storageKey = "sprint-goals-site-language";
  const valid = (value) => value === "fr" || value === "en";
  const current = document.documentElement.lang === "fr" ? "fr" : "en";
  const url = new URL(location.href);
  const explicit = url.searchParams.get("lang");
  const links = [...document.querySelectorAll("a[data-language]")];
  const remember = (language) => {
    try {
      localStorage.setItem(storageKey, language);
    } catch {
      // La navigation reste fonctionnelle quand le stockage est bloqué.
    }
  };
  if (valid(explicit)) remember(explicit);
  for (const link of links) {
    const language = link.dataset.language;
    if (!valid(language)) continue;
    const target = new URL(link.href);
    target.searchParams.set("lang", language);
    // Les fiches traduites n’ont pas nécessairement les mêmes ancres de section.
    link.href = target.href;
    link.addEventListener("click", () => remember(language));
  }
  // Une URL de fiche ou de langue explicitement partagée reste toujours respectée.
  if (document.body.dataset.languageEntry !== "true" || valid(explicit)) return;
  let preferred;
  try {
    preferred = localStorage.getItem(storageKey);
  } catch {
    // L’anglais est le repli de toute langue navigateur autre que le français.
  }
  if (!valid(preferred)) preferred = /^fr(?:-|_|$)/i.test(navigator.language) ? "fr" : "en";
  if (preferred === current) return;
  const link = links.find((candidate) => candidate.dataset.language === preferred);
  if (!link) return;
  const target = new URL(link.href);
  target.hash = url.hash;
  location.replace(target.href);
})();
