// game.js — NO LEGAL PAIN, NO FIDUCIARY GAIN. Fully fictional pitches; each option
// is [label, gain in $k, pain, host line]. Everything runs in the browser.
import * as music from "./music.js";

const WIN = 1000, MAXPAIN = 10, ROUNDS = 8;
const PITCHES = [
  ["A cooking show where the secret ingredient is a famous brand's logo, used without asking.",
    [["Air it, logos blurred.", 120, 1, "Blurry but brave."],
     ["Air it, logos in 4K.", 400, 4, "The cease-and-desist arrived before the credits."],
     ["Make up our own brand: Bortle's.", 200, 0, "Bortle's: now with 0% lawsuit."]]],
  ["A reality show about roommates, filmed in rooms the roommates never agreed to be filmed in.",
    [["Get signed releases first.", 150, 0, "Paperwork! The sexiest drama."],
     ["Hidden cameras, big ratings.", 500, 5, "Ratings up. Lawyers up faster."],
     ["Cast actors as roommates.", 250, 1, "Acting! Technically legal."]]],
  ["A quiz where the grand prize is a mystery box. It's an empty box. Contestants are told it's a mystery.",
    [["Put a coupon in the box.", 100, 0, "A coupon! A real one!"],
     ["Advertise it as a car.", 350, 6, "Somebody's lawyer owns a car."],
     ["Box says 'prize TBD' in tiny print.", 220, 2, "Tiny print, tiny regrets."]]],
  ["The theme song is a very familiar song, played slightly slower so nobody notices.",
    [["Commission an original theme.", 90, 0, "Bangers cost money, but not lawsuits."],
     ["Play it 3% slower.", 300, 5, "Musicologists can count, it turns out."],
     ["Hum it badly on camera.", 160, 2, "Parody is a defence, mostly."]]],
  ["A celebrity cameo: a lookalike billed as 'definitely the real one'.",
    [["Bill him as 'a lookalike'.", 140, 0, "Honest and still funny."],
     ["Bill him as the real thing.", 450, 6, "The real one has an agent. And a lawyer."],
     ["Cameo from Gerald the Pigeon.", 180, 0, "Gerald signed. Gerald is unrepresented."]]],
  ["A sponsor wants you to read an ad as if it were your honest opinion, no disclosure.",
    [["Add a big 'AD' label.", 130, 0, "Honest AND monetised."],
     ["Skip the label, skim the cash.", 380, 4, "Regulators love a quiet read."],
     ["Decline, take the pizza money.", 40, 0, "Integrity: modest but delicious."]]],
  ["Live finale: a prank where the audience's phones are 'tested' for secret data.",
    [["It's a bit. Nothing is collected.", 110, 0, "A harmless bit! Applause!"],
     ["Actually collect it.", 600, 8, "Terms of service are not a magic spell."],
     ["Cancel the prank, do a raffle.", 70, 1, "Raffles: tickets, tension, tax forms."]]],
  ["Final pitch: a show about your own network's legal troubles, narrated by a pigeon.",
    [["Green-light with legal review.", 260, 1, "Meta and reviewed. Rare."],
     ["Air the actual internal memos.", 500, 7, "Discovery just discovered you."],
     ["Fictionalise it fully.", 320, 1, "Any resemblance is purely coincidental."]]],
];

const $ = (id) => document.getElementById(id);
let i = 0, gain = 0, pain = 0, locked = false, wins = 0;
const money = (k) => "$" + (k * 1000).toLocaleString("en-US");

function show(id) { for (const s of ["intro", "play", "end"]) $(s).hidden = s !== id; }

function meters() {
  $("gain").textContent = money(gain);
  $("pain").textContent = pain;
  $("gainbar").style.width = Math.min(100, (gain / WIN) * 100) + "%";
  $("painbar").style.width = Math.min(100, (pain / MAXPAIN) * 100) + "%";
}

function confetti() {
  const cols = ["#ffd23f", "#ff3d8b", "#27e1ff", "#7dff7d"];
  for (let n = 0; n < 40; n++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = cols[n % 4];
    c.style.animationDelay = Math.random() * 0.6 + "s";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3500);
  }
}

function round() {
  locked = false;
  const [text, opts] = PITCHES[i];
  $("round").textContent = `PITCH ${i + 1}/${ROUNDS}`;
  $("pitch").textContent = text;
  $("host").textContent = "Contestant, what's your call?";
  $("reveal").hidden = true;
  const box = $("opts");
  box.textContent = "";
  opts.forEach((o, k) => {
    const b = document.createElement("button");
    b.className = "opt";
    b.textContent = o[0];
    b.addEventListener("click", () => pick(k, b));
    box.appendChild(b);
  });
  meters();
}

function pick(k, btn) {
  if (locked) return;
  locked = true;
  const [label, g, p, line] = PITCHES[i][1][k];
  for (const b of $("opts").children) b.disabled = true;
  btn.classList.add("picked");
  gain += g; pain += p;
  meters();
  music.sting(p >= 4 ? "wrong" : "right");
  if (p < 4) confetti();
  $("host").textContent = line;
  $("verdict").textContent = `+${money(g)}  /  +${p} legal pain`;
  $("reveal").className = "reveal " + (p >= 4 ? "wrong" : "right");
  $("reveal").hidden = false;
  $("next").textContent = (pain >= MAXPAIN || i === ROUNDS - 1) ? "SEE THE RATINGS" : "NEXT PITCH";
}

function end() {
  music.stopTheme();
  show("end");
  let title, line;
  if (pain >= MAXPAIN) { title = "CANCELLED MID-EPISODE"; line = `The lawsuit meter hit ${pain}. You took in ${money(gain)} before the injunction. Even for web TV, that cancellation came quickly.`; }
  else if (gain >= WIN) { title = "SEASON RENEWED!"; line = `${money(gain)} in the bank and only ${pain} legal pain. No legal pain, fiduciary gain.`; music.sting("cameo"); confetti(); }
  else { title = "QUIETLY CANCELLED"; line = `Clean hands, thin wallet: ${money(gain)} with ${pain} legal pain. Nobody sued you, nobody watched you.`; }
  $("endtitle").textContent = title;
  $("endline").textContent = line;
  const msg = `${title} on NO LEGAL PAIN, NO FIDUCIARY GAIN: ${money(gain)} and ${pain}/10 legal pain.`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(msg + "\nhttps://legalpain.bisks.net");
}

function start() {
  i = 0; gain = 0; pain = 0;
  music.init();
  music.setMuted($("mute").checked);
  music.startTheme();
  show("play");
  round();
}

$("start").addEventListener("click", start);
$("again").addEventListener("click", start);
$("mute").addEventListener("change", (e) => music.setMuted(e.target.checked));
$("next").addEventListener("click", () => {
  if (pain >= MAXPAIN || i === ROUNDS - 1) return end();
  i++; round();
});
