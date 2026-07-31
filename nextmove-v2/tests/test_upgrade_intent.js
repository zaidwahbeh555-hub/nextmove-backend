// Arriving from the landing page's "Become a Grandmaster".
//
// The interesting case is the one that normally breaks: a signed-out visitor
// clicks it, gets sent through signup, and the thing they came to do has to
// survive that detour rather than being quietly dropped.
//
// Run from nextmove-v2/:  node tests/test_upgrade_intent.js

const store = {};
global.sessionStorage = {
  getItem:k=>(k in store?store[k]:null),
  setItem:(k,v)=>{store[k]=String(v);},
  removeItem:k=>{delete store[k];}
};

const els = {};
function mk(id){
  const el = {id, _c:new Set(), scrolled:false,
    classList:{add:c=>el._c.add(c), remove:c=>el._c.delete(c), contains:c=>el._c.has(c)},
    scrollIntoView(){ el.scrolled = true; }};
  els[id]=el; return el;
}
mk('tb-menu')._c.add('hidden');
mk('upgrade-btn');

let authShown = 0;
global.showAuthModal = ()=>authShown++;
global.document = {getElementById:id=>els[id]||null, addEventListener(){},
                   querySelector:()=>null, querySelectorAll:()=>[]};
global.State = {loggedIn:false, plan:'free'};

let href = 'https://app.chessforge.org/?upgrade=1';
function setUrl(u){
  href = u;
  const q = u.indexOf('?'), h = u.indexOf('#');
  global.location = {
    href:u,
    search: q<0 ? '' : u.slice(q, h<0?undefined:h),
    hash:   h<0 ? '' : u.slice(h),
    pathname:'/'
  };
}
setUrl(href);
global.URLSearchParams = require('url').URLSearchParams;
global.URL = require('url').URL;
let scrubbed = 0;
global.history = {replaceState:()=>scrubbed++};
global.window = global;

const timers = [];
global.setTimeout = (fn)=>{ timers.push(fn); return timers.length; };
function flush(){ const t = timers.splice(0); t.forEach(f=>f()); }

const src = require('fs').readFileSync('static/js/main.js','utf8');
const a = src.indexOf('const UpgradeIntent = {');
const b = src.indexOf('\n};', a) + 3;
eval(src.slice(a,b).replace('const UpgradeIntent =','global.UpgradeIntent ='));

let pass=0, total=0;
function check(label, cond, detail){ total++; if(cond) pass++;
  console.log(`  [${cond?'PASS':'FAIL'}] ${label}${detail?'  -> '+detail:''}`); }

// ── signed out: park the intent and send them to sign up ────────────────────
State.loggedIn = false;
UpgradeIntent.run();
check('signed-out visitor is sent to sign up', authShown === 1);
check('the intent is parked, not lost', store['cf_upgrade_intent'] === '1');
check('the menu is not opened before they are signed in', els['tb-menu']._c.has('hidden'));

// ── they sign up; the URL no longer has the flag, but the intent survives ───
setUrl('https://app.chessforge.org/');
State.loggedIn = true;
check('parked intent is still recognised without the query string', UpgradeIntent.wanted());
UpgradeIntent.run();
flush();
check('account menu opens after signing up', !els['tb-menu']._c.has('hidden'));
check('the upgrade button is called out', els['upgrade-btn']._c.has('is-calling'));
check('the button is scrolled into view', els['upgrade-btn'].scrolled);
check('the parked intent is consumed', store['cf_upgrade_intent'] === undefined,
      String(store['cf_upgrade_intent']));

// ── a plain visit does nothing ──────────────────────────────────────────────
els['tb-menu']._c.add('hidden'); els['upgrade-btn']._c.delete('is-calling');
setUrl('https://app.chessforge.org/');
UpgradeIntent.run(); flush();
check('a normal visit leaves the menu closed', els['tb-menu']._c.has('hidden'));

// ── arriving signed in goes straight there ──────────────────────────────────
setUrl('https://app.chessforge.org/?upgrade=1');
State.loggedIn = true; State.plan = 'free';
UpgradeIntent.run(); flush();
check('signed-in visitor gets the menu immediately', !els['tb-menu']._c.has('hidden'));
check('the URL is tidied so a refresh does not repeat it', scrubbed > 0, scrubbed+' scrubs');

// ── existing members are not sold to ────────────────────────────────────────
els['tb-menu']._c.add('hidden'); els['upgrade-btn']._c.delete('is-calling');
setUrl('https://app.chessforge.org/?upgrade=1');
State.loggedIn = true; State.plan = 'pro';
UpgradeIntent.run(); flush();
check('an existing Grandmaster is not pitched at', els['tb-menu']._c.has('hidden'));
check('and no call-out is drawn on them', !els['upgrade-btn']._c.has('is-calling'));

// ── the hash form works too ─────────────────────────────────────────────────
setUrl('https://app.chessforge.org/#upgrade');
State.plan = 'free';
check('#upgrade is honoured as well as ?upgrade=1', UpgradeIntent.wanted());

console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total ? 0 : 1);
