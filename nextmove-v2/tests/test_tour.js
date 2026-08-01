// The guided tour for new accounts.
//
// The old version triggered off localStorage alone, so an existing user on a
// new browser got it and a new account on an old browser never did. It belongs
// to the account now. These checks drive the real module against a DOM shim.
//
// Run from nextmove-v2/:  node tests/test_tour.js

const els = {};
function mk(id){
  const el = {id, textContent:'', _c:new Set(), style:{},
    classList:{add:c=>el._c.add(c), remove:c=>el._c.delete(c),
               toggle:(c,on)=>{on?el._c.add(c):el._c.delete(c)}, contains:c=>el._c.has(c)}};
  els[id]=el; return el;
}
['tutorial-overlay','tutorial-box','t-step-num','t-step-total','t-title','t-desc',
 't-back','t-next','coach-panel','ladder-open','cmdk-hint'].forEach(mk);
els['tutorial-overlay']._c.add('hidden');

const store = {};
global.localStorage = {getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}};

const focused = [];
global.document = {
  getElementById:id=>els[id]||null,
  querySelectorAll:(sel)=>{
    if(sel === '.tour-focus') return Object.values(els).filter(e=>e._c.has('tour-focus'));
    return [];
  },
  addEventListener(){}, querySelector:()=>null
};
global.window = global;
const pages = [];
global.showPage = p=>pages.push(p);
global.State = {loggedIn:true};
let posted = 0;
global.fetch = async (u)=>{ if(u === '/auth/tutorial-seen') posted++; return {ok:true, json:async()=>({ok:true})}; };
const timers = [];
global.setTimeout = (fn)=>{ timers.push(fn); return timers.length; };
function flush(){ timers.splice(0).forEach(f=>f()); }

const src = require('fs').readFileSync('static/js/main.js','utf8');
const a = src.indexOf('/* ── Guided tour ───');
const b = src.indexOf('/* ── Onboarding ───');
if(a < 0 || b < 0){ console.log('  [FAIL] tour module not found'); process.exit(1); }
eval(src.slice(a,b) + ';global.TOUR=TOUR;global.tourStep=tourStep;');

let pass=0, total=0;
function check(label, cond, detail){ total++; if(cond) pass++;
  console.log(`  [${cond?'PASS':'FAIL'}] ${label}${detail?'  -> '+detail:''}`); }

// ── who gets it ─────────────────────────────────────────────────────────────
maybeStartTour({loggedIn:true, tutorial_done:true}); flush();
check('an account that has seen it is not shown it again',
      els['tutorial-overlay']._c.has('hidden'));

maybeStartTour({loggedIn:true, tutorial_done:false}); flush();
check('a new account is shown the tour', !els['tutorial-overlay']._c.has('hidden'));

// ── it covers the app, not a stale version of it ────────────────────────────
check('the tour has real length', TOUR.length >= 10, TOUR.length + ' steps');
const text = TOUR.map(s=>s.title + ' ' + s.desc).join(' ').toLowerCase();
['coach','arrow keys','candidate','training','puzzle','progress','xp','command palette',
 'grandmaster'].forEach(topic=>{
  check('covers ' + topic, text.includes(topic));
});
check('does NOT still describe pasting a PGN',
      !/paste.*pgn|pgn from chess\.com/i.test(text));
check('does NOT reference the removed Analyze tab', !/analyze tab/i.test(text));

// ── stepping through ────────────────────────────────────────────────────────
startTutorial();
check('starts at step 1', els['t-step-num'].textContent === 1, String(els['t-step-num'].textContent));
check('shows the total', els['t-step-total'].textContent === TOUR.length);
check('Back is hidden on the first step', els['t-back']._c.has('hidden'));
check('a title is rendered', !!els['t-title'].textContent, els['t-title'].textContent);

nextTutorialStep();
check('advances', els['t-step-num'].textContent === 2);
check('Back appears after the first step', !els['t-back']._c.has('hidden'));
check('it navigates to the screen it describes', pages.includes('coach'), pages.join(','));

prevTutorialStep();
check('Back goes back', els['t-step-num'].textContent === 1);

// ── it rings what it is talking about ───────────────────────────────────────
const focusStep = TOUR.findIndex(s=>s.focus);
check('at least one step highlights an element', focusStep >= 0);
function tourStepTo(n){ startTutorial(); for(let i=0;i<n;i++) nextTutorialStep(); }
if(focusStep >= 0){
  tourStepTo(focusStep);
  flush();
  const ringed = Object.values(els).some(e=>e._c.has('tour-focus'));
  check('the element for that step is ringed', ringed);
}

// ── finishing ───────────────────────────────────────────────────────────────
startTutorial();
for(let i=0;i<TOUR.length;i++) nextTutorialStep();
check('running off the end closes it', els['tutorial-overlay']._c.has('hidden'));
check('completion is recorded against the account', posted >= 1, posted + ' posts');
check('and locally too', store['cf-tutorial-done'] === '1');
check('no highlight is left behind',
      !Object.values(els).some(e=>e._c.has('tour-focus')));
check('it drops you on the play screen', pages[pages.length-1] === 'coach',
      pages[pages.length-1]);

// ── skipping mid-way behaves the same ───────────────────────────────────────
posted = 0;
startTutorial(); nextTutorialStep(); skipTutorial();
check('skipping closes it', els['tutorial-overlay']._c.has('hidden'));
check('skipping also records it', posted === 1);

// ── a signed-out visitor is never posted to ─────────────────────────────────
posted = 0; State.loggedIn = false;
startTutorial(); skipTutorial();
check('no write is attempted for a signed-out visitor', posted === 0);

console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total ? 0 : 1);
