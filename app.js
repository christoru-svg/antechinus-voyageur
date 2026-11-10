import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, reload
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore,
  collection, doc, query, where, onSnapshot, setDoc, updateDoc, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, COUPLE, START, DATES } from "./config.js?v=10";
import { Q, SEASON, SEASON_START, FIXED, PERSONAL, THEMES } from "./questions.js?v=10";

const NAMES = { luigi: "Luigi", kritas: "Les Kritas" };
const TO = { luigi: "Luigi", kritas: "les Kritas" };          // en milieu de phrase
const OTHER = { luigi: "kritas", kritas: "luigi" };
const PLURAL = { luigi: false, kritas: true };
const v = (role, sing, plur) => (PLURAL[role] ? plur : sing);  // accord singulier / pluriel
const KRITAS = ["Jessica", "Magdalena", "Cristina", "Filippa", "Sabrina", "Samantha", "Patricia", "Ursula", "Valentina"];
const REACTIONS = [
  ["touche", "Ça me touche"],
  ["merci", "Merci pour ta lettre"],
  ["crash", "Mon système immunitaire lâche"],
  ["rire", "J'ai ri dans mon terrier"]
];


const SRC = {
  conv: ["The Conversation, D. Fisher (2013)", "https://theconversation.com/doing-it-to-death-suicidal-sex-in-marsupial-mice-18884"],
  pnas: ["Fisher et al., PNAS (2013)", "https://pmc.ncbi.nlm.nih.gov/articles/PMC3816400/"],
  natgeo: ["National Geographic (2013)", "https://www.nationalgeographic.com/science/article/why-a-little-mammal-has-so-much-sex-that-it-disintegrates"],
  wiki: ["Wikipédia (en), Antechinus", "https://en.wikipedia.org/wiki/Antechinus"],
  museum: ["Australian Museum, Brown Antechinus", "https://australian.museum/learn/animals/mammals/brown-antechinus/"]
};
const FACTS = [
  ["Le mâle antechinus peut s'accoupler jusqu'à 14 heures d'affilée. Ensuite, son système immunitaire présente sa démission. Ne prenez pas exemple.", SRC.conv],
  ["Après une saison des amours de deux à trois semaines, les mâles meurent presque tous d'épuisement. Les chercheurs appellent ça la reproduction suicidaire. On vous conseille plutôt une question par jour.", SRC.pnas],
  ["Pendant la saison des amours, le mâle antechinus perd ses poils et ses plaies ne cicatrisent plus. Toi, tu as juste perdu une chaussette. Relativise.", SRC.natgeo],
  ["Ses hormones de stress grimpent tellement que son système immunitaire s'éteint et qu'il saigne de l'intérieur. Si tu stresses pour ta lettre, respire : elle ne te tuera pas.", SRC.wiki],
  ["Selon l'espèce, un antechinus pèse entre 16 et 170 grammes. Votre amour, lui, n'entre dans aucune balance de cuisine.", SRC.wiki],
  ["Les femelles antechinus survivent souvent et se reproduisent deux, parfois trois fois dans leur vie. Elles ont, elles, de la mémoire. Comme ce terrier.", SRC.wiki],
  ["L'antechinus brun sort surtout la nuit. Il fait ses déclarations dans le noir. Ça tombe bien, la question expire à minuit.", SRC.museum],
  ["Le mâle antechinus vit environ 11 mois et n'a pas de deuxième chance. Vous si : les questions non répondues vous attendent dans le terrier.", SRC.museum],
  ["L'antechinus est un marsupial sans vraie poche : juste un repli de peau sur les tétines. Il fait avec ce qu'il a. Comme vous un lundi soir.", SRC.wiki]
];

/* ---------- Dates ---------- */
const pad = n => String(n).padStart(2, "0");
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toUTC = k => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const dayIndex = k => Math.round((toUTC(k) - toUTC(START)) / 86400000);
// Saison des amours de l'antechinus : SEASON.length jours à partir de SEASON_START (MM-JJ).
function seasonDay(k) {
  const y = k.slice(0, 4);
  const d = Math.round((toUTC(k) - toUTC(`${y}-${SEASON_START}`)) / 86400000);
  return d >= 0 && d < SEASON.length ? d : -1;
}
// [thème, question, genre] : "special" (vos dates, fêtes), "season" (saison des amours) ou "" (question du jour).
function qFor(k) {
  const md = k.slice(5);
  for (const [key, val] of Object.entries(DATES || {})) {
    if (val && val.slice(-5) === md && PERSONAL[key]) return [...PERSONAL[key], "special"];
  }
  if (FIXED[md]) return [...FIXED[md], "special"];
  const s = seasonDay(k);
  if (s >= 0) return ["Saison des amours (la vraie)", SEASON[s], "season"];
  const i = dayIndex(k);
  return [...Q[((i % Q.length) + Q.length) % Q.length], ""];
}
const asDate = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtShort = k => asDate(k).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const fmtLong = k => asDate(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/* ---------- État ---------- */
const S = {
  phase: "loading",      // loading | unconfigured | signedOut | verify | stranger | ready | error
  user: null,
  me: null,              // "luigi" | "kritas"
  mine: {},              // date -> ma lettre
  partner: {},           // date -> sa lettre (lisible seulement si j'ai écrit)
  status: {},            // date -> { luigi: true, kritas: true }
  today: keyOf(new Date()),
  selected: keyOf(new Date()),
  busy: false,
  authError: "",
  krita: "",            // quelle Krita écrit (choisie à chaque lettre)
  confirmRemove: null   // date dont on confirme le retrait
};
const other = () => (S.me ? OTHER[S.me] : null);
const wrote = (date, role) => !!(S.status[date] && S.status[date][role]) || (role === S.me && !!S.mine[date]);

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3500);
}
const draftKey = d => `antechinus-draft-${d}`;
const getDraft = d => { try { return localStorage.getItem(draftKey(d)) || ""; } catch { return ""; } };
const setDraft = (d, v) => { try { v ? localStorage.setItem(draftKey(d), v) : localStorage.removeItem(draftKey(d)); } catch {} };
function svgUse(w) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg"); s.setAttribute("viewBox", "0 0 110 110"); s.setAttribute("width", w);
  const u = document.createElementNS(ns, "use"); u.setAttribute("href", "#antechinus"); s.append(u); return s;
}
const labelOf = k => (REACTIONS.find(r => r[0] === k) || [, "un mystère"])[1];

/* ---------- Firebase ---------- */
const configured = !Object.values(firebaseConfig).some(v => String(v).includes("A_REMPLIR"));
let auth, db;
if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  auth.languageCode = "fr";
  try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch { db = getFirestore(app); }
}

const AUTH_ERRORS = {
  "auth/invalid-email": "Cette adresse e-mail n'a pas l'air valide.",
  "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  "auth/wrong-password": "Mot de passe incorrect.",
  "auth/user-not-found": "Aucun compte avec cet e-mail. Crée-le d'abord.",
  "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail. Connecte-toi plutôt.",
  "auth/weak-password": "Mot de passe trop court : 6 caractères minimum.",
  "auth/too-many-requests": "Trop d'essais. Attends quelques minutes, l'antechinus reprend son souffle.",
  "auth/network-request-failed": "Pas de réseau. Réessaie quand tu seras connecté.",
  "auth/popup-closed-by-user": "Fenêtre Google fermée avant la fin."
};
const authMsg = e => AUTH_ERRORS[e && e.code] || "La connexion a échoué. Réessaie.";

/* ---------- Rendu : connexion ---------- */
function renderAuth() {
  const box = $("auth"), bar = $("meBar");
  box.replaceChildren(); bar.replaceChildren();
  bar.hidden = !(S.user && (S.phase === "ready" || S.phase === "verify" || S.phase === "stranger"));
  if (!bar.hidden) {
    bar.append(
      h("span", {}, S.me ? `Connecté en tant que ${NAMES[S.me]}` : S.user.email),
      h("button", { class: "link", type: "button", onclick: () => signOut(auth) }, "Se déconnecter"));
  }

  if (S.phase === "unconfigured") {
    box.hidden = false;
    box.append(h("h3", {}, "Le terrier n'est pas encore branché"),
      h("p", { class: "status" }, "Remplis config.js avec la configuration de ton projet Firebase, puis recharge la page. Tout est expliqué dans le README."));
    return;
  }
  if (S.phase === "stranger") {
    box.hidden = false;
    box.append(h("h3", {}, "Ce terrier est réservé à Luigi et aux Kritas"),
      h("p", { class: "status" }, `Le compte ${S.user.email} n'est pas invité. Connecte-toi avec l'adresse prévue dans config.js.`));
    return;
  }
  if (S.phase === "verify") {
    box.hidden = false;
    box.append(h("h3", {}, "Confirme ton adresse e-mail"),
      h("p", { class: "status" }, `Un lien de confirmation a été envoyé à ${S.user.email}. Clique dessus, puis reviens ici.`),
      h("div", { class: "row" },
        h("button", { class: "btn love", type: "button", disabled: S.busy, onclick: checkVerified }, "C'est fait"),
        h("button", { class: "btn ghost", type: "button", disabled: S.busy, onclick: () => busyDo(() => sendEmailVerification(S.user), "Lien renvoyé. Regarde aussi dans les spams.") }, "Renvoyer le lien")));
    return;
  }
  if (S.phase !== "signedOut") { box.hidden = true; return; }

  box.hidden = false;
  const email = h("input", { id: "email", type: "email", autocomplete: "email", required: true, inputmode: "email" });
  const pass = h("input", { id: "password", type: "password", autocomplete: "current-password", minlength: "6", required: true });
  const err = h("p", { class: "err", role: "alert" }, S.authError);
  const form = h("form", { class: "auth", style: "padding:0;border:0" },
    h("h3", {}, "Entre dans le terrier"),
    h("p", { class: "status" }, "Réservé à Luigi et aux Kritas. La première fois, crée ton compte avec ton adresse e-mail."),
    h("label", { for: "email" }, "Adresse e-mail", email),
    h("label", { for: "password" }, "Mot de passe", pass),
    S.authError ? err : null,
    h("div", { class: "row" },
      h("button", { class: "btn love", type: "submit", disabled: S.busy }, "Se connecter"),
      h("button", { class: "btn ghost", type: "button", disabled: S.busy, onclick: () => signUp(email.value, pass.value) }, "Créer mon compte"),
      h("button", { class: "btn ghost", type: "button", disabled: S.busy, onclick: google }, "Continuer avec Google")),
    h("button", { class: "link", type: "button", onclick: () => resetPass(email.value) }, "Mot de passe oublié"));
  form.addEventListener("submit", e => { e.preventDefault(); signIn(email.value, pass.value); });
  box.append(form);
}

async function busyDo(fn, okMsg) {
  if (S.busy) return;
  S.busy = true; S.authError = ""; renderAll();
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (e) { S.authError = authMsg(e); if (S.phase !== "signedOut") toast(S.authError); console.error(e); }
  finally { S.busy = false; renderAll(); }
}
const signIn = (e, p) => busyDo(() => signInWithEmailAndPassword(auth, e.trim(), p));
const signUp = (e, p) => busyDo(async () => {
  const cred = await createUserWithEmailAndPassword(auth, e.trim(), p);
  await sendEmailVerification(cred.user);
}, "Compte créé. Confirme ton adresse e-mail.");
const resetPass = e => {
  if (!e.trim()) { S.authError = "Indique ton e-mail d'abord."; renderAll(); return; }
  busyDo(() => sendPasswordResetEmail(auth, e.trim()), "E-mail de réinitialisation envoyé.");
};
const google = () => busyDo(async () => {
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") await signInWithRedirect(auth, provider);
    else throw e;
  }
});
const checkVerified = () => busyDo(async () => {
  await reload(S.user);
  if (!S.user.emailVerified) { toast("Pas encore confirmé. Le lien est dans ta boîte mail."); return; }
  await S.user.getIdToken(true);
  enter(S.user);
});

/* ---------- Rendu : la lettre du jour ---------- */
function renderDay() {
  const box = $("day");
  const date = S.selected;
  const [theme, question, kind] = qFor(date);
  const isToday = date === S.today;
  const n = dayIndex(date) + 1;
  const mine = S.me, oth = other();
  const myL = mine ? S.mine[date] : null;
  const theyWrote = oth ? wrote(date, oth) : false;
  const theirL = oth ? S.partner[date] : null;

  const head = h("div", { class: "day-head" },
    h("span", { class: "num" }, n > 0 ? `Lettre n° ${n} · ${fmtLong(date)}` : fmtLong(date)),
    !isToday ? h("button", { class: "link", type: "button", onclick: () => select(S.today) }, "Revenir à aujourd'hui") : null);

  const card = h("article", { class: "letter" + (kind ? " " + kind : "") },
    h("div", { class: "stamp", "aria-hidden": "true" }, svgUse(42)),
    h("span", { class: "theme" }, theme),
    h("h2", { class: "question" }, question),
    isToday ? h("p", { class: "expiry" }, "Expire dans ", h("span", { class: "t", id: "countdown" }, countdownText()),
      ". Comme un antechinus mâle, elle ne passera pas la nuit.") : null);

  if (S.phase === "loading") {
    card.append(h("p", { class: "status" }, "L'antechinus fouille le terrier à la recherche de vos lettres…"));
  } else if (S.phase !== "ready") {
    card.append(h("p", { class: "status" }, "Connecte-toi pour écrire ta lettre. En attendant, tu peux déjà réfléchir à ta réponse."));
  } else if (!myL) {
    const ta = h("textarea", { id: `ta-${date}`, placeholder: `Ta lettre pour ${TO[oth]}…`, "aria-label": "Ta lettre" });
    ta.value = getDraft(date);
    ta.addEventListener("input", () => setDraft(date, ta.value));
    const send = h("button", { class: "btn love", type: "button", disabled: S.busy, onclick: () => writeLetter(date, ta.value) }, "Sceller ma lettre");
    if (mine === "kritas") card.append(kritaPicker());
    card.append(ta, h("div", { class: "actions" },
      h("p", { class: "status" }, theyWrote
        ? [h("b", {}, NAMES[oth]), v(oth, " a déjà écrit. Sa lettre est scellée", " ont déjà écrit. Leur lettre est scellée"), " et s'ouvrira dès que tu auras écrit la tienne."]
        : [h("b", {}, NAMES[oth]), v(oth, " n'a pas encore écrit. Son système immunitaire tient bon", " n'ont pas encore écrit. Leur système immunitaire tient bon"), ", pour l'instant."]),
      send));
  } else {
    card.append(h("div", { class: "envelope" },
      h("span", { class: "from" }, myL.author ? `Ta lettre, signée ${myL.author}` : "Ta lettre"),
      h("p", { class: "handwritten" }, myL.text),
      theirL && theirL.reaction ? h("span", { class: "reacted" }, `${NAMES[oth]} ${v(oth, "a", "ont")} réagi : ${labelOf(theirL.reaction)}`) : null));
    if (!theyWrote) {
      card.append(h("div", { class: "sealed" },
        h("span", { class: "wax", "aria-hidden": "true" }, "A"),
        h("p", {}, "Ta lettre est partie, scellée. ", h("b", {}, NAMES[oth]), v(oth, " n'a", " n'ont"), " pas encore répondu. L'antechinus attend, le cœur battant à 600 pulsations par minute.")));
    } else if (!theirL) {
      card.append(h("p", { class: "status" }, "L'antechinus décachette la lettre…"));
    } else if (myL.removed) {
      card.append(h("div", { class: "removed" },
        h("p", {}, `Tu as retiré la lettre ${v(oth, "de Luigi", "des Kritas")}. Elle n'apparaît plus ici.`),
        h("button", { class: "link", type: "button", disabled: S.busy, onclick: () => removeLetter(date, false) }, "La remettre")));
    } else {
      card.append(h("div", { class: "envelope" },
        h("span", { class: "from" }, theirL.author ? `De ${theirL.author}, pour les Kritas` : `De ${NAMES[oth]}`),
        h("p", { class: "handwritten" }, theirL.text),
        h("div", { class: "reactions", role: "group", "aria-label": "Réagir à sa lettre" },
          ...REACTIONS.map(([k, label]) => h("button", {
            class: "chip", type: "button", "aria-pressed": myL.reaction === k ? "true" : "false",
            disabled: S.busy, onclick: () => react(date, myL.reaction === k ? null : k)
          }, label))),
        h("button", {
          class: "keep", type: "button", "aria-pressed": myL.kept ? "true" : "false", disabled: S.busy,
          onclick: () => keep(date, !myL.kept)
        }, myL.kept ? "Gardée dans la boîte à trésors" : "Garder précieusement"),
        removeControl(date, oth)));
    }
  }
  box.replaceChildren(head, card);
}

/* ---------- Quelle Krita écrit ? ---------- */
function kritaPicker() {
  const known = KRITAS.includes(S.krita);
  const custom = h("input", { id: "kritaOther", type: "text", maxlength: "40", placeholder: "Une autre Krita…", "aria-label": "Nom d'une autre Krita" });
  custom.value = known ? "" : S.krita;
  custom.addEventListener("input", () => {
    S.krita = custom.value;
    box.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", "false"));
  });
  const box = h("div", { class: "krita" },
    h("span", { class: "from" }, "Quelle Krita tient la plume aujourd'hui ?"),
    h("div", { class: "reactions", role: "group", "aria-label": "Choisir la Krita" },
      ...KRITAS.map(n => h("button", {
        class: "chip", type: "button", "aria-pressed": S.krita === n ? "true" : "false",
        onclick: () => { S.krita = S.krita === n ? "" : n; renderDay(); }
      }, n))),
    custom);
  return box;
}

/* ---------- Rendu : le terrier ---------- */
function renderTerrier() {
  const items = [];
  const last = dayIndex(S.today);
  for (let i = last; i >= Math.max(0, last - 29); i--) {
    const d = new Date(toUTC(START) + i * 86400000);
    const k = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const l = wrote(k, "luigi"), j = wrote(k, "kritas");
    items.push(h("li", { class: k === S.selected ? "current" : "" },
      h("button", { type: "button", onclick: () => select(k), "aria-current": k === S.selected ? "true" : null },
        h("span", { class: "d" }, k === S.today ? "Aujourd'hui" : fmtShort(k)),
        h("span", { class: "q" }, qFor(k)[1]),
        h("span", { class: "dots", title: `Luigi ${l ? "a écrit" : "n'a pas écrit"}, les Kritas ${j ? "ont écrit" : "n'ont pas écrit"}` },
          h("span", { class: l ? "on" : "" }), h("span", { class: j ? "on" : "" })))));
  }
  $("terrierList").replaceChildren(...items);
}

/* ---------- Signes vitaux ---------- */
function countdownText() {
  const now = new Date(), mid = new Date(now); mid.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((mid - now) / 1000));
  return `${Math.floor(s / 3600)} h ${pad(Math.floor(s / 60) % 60)} min ${pad(s % 60)} s`;
}
function renderVitals() {
  const now = new Date();
  const cd = $("countdown"); if (cd) cd.textContent = countdownText();
  if (keyOf(now) !== S.today) {
    const wasToday = S.selected === S.today;
    S.today = keyOf(now); if (wasToday) S.selected = S.today;
    renderAll(); return;
  }
  // La jauge dépend des lettres : on ne la montre qu'une fois connecté au terrier.
  const showImmune = S.phase === "ready";
  $("vitals").hidden = !showImmune;
  if (!showImmune) return;
  const written = ["luigi", "kritas"].filter(r => wrote(S.today, r)).length;
  const hours = now.getHours() + now.getMinutes() / 60;
  let pct, sub;
  if (written === 2) { pct = 100; sub = "Deux lettres échangées. Immunité au maximum, contrairement à un antechinus en novembre."; }
  else { const speed = seasonDay(S.today) >= 0 ? 2 : 1; pct = Math.max(3, Math.round(100 - hours * (written ? 2 : 4) * speed)); sub = written ? "Une lettre sur deux. Ça tient, mais ça tousse." : "Aucune lettre aujourd'hui. Les anticorps s'inquiètent."; }
  $("immuneVal").textContent = `${pct} %`;
  const bar = $("immuneBar");
  bar.className = "meter" + (pct < 25 ? " crit" : pct < 55 ? " low" : "");
  bar.firstElementChild.style.width = pct + "%";
  $("immuneSub").textContent = sub;
}

/* ---------- La boîte à trésors ---------- */
function renderTresors() {
  const sec = $("tresors");
  if (S.phase !== "ready") { sec.hidden = true; return; }
  sec.hidden = false;
  const kept = Object.values(S.mine).filter(l => l.kept && !l.removed).sort((a, b) => (a.date < b.date ? 1 : -1));
  const ul = $("tresorList");
  if (!kept.length) {
    ul.replaceChildren(h("li", { class: "empty" }, "Aucune lettre gardée pour l'instant. Une fois vos deux lettres ouvertes, touche « Garder précieusement » pour la ranger ici."));
    return;
  }
  ul.replaceChildren(...kept.map(l => h("li", { class: l.date === S.selected ? "current" : "" },
    h("button", { type: "button", onclick: () => select(l.date) },
      h("span", { class: "d" }, fmtShort(l.date)),
      h("span", { class: "q" }, qFor(l.date)[1]),
      h("span", { class: "star", "aria-hidden": "true" }, "♥")))));
}

/* ---------- Saison des amours ---------- */
function renderSeason() {
  const d = seasonDay(S.today), el = $("season");
  el.hidden = d < 0;
  if (d >= 0) el.replaceChildren(
    h("b", {}, `Saison des amours de l'antechinus · jour ${d + 1} sur ${SEASON.length}`),
    h("span", {}, "Questions spéciales jusqu'au 21 août. Les systèmes immunitaires chutent deux fois plus vite. Courage."));
}

function renderAll() { renderAuth(); renderSeason(); renderDay(); renderTresors(); renderTerrier(); renderVitals(); }

function select(k) {
  S.selected = k; watchPartner(); renderDay(); renderTresors(); renderTerrier();
  $("day").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

/* ---------- Faits ---------- */
let factI = (dayIndex(S.today) % FACTS.length + FACTS.length) % FACTS.length;
const showFact = () => {
  const [text, [label, url]] = FACTS[factI];
  $("factText").textContent = text;
  const a = $("factSource"); a.textContent = label; a.href = url;
};
$("factNext").addEventListener("click", () => { factI = (factI + 1) % FACTS.length; showFact(); });
showFact();

/* ---------- Données ---------- */
let unsubs = [];
let partnerSub = null, partnerSubDate = null;

function stopData() {
  unsubs.forEach(u => u()); unsubs = [];
  if (partnerSub) partnerSub(); partnerSub = null; partnerSubDate = null;
  S.mine = {}; S.partner = {}; S.status = {};
}

function startData() {
  stopData();
  unsubs.push(onSnapshot(query(collection(db, "letters"), where("role", "==", S.me)), snap => {
    const m = {}; snap.forEach(d => (m[d.data().date] = d.data()));
    S.mine = m; watchPartner(); renderAll();
  }, e => dataError(e)));
  unsubs.push(onSnapshot(collection(db, "status"), snap => {
    const m = {}; snap.forEach(d => (m[d.id] = d.data()));
    S.status = m; watchPartner(); renderAll();
  }, e => dataError(e)));
}

// La lettre de l'autre n'est lisible (règles Firestore) que si j'ai écrit la mienne ce jour-là.
function watchPartner() {
  const date = S.selected, oth = other();
  const ok = oth && S.mine[date] && wrote(date, oth);
  if (!ok) { if (partnerSub) { partnerSub(); partnerSub = null; partnerSubDate = null; } return; }
  if (partnerSubDate === date) return;
  if (partnerSub) partnerSub();
  partnerSubDate = date;
  partnerSub = onSnapshot(doc(db, "letters", `${date}_${oth}`), snap => {
    if (snap.exists()) S.partner = { ...S.partner, [date]: snap.data() };
    renderAll();
  }, e => { partnerSub = null; partnerSubDate = null; console.warn(e); });
}

function dataError(e) {
  console.error(e);
  toast(e.code === "permission-denied"
    ? "Le terrier refuse l'accès. Vérifie les e-mails dans firestore.rules."
    : "Le terrier ne répond pas. Les lettres affichées sont peut-être en retard.");
}

async function guard(fn, okMsg) {
  if (S.busy) return;
  S.busy = true; renderAll();
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (e) {
    console.error(e);
    toast(e.code === "permission-denied" ? "Le terrier a refusé cette lettre." : "L'antechinus a trébuché. Réessaie dans un instant.");
  } finally { S.busy = false; renderAll(); }
}

async function writeLetter(date, text) {
  const t = (text || "").trim();
  if (!t) { toast("Une lettre vide, même un antechinus épuisé ferait mieux."); return; }
  const author = S.krita.trim().slice(0, 40);
  if (S.me === "kritas" && !author) { toast("Dis d'abord quelle Krita tient la plume."); return; }
  await guard(async () => {
    const data = { date, role: S.me, text: t.slice(0, 8000), at: new Date().toISOString() };
    if (S.me === "kritas") data.author = author;
    await setDoc(doc(db, "letters", `${date}_${S.me}`), data);
    S.mine = { ...S.mine, [date]: data };
    await setDoc(doc(db, "status", date), { [S.me]: true }, { merge: true });
    setDraft(date, "");
    S.krita = "";
  }, "Lettre scellée. L'antechinus est parti, à toute vitesse.");
}

function removeControl(date, oth) {
  if (S.confirmRemove !== date) {
    return h("button", { class: "link", type: "button", onclick: () => { S.confirmRemove = date; renderDay(); } }, "Retirer cette lettre");
  }
  return h("div", { class: "confirm", role: "group", "aria-label": "Confirmer le retrait" },
    h("p", {}, `Retirer la lettre ${v(oth, "de Luigi", "des Kritas")} ? Elle n'apparaîtra plus pour toi. Tu pourras la remettre plus tard.`),
    h("div", { class: "row" },
      h("button", { class: "btn ghost", type: "button", onclick: () => { S.confirmRemove = null; renderDay(); } }, "Annuler"),
      h("button", { class: "btn", type: "button", disabled: S.busy, onclick: () => removeLetter(date, true) }, "Retirer")));
}

async function removeLetter(date, on) {
  S.confirmRemove = null;
  await guard(() => updateDoc(doc(db, "letters", `${date}_${S.me}`),
    on ? { removed: true, kept: deleteField() } : { removed: deleteField() }),
    on ? "Lettre retirée." : "Lettre remise à sa place.");
}

async function keep(date, on) {
  await guard(() => updateDoc(doc(db, "letters", `${date}_${S.me}`), { kept: on ? true : deleteField() }),
    on ? "Rangée dans la boîte à trésors. Elle survivra à la saison." : "Retirée de la boîte à trésors.");
}

async function react(date, k) {
  await guard(() => updateDoc(doc(db, "letters", `${date}_${S.me}`), { reaction: k || deleteField() }), k ? "Réaction envoyée." : null);
}

/* ---------- Onboarding et mode d'emploi ---------- */
function steps(role) {
  return [
    ["Une question par jour", "Chaque jour, une question arrive pour Luigi et les Kritas. Réponds-y par une lettre, puis touche « Sceller ma lettre » : elle ne se modifie plus ensuite."
      + (role === "kritas" ? " Côté Kritas, choisis d'abord quelle Krita tient la plume." : "")],
    ["Le sceau", "Tu ne lis la lettre de l'autre qu'après avoir écrit la tienne. La question expire à minuit, comme un antechinus mâle, mais celles que vous avez ratées vous attendent dans le terrier."],
    ["Après la lecture", "Réagis, garde les plus belles lettres dans la boîte à trésors ou retire celles que tu ne veux plus voir. Tout le reste est dans le mode d'emploi, en haut de la page."]
  ];
}

const onboardKey = () => `antechinus-onboarded-${S.me}`;
function maybeOnboard() {
  let done = false;
  try { done = localStorage.getItem(onboardKey()) === "1"; } catch {}
  if (!done) openOnboarding();
}
let obStep = 0;
function openOnboarding() { obStep = 0; renderOnboarding(); const d = $("onboarding"); if (!d.open) d.showModal(); }
function closeOnboarding() {
  try { localStorage.setItem(onboardKey(), "1"); } catch {}
  $("onboarding").close();
}
function renderOnboarding() {
  const list = steps(S.me), [title, text] = list[obStep], last = obStep === list.length - 1;
  $("onboarding").replaceChildren(h("div", { class: "sheet" },
    h("svg", { class: "ob-art", viewBox: "0 0 110 110", "aria-hidden": "true" }),
    h("p", { class: "ob-count" }, `${obStep + 1} / ${list.length}`),
    h("h2", {}, title),
    h("p", {}, text),
    h("div", { class: "dots-row", "aria-hidden": "true" }, ...list.map((_, i) => h("span", { class: i === obStep ? "on" : "" }))),
    h("div", { class: "row" },
      last ? null : h("button", { class: "link", type: "button", onclick: closeOnboarding }, "Passer"),
      obStep > 0 ? h("button", { class: "btn ghost", type: "button", onclick: () => { obStep--; renderOnboarding(); } }, "Retour") : null,
      h("button", { class: "btn love", type: "button", onclick: () => { if (last) closeOnboarding(); else { obStep++; renderOnboarding(); } } },
        last ? "C'est parti" : "Suivant"))));
  $("onboarding").querySelector(".ob-art").replaceWith(svgUse(64));
}

function renderGuide() {
  const role = S.me || "luigi";
  const acc = (title, body, open = false) =>
    h("details", { class: "acc", open }, h("summary", {}, title), h("div", { class: "acc-body" }, body));
  const section = (title, ...items) => h("section", { class: "guide-sec" }, h("h3", {}, title), ...items);
  $("guideBody").replaceChildren(
    h("button", { class: "replay", type: "button", onclick: () => { $("guide").close(); openOnboarding(); } }, "Rejouer l'onboarding"),
    section("Comment ça marche",
      ...steps(role).map(([t, p], i) => acc(`${i + 1}. ${t}`, h("p", {}, p), i === 0))),
    section("Les thèmes",
      acc(`Les ${THEMES.length} thèmes du quotidien`,
        h("dl", { class: "themes" }, ...THEMES.flatMap(([t, d]) => [h("dt", {}, t), h("dd", {}, d)]))),
      acc("Saison des amours (la vraie)", h("p", {}, "Du 1er au 21 août, comme chez l'antechinus brun : 21 questions plus coquines, un bandeau dédié et une jauge qui chute deux fois plus vite.")),
      acc("Les fêtes", h("p", {}, "Nouvel An, Saint-Valentin, Réveillon, Noël et 31 décembre ont leur propre question, avec une lettre encadrée en rose.")),
      acc("Vos dates", h("p", {}, "Le 13 août (votre rencontre), le 26 octobre (anniversaire des Kritas) et le 26 novembre (anniversaire de Luigi)."))),
    section("Les lettres",
      acc("Qui peut lire nos lettres ?", h("p", {}, "Seulement vous deux : la base n'accepte que vos deux adresses e-mail, et chaque lettre reste fermée tant que l'autre n'a pas écrit la sienne.")),
      acc("Peut-on modifier une lettre ?", h("p", {}, "Non. Une fois scellée, elle est envoyée telle quelle. Seules la réaction, la boîte à trésors et le retrait changent ensuite.")),
      acc("Que fait « Garder précieusement » ?", h("p", {}, "Une fois les deux lettres d'un jour ouvertes, l'échange est rangé dans ta boîte à trésors, sous la lettre du jour. Chacun a la sienne.")),
      acc("Que fait « Retirer cette lettre » ?", h("p", {}, "La lettre de l'autre n'apparaît plus pour toi. Elle n'est pas supprimée : tu peux la remettre depuis le même jour, dans le terrier.")),
      acc("Et si on rate un jour ?", h("p", {}, "La question reste dans le terrier, en bas de la page. Vous pouvez y répondre quand vous voulez."))),
    section("L'appli",
      acc("Comment l'installer sur le téléphone ?", h("p", {}, "Sur iPhone : Partager, puis « Sur l'écran d'accueil ». Sur Android : menu ⋮, puis « Installer l'application ».")),
      acc("À quoi sert la jauge immunitaire ?", h("p", {}, "Elle baisse au fil de la journée tant que vous n'avez pas écrit tous les deux, et remonte à 100 % quand les deux lettres sont scellées. Elle n'apparaît qu'une fois connecté."))));
}
$("openGuide").addEventListener("click", () => { renderGuide(); $("guide").showModal(); });
$("closeGuide").addEventListener("click", () => $("guide").close());
for (const id of ["guide", "onboarding"]) {
  $(id).addEventListener("click", e => { if (e.target === $(id)) id === "guide" ? $(id).close() : closeOnboarding(); });
}
$("onboarding").addEventListener("cancel", e => { e.preventDefault(); closeOnboarding(); });

/* ---------- Session ---------- */
function roleFor(email) {
  const e = (email || "").toLowerCase();
  return Object.keys(COUPLE).find(r => COUPLE[r].toLowerCase() === e) || null;
}
function enter(user) {
  S.user = user;
  S.me = roleFor(user.email);
  if (!S.me) { S.phase = "stranger"; stopData(); }
  else if (!user.emailVerified) { S.phase = "verify"; stopData(); }
  else { S.phase = "ready"; startData(); maybeOnboard(); }
  renderAll();
}

renderAll();
setInterval(renderVitals, 1000);

if (!configured) { S.phase = "unconfigured"; renderAll(); }
else {
  onAuthStateChanged(auth, user => {
    if (!user) { S.user = null; S.me = null; S.phase = "signedOut"; stopData(); renderAll(); return; }
    enter(user);
  });
}

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
