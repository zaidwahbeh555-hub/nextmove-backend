// The daily free-play gate, as the pre-game panel presents it.
//
// It shipped dimmed-but-clickable with a note in BOTH states, so Coached read
// as merely selected, people picked it, and the game then refused to start.
// Struck out when locked, explained only while struck, and gone once the solo
// game is done.
//
// Run from nextmove-v2/:  node tests/test_gate.js
const els={};
function mk(id){
  const e={id, textContent:'', dataset:{}, _c:new Set(),
    classList:{add:(...c)=>c.forEach(x=>e._c.add(x)),
               remove:(...c)=>c.forEach(x=>e._c.delete(x)),
               contains:c=>e._c.has(c),
               toggle:(c,on)=>{on?e._c.add(c):e._c.delete(c); return e._c.has(c);}},
    addEventListener(ev,fn){ e['_'+ev]=fn; },
    querySelectorAll:()=>[], querySelector:()=>null};
  els[id]=e; return e;
}
['gate-note','gm-setup','gm-gamebar','setup-mode'].forEach(mk);
els['gate-note']._c.add('hidden');
const coachedBtn = mk('btn-coached'); coachedBtn.dataset.mode='coached';
const freeBtn    = mk('btn-free');    freeBtn.dataset.mode='free'; 
const segBtns=[coachedBtn, freeBtn];
els['setup-mode'].querySelectorAll = ()=>segBtns;

let GATE={coached_locked:true, solo_done_today:false,
          why:'Your training drills are built from the mistakes you make on your own.'};
global.document={
  getElementById:id=>els[id]||null,
  querySelector:sel=> sel.includes('data-mode="coached"') ? coachedBtn : null,
  querySelectorAll:sel=> sel.includes('setup-mode') ? segBtns : [],
  addEventListener(){}
};
global.window=global; global.State={loggedIn:true};
global.fetch=async()=>({json:async()=>GATE});
// Helpers init() reaches for that live outside this module.
global.pollWhileCoaching=()=>0;
global.coachScreenLive=()=>true;
global.setBotMode=()=>{};
global.addEventListener=()=>{};

const src=require('fs').readFileSync('static/js/main.js','utf8');
const a=src.indexOf('const GameSetup = (function(){');
const b=src.indexOf('\n})();', a)+6;
eval(src.slice(a,b).replace('const GameSetup =','global.GameSetup ='));

let pass=0,total=0;
const check=(l,c,d)=>{total++; if(c)pass++; console.log(`  [${c?'PASS':'FAIL'}] ${l}${d?'  -> '+d:''}`);};
const tick=()=>new Promise(r=>setImmediate(()=>setImmediate(r)));

(async()=>{
  GameSetup.init();                       // wires the segmented controls
  // ── locked: struck out, explained ─────────────────────────────────────────
  GameSetup.showSetup(true); await tick();
  check('Coached is struck out before the solo game',
        coachedBtn._c.has('is-locked'));
  check('the reason is shown while it is struck',
        !els['gate-note']._c.has('hidden'));
  const t = els['gate-note'].textContent;
  check('it says what unlocks it', /on your own today/.test(t), t.slice(0,52));
  check('it explains the training', /training drills/.test(t));
  check('Free play is the selected mode instead', freeBtn._c.has('active'));
  check('it is not dressed up as an upsell', !/grandmaster|upgrade|pro\b/i.test(t));

  // ── a struck-out option cannot be chosen ──────────────────────────────────
  els['setup-mode']._click({target:{closest:()=>coachedBtn}});
  check('clicking the struck-out option does nothing',
        !coachedBtn._c.has('active'));
  els['setup-mode']._click({target:{closest:()=>freeBtn}});
  check('the live option still selects', freeBtn._c.has('active'));

  // ── unlocked: no strike, no note ──────────────────────────────────────────
  GATE={coached_locked:false, solo_done_today:true, why:''};
  GameSetup.showSetup(true); await tick();
  check('the strike is removed once the solo game is done',
        !coachedBtn._c.has('is-locked'));
  check('and the explanation is removed with it',
        els['gate-note']._c.has('hidden'));
  check('no leftover text', els['gate-note'].textContent === '',
        JSON.stringify(els['gate-note'].textContent));
  check('no "you are unlocked" message is left behind',
        !els['gate-note']._c.has('ok'));
  els['setup-mode']._click({target:{closest:()=>coachedBtn}});
  check('Coached is selectable again', coachedBtn._c.has('active'));

  // ── the strike is a real strike, not just a dim ───────────────────────────
  const css=require('fs').readFileSync('static/css/style.css','utf8');
  const rule=(css.match(/\.gm-seg-btn\.is-locked\{[^}]*\}/)||[''])[0];
  check('locked style actually strikes through', /line-through/.test(rule), rule.slice(0,70));
  check('and shows it is not clickable', /not-allowed/.test(rule));

  console.log(`\n  ${pass}/${total} passed`);
  process.exit(pass===total?0:1);
})();
