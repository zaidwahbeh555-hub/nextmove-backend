// "Play them out" must actually play them out.
//
// It used to jump straight to "which was better?", which then bailed because
// nothing had been watched yet -- so the button produced a list and nothing
// else, and the walk-through only ran if you happened to click a row. These
// checks drive the real CoachRail module against a DOM shim and assert that the
// board is stepped through move by move, with a line of narration each time.
//
// Run from nextmove-v2/:  node tests/test_candidates.js

const els = {};
function mk(id){
  const el = {id, innerHTML:'', textContent:'', disabled:false, dataset:{}, _c:new Set(),
    classList:{add:c=>el._c.add(c), remove:c=>el._c.delete(c),
               toggle:(c,on)=>{on?el._c.add(c):el._c.delete(c)}, contains:c=>el._c.has(c)},
    addEventListener(){},
    // Controls have to be stable across calls: say() attaches its handlers via
    // querySelectorAll, and the test clicks them via a later call. Rebuilding
    // the list each time would throw those handlers away.
    querySelectorAll(){
      if(el._html === el.innerHTML && el._acts) return el._acts;
      const out=[]; const re=/data-act="([^"]*)"(?:\s+data-val="([^"]*)")?/g; let m;
      while((m=re.exec(el.innerHTML))) out.push({dataset:{act:m[1], val:m[2]},
                                                 addEventListener(ev,fn){this._fn=fn;},
                                                 _click(){ this._fn && this._fn({stopPropagation(){}}); }});
      el._html = el.innerHTML; el._acts = out; return out;
    }};
  els[id]=el; return el;
}
['cwalk','cwalk-step','cwalk-title','cwalk-say','cwalk-opts','coachstrip','cs-q',
 'crail-cands','crail-cand-list','crail-play','crail-tip','crail-items','crail-daily'].forEach(mk);
els['cwalk']._c.add('hidden');

global.document = {getElementById:id=>els[id]||null, createElement:()=>mk('tmp'),
                   addEventListener(){}, querySelector:()=>null, querySelectorAll:()=>[]};
global.window = global;
global.esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// Board records every position it is asked to show.
const shown = [];
global.BotState = {
  gameActive:true,
  board:{ setPosition:(fen)=>shown.push(fen), clearMarks(){}, highlight(){} },
  game:{ fen:()=>'LIVE', history:()=>['e4','e5'] }
};
global.Chess = function(){ return {move:()=>({san:'Nf3'}), fen:()=>'x'}; };
global.Candidates = {marked:()=>[{from:'g1',to:'f3'},{from:'f1',to:'c4'}]};

const PREVIEW = {candidates:[
  {move:'Nf3', reply:'Nc6', eval:0.3, gap:0,
   steps:[{fen:'F1', say:'You play Nf3. Watch what he gets.'},
          {fen:'F2', say:'Nc6.'},
          {fen:'F3', say:'You answer Bb5.'}]},
  {move:'Bc4', reply:'Nf6', eval:-0.4, gap:0.7,
   steps:[{fen:'G1', say:'You play Bc4. Watch what he gets.'},
          {fen:'G2', say:'Nf6 takes your pawn.'}]}
]};
global.fetch = async ()=>({ok:true, json:async()=>PREVIEW});

const src = require('fs').readFileSync('static/js/main.js','utf8');
const a = src.indexOf('const CoachRail = (function(){');
if(a < 0){ console.log('  [FAIL] CoachRail not found'); process.exit(1); }
const b = src.indexOf('\n})();', a) + 6;
eval(src.slice(a,b).replace('const CoachRail =','global.CoachRail ='));

let pass=0, total=0;
function check(label, cond, detail){ total++; if(cond) pass++;
  console.log(`  [${cond?'PASS':'FAIL'}] ${label}${detail?'  -> '+detail:''}`); }
function act(name){
  const found = (els['cwalk-opts']._acts||[]).find(x=>x.dataset.act===name);
  if(!found) throw new Error('no "'+name+'" control; have: ' +
    (els['cwalk-opts']._acts||[]).map(x=>x.dataset.act).join(','));
  found._click();
}

(async ()=>{
  await CoachRail.playOut();

  // ── it starts walking on its own ─────────────────────────────────────────
  check('the walk-through card opens', !els['cwalk']._c.has('hidden'));
  check('it does NOT jump straight to "which was better"',
        !/which/i.test(els['cwalk-say'].textContent), els['cwalk-say'].textContent);
  check('the first candidate starts playing out',
        /If you play Nf3/.test(els['cwalk-title'].textContent), els['cwalk-title'].textContent);
  check('the board is moved to the first position', shown.includes('F1'), shown.join(','));
  check('there is narration for it',
        /Watch what he gets/.test(els['cwalk-say'].textContent), els['cwalk-say'].textContent);
  check('progress is shown', /move 1 of 3/.test(els['cwalk-step'].textContent),
        els['cwalk-step'].textContent);

  // ── stepping forward moves the board each time ───────────────────────────
  els['cwalk-opts'].querySelectorAll(); act('next');
  check('second move is played on the board', shown.includes('F2'), shown.slice(-3).join(','));
  check('narration follows the move', /Nc6/.test(els['cwalk-say'].textContent),
        els['cwalk-say'].textContent);
  els['cwalk-opts'].querySelectorAll(); act('next');
  check('third move is played', shown.includes('F3'));
  check('going back is offered mid-line',
        /data-act="prev"/.test(els['cwalk-opts'].innerHTML));

  // ── finishing one line rolls into the other ──────────────────────────────
  els['cwalk-opts'].querySelectorAll(); act('next');       // Done
  check('the live position is restored between lines', shown[shown.length-1] === 'LIVE',
        shown[shown.length-1]);
  check('it offers the second candidate rather than stopping',
        /data-act="go"/.test(els['cwalk-opts'].innerHTML) &&
        /Bc4/.test(els['cwalk-opts'].innerHTML), els['cwalk-opts'].innerHTML);

  els['cwalk-opts'].querySelectorAll(); act('go');
  check('the second line plays out too', shown.includes('G1'));
  check('title names the second candidate', /If you play Bc4/.test(els['cwalk-title'].textContent),
        els['cwalk-title'].textContent);

  els['cwalk-opts'].querySelectorAll(); act('next');
  els['cwalk-opts'].querySelectorAll(); act('next');       // Done on the last one

  // ── only now is the judgement asked for ──────────────────────────────────
  check('after both are watched it asks which was better',
        /which one would you rather/i.test(els['cwalk-say'].textContent),
        els['cwalk-say'].textContent);
  check('both moves are offered as answers',
        /data-val="Nf3"/.test(els['cwalk-opts'].innerHTML) &&
        /data-val="Bc4"/.test(els['cwalk-opts'].innerHTML));
  check('"I am not sure" is offered', /data-act="unsure"/.test(els['cwalk-opts'].innerHTML));

  // ── not sure once explains; it does not reveal ───────────────────────────
  els['cwalk-opts'].querySelectorAll(); act('unsure');
  check('first "not sure" explains rather than revealing',
        /what does he get to do/i.test(els['cwalk-say'].textContent),
        els['cwalk-say'].textContent);
  check('and still asks them to choose', /data-act="pick"/.test(els['cwalk-opts'].innerHTML));

  // ── second time it gives it, with the reasoning ──────────────────────────
  els['cwalk-opts'].querySelectorAll(); act('unsure');
  check('second "not sure" reveals the move',
        /Nf3 was the move/.test(els['cwalk-title'].textContent), els['cwalk-title'].textContent);
  check('and explains why', /habit worth keeping/i.test(els['cwalk-say'].textContent),
        els['cwalk-say'].textContent);

  console.log(`\n  ${pass}/${total} passed`);
  process.exit(pass===total ? 0 : 1);
})().catch(e=>{ console.log('  ERROR', e.message); process.exit(1); });
