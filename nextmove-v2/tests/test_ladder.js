// The think-it-through ladder and the retractable rails.
//
// The ladder is the answer to "I have no idea what to do here": count, decide
// whether anything is loose, then choose -- with the board visible throughout.
// These checks drive the real modules against a DOM shim.
//
// Run from nextmove-v2/:  node tests/test_ladder.js

const els = {};
function mk(id){
  const el = {id, innerHTML:'', textContent:'', value:'', disabled:false, dataset:{}, style:{},
    _c:new Set(), _listeners:{},
    classList:{add:c=>el._c.add(c), remove:c=>el._c.delete(c),
               toggle:(c,on)=>{on?el._c.add(c):el._c.delete(c)}, contains:c=>el._c.has(c)},
    addEventListener(ev,fn){ (el._listeners[ev]=el._listeners[ev]||[]).push(fn); },
    setAttribute(k,v){ el[k]=v; }, getAttribute(k){ return el[k]; },
    click(){ (el._listeners.click||[]).forEach(f=>f()); },
    querySelectorAll(sel){
      // good enough for .lopt / [data-v="x"] lookups against innerHTML
      const out = [];
      const re = /data-v="([^"]*)"/g; let m2;
      while((m2 = re.exec(el.innerHTML))){
        const v = m2[1];
        out.push(el._opts[v] || (el._opts[v] = {
          dataset:{v}, disabled:false, _c:new Set(),
          classList:{add:c=>out._last=c, remove(){}, contains(){return false}},
          addEventListener(ev,fn){ this._fn=fn; },
          _click(){ if(this._fn) this._fn(); }
        }));
      }
      if(sel && sel.indexOf('[data-v=') === 0){
        const want = sel.match(/data-v="([^"]*)"/)[1];
        return out.filter(o=>o.dataset.v === want);
      }
      return out;
    },
    querySelector(sel){ const r = el.querySelectorAll(sel); return r[0]||null; }
  };
  el._opts = {};
  els[id] = el; return el;
}
['ladder','ladder-step','ladder-title','ladder-body','ladder-rows','ladder-opts',
 'ladder-fb','ladder-next','ladder-open','ladder-close','crail-toggle','side-toggle'].forEach(mk);
els['ladder']._c.add('hidden');

const store = {};
global.localStorage = {getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}};

const bodyCls = new Set();
global.document = {
  getElementById:id=>els[id]||null,
  body:{classList:{add:c=>bodyCls.add(c), remove:c=>bodyCls.delete(c),
                   toggle:(c,on)=>{on?bodyCls.add(c):bodyCls.delete(c)}, contains:c=>bodyCls.has(c)}},
  addEventListener(){}, querySelector:()=>null, querySelectorAll:()=>[]
};
global.window = global;
global.esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
global.ChessSFX = {playSelect(){}, playWrong(){}};
const pointed = [];
global.ForgePointer = {active:false, lastSquare:null,
  pointAt:s=>pointed.push(s), sequence:l=>pointed.push(l.join('+')), retract:()=>pointed.push('retract')};
global.BotState = {game:{fen:()=>'startfen'}};

let fetched = null;
const LADDER = {ok:true, best:'Nf6', line:['Nf6','Ne2','d5'], steps:[
  {kind:'count', title:'Start by counting.', body:'Count attackers, then defenders.',
   rows:[{square:'f7',piece:'pawn',attackers:2,defenders:1,loose:true},
         {square:'e5',piece:'pawn',attackers:1,defenders:1,loose:false}],
   point:['f7','e5']},
  {kind:'yesno', title:'Is anything of yours loose?', body:'Attacked more than defended.',
   answer:true, why_yes:'Correct - f7 is attacked twice, defended once.',
   why_no:'Look again at f7.', point:['f7']},
  {kind:'mcq', title:'So what do you play?', body:'Deal with f7.',
   options:['g6','Nf6','Rb8'], answer:1,
   why_right:'Yes - Nf6. The line runs Nf6 Ne2 d5.', why_wrong:'Not that one.', point:[]}
]};
global.fetch = async (url, opts)=>{ fetched = {url, opts}; return {ok:true, json:async()=>LADDER}; };

const src = require('fs').readFileSync('static/js/main.js','utf8');
function grab(startMark){
  const a = src.indexOf(startMark);
  if(a<0) throw new Error('cannot find '+startMark);
  const b = src.indexOf('\n})();', a);
  return src.slice(a, b+6);
}
eval(grab('const Rails = (function(){').replace('const Rails =','global.Rails ='));
eval(grab('const Ladder = (function(){').replace('const Ladder =','global.Ladder ='));

let pass=0, total=0;
function check(label, cond, detail){ total++; if(cond) pass++;
  console.log(`  [${cond?'PASS':'FAIL'}] ${label}${detail?'  -> '+detail:''}`); }

// ── rails fold away and remember it ─────────────────────────────────────────
Rails.init();
check('rails start open', !bodyCls.has('rail-left-off') && !bodyCls.has('rail-right-off'));
Rails.toggle('left');
check('left rail folds', bodyCls.has('rail-left-off'));
check('folding is remembered', JSON.parse(store['cf_rails']).left === false, store['cf_rails']);
Rails.toggle('left');
check('left rail comes back', !bodyCls.has('rail-left-off'));
Rails.toggle('right');
check('right rail folds independently',
      bodyCls.has('rail-right-off') && !bodyCls.has('rail-left-off'));

// ── the ladder walks its three rungs ────────────────────────────────────────
(async ()=>{
  Ladder.init();
  await Ladder.open();

  check('ladder asked the server for this position',
        fetched && fetched.url === '/coach/ladder' &&
        JSON.parse(fetched.opts.body).fen === 'startfen', fetched && fetched.url);
  check('ladder is shown', !els['ladder']._c.has('hidden'));
  check('the open button hides while it is up', els['ladder-open']._c.has('hidden'));

  // rung 1 — counting
  check('step counter reads 1 of 3', els['ladder-step'].textContent === '1 of 3', els['ladder-step'].textContent);
  check('counting rows are rendered', /2 attacking/.test(els['ladder-rows'].innerHTML));
  check('a loose piece is flagged', /is-loose/.test(els['ladder-rows'].innerHTML));
  check('the numbers are shown, not asserted',
        /1 defending/.test(els['ladder-rows'].innerHTML));
  check('it points at what it is discussing', pointed.includes('f7+e5'), pointed.join(','));
  check('counting rung offers no options', els['ladder-opts'].innerHTML === '');
  check('counting rung offers Next', !els['ladder-next']._c.has('hidden'));

  // rung 2 — yes/no
  els['ladder-next'].click();
  check('advances to 2 of 3', els['ladder-step'].textContent === '2 of 3', els['ladder-step'].textContent);
  check('yes/no options rendered', /data-v="1"/.test(els['ladder-opts'].innerHTML) &&
                                   /data-v="0"/.test(els['ladder-opts'].innerHTML));
  const yes = els['ladder-opts'].querySelectorAll('[data-v="1"]')[0];
  yes._click();
  check('answering explains with real numbers',
        /attacked twice/.test(els['ladder-fb'].textContent), els['ladder-fb'].textContent);
  check('feedback is shown', !els['ladder-fb']._c.has('hidden'));

  // rung 3 — the choice
  els['ladder-next'].click();
  check('advances to 3 of 3', els['ladder-step'].textContent === '3 of 3');
  check('real legal moves offered', /Nf6/.test(els['ladder-opts'].innerHTML) &&
                                    /g6/.test(els['ladder-opts'].innerHTML));
  check('the answer is not marked in the markup',
        !/is-right/.test(els['ladder-opts'].innerHTML));
  const wrong = els['ladder-opts'].querySelectorAll('[data-v="0"]')[0];
  wrong._click();
  check('a wrong pick does not hand over the move',
        !/Nf6/.test(els['ladder-fb'].textContent), els['ladder-fb'].textContent);

  // closing puts the hand away
  pointed.length = 0;
  els['ladder-close'].click();
  check('closing hides the ladder', els['ladder']._c.has('hidden'));
  check('closing retracts the pointer', pointed.includes('retract'));
  check('the open button returns', !els['ladder-open']._c.has('hidden'));

  console.log(`\n  ${pass}/${total} passed`);
  process.exit(pass===total ? 0 : 1);
})();
