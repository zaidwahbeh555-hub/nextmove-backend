// The top-bar upgrade button.
//
// It is the only always-visible route to the paid plan, so who sees it matters:
// free accounts yes, Grandmaster never, signed-out never (there is nothing to
// upgrade from yet).
//
// Run from nextmove-v2/:  node tests/test_upgrade_btn.js
const els={};
function mk(id){
  const e={id, hidden:false, _c:new Set(), style:{},
    classList:{add:c=>e._c.add(c), remove:c=>e._c.delete(c), contains:c=>e._c.has(c),
               toggle:(c,on)=>{on?e._c.add(c):e._c.delete(c); return e._c.has(c);}}};
  els[id]=e; return e;
}
['tb-upgrade','gm-skin-lock','nav-shop-new','tb-plan'].forEach(mk);
global.document={getElementById:id=>els[id]||null};
global.window=global; global.State={};

const src=require('fs').readFileSync('static/js/main.js','utf8');
const a=src.indexOf('function syncCosmeticAffordances(){');
eval(src.slice(a, src.indexOf('\n}', a)+2) + ';global.sync=syncCosmeticAffordances;');

let pass=0,total=0;
const check=(l,c,d)=>{total++; if(c)pass++; console.log(`  [${c?'PASS':'FAIL'}] ${l}${d?'  -> '+d:''}`);};
const shown=()=>!els['tb-upgrade']._c.has('hidden');

State={loggedIn:true, plan:'free'};  sync();
check('a free account sees it', shown());
State={loggedIn:true, plan:'pro'};   sync();
check('Grandmaster does not', !shown());
State={loggedIn:false, plan:'free'}; sync();
check('signed out does not', !shown());
State={loggedIn:true, plan:'free'};  sync();
check('it comes back on downgrade', shown());

// ── the slot is never just empty ───────────────────────────────────────────
const badge=()=>!els['tb-plan']._c.has('hidden');
State={loggedIn:true, plan:'pro'};   sync();
check('Grandmaster sees the plan badge instead', badge() && !shown());
State={loggedIn:true, plan:'free'};  sync();
check('a free account sees the button and no badge', shown() && !badge());
State={loggedIn:false, plan:'pro'};  sync();
check('signed out sees neither', !shown() && !badge());
State={loggedIn:true, plan:'free'};  sync();

// ── it has to be in the bar itself, not only the account menu ──────────────
const html=require('fs').readFileSync('templates/index.html','utf8');
const bar=html.slice(html.indexOf('<div class="tb-right">'), html.indexOf('<div class="tb-menu'));
check('it lives in the top bar', /id="tb-upgrade"/.test(bar));
check('the plan badge shares that slot', /id="tb-plan"/.test(bar));
check('it is the first thing in the right cluster',
      bar.indexOf('tb-upgrade') < bar.indexOf('tb-cmdk'));
check('it names the plan', /Grandmaster/.test(bar), (bar.match(/<span>([^<]*)<\/span>/)||[])[1]);
check('the account-menu one is kept too', /id="upgrade-btn"/.test(html));
check('both go to the same place',
      (html.match(/onclick="goToPro\(\)"/g)||[]).length >= 2);

// ── and it has to actually read as a button, not chrome ────────────────────
const css=require('fs').readFileSync('static/css/style.css','utf8');
const rule=(css.match(/\.tb-upgrade\{[^}]*\}/)||[''])[0];
check('it is filled, not an outline', /background:linear-gradient/.test(rule));
check('its label survives on a normal desktop width',
      !/@media\(max-width:1[2-9]\d\d px?\).*tb-upgrade span\{display:none\}/.test(css.replace(/\s/g,'')));

console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total?0:1);
