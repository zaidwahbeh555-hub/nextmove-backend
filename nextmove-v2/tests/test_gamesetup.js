// Exercise GameSetup.refresh()'s decision tree against a DOM shim.
const els = {};
function mk(id){ return els[id] = {id, textContent:'', _cls:new Set(),
  classList:{ add:(c)=>els[id]._cls.add(c), remove:(...c)=>c.forEach(x=>els[id]._cls.delete(x)),
              toggle:(c,on)=>{on?els[id]._cls.add(c):els[id]._cls.delete(c)}, contains:(c)=>els[id]._cls.has(c) },
  addEventListener(){}, querySelectorAll:()=>[], dataset:{} }; }
['gm-setup','gm-gamebar','gm-turn','gm-turn-text','setup-mode','setup-side','setup-go','act-new','act-resign','act-flip','bot-color','page-coach'].forEach(mk);
global.document = { getElementById:(id)=>els[id]||null, addEventListener(){}, readyState:'complete',
                    querySelectorAll:()=>[], querySelector:()=>null };
global.window = global; global.setInterval = ()=>0; global.setTimeout=(f)=>f();

let src = require('fs').readFileSync('static/js/main.js','utf8');
const start = src.indexOf('const GameSetup = (function(){');
const end   = src.indexOf('window.GameSetup = GameSetup;');
eval(src.slice(start, end).replace('const GameSetup = (function(){','global.GameSetup = (function(){'));

const cases = [
  ['game not active',            {gameActive:false},                                              'Game over'],
  ['coach blocking',             {gameActive:true, boardLocked:true},                             'Answer the coach to continue'],
  ['bot thinking',               {gameActive:true, thinking:true},                                'GM Forge is thinking…'],
  ['premove queued',             {gameActive:true, _pre:{from:'e2',to:'e4'}},                     'Premove queued — e2→e4'],
  ['not your turn',              {gameActive:true, turn:'b', color:'white'},                      'GM Forge is thinking…'],
  ['your move',                  {gameActive:true, turn:'w', color:'white'},                      'Your move'],
  ['your move, in check',        {gameActive:true, turn:'w', color:'white', check:true},          'Your move — you are in check'],
];
let pass=0;
for(const [label, st, expect] of cases){
  global.BotState = { gameActive:st.gameActive, boardLocked:!!st.boardLocked, thinking:!!st.thinking,
    playerColor: st.color||'white',
    game: { turn:()=>st.turn||'w', in_check:()=>!!st.check } };
  global.Premove = { pending: st._pre||null };
  GameSetup.refresh();
  const got = els['gm-turn-text'].textContent;
  const ok = got === expect;
  if(ok) pass++;
  console.log(`  [${ok?'PASS':'FAIL'}] ${label.padEnd(24)} -> "${got}"${ok?'':`  (expected "${expect}")`}`);
}
console.log(`\n${pass}/${cases.length} passed`);
process.exit(pass===cases.length?0:1);
