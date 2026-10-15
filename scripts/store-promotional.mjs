/**
 * Compositions Chrome Web Store autonomes : aucune ressource réseau, aucun faux écran.
 * Les trois assets sont fournis par le générateur sous forme de data URL en base64.
 */
export function storePromoHtml({ width, height, logoDataUrl, boardDataUrl, fontDataUrl }) {
  const compact = width === 440 && height === 280;
  if (!compact && !(width === 1400 && height === 560)) {
    throw new Error("Format promotionnel attendu : 440 × 280 ou 1400 × 560.");
  }
  const logo = embeddedAsset(logoDataUrl, "image/svg\\+xml", "logo SVG");
  const board = embeddedAsset(boardDataUrl, "image/(?:png|jpeg|webp)", "capture du board");
  const font = embeddedAsset(
    fontDataUrl,
    "(?:font/(?:ttf|otf|woff2?)|application/(?:octet-stream|x-font-ttf))",
    "police locale",
  );

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>SprintGoals — Donnez un cap à votre Jira.</title>
  <style>
    @font-face {
      font-family: "Manrope";
      src: url("${font}");
      font-style: normal;
      font-weight: 200 800;
      font-display: block;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
    body {
      background: #0b1026;
      color: #f6f7fb;
      font-family: "Manrope", sans-serif;
      font-synthesis: none;
      -webkit-font-smoothing: antialiased;
    }
    .composition {
      position: relative;
      width: 100%;
      height: 100%;
      isolation: isolate;
      overflow: hidden;
      background:
        radial-gradient(ellipse at 91% 4%, #4b5cff4a 0, #4b5cff00 58%),
        #0b1026;
    }
    .orbit {
      position: absolute;
      z-index: -1;
      width: 900px;
      height: 900px;
      top: -505px;
      right: -375px;
      border: 1px solid #b7f5d026;
      border-radius: 50%;
    }
    .orbit::after {
      content: "";
      position: absolute;
      inset: -70px;
      border: 1px solid #b7f5d012;
      border-radius: inherit;
    }
    .accent {
      position: absolute;
      z-index: -1;
      width: 450px;
      height: 450px;
      right: -170px;
      bottom: -230px;
      border-radius: 50%;
      background: #b7f5d0;
    }
    .brand {
      position: absolute;
      top: 60px;
      left: 64px;
      display: flex;
      align-items: center;
      gap: 18px;
      color: #f6f7fb;
      font-size: 36px;
      font-weight: 800;
      letter-spacing: -1.7px;
      line-height: 1;
      white-space: nowrap;
    }
    .brand img { display: block; width: 60px; height: 60px; }
    .brand-light { font-weight: 500; }
    h1 {
      position: absolute;
      left: 60px;
      top: 184px;
      margin: 0;
      font-size: 65px;
      font-weight: 750;
      line-height: 1.1;
      letter-spacing: -3.4px;
    }
    h1 > span { display: block; }
    h1 em { color: #b7f5d0; font-style: normal; }
    .modes {
      position: absolute;
      top: 390px;
      left: 65px;
      display: flex;
      align-items: center;
      gap: 13px;
      color: #b6bfd9;
      font-size: 18px;
      font-weight: 550;
      letter-spacing: 0.3px;
    }
    .modes .dot { width: 4px; height: 4px; border-radius: 50%; background: #b7f5d0; }
    .board {
      position: absolute;
      top: 99px;
      left: 630px;
      width: 878px;
      padding: 6px;
      background: #ffffff;
      border: 1px solid #ffffffb3;
      border-radius: 20px;
      transform: rotate(-4deg);
      transform-origin: 50% 50%;
      box-shadow: 0 34px 95px #00000073, 0 0 0 1px #b7c2ff40;
    }
    .board img { display: block; width: 100%; height: auto; border-radius: 13px; }
    .compact .orbit { width: 420px; height: 420px; top: -252px; right: -210px; }
    .compact .orbit::after { inset: -38px; }
    .compact .accent { width: 210px; height: 210px; right: -90px; bottom: -115px; }
    .compact .brand { top: 24px; left: 25px; gap: 12px; font-size: 27px; letter-spacing: -1.25px; }
    .compact .brand img { width: 40px; height: 40px; }
    .compact h1 { top: 84px; left: 25px; font-size: 33px; line-height: 1.1; letter-spacing: -1.45px; }
    .compact .modes { display: none; }
    .compact .board {
      top: 176px;
      left: 45px;
      width: 452px;
      height: 290px;
      padding: 3px;
      border-radius: 12px;
      overflow: hidden;
      transform: rotate(-8deg);
      box-shadow: 0 16px 45px #00000080, 0 0 0 1px #b7c2ff40;
    }
    /* Le cadrage rapproche les objectifs, sans retoucher le contenu de la capture. */
    .compact .board img { margin-top: -48px; border-radius: 0; }
  </style>
</head>
<body>
  <main class="composition ${compact ? "compact" : "wide"}">
    <div class="orbit" aria-hidden="true"></div>
    <div class="accent" aria-hidden="true"></div>
    <div class="brand">
      <img src="${logo}" alt="" width="64" height="64">
      <span>Sprint<span class="brand-light">Goals</span></span>
    </div>
    <h1><span>Donnez un cap</span><span>à votre <em>Jira.</em></span></h1>
    <div class="modes"><span>Scrum</span><span class="dot" aria-hidden="true"></span><span>Kanban</span></div>
    <div class="board"><img src="${board}" alt="Aperçu réel du board SprintGoals organisé par objectifs"></div>
  </main>
</body>
</html>`;
}

function embeddedAsset(value, mimeType, label) {
  const pattern = new RegExp(`^data:${mimeType};base64,[A-Za-z0-9+/]+={0,2}$`);
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`Une data URL base64 est attendue pour ${label}.`);
  }
  return value;
}
