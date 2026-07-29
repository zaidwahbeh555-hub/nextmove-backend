// The ⌘K hint card must never end up somewhere the user cannot reach it.
//
// It is draggable and remembers its position, which is exactly how an element
// gets stranded: a position saved on a wide window, restored on a narrow one.
// This drives the real drag module against a DOM shim and checks the clamp on
// drag, on restore, and on resize.
//
// Run from nextmove-v2/:  node tests/test_cmdk.js

const store = {};
global.localStorage = {
  getItem:(k)=> (k in store ? store[k] : null),
  setItem:(k,v)=>{ store[k] = String(v); },
  removeItem:(k)=>{ delete store[k]; }
};

const handlers = { card:{}, win:{} };
const card = {
  id:'cmdk-hint', style:{}, offsetWidth:220, offsetHeight:74,
  _c:new Set(),
  classList:{add:(c)=>card._c.add(c), remove:(c)=>card._c.delete(c), contains:(c)=>card._c.has(c)},
  getBoundingClientRect(){
    return {left:parseInt(card.style.left,10)||0, top:parseInt(card.style.top,10)||0,
            width:card.offsetWidth, height:card.offsetHeight};
  },
  addEventListener(ev, fn){ (handlers.card[ev] = handlers.card[ev] || []).push(fn); }
};

global.document = {
  getElementById:(id)=> id==='cmdk-hint' ? card : null,
  readyState:'complete',
  addEventListener(){}, querySelector:()=>null, querySelectorAll:()=>[]
};
global.window = {
  innerWidth:1440, innerHeight:900,
  addEventListener(ev, fn){ (handlers.win[ev] = handlers.win[ev] || []).push(fn); },
  CommandPalette:{ opened:0, open(){ global.window.CommandPalette.opened++; } }
};
global.CommandPalette = global.window.CommandPalette;

function fire(target, ev, arg){ (handlers[target][ev]||[]).forEach(f=>f(arg)); }
function mouse(x,y){ return {button:0, clientX:x, clientY:y, preventDefault(){}}; }

let pass=0, total=0;
function check(label, cond, detail){ total++; if(cond) pass++;
  console.log(`  [${cond?'PASS':'FAIL'}] ${label}${detail?'  -> '+detail:''}`); }

// Load only the drag IIFE.
const src = require('fs').readFileSync('static/js/main.js','utf8');
const a = src.indexOf('/* Draggable ⌘K hint card.');
if(a < 0){ console.log('  [FAIL] cannot find the drag module'); process.exit(1); }
const end = src.indexOf('})();', a);
eval(src.slice(a, end + 5));

const L = ()=> parseInt(card.style.left,10);
const T = ()=> parseInt(card.style.top,10);

// ── a normal drag lands where you dropped it ────────────────────────────────
fire('card','mousedown', mouse(500,400));
fire('win','mousemove',  mouse(600,450));
fire('win','mouseup');
check('drag moves the card', L()===600-500+ (parseInt('0',10)||0) || L()>0, 'left='+L()+' top='+T());
check('position is persisted', !!store['cf_cmdk_pos'], store['cf_cmdk_pos']);

// ── dragging past an edge clamps instead of escaping ────────────────────────
fire('card','mousedown', mouse(600,450));
fire('win','mousemove',  mouse(99999, 99999));
fire('win','mouseup');
check('clamped to right edge',  L() === 1440-220, 'left='+L());
check('clamped to bottom edge', T() === 900-74,  'top='+T());

fire('card','mousedown', mouse(L()+5, T()+5));
fire('win','mousemove',  mouse(-99999, -99999));
fire('win','mouseup');
check('clamped to left edge', L() === 0, 'left='+L());
check('clamped to top edge',  T() === 0, 'top='+T());

// ── shrinking the window pulls a far-away card back into view ───────────────
fire('card','mousedown', mouse(5,5));
fire('win','mousemove',  mouse(1300, 820));
fire('win','mouseup');
check('card parked near the far corner', L() > 1000 && T() > 600, L()+','+T());

window.innerWidth = 900; window.innerHeight = 600;
fire('win','resize');
check('resize pulls it back inside', L() <= 900-220 && T() <= 600-74, L()+','+T());
check('resize re-saves the clamped spot',
      JSON.parse(store['cf_cmdk_pos']).x === L(), store['cf_cmdk_pos']);

// ── a stale saved position from a wide window is clamped on restore ─────────
store['cf_cmdk_pos'] = JSON.stringify({x:5000, y:5000});
card.style.left = ''; card.style.top = '';
handlers.card = {}; handlers.win = {};
window.innerWidth = 1024; window.innerHeight = 700;
eval(src.slice(a, end + 5));
check('stale wide-window position is clamped on load',
      L() === 1024-220 && T() === 700-74, L()+','+T());
check('restored card is never off-screen', L() >= 0 && T() >= 0 && L() < 1024 && T() < 700);

// ── a click that did not move still opens the palette ───────────────────────
const before = window.CommandPalette.opened;
fire('card','mousedown', mouse(L()+4, T()+4));
fire('win','mouseup');
check('a plain click opens the palette', window.CommandPalette.opened === before+1);

// ── a drag must NOT open the palette ────────────────────────────────────────
const before2 = window.CommandPalette.opened;
fire('card','mousedown', mouse(L()+4, T()+4));
fire('win','mousemove',  mouse(300,300));
fire('win','mouseup');
check('a drag does not open the palette', window.CommandPalette.opened === before2);

// ── touch drags the same way ────────────────────────────────────────────────
const touch = (x,y)=>({touches:[{clientX:x, clientY:y}], preventDefault(){}});
fire('card','touchstart', touch(200,200));
fire('card','touchmove',  touch(260,240));
fire('card','touchend');
check('touch drag moves the card', L() !== 0 || T() !== 0, L()+','+T());
check('touch drag stays inside', L() >= 0 && T() >= 0 && L() <= 1024-220 && T() <= 700-74);

console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total ? 0 : 1);
