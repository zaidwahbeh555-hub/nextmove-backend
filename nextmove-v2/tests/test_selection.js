// A selection must survive a repaint the user did not cause.
//
// Reported: pick a piece up to look at where it can go, the bot replies, and
// the selection and its dots vanish -- you have to click the same piece again.
// setPosition() cleared this.selected unconditionally, and every position
// change goes through setPosition().
//
// Run from nextmove-v2/:  node tests/test_selection.js

// ── DOM shim: enough of an element tree for ForgeBoard to paint into ────────
function mkEl(tag){
  const e={tagName:tag, children:[], style:{}, dataset:{}, innerHTML:'',
    offsetLeft:0, offsetTop:0, firstElementChild:null,
    _c:new Set(),
    classList:{add:(...c)=>c.forEach(x=>e._c.add(x)), remove:(...c)=>c.forEach(x=>e._c.delete(x)),
               contains:c=>e._c.has(c), toggle:(c,on)=>{on?e._c.add(c):e._c.delete(c)}},
    appendChild(ch){
      if(ch.tagName==='frag'){ (ch.children||[]).slice().forEach(g=>e.appendChild(g)); return ch; }
      e.children.push(ch); ch.parentNode=e;
      if(!e.firstElementChild) e.firstElementChild=ch; return ch; },
    removeChild(ch){ const i=e.children.indexOf(ch); if(i>=0) e.children.splice(i,1); },
    remove(){ if(e.parentNode) e.parentNode.removeChild(e); },
    addEventListener(){}, setAttribute(k,v){ e[k]=v; },
    insertAdjacentHTML(){}, closest(){ return null; },
    insertBefore(frag){ (frag.children||[]).forEach(ch=>e.appendChild(ch)); return frag; },
    getBoundingClientRect:()=>({left:0,top:0,width:640,height:640}),
    querySelector(sel){ return e.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel){
      const want = sel.split(',').map(s=>s.trim());
      const out=[];
      (function walk(n){
        (n.children||[]).forEach(ch=>{
          if(want.some(w=>matches(ch,w))) out.push(ch);
          walk(ch);
        });
      })(e);
      return out;
    }};
  // A real element keeps className and classList in step; the shim must too, or
  // elements built with `el.className = 'fb-sq ...'` match no selector at all.
  Object.defineProperty(e, 'className', {
    get:()=>[...e._c].join(' '),
    set:(v)=>{ e._c = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  return e;
}
function matches(el, sel){
  // supports ".a", ".a.b", "[data-square='x']", ".fb-sq[data-square=\"x\"]"
  const attr = /\[data-square="([^"]+)"\]/.exec(sel);
  if(attr){
    const cls = sel.slice(0, sel.indexOf('[')).split('.').filter(Boolean);
    return el.dataset.square === attr[1] && cls.every(c=>el._c.has(c));
  }
  return sel.split('.').filter(Boolean).every(c=>el._c.has(c));
}
const host = mkEl('div');
global.document={createElement:mkEl, getElementById:(id)=> id==='board' ? host : null,
                 addEventListener(){}, querySelector:()=>null, querySelectorAll:()=>[],
                 createDocumentFragment:()=>mkEl('frag')};
global.window=global;
global.addEventListener=function(){};
global.fbPieceEl=(type,color)=>'<img data-p="'+color+type+'">';
global.requestAnimationFrame=f=>f();
global.getComputedStyle=()=>({});

const src=require('fs').readFileSync('static/js/main.js','utf8');
const a=src.indexOf('class ForgeBoard');
// Brace-match to the real end of the class rather than guessing at a marker.
let depth=0, end=a;
for(let i=src.indexOf('{', a); i<src.length; i++){
  const ch=src[i];
  if(ch==='{') depth++;
  else if(ch==='}'){ depth--; if(depth===0){ end=i+1; break; } }
}
eval('global.ForgeBoard = ' + src.slice(a, end) + ';');

let pass=0,total=0;
const check=(l,c,d)=>{total++; if(c)pass++; console.log(`  [${c?'PASS':'FAIL'}] ${l}${d?'  -> '+d:''}`);};

// ── a board with a controllable notion of "legal moves" ────────────────────
let TARGETS = {e2:['e3','e4'], g1:['f3','h3'], d1:['e2']};
const board = new ForgeBoard('board', {
  orientation:'white', interactive:true,
  getTargets:(sq)=>TARGETS[sq] || null,
  onMove:()=>true
});
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
board.setPosition(START);

const dots = ()=>host.querySelectorAll('.fb-dot').length + host.querySelectorAll('.fb-ring').length;

// ── the reported bug ───────────────────────────────────────────────────────
board._handleClick('e2');
check('clicking a piece selects it', board.selected === 'e2', String(board.selected));
check('and shows where it can go', dots() === 2, dots()+' marks');

// the bot replies somewhere else entirely
board.setPosition('rnbqkbnr/pppppp1p/6p1/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2',
                  {lastMove:{from:'g7',to:'g6'}});
check('the selection survives the bot moving', board.selected === 'e2', String(board.selected));
check('and so do its dots', dots() === 2, dots()+' marks');
check('the selected square is still marked',
      host.querySelectorAll('.fb-selected').length === 1);
check('the bot move is still shown as the last move',
      host.querySelectorAll('.fb-last').length === 2);

// ── it must still clear when the selection stops meaning anything ──────────
board._handleClick('e2');   // deselect
board._handleClick('g1');
check('re-selecting works', board.selected === 'g1');
// that knight gets captured
delete TARGETS.g1;
board.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKB1R w KQkq - 0 3',
                  {lastMove:{from:'a8',to:'g1'}});
check('a captured piece does not stay selected', board.selected === null, String(board.selected));
check('and leaves no dots behind', dots() === 0, dots()+' marks');

// a piece that is still there but has nothing to play
TARGETS = {d1:[]};
board._handleClick('d1');
board.setPosition(START, {lastMove:{from:'b8',to:'c6'}});
check('a piece with no legal moves is not kept selected', board.selected === null);

// ── the player's own move still clears ─────────────────────────────────────
TARGETS = {e2:['e3','e4']};
board.setPosition(START);
board._handleClick('e2');
check('selected before moving', board.selected === 'e2');
board.setPosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
                  {lastMove:{from:'e2',to:'e4'}});
check('moving the selected piece clears the selection', board.selected === null,
      String(board.selected));

// ── a non-interactive board never restores ─────────────────────────────────
TARGETS = {e2:['e3','e4']};
board.setPosition(START);
board._handleClick('e2');
board.interactive = false;
board.setPosition(START, {lastMove:{from:'g7',to:'g6'}});
check('a locked board drops the selection', board.selected === null);

console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total?0:1);
