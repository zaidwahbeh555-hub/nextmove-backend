// Random colour has to be random from EVERY way of starting a game.
//
// It shipped resolved only inside GameSetup.start(), so "Play Again", both
// command-palette entries and the toolbar button read the <select> straight and
// got White every time — the first option. Twenty games, twenty Whites.
//
// Run from nextmove-v2/:  node tests/test_randomside.js

const sel = {value:'random'};
global.document = {
  getElementById:id=> id === 'bot-color' ? sel : null,
  querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){},
  body:{classList:{add(){},remove(){},toggle(){},contains:()=>false}}
};
global.window = global;
global.BotState = {};
global.State = {coachMode:'free', loggedIn:false, plan:'free'};

// Only the colour-deciding head of startBotGame is under test; the rest of the
// function builds a board this shim has no business simulating.
const src = require('fs').readFileSync('static/js/main.js','utf8');
const a = src.indexOf('function beginBotGame(){');   // the colour roll lives here now
const head = src.slice(a, src.indexOf("const _pgnBtn", a));
const pick = src.slice(src.indexOf('  if(!BotState.randomSide){', a),
                       src.indexOf('\n', src.indexOf('  }', src.indexOf('  if(!BotState.randomSide){', a))));
eval('global.rollColour = function(){' + head.replace('function beginBotGame(){','') + pick + '\n};');

let pass=0, total=0;
function check(label, cond, detail){ total++; if(cond) pass++;
  console.log(`  [${cond?'PASS':'FAIL'}] ${label}${detail?'  -> '+detail:''}`); }

// ── the roll happens, and it is actually a roll ─────────────────────────────
sel.value = 'random';
const counts = {white:0, black:0};
for(let i=0;i<2000;i++){ BotState = {}; rollColour(); counts[BotState.playerColor]++; }
check('both colours come up', counts.white > 0 && counts.black > 0,
      counts.white + ' white / ' + counts.black + ' black');
const ratio = counts.white / 2000;
check('the split is near even over 2000 games', ratio > 0.45 && ratio < 0.55,
      (ratio*100).toFixed(1) + '% white');

// The failure that was reported: twenty in a row. With a real coin that is a
// 1-in-500k event, so if it can happen here the roll is not happening.
let longest = 0, run = 0, last = null;
for(let i=0;i<5000;i++){
  BotState = {}; rollColour();
  if(BotState.playerColor === last) run++; else { run = 1; last = BotState.playerColor; }
  if(run > longest) longest = run;
}
check('no run anywhere near twenty in a row', longest < 20, 'longest run ' + longest);

// ── an explicit choice is still honoured ────────────────────────────────────
sel.value = 'white';
BotState = {}; rollColour();
check('choosing White gives White', BotState.playerColor === 'white', BotState.playerColor);
check('and is not flagged as a random game', BotState.randomSide === false);

sel.value = 'black';
BotState = {}; rollColour();
check('choosing Black gives Black', BotState.playerColor === 'black', BotState.playerColor);

// ── the preference survives, so the next game rolls again ──────────────────
sel.value = 'random';
BotState = {}; rollColour();
check('random stays selected after a game', sel.value === 'random', sel.value);
check('and the game is flagged as randomly sided', BotState.randomSide === true);

// ── the select really does offer random ─────────────────────────────────────
const html = require('fs').readFileSync('templates/index.html','utf8');
check('the colour select has a random option', /<option value="random"[^>]*>/.test(html));
check('and it is the default', /<option value="random" selected>/.test(html));
check('the setup panel defaults to the Random pill',
      /class="gm-seg-btn active" data-side="random"/.test(html));

console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total ? 0 : 1);
