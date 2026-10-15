// Recherche locale des fiches : aucune donnée n’est envoyée ni conservée.
const input = document.querySelector("[data-guide-search]");
if (input) {
  const cards = [...document.querySelectorAll("[data-guide-card]")];
  const empty = document.querySelector("[data-guide-empty]");
  const count = document.querySelector("[data-guide-count]");
  const reset = document.querySelector("[data-guide-reset]");
  const normalize = (value) =>
    value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’']/g, " ");
  const searchable = new Map(cards.map((card) => [card, normalize(card.dataset.guideKeywords)]));
  function filterCards() {
    const terms = normalize(input.value).trim().split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const card of cards) {
      card.hidden = !terms.every((term) => searchable.get(card).includes(term));
      if (!card.hidden) visible++;
    }
    reset.hidden = input.value.length === 0;
    empty.hidden = visible !== 0;
    count.textContent =
      terms.length === 0
        ? `${cards.length} fiches pour prendre vos repères`
        : `${visible} fiche${visible === 1 ? "" : "s"} trouvée${visible === 1 ? "" : "s"}`;
  }
  function showAll() {
    input.value = "";
    filterCards();
    input.focus();
  }
  input.addEventListener("input", filterCards);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") showAll();
  });
  input.form.addEventListener("submit", (event) => event.preventDefault());
  reset.addEventListener("click", showAll);
  document.querySelector("[data-guide-show-all]").addEventListener("click", showAll);
  // Recalcul après restauration de l’historique, lorsque le navigateur restaure la saisie.
  window.addEventListener("pageshow", filterCards);
  filterCards();
}
