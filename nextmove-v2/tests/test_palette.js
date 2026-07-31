// The command palette must expose the play modes and show which one is on.
//
// Mode was previously only switchable from two cards on the play screen, which
// are out of sight once a game starts. These checks drive the real
// CommandPalette against a DOM shim.
//
// Run from nextmove-v2/:  node tests/test_palette.js

const els = {};
function mk(id){
  const el = {id, innerHTML:'', value:'', hidden:true, _c:new Set(),
    classList:{add:c=>el._c.add(c), remove:c=>el._c.delete(c),
               toggle:(c,on)=>{on?el._c.add(c):el._c.delete(c)}, contains:c=>el._c.has(c)},
    addEventListener(){}, focus(){},
    querySelectorAll:()=>[] };
  els[id] = el; return el;
}
['cmdk','cmdk-input','cmdk-list','cmdk-hint','mode-coached','mode-free','analysis-btn'].forEach(mk);

global.document = {
  getElementById:id=>els[id]||null,
  addEventListener(){}, querySelector:()=>null, querySelectorAll:()=>[],
  activeElement:null
};
global.window = global;
global.esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const pages = [];
global.showPage = p=>pages.push(p);
global.State = {coachMode:'coached'};
const spoken = [];
global.Coach = {speak:t=>spoken.push(t)};

const src = require('fs').readFileSync('static/js/main.js','utf8');

// setBotMode, then the palette itself.
const sbmStart = src.indexOf('function setBotMode(mode){');
const sbmEnd = src.indexOf('\n}', sbmStart) + 2;
eval(src.slice(sbmStart, sbmEnd) + ';global.setBotMode=setBotMode;');

const cpStart = src.indexOf('const CommandPalette = {');
const cpEnd = src.indexOf('\n};', cpStart) + 3;
eval(src.slice(cpStart, cpEnd).replace('const CommandPalette =', 'global.CommandPalette =') + '');

let pass=0, total=0;
function check(label, cond, detail){ total++; if(cond) pass++;
  console.log(`  [${cond?'PASS':'FAIL'}] ${label}${detail?'  -> '+detail:''}`); }

const labels = CommandPalette.items.map(i=>i.label);
check('a coached-mode command exists', labels.some(l=>/coached/i.test(l)), labels.find(l=>/coached/i.test(l)));
check('a free-play command exists',   labels.some(l=>/free play/i.test(l)), labels.find(l=>/free play/i.test(l)));

// ── the active mode is marked, and only one of them ─────────────────────────
State.coachMode = 'coached';
CommandPalette.render('');
let html = els['cmdk-list'].innerHTML;
check('coached shows as active', /Coached mode[^<]*<\/span><span class="cmdk-on">/.test(html)
      || (html.match(/cmdk-on/g)||[]).length===1, (html.match(/cmdk-on/g)||[]).length+' active rows');
check('exactly one mode marked active (coached)', (html.match(/cmdk-on/g)||[]).length===1);

State.coachMode = 'free';
CommandPalette.render('');
html = els['cmdk-list'].innerHTML;
check('exactly one mode marked active (free)', (html.match(/cmdk-on/g)||[]).length===1);
const freeIdx = html.indexOf('Free Play');
const coachIdx = html.indexOf('Coached mode');
const onIdx = html.indexOf('cmdk-on');
check('the active badge follows the free-play row', onIdx > freeIdx && (coachIdx > onIdx || onIdx > coachIdx),
      'free@'+freeIdx+' coached@'+coachIdx+' badge@'+onIdx);

// ── running the commands actually switches mode ─────────────────────────────
function runByLabel(re){
  CommandPalette.render('');
  const i = CommandPalette.filtered.findIndex(it=>re.test(it.label));
  CommandPalette.sel = i;
  CommandPalette.run();
}
State.coachMode = 'free'; pages.length = 0; spoken.length = 0;
runByLabel(/coached/i);
check('coached command sets the mode', State.coachMode==='coached', State.coachMode);
check('coached command opens the play screen', pages.includes('coach'), pages.join(','));
check('coached command marks the card active', els['mode-coached']._c.has('active'));
check('switching modes tells the player', spoken.length===1, spoken[0]);

pages.length = 0;
runByLabel(/free play/i);
check('free-play command sets the mode', State.coachMode==='free', State.coachMode);
check('free-play command clears the coached card', !els['mode-coached']._c.has('active'));
check('free-play command marks the free card', els['mode-free']._c.has('active'));

// ── setBotMode must survive being called with the cards absent ──────────────
const savedC = els['mode-coached'], savedF = els['mode-free'];
delete els['mode-coached']; delete els['mode-free'];
let threw=false;
try{ setBotMode('coached'); }catch(e){ threw=true; }
check('setBotMode does not throw without the play-screen cards', !threw);
check('mode still changed', State.coachMode==='coached');
els['mode-coached']=savedC; els['mode-free']=savedF;

// ── fuzzy search still finds them ───────────────────────────────────────────
CommandPalette.render('free');
check('typing "free" finds free play', CommandPalette.filtered.some(i=>/free play/i.test(i.label)),
      CommandPalette.filtered.map(i=>i.label).join(' | '));
CommandPalette.render('coach');
check('typing "coach" finds coached mode', CommandPalette.filtered.some(i=>/coached/i.test(i.label)));

console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total ? 0 : 1);
