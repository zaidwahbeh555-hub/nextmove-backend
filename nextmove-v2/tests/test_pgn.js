// The exported PGN has to be one other sites will accept.
//
// The old one emitted four tags and no closing result token, which Lichess and
// Chess.com either reject or mangle. Run from nextmove-v2/: node tests/test_pgn.js

global.window = global;
global.State = {user:'zaid'};
const MOVES = ['e4','e5','Nf3','Nc6','Bb5','a6','Bxc6','dxc6','O-O','f6'];
global.BotState = {
  playerColor:'white',
  game:{
    history:()=>MOVES,
    game_over:()=>true, in_checkmate:()=>false, in_stalemate:()=>false,
    in_draw:()=>false, turn:()=>'w'
  }
};

const src = require('fs').readFileSync('static/js/main.js','utf8');
function grab(sig){
  const a = src.indexOf(sig);
  if(a < 0) throw new Error('cannot find ' + sig);
  const b = src.indexOf('\n}', a) + 2;
  return src.slice(a, b);
}
eval(grab('function botResultString(g){') + ';global.botResultString=botResultString;');
eval(grab('function getBotPGN(){') + ';global.getBotPGN=getBotPGN;');

let pass=0, total=0;
function check(label, cond, detail){ total++; if(cond) pass++;
  console.log(`  [${cond?'PASS':'FAIL'}] ${label}${detail?'  -> '+detail:''}`); }

const pgn = getBotPGN();

// ── the seven-tag roster ────────────────────────────────────────────────────
['Event','Site','Date','Round','White','Black','Result'].forEach(tag=>{
  check('has the ' + tag + ' tag', new RegExp('^\\[' + tag + ' "', 'm').test(pgn));
});

// ── the tags say true things ────────────────────────────────────────────────
check('the player is named as White when they played White', /\[White "zaid"\]/.test(pgn));
check('the opponent is named as Black', /\[Black "GM Forge"\]/.test(pgn));
check('the date is in PGN format', /\[Date "\d{4}\.\d{2}\.\d{2}"\]/.test(pgn),
      (pgn.match(/\[Date "[^"]+"\]/)||[])[0]);

// ── the movetext ────────────────────────────────────────────────────────────
const body = pgn.split('\n\n')[1] || '';
check('there is a blank line between tags and moves', pgn.includes('\n\n'));
check('moves are numbered', /1\. e4/.test(body), body.slice(0,24));
check('every move made is present',
      MOVES.every(mv=>body.includes(mv)), MOVES.filter(mv=>!body.includes(mv)).join(','));
check('castling survives', body.includes('O-O'));
check('captures survive', body.includes('Bxc6') && body.includes('dxc6'));
check('the move count is right',
      (body.match(/\b\d+\.\s/g)||[]).length === Math.ceil(MOVES.length/2),
      (body.match(/\b\d+\.\s/g)||[]).length + ' move numbers for ' + MOVES.length + ' plies');

// ── the closing token, which was the actual bug ─────────────────────────────
const tag = (pgn.match(/\[Result "([^"]+)"\]/)||[])[1];
check('the result token closes the movetext', body.trim().endsWith(tag),
      'ends "' + body.trim().slice(-8) + '", tag is ' + tag);
check('the result is a legal PGN result', ['1-0','0-1','1/2-1/2','*'].includes(tag), tag);

// ── formatting ──────────────────────────────────────────────────────────────
check('no line exceeds 80 characters',
      pgn.split('\n').every(l=>l.length <= 80),
      'longest ' + Math.max(...pgn.split('\n').map(l=>l.length)));
check('there are no doubled spaces in the movetext', !/ {2}/.test(body));

// ── colours swap correctly ──────────────────────────────────────────────────
BotState.playerColor = 'black';
const asBlack = getBotPGN();
check('playing Black puts the player in the Black tag', /\[Black "zaid"\]/.test(asBlack));
check('and GM Forge in the White tag', /\[White "GM Forge"\]/.test(asBlack));

// ── an unfinished game is still valid ───────────────────────────────────────
BotState.game.game_over = ()=>false;
const live = getBotPGN();
const liveTag = (live.match(/\[Result "([^"]+)"\]/)||[])[1];
check('an in-progress game exports with a legal result', ['*','1-0','0-1','1/2-1/2'].includes(liveTag), liveTag);
check('and still closes with its token', live.split('\n\n')[1].trim().endsWith(liveTag));

// ── no game at all must not throw ───────────────────────────────────────────
BotState.game = null;
let threw = false;
try{ getBotPGN(); }catch(e){ threw = true; }
check('no game exports nothing rather than throwing', !threw);

console.log('\n--- sample ---');
console.log(pgn);
console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total ? 0 : 1);
