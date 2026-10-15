// Préférence propre au site public, indépendante de celle de l’extension.
(() => {
  const storageKey = "sprint-goals-site-language";
  const valid = (value) => value === "fr" || value === "en" || value === "es";
  const current = valid(document.documentElement.lang) ? document.documentElement.lang : "en";
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
    // La navigation ne dépend pas de l'accès au stockage du navigateur.
  }
  if (!valid(preferred)) {
    const primary = navigator.language.replaceAll("_", "-").toLowerCase().split("-")[0];
    preferred = valid(primary) ? primary : "en";
  }
  if (preferred === current) return;
  const link = links.find((candidate) => candidate.dataset.language === preferred);
  if (!link) return;
  const target = new URL(link.href);
  target.hash = url.hash;
  location.replace(target.href);
})();
