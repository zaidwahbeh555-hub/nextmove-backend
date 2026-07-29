// The whole point of the ladder is that it narrows BEFORE it names a move.
// These assert exactly that, per pattern.
global.window=global; global.esc=s=>String(s);
let src=require('fs').readFileSync('static/js/main.js','utf8');
const a=src.indexOf('const SolveHelp = (function(){');
const m=/\n\}\)\(\);/.exec(src.slice(a));
eval(src.slice(a,a+m.index+m[0].length).replace('const SolveHelp = (function(){','global.SolveHelp = (function(){'));

let pass=0,total=0;
const t=(l,c,d)=>{total++;if(c)pass++;console.log(`  [${c?'PASS':'FAIL'}] ${l}${d?'  -> '+d:''}`);};

const pats=['Hanging piece','Missed tactic','King safety issue','Opening mistake','Endgame mistake','Early queen development'];
for(const p of pats){
  const L=SolveHelp.ladder(p,'Nxe5','');
  const beforeAnswer=L.slice(0,-1).map(r=>r.body).join(' ');
  t(`${p}: no move leaked before the answer`, !/Nxe5/.test(beforeAnswer));
  t(`${p}: has method steps`, SolveHelp.forPattern(p).steps.length>=3);
}
t('answer rung is flagged', SolveHelp.ladder('Hanging piece','Nxe5','').slice(-1)[0].isAnswer===true);
t('answer rung names the move', /Nxe5/.test(SolveHelp.ladder('Hanging piece','Nxe5','').slice(-1)[0].body));

// SAN parsing drives the narrowing clue, so it must be right.
const cases=[['Nxe5','knight','e5'],['Qh4+','queen','h4'],['e4','pawn','e4'],['Rxd8#','rook','d8'],['Bb5','bishop','b5'],['Kf1','king','f1']];
for(const [san,pc,dest] of cases){
  const r=SolveHelp.parseSan(san);
  t(`parse ${san}`, r && r.piece===pc && r.dest===dest, r?`${r.piece} -> ${r.dest}`:'null');
}
const oo=SolveHelp.parseSan('O-O');   t('parse O-O', oo && oo.castle==='kingside');
const ooo=SolveHelp.parseSan('O-O-O');t('parse O-O-O', ooo && ooo.castle==='queenside');
t('unknown pattern falls back', SolveHelp.forPattern('Nonsense').steps.length>0);
t('ladder survives missing solution', SolveHelp.ladder('Hanging piece',null,'').length>=3);

console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total?0:1);
