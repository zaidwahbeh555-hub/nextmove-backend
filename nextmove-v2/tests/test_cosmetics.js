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
// Colours plus the two optional texture layers -- and nothing else. The point
// of this assertion is that a theme is paint only, never geometry.
check('theme sets only paint properties',
      Object.keys(setProps).every(k=>/^--sq-(light|dark)(-tex)?$/.test(k)),
      Object.keys(setProps).join(','));
check('no layout property touched',
      !Object.keys(setProps).some(k=>/width|height|flex|aspect|position|display|margin|padding/i.test(k)));
check('an untextured theme clears any previous texture',
      setProps['--sq-light-tex']==='none' && setProps['--sq-dark-tex']==='none',
      setProps['--sq-light-tex']);

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

// ── what a free player is offered vs a Pro player ───────────────────────────
eval(slice("const XP_RULE_LABELS", "async function renderShop") +
     ";global.shopCard=shopCard;global.shopMiniBoard=shopMiniBoard;");

const paidTheme = {id:'royal', name:'Royal', price:1500, blurb:'Violet.',
                   light:'#3A3154', dark:'#251E38', owned:false, equipped:false, affordable:false};
const freeCtx = {is_pro:false, light:'#2E3446', dark:'#1E2231', balance:300};
const proCtx  = {is_pro:true,  light:'#2E3446', dark:'#1E2231', balance:300};

const freeCard = shopCard('board', paidTheme, freeCtx);
check('free player still sees the real preview',
      freeCard.includes('#3A3154') && freeCard.includes('#251E38'));
check('free player sees the action, not a wall', freeCard.includes('Use these colours'));
check('locked card is flagged for styling', freeCard.includes('is-locked'));
check('locked card carries a lock glyph', freeCard.includes('#ic-lock'));
check('locked button opens the gate, not checkout', freeCard.includes("showProGate('board')"));
check('free player is never offered a buy button', !freeCard.includes('shopBuy'));

const proShort = shopCard('board', paidTheme, proCtx);
check('pro who cannot afford it sees the gap', proShort.includes('1200 XP to go'), '1500-300');
check('pro short of XP gets no gate', !proShort.includes('showProGate'));

const proRich = shopCard('board', Object.assign({}, paidTheme, {affordable:true}), proCtx);
check('affordable item offers the purchase', proRich.includes('shopBuy') && proRich.includes('1500 XP'));

const ownedCard = shopCard('board', Object.assign({}, paidTheme, {owned:true}), freeCtx);
check('owned item equips even for a free player',
      ownedCard.includes('shopEquip') && !ownedCard.includes('showProGate'));

const equipped = shopCard('board', Object.assign({}, paidTheme, {owned:true, equipped:true}), freeCtx);
check('equipped item is inert', equipped.includes('Equipped') && equipped.includes('disabled'));

const pieceCard = shopCard('pieces', {id:'frost',name:'Frost',price:1100,blurb:'Cool.',dir:'frost/',
                                      owned:false,equipped:false,affordable:false}, freeCtx);
check('piece preview uses the set directory', pieceCard.includes('/static/custom/frost/'));
check('piece verb differs from board verb', pieceCard.includes('Use this set'));

console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total ? 0 : 1);
