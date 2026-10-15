// Site de présentation autonome : aucune connexion aux données Jira.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
document.documentElement.classList.add("js-enabled");

const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#site-navigation");
function closeMenu(returnFocus = false) {
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Ouvrir le menu");
  navigation.classList.remove("is-open");
  if (returnFocus) menuButton.focus();
}
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
  navigation.classList.toggle("is-open", open);
});
navigation.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
    closeMenu(true);
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeMenu();
});

const header = document.querySelector(".site-header");
const progress = document.querySelector(".reading-progress span");
let scrollPending = false;
function updateScroll() {
  const total = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.transform = `scaleX(${total > 0 ? window.scrollY / total : 0})`;
  header.classList.toggle("is-scrolled", window.scrollY > 15);
  scrollPending = false;
}
window.addEventListener(
  "scroll",
  () => {
    if (!scrollPending) {
      scrollPending = true;
      window.requestAnimationFrame(updateScroll);
    }
  },
  { passive: true },
);
window.addEventListener("resize", updateScroll);
updateScroll();

if ("IntersectionObserver" in window && !reducedMotion.matches) {
  document.documentElement.classList.add("motion-ready");
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.08 },
  );
  for (const element of document.querySelectorAll(".reveal")) revealObserver.observe(element);
}

// Les commandes de démonstration restent utilisables sans animation automatique.
const scenes = ["goals", "focus", "daily"];
const sceneTabs = [...document.querySelectorAll("[data-scene]")];
const demoPanel = document.querySelector("[data-demo-scene]");
const demoDescription = document.querySelector("[data-demo-description]");
const movingCard = document.querySelector("[data-moving-card]");
const playButton = document.querySelector("[data-demo-play]");
const playLabel = document.querySelector("[data-play-label]");
const playSymbol = document.querySelector("[data-play-symbol]");
const demoProgress = document.querySelector(".demo-progress");
const descriptions = {
  goals:
    "Les objectifs structurent le board. Le travail sans objectif garde sa place dans Build ou RUN.",
  focus:
    "Le ticket Support rejoint son objectif. Son type ne change pas : l’objectif est prioritaire sur sa ligne RUN.",
  daily:
    "En Daily, l’équipe échange sur un objectif à la fois. Les autres lignes attendent leur tour.",
};
let currentScene = 0;
let timer = null;
let playing = !reducedMotion.matches;
let demoVisible = false;
let cardAnimation = null;

function chooseScene(name) {
  const index = scenes.indexOf(name);
  if (index === -1) return;
  currentScene = index;
  cardAnimation?.cancel();
  const before = movingCard.getBoundingClientRect();
  const target = document.querySelector(
    name === "goals" ? '[data-slot="run"]' : '[data-slot="goal-todo"]',
  );
  const moved = movingCard.parentElement !== target;
  if (moved) target.append(movingCard);
  demoPanel.dataset.demoScene = name;
  demoPanel.setAttribute("aria-labelledby", `scene-${name}`);
  for (const tab of sceneTabs) {
    const selected = tab.dataset.scene === name;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  demoDescription.textContent = descriptions[name];
  document.querySelector("[data-demo-mode]").textContent =
    name === "daily" ? "Mode Daily" : "Vue par objectifs";
  if (moved && !reducedMotion.matches && demoVisible) {
    const after = movingCard.getBoundingClientRect();
    cardAnimation = movingCard.animate(
      [
        {
          transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)`,
          boxShadow: "0 16px 30px #0b10262b",
        },
        { transform: "translate(0, 0)", boxShadow: "0 2px 3px #131f3906" },
      ],
      { duration: 850, easing: "cubic-bezier(.22, 1, .36, 1)" },
    );
  }
}

function updatePlayback() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  const active = playing && demoVisible && !document.hidden;
  playButton.setAttribute("aria-pressed", String(playing));
  playLabel.textContent = playing ? "Mettre en pause" : "Lancer l’animation";
  playSymbol.textContent = playing ? "Ⅱ" : "▶";
  demoProgress.classList.remove("is-playing");
  if (active) {
    // Une pause hors écran évite de faire travailler le navigateur inutilement.
    window.requestAnimationFrame(() => {
      if (playing && demoVisible && !document.hidden) demoProgress.classList.add("is-playing");
    });
    timer = window.setInterval(() => chooseScene(scenes[(currentScene + 1) % scenes.length]), 6000);
  }
}
function manuallyChooseScene(name) {
  playing = false;
  chooseScene(name);
  updatePlayback();
}
for (const tab of sceneTabs)
  tab.addEventListener("click", () => manuallyChooseScene(tab.dataset.scene));
playButton.addEventListener("click", () => {
  playing = !playing;
  updatePlayback();
});
if ("IntersectionObserver" in window) {
  const demoObserver = new IntersectionObserver(
    (entries) => {
      demoVisible = entries[0].isIntersecting;
      updatePlayback();
    },
    { threshold: 0.2 },
  );
  demoObserver.observe(demoPanel);
}
document.addEventListener("visibilitychange", updatePlayback);
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) {
    playing = false;
    cardAnimation?.cancel();
    updatePlayback();
  }
});
updatePlayback();

// Navigation clavier des deux jeux d’onglets, sans interception du défilement.
function keyboardTabs(tabs, activate) {
  for (const tab of tabs) {
    tab.addEventListener("keydown", (event) => {
      let next = tabs.indexOf(tab);
      if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (next + 1) % tabs.length;
      else if (["ArrowLeft", "ArrowUp"].includes(event.key))
        next = (next + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[next].focus();
      activate(tabs[next]);
    });
  }
}
keyboardTabs(sceneTabs, (tab) => manuallyChooseScene(tab.dataset.scene));

const productViews = {
  scrum: {
    image: "01-board.png",
    alt: "Board Scrum organisé par objectifs avec progression et filtres",
    kicker: "UN SPRINT, UN CAP",
    title: "Les objectifs donnent le rythme.",
    description:
      "Visualisez la progression du sprint, retrouvez les tickets bloqués et passez d’un objectif à l’autre sans perdre le contexte.",
    label: "Board Scrum",
  },
  kanban: {
    image: "02-kanban.png",
    alt: "Board Kanban avec objectifs Atlassian et lignes par type de ticket",
    kicker: "LE FLUX GARDE LE CAP",
    title: "Vos objectifs suivent le mouvement.",
    description:
      "Retrouvez le filtre et les colonnes de votre Kanban, avec les Goals Atlassian et les swimlanes prévues pour vos types de tickets.",
    label: "Board Kanban",
  },
  settings: {
    image: "03-swimlanes.png",
    alt: "Administration des swimlanes : Default, groupes par type et objectifs prioritaires",
    kicker: "UNE VUE À VOTRE MESURE",
    title: "Un cadre commun, votre organisation.",
    description:
      "Regroupez les types dans les lignes adaptées à votre équipe. L’objectif reste prioritaire ; les réglages sont partagés dans Jira.",
    label: "Réglages des swimlanes",
  },
};
const productTabs = [...document.querySelectorAll("[data-view]")];
const productImage = document.querySelector("[data-product-image]");
const captureButton = document.querySelector("[data-open-capture]");
let currentView = "scrum";
function chooseProduct(name) {
  const view = productViews[name];
  if (!view) return;
  currentView = name;
  productImage.src = `assets/screenshots/${view.image}`;
  productImage.alt = view.alt;
  document.querySelector("[data-product-kicker]").textContent = view.kicker;
  document.querySelector("[data-product-title]").textContent = view.title;
  document.querySelector("[data-product-description]").textContent = view.description;
  document.querySelector("#product-panel").setAttribute("aria-labelledby", `view-${name}`);
  captureButton.setAttribute("aria-label", `Agrandir la capture : ${view.label}`);
  for (const tab of productTabs) {
    const selected = tab.dataset.view === name;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
}
for (const tab of productTabs) tab.addEventListener("click", () => chooseProduct(tab.dataset.view));
keyboardTabs(productTabs, (tab) => chooseProduct(tab.dataset.view));

const dialog = document.querySelector("#capture-dialog");
captureButton.addEventListener("click", () => {
  const view = productViews[currentView];
  const image = document.querySelector("[data-dialog-image]");
  image.src = `assets/screenshots/${view.image}`;
  image.alt = view.alt;
  document.querySelector("[data-dialog-title]").textContent = view.label;
  dialog.showModal();
});
document.querySelector("[data-close-capture]").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  const rect = dialog.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    dialog.close();
});
dialog.addEventListener("close", () => captureButton.focus({ preventScroll: true }));
