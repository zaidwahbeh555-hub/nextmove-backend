// Prove the rebuilt coach surfaces are actually reachable now: before the
// markup existed, every one of these render calls hit `if(!el) return`.
const els={};
function mk(id, cls){ els[id]={id, textContent:'', innerHTML:'', className:cls||'',
  _c:new Set((cls||'').split(' ').filter(Boolean)),
  classList:{add:(c)=>els[id]._c.add(c), remove:(c)=>els[id]._c.delete(c),
             toggle:(c,on)=>{on?els[id]._c.add(c):els[id]._c.delete(c)}, contains:(c)=>els[id]._c.has(c)}};
  Object.defineProperty(els[id],'cls',{get:()=>[...els[id]._c].join(' ')}); return els[id]; }
mk('coach-status-label'); mk('coach-questions'); mk('coach-feedback','gm-feedback hidden');
mk('coach-position-badge','gm-position-badge hidden'); mk('coach-theory','gm-theory hidden');
mk('coach-thinking'); mk('coach-bubble-text');
global.document={getElementById:(id)=>els[id]||null, querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){}};
global.window=global; global.BotState={board:null}; global.CoachFigure={mood(){}};
global.esc=(s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let src=require('fs').readFileSync('static/js/main.js','utf8');
const a=src.indexOf('const Coach = (function(){');
const m=/\n\}\)\(\);/.exec(src.slice(a));
eval(src.slice(a, a+m.index+m[0].length).replace('const Coach = (function(){','global.Coach = (function(){'));

let pass=0, total=0;
function check(label, cond, detail){ total++; if(cond) pass++;
  console.log(`  [${cond?'PASS':'FAIL'}] ${label}${detail?'  -> '+detail:''}`); }

Coach.setStatus('Watching the board');
check('setStatus writes text', els['coach-status-label'].textContent==='Watching the board', els['coach-status-label'].textContent);

Coach.renderQuestions(['Why did he play that?','What is loose?']);
check('renderQuestions builds list items', /<li>Why did he play that\?<\/li><li>What is loose\?<\/li>/.test(els['coach-questions'].innerHTML));
Coach.renderQuestions([]);
check('renderQuestions empty state', els['coach-questions'].innerHTML.includes('gm-q-empty'));

Coach.renderFeedback('That drops the knight on f3.','blunder');
check('renderFeedback text', els['coach-feedback'].textContent==='That drops the knight on f3.');
check('renderFeedback severity class', els['coach-feedback'].className==='gm-feedback blunder', els['coach-feedback'].className);
check('renderFeedback unhides', !els['coach-feedback']._c.has('hidden'));
Coach.renderFeedback('', '');
check('renderFeedback clears + hides', els['coach-feedback'].textContent==='' && els['coach-feedback']._c.has('hidden'));

Coach.renderPositionBadge('tactical');
check('positionBadge class', els['coach-position-badge'].className==='gm-position-badge tactical', els['coach-position-badge'].className);
check('positionBadge label', els['coach-position-badge'].textContent==='Tactical Moment', els['coach-position-badge'].textContent);
Coach.renderPositionBadge(null);
check('positionBadge hides on null', els['coach-position-badge']._c.has('hidden'));

Coach.renderTheory([{type:'opening',label:'Italian Game'},{type:'theme',label:'Weak f7'}]);
check('renderTheory chips', els['coach-theory'].innerHTML.includes('Italian Game') && els['coach-theory'].innerHTML.includes('gm-chip'));
Coach.renderTheory([]);
check('renderTheory hides when empty', els['coach-theory']._c.has('hidden'));

console.log(`\n  ${pass}/${total} passed`);
process.exit(pass===total?0:1);
