// Equipping a cosmetic must actually reach every board.
//
// This is the step that worried the last session: applying a theme is where a
// board has broken before. So rather than reasoning about it, this drives the
// real Cosmetics module and a real ForgeBoard against a DOM shim and asserts
// that (a) a theme sets only the two square variables, (b) a piece-set change
// repaints every registered board, and (c) it repaints them in place rather
// than rebuilding the grid -- a full rebuild is the old flicker bug.
//
// Run from nextmove-v2/:  node tests/test_cosmetics.js

const setProps = {};
function mkEl(id){
  const el = {
    id, innerHTML:'', textContent:'', style:{}, dataset:{}, children:[],
    _c:new Set(),
    classList:{add(c){el._c.add(c)}, remove(c){el._c.delete(c)},
               toggle(c,on){on?el._c.add(c):el._c.delete(c)}, contains(c){return el._c.has(c)}},
    appendChild(c){ el.children.push(c); return c; },
    querySelectorAll(){ return []; },
    querySelector(){ return null; },
    addEventListener(){}, removeEventListener(){},
    getBoundingClientRect(){ return {left:0,top:0,width:400,height:400}; },
    setAttribute(){}, remove(){}
  };
  return el;
}

const boardEl = mkEl('bot-board');
global.document = {
  documentElement:{ style:{ setProperty(k,v){ setProps[k]=v; } } },
  getElementById:(id)=> id==='bot-board' ? boardEl : null,
  createElement:(t)=>mkEl(t),
  querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){}
};
global.window = global;
global.requestAnimationFrame = (f)=>f();

const fs = require('fs');
const src = fs.readFileSync('static/js/main.js','utf8');

function slice(startMarker, endMarker){
  const a = src.indexOf(startMarker);
  if(a < 0) throw new Error('cannot find: '+startMarker);
  const b = src.indexOf(endMarker, a);
  if(b < 0) throw new Error('cannot find end: '+endMarker);
  return src.slice(a, b);
}

// The module under test, plus the piece helpers it drives. Evaluated verbatim
// and then exported by name, so the test always runs the real source rather
// than a rewritten copy of it.
eval(slice("const PIECE_VER", "const LESSONS=") +
     ";global.PIECE_VER=PIECE_VER;global.PIECE_THEME=PIECE_THEME;global.Cosmetics=Cosmetics;");
eval(slice("function fbPieceCode", "class ForgeBoard") +
     ";global.fbPieceCode=fbPieceCode;global.fbPieceEl=fbPieceEl;");

// The real refreshPieces body, lifted off the class and given a `this`.
const refreshBody = slice('  refreshPieces(){', '\n  }').replace('  refreshPieces(){','');
const realRefreshPieces = new Function(refreshBody);

let pass=0, total=0;
function check(label, cond, detail){ total++; if(cond) pass++;
  console.log(`  [${cond?'PASS':'FAIL'}] ${label}${detail?'  -> '+detail:''}`); }

// ── a board theme touches the two square variables and nothing else ──────────
Cosmetics.apply({board:'forest', light:'#28382F', dark:'#1A241E', dir:'', pieces:'classic'});
check('theme sets --sq-light', setProps['--sq-light']==='#28382F', setProps['--sq-light']);
check('theme sets --sq-dark',  setProps['--sq-dark']==='#1A241E',  setProps['--sq-dark']);
check('theme sets nothing else', Object.keys(setProps).length===2, Object.keys(setProps).join(','));
check('no layout property touched',
      !Object.keys(setProps).some(k=>/width|height|flex|aspect|position|display/i.test(k)));

// ── the piece directory feeds the real image markup ─────────────────────────
check('default set uses the base directory', fbPieceEl('n','w').includes('/static/custom/wN.svg'), fbPieceEl('n','w'));
Cosmetics.apply({board:'forest', light:'#28382F', dark:'#1A241E', dir:'frost/', pieces:'frost'});
check('equipped set changes the src path', fbPieceEl('n','w').includes('/static/custom/frost/wN.svg'), fbPieceEl('n','w'));
check('piece code is unchanged by the set', fbPieceCode('q','b')==='bQ');
check('cache buster survives', fbPieceEl('k','w').includes('?v='+PIECE_VER));

// chessboard.js (the replay board) takes a function and must follow too
check('replay board follows the set', PIECE_THEME('wQ')==='/static/custom/frost/wQ.svg?v='+PIECE_VER, PIECE_THEME('wQ'));

// ── a piece-set change repaints every registered board, in place ─────────────
let repaints = 0, rebuilds = 0;
function FakeBoard(){
  this.pos = {e1:{type:'k',color:'w'}, e8:{type:'k',color:'b'}, d4:null};
  this.painted = [];
  this._paint = (sq,pc)=>{ repaints++; this.painted.push(sq); };
  this._buildSquares = ()=>{ rebuilds++; };
  this.refreshPieces = realRefreshPieces;
}
global.ForgeBoard = function(){};
ForgeBoard.instances = [new FakeBoard(), new FakeBoard()];

Cosmetics.dir = 'frost/';            // pretend this is what is equipped now
Cosmetics.apply({board:'forest', light:'#28382F', dark:'#1A241E', dir:'mono/', pieces:'mono'});
check('every registered board repainted', repaints===4, repaints+' paints across 2 boards');
check('only occupied squares repainted',
      ForgeBoard.instances[0].painted.join(',')==='e1,e8', ForgeBoard.instances[0].painted.join(','));
check('grid never rebuilt (no flicker)', rebuilds===0, rebuilds+' rebuilds');

// re-applying the same set must not repaint again
repaints = 0;
Cosmetics.apply({board:'forest', light:'#28382F', dark:'#1A241E', dir:'mono/', pieces:'mono'});
check('same set does not repaint', repaints===0, repaints+' paints');

// ── a malformed payload must not throw ──────────────────────────────────────
let threw = false;
try{ Cosmetics.apply(null); Cosmetics.apply({}); Cosmetics.apply({light:'#000'}); }catch(e){ threw = true; }
check('malformed payload is survivable', !threw);

console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total ? 0 : 1);
