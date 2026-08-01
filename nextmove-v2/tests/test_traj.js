// The rating trajectory chart.
//
// A chart is read by people and executed by me, so the parts that are
// computable get computed: that only solo games are plotted, that points land
// inside the plot area, that a flat run does not render as a misleading
// straight line at the top of the box, and that the empty state appears instead
// of an axis with nothing on it.
//
// Run from nextmove-v2/:  node tests/test_traj.js

const els = {};
function mk(id, cls){
  const el = {id, innerHTML:'', textContent:'', className:cls||'', style:{}, dataset:{},
    _c:new Set((cls||'').split(' ').filter(Boolean)), _listeners:{},
    classList:{add:c=>el._c.add(c), remove:c=>el._c.delete(c),
               toggle:(c,on)=>{ if(on===undefined){ el._c.has(c)?el._c.delete(c):el._c.add(c); }
                                else { on?el._c.add(c):el._c.delete(c); } return el._c.has(c); },
               contains:c=>el._c.has(c)},
    addEventListener(ev,fn){ (el._listeners[ev]=el._listeners[ev]||[]).push(fn); },
    getBoundingClientRect:()=>({left:0,top:0,width:1000,height:380}),
    getTotalLength:()=>900,
    setAttribute(k,v){ el[k]=v; },
    querySelectorAll(sel){
      const cls = sel.replace('.','');
      const out=[]; const re=new RegExp('class="'+cls+'[^"]*"[^>]*data-i="(\\d+)"','g');
      let m; while((m=re.exec(el.innerHTML))) out.push(mkHit(cls, m[1]));
      return out;
    }};
  els[id]=el; return el;
}
const hits = {};
function mkHit(cls, i){
  const k = cls+i;
  if(hits[k]) return hits[k];
  const h = {dataset:{i}, _c:new Set(),
    classList:{add:c=>h._c.add(c), remove:c=>h._c.delete(c),
               toggle:(c,on)=>{on?h._c.add(c):h._c.delete(c)}, contains:c=>h._c.has(c)},
    addEventListener(ev,fn){ h['_'+ev]=fn; },
    setAttribute(){}, };
  hits[k]=h; return h;
}
['traj-svg','traj-tip','traj-empty','tj-cross','tj-line'].forEach(id=>mk(id));

global.document = {
  getElementById:id=>els[id]||null,
  querySelector:sel=> sel==='.traj-figure' ? mk('fig') : null,
  querySelectorAll:()=>[], addEventListener(){}
};
global.window = global;
global.requestAnimationFrame = f=>f();
global.matchMedia = ()=>({matches:false});

const src = require('fs').readFileSync('static/js/main.js','utf8');
const a = src.indexOf('const Traj = (function(){');
const b = src.indexOf('\n})();', a) + 6;
eval(src.slice(a,b).replace('const Traj =','global.Traj ='));

let pass=0, total=0;
function check(label, cond, detail){ total++; if(cond) pass++;
  console.log(`  [${cond?'PASS':'FAIL'}] ${label}${detail?'  -> '+detail:''}`); }

const H = (n, opts={}) => Array.from({length:n}, (_,i)=>({
  mode: opts.mode || 'solo', elo: opts.flat ? 1200 : 1000 + i*20,
  d: '2026-08-' + String(i+1).padStart(2,'0'), acpl: 40, blunders: 1, result: '1-0'
}));

// ── only solo games are plotted ─────────────────────────────────────────────
let r = Traj.render(H(6).concat(H(4, {mode:'coached'})));
check('coached games are excluded', r && r.n === 6, r && r.n);
check('the empty state is hidden when there is data', els['traj-empty']._c.has('hidden'));

// ── geometry stays inside the box ───────────────────────────────────────────
const svg = els['traj-svg'].innerHTML;
const xs = [...svg.matchAll(/class="tj-dot"[^>]*cx="([\d.]+)"/g)].map(m=>+m[1]);
const ys = [...svg.matchAll(/class="tj-dot"[^>]*cy="([\d.]+)"/g)].map(m=>+m[1]);
check('a dot per solo game', xs.length === 6, xs.length + ' dots');
check('points sit inside the plot horizontally',
      xs.every(v=>v >= 52 && v <= 982), 'x range ' + Math.min(...xs) + '–' + Math.max(...xs));
check('points sit inside the plot vertically',
      ys.every(v=>v >= 26 && v <= 346), 'y range ' + Math.min(...ys).toFixed(0) + '–' + Math.max(...ys).toFixed(0));
check('x increases left to right', xs.every((v,i)=>i===0 || v > xs[i-1]));
check('a rising rating draws upward', ys[ys.length-1] < ys[0],
      'first y ' + ys[0].toFixed(0) + ' last y ' + ys[ys.length-1].toFixed(0));

// ── the parts a chart needs ─────────────────────────────────────────────────
check('there is a grid', (svg.match(/tj-grid/g)||[]).length >= 4);
check('the scale is labelled', (svg.match(/tj-tick/g)||[]).length >= 4);
check('the area is filled from the gradient', svg.includes('url(#tjFill)'));
check('hit targets are wider than the dots',
      /class="tj-hit"[^>]*width="28"/.test(svg));
check('a crosshair exists and starts hidden', /id="tj-cross"[^>]*class=|class="tj-cross hidden"/.test(svg));

// ── a flat run must not be drawn as a line pinned to an edge ───────────────
Traj.render(H(5, {flat:true}));
const fy = [...els['traj-svg'].innerHTML.matchAll(/class="tj-dot"[^>]*cy="([\d.]+)"/g)].map(m=>+m[1]);
check('a flat rating sits mid-plot, not on an edge',
      fy.every(v=>v > 60 && v < 320), 'y ' + fy[0].toFixed(0));
check('and every flat point is level', new Set(fy.map(v=>v.toFixed(1))).size === 1);

// ── not enough data ─────────────────────────────────────────────────────────
Traj.render([]);
check('no games shows the empty state', !els['traj-empty']._c.has('hidden'));
check('and draws nothing', els['traj-svg'].innerHTML === '');
Traj.render(H(1));
check('a single game is not a trajectory', !els['traj-empty']._c.has('hidden'));
Traj.render(H(4, {mode:'coached'}));
check('coached games alone are not a trajectory', !els['traj-empty']._c.has('hidden'));

// ── hover ───────────────────────────────────────────────────────────────────
Traj.render(H(6));
const hitEls = els['traj-svg'].querySelectorAll('.tj-hit');
check('hover is wired to every point', hitEls.length === 6, hitEls.length + ' targets');
hitEls[3]._mouseenter();
const tip = els['traj-tip'];
check('hovering shows a tooltip', !tip._c.has('hidden'));
check('the tooltip names the rating', /1060/.test(tip.innerHTML), tip.innerHTML.slice(0,60));
check('and the change since the last game', /\+20/.test(tip.innerHTML));
check('and the detail behind it', /blunder/.test(tip.innerHTML) && /avg loss/.test(tip.innerHTML));

// ── the reported summary drives the headline delta ──────────────────────────
r = Traj.render(H(6));
check('summary reports first and last', r.first === 1000 && r.last === 1100, r.first + '→' + r.last);

// ── bad input must not throw ────────────────────────────────────────────────
let threw = false;
try{
  Traj.render(null);
  Traj.render([{mode:'solo'}, {mode:'solo', elo:'x'}, null]);
}catch(e){ threw = true; }
check('malformed history is survivable', !threw);

console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total ? 0 : 1);
