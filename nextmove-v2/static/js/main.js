/* NextMove — Main JS */
const PIECE_THEME = 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png';

const State = {
  xp:0, user:null, loggedIn:false,
  analysisData:null, lastPGN:'', lastPlayerColor:null,
  replayMoves:[], replayPly:-1, replayBoard:null,
  puzzles:[], puzzleIdx:0, puzzleBoard:null, puzzleGame:null,
  puzzleCorrect:0, puzzleWrong:0,
  challengeBoard:null, challengeGame:null, currentChallenge:null, challengeSolved:{},
  openingBoard:null, openings:[], currentOpening:null, openingStep:0,
  lessonOrder:[], completedLessons:[],
  boardsReady:{replay:false,puzzle:false,challenge:false,opening:false},
};

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function esc(s){return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):''}
function cap(s){return s?s[0].toUpperCase()+s.slice(1):''}
function showEl(id){const e=document.getElementById(id);if(e)e.classList.remove('hidden')}
function hideEl(id){const e=document.getElementById(id);if(e)e.classList.add('hidden')}

/* ── XP ───────────────────────────────────────────────────────────────────── */
function setXP(val){
  State.xp=val;
  document.getElementById('xp-count').textContent=val;
  document.getElementById('user-xp-label').textContent=val+' XP';
  document.getElementById('xp-fill').style.width=Math.min((val%500)/500*100,100)+'%';
}
async function awardXP(amount,type,lessonId){
  State.xp+=amount; setXP(State.xp);
  if(State.loggedIn){
    const body={amount,type};
    if(lessonId) body.lesson_id=lessonId;
    try{
      const r=await fetch('/auth/add-xp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json();
      if(d.xp!==undefined) setXP(d.xp);
      if(type==='lesson'&&lessonId&&!State.completedLessons.includes(lessonId)){
        State.completedLessons.push(lessonId);
        document.querySelectorAll(`[data-lesson="${lessonId}"]`).forEach(el=>el.classList.add('completed'));
        const el=document.getElementById('pg-lessons');
        if(el) el.textContent=State.completedLessons.length;
      }
    }catch(e){}
  }
  const fl=document.getElementById('xp-earned');
  if(fl){document.getElementById('xp-amount').textContent=amount;fl.classList.remove('hidden');setTimeout(()=>fl.classList.add('hidden'),2500);}
}

/* ── Auth ─────────────────────────────────────────────────────────────────── */
function showAuthModal(){document.getElementById('auth-overlay').classList.remove('hidden');}
function hideAuthModal(){document.getElementById('auth-overlay').classList.add('hidden');}

document.querySelectorAll('.auth-tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.auth-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.auth-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('auth-'+btn.dataset.auth).classList.add('active');
  });
});

document.getElementById('login-btn').addEventListener('click',async()=>{
  const u=document.getElementById('login-username').value.trim();
  const p=document.getElementById('login-password').value;
  const err=document.getElementById('login-error');
  err.textContent='';
  if(!u||!p){err.textContent='Please enter username and password.';return;}
  try{
    const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const d=await r.json();
    if(d.error){err.textContent=d.error;return;}
    applySession(d); hideAuthModal();
  }catch(e){err.textContent='Connection error. Please try again.';}
});

document.getElementById('register-btn').addEventListener('click',async()=>{
  const u=document.getElementById('reg-username').value.trim();
  const em=document.getElementById('reg-email').value.trim();
  const p=document.getElementById('reg-password').value;
  const err=document.getElementById('register-error');
  err.textContent='';
  if(!u||!p){err.textContent='Please enter username and password.';return;}
  try{
    const r=await fetch('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,email:em,password:p})});
    const d=await r.json();
    if(d.error){err.textContent=d.error;return;}
    applySession(d); hideAuthModal();
  }catch(e){err.textContent='Connection error. Please try again.';}
});

document.getElementById('skip-auth').addEventListener('click',hideAuthModal);

document.getElementById('logout-btn').addEventListener('click',async()=>{
  await fetch('/auth/logout',{method:'POST'});
  State.loggedIn=false; State.user=null;
  document.getElementById('user-name').textContent='Guest';
  document.getElementById('user-avatar').textContent='?';
  setXP(0);
  showAuthModal();
});

function applySession(d){
  State.loggedIn=true; State.user=d.username;
  document.getElementById('user-name').textContent=d.username;
  document.getElementById('user-avatar').textContent=d.username[0].toUpperCase();
  setXP(d.xp||0);
  State.completedLessons=d.progress?.lessons_completed||[];
  if(d.progress){
    const p=d.progress;
    [['pg-games',p.games_analysed],['pg-blunders',p.blunders_found],['pg-puzzles',p.puzzles_solved],['pg-lessons',(p.lessons_completed||[]).length]].forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=v||0;});
  }
  if(d.games) renderSavedGames(d.games);
  hideEl('progress-guest');
  showEl('progress-content');
  document.getElementById('save-game-btn').style.display='inline-flex';
}

async function checkSession(){
  try{
    const r=await fetch('/auth/me');
    const d=await r.json();
    if(d.loggedIn){applySession(d);}
    else{showAuthModal();}
  }catch(e){showAuthModal();}
}

/* ── Nav ──────────────────────────────────────────────────────────────────── */
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  const lnk=document.querySelector(`[data-page="${name}"]`);
  if(lnk) lnk.classList.add('active');
  setTimeout(()=>{
    if(name==='replay')     initReplayBoard();
    if(name==='puzzles')    initPuzzleBoard();
    if(name==='challenges') initChallengePage();
    if(name==='openings')   initOpeningPage();
    if(name==='lessons')    initLessonsPage();
    if(name==='progress')   renderProgressPage();
  },60);
}
document.querySelectorAll('.nav-link').forEach(l=>l.addEventListener('click',e=>{e.preventDefault();showPage(l.dataset.page);}));

/* ── Tabs ─────────────────────────────────────────────────────────────────── */
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const c=btn.closest('.card')||btn.closest('.page');
    c.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
  });
});
document.getElementById('pgn-file').addEventListener('change',function(){document.getElementById('file-name').textContent=this.files[0]?.name||'';});

/* ══════════════════════════════════════════════════════════════════════════
   TWO-STEP ANALYSIS FLOW
   Step 1: Parse PGN → show player buttons
   Step 2: User clicks their name → run Stockfish
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Step 1: Parse PGN ─────────────────────────────────────────────────────── */
document.getElementById('parse-btn').addEventListener('click', async()=>{
  const btn=document.getElementById('parse-btn');
  const spinner=document.getElementById('parse-spinner');
  const btnText=document.getElementById('parse-btn-text');
  const errBox=document.getElementById('parse-error');

  // Get PGN — store everything on State immediately so nothing gets lost
  const activeTab=document.querySelector('#page-analyze .tab.active').dataset.tab;
  const fd=new FormData();
  State.lastActiveTab=activeTab;

  if(activeTab==='paste'){
    const pgn=document.getElementById('pgn-text').value.trim();
    if(!pgn){showParseError('Please paste a PGN game first.');return;}
    State.lastPGN=pgn;
    State.lastUploadedFile=null;
    fd.append('pgn_text',pgn);
  } else {
    const f=document.getElementById('pgn-file').files[0];
    if(!f){showParseError('Please select a PGN file.');return;}
    State.lastUploadedFile=f;
    State.lastPGN='';
    fd.append('pgn_file',f);
  }

  errBox.classList.add('hidden');
  btn.disabled=true; spinner.classList.add('on'); btnText.textContent='Reading game…';

  try{
    const r=await fetch('/parse-pgn',{method:'POST',body:fd});
    const d=await r.json();
    if(!r.ok||d.error){showParseError(d.error||'Could not read the PGN.');return;}
    showPlayerSelection(d);
  }catch(e){showParseError('Network error: '+e.message);}
  finally{btn.disabled=false;spinner.classList.remove('on');btnText.textContent='Load Game →';}
});

function showParseError(msg){
  const b=document.getElementById('parse-error');
  b.textContent='⚠ '+msg; b.classList.remove('hidden');
}

function showPlayerSelection(data){
  const card=document.getElementById('step2-card');
  const row=document.getElementById('player-select-row');
  const info=document.getElementById('game-info-row');
  card.classList.remove('hidden');

  // Game info
  let infoHtml='';
  if(data.event&&data.event!=='?') infoHtml+=`<span>📋 ${esc(data.event)}</span>`;
  if(data.date&&data.date!=='?')   infoHtml+=`<span>📅 ${esc(data.date)}</span>`;
  if(data.site)                    infoHtml+=`<span>🌐 ${esc(data.site)}</span>`;
  info.innerHTML=infoHtml;

  // Player buttons
  row.innerHTML='';
  const players=[
    {color:'white', name:data.white, label:'⬜ White'},
    {color:'black', name:data.black, label:'⬛ Black'},
  ];

  players.forEach(p=>{
    if(!p.name) return;
    const btn=document.createElement('button');
    btn.className=`player-btn ${p.color}-btn`;
    btn.innerHTML=`
      <div class="player-btn-color">${p.label}</div>
      <div class="player-btn-name">${esc(p.name)}</div>
    `;
    btn.addEventListener('click',()=>{
      // Visually select
      row.querySelectorAll('.player-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      // Run analysis after brief delay so user sees selection
      setTimeout(()=>runAnalysis(p.color), 300);
    });
    row.appendChild(btn);
  });

  // Also offer "analyse both sides" option
  const bothBtn=document.createElement('button');
  bothBtn.className='player-btn';
  bothBtn.innerHTML=`<div class="player-btn-color">Both sides</div><div class="player-btn-name">Analyse everyone</div>`;
  bothBtn.addEventListener('click',()=>{
    row.querySelectorAll('.player-btn').forEach(b=>b.classList.remove('selected'));
    bothBtn.classList.add('selected');
    setTimeout(()=>runAnalysis(''), 300);
  });
  row.appendChild(bothBtn);

  card.scrollIntoView({behavior:'smooth',block:'start'});
}

/* ── Step 2: Run analysis ──────────────────────────────────────────────────── */
async function runAnalysis(playerColor){
  // Show step 3 loading card
  const step3=document.getElementById('step3-card');
  step3.classList.remove('hidden');
  step3.scrollIntoView({behavior:'smooth',block:'start'});

  const fd=new FormData();
  if(State.lastUploadedFile){
    fd.append('pgn_file', State.lastUploadedFile);
  } else {
    fd.append('pgn_text', State.lastPGN);
  }
  if(playerColor) fd.append('player_color', playerColor);
  State.lastPlayerColor = playerColor || null;

  try{
    const r=await fetch('/analyse',{method:'POST',body:fd});
    const d=await r.json();
    step3.classList.add('hidden');
    if(!r.ok||d.error){showParseError(d.error||'Analysis failed.');return;}

    State.analysisData=d;
    renderAnalysis(d);
    showEl('results');
    if(State.loggedIn) document.getElementById('save-game-btn').style.display='inline-flex';
    if(d.xp) setXP(d.xp);
    setTimeout(()=>document.getElementById('results').scrollIntoView({behavior:'smooth'}),100);
  }catch(e){
    step3.classList.add('hidden');
    showParseError('Analysis error: '+e.message);
  }
}

/* ── Save game ─────────────────────────────────────────────────────────────── */
document.getElementById('save-game-btn').addEventListener('click',async()=>{
  if(!State.loggedIn||!State.lastPGN) return;
  const metas=State.analysisData?.game_metas||[];
  const label=metas.length?`${metas[0].white} vs ${metas[0].black} (${metas[0].date})`:'Game';
  try{
    const r=await fetch('/auth/save-game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pgn:State.lastPGN,label})});
    const d=await r.json();
    if(d.ok){const b=document.getElementById('save-game-btn');b.textContent='✅ Saved!';setTimeout(()=>b.textContent='💾 Save Game',2000);}
  }catch(e){}
});

/* ── Render Analysis ───────────────────────────────────────────────────────── */
function renderAnalysis(data){
  const icons={'Reckless Gambler':'🎲','Tactical Dreamer':'🔍','Opening Adventurer':'🗺','Middlegame Fighter':'⚔','Daring Attacker':'🔥','Solid but Passive':'🛡','Balanced Player':'⚖'};
  document.getElementById('profile-icon').textContent=icons[data.profile.style]||'♟';
  document.getElementById('profile-style').textContent=data.profile.style;
  document.getElementById('profile-desc').textContent=data.profile.description;

  // Color badge
  const cb=document.getElementById('player-color-badge'); cb.innerHTML='';
  const pc=data.player_color;
  if(pc){const b=document.createElement('span');b.className='color-badge '+pc;b.textContent=pc==='white'?'⬜ Analysed as White':'⬛ Analysed as Black';cb.appendChild(b);}

  // Stats
  const sev=data.severity_counts||{};
  document.getElementById('s-blunder').textContent=sev.blunder||0;
  document.getElementById('s-mistake').textContent=sev.mistake||0;
  document.getElementById('s-inaccuracy').textContent=sev.inaccuracy||0;
  document.getElementById('s-total').textContent=data.total_mistakes||0;

  // Weaknesses
  const wl=document.getElementById('weaknesses-list'); wl.innerHTML='';
  const ranks=['①','②','③'];
  (data.top_weaknesses||[]).forEach(([name,count],i)=>{
    const pct=data.total_mistakes>0?Math.round(count/data.total_mistakes*100):0;
    const bp=(data.top_weaknesses[0]?.[1]||1)>0?Math.round(count/data.top_weaknesses[0][1]*100):0;
    wl.innerHTML+=`<div class="weakness-item"><span class="weakness-rank">${ranks[i]||i+1}</span><div class="weakness-info"><div class="weakness-name">${esc(name)}</div><div class="weakness-count">${count} occurrence${count!==1?'s':''} · ${pct}% of errors</div></div><div class="weakness-bar-bg"><div class="weakness-bar" style="width:${bp}%"></div></div></div>`;
  });
  if(!(data.top_weaknesses?.length)) wl.innerHTML='<p style="color:var(--muted);font-size:.85rem;padding:.4rem 0">No major patterns found — strong game!</p>';

  // Phase bars
  const pb=document.getElementById('phase-bars'); pb.innerHTML='';
  const phases=[{key:'opening',label:'Opening (moves 1–10)'},{key:'middlegame',label:'Middlegame (11–30)'},{key:'endgame',label:'Endgame (31+)'}];
  const maxP=Math.max(...phases.map(p=>data.phase_counts[p.key]||0),1);
  phases.forEach(({key,label})=>{const c=data.phase_counts[key]||0;pb.innerHTML+=`<div class="phase-row"><span class="phase-label">${label}</span><div class="phase-bar-bg"><div class="phase-bar-fill ${key}" style="width:${Math.round(c/maxP*100)}%"></div></div><span class="phase-count">${c}</span></div>`;});

  // Chips
  const pg=document.getElementById('pattern-grid'); pg.innerHTML='';
  Object.entries(data.pattern_counts||{}).sort((a,b)=>b[1]-a[1]).forEach(([n,c])=>{pg.innerHTML+=`<div class="chip"><span class="chip-name">${esc(n)}</span><span class="chip-count">${c}</span></div>`;});

  // Training
  renderTrainingPage(data.training);

  // Lesson order
  State.lessonOrder=data.lessons||Object.keys(LESSONS);

  // Puzzles
  if(data.puzzles?.length){
    State.puzzles=data.puzzles; State.puzzleIdx=0; State.puzzleCorrect=0; State.puzzleWrong=0;
    State.boardsReady.puzzle=false;
    hideEl('no-puzzles'); showEl('puzzle-area');
    document.getElementById('puzzle-total').textContent=data.puzzles.length;
  }

  // Replay
  if(data.games_moves?.length){
    State.replayMoves=data.games_moves[0]; State.replayPly=-1; State.boardsReady.replay=false;
    buildMoveList();
    document.getElementById('go-replay-btn').style.display='inline-flex';
    document.getElementById('go-lessons-btn').style.display='inline-flex';
  }
}

/* ── REPLAY ───────────────────────────────────────────────────────────────── */
function initReplayBoard(){
  if(State.replayBoard){try{State.replayBoard.destroy();}catch(e){} State.replayBoard=null;}
  State.replayBoard=Chessboard('replay-board',{position:'start',pieceTheme:PIECE_THEME});
  State.boardsReady.replay=true;
  if(State.replayMoves.length) goToPly(0);
  else document.getElementById('replay-move-label').textContent='No game loaded — analyse a game first.';
}

function buildMoveList(){
  const ml=document.getElementById('move-list'); ml.innerHTML='';
  State.replayMoves.forEach((m,ply)=>{
    if(ply%2!==0) return;
    const bm=State.replayMoves[ply+1];
    const row=document.createElement('div');
    row.className='move-row';
    row.innerHTML=`<span class="move-num">${m.move_number}.</span><span class="move-san ${m.severity||''}" data-ply="${ply}">${esc(m.san)}</span>${bm?`<span class="move-san ${bm.severity||''}" data-ply="${ply+1}">${esc(bm.san)}</span>`:'<span></span>'}`;
    ml.appendChild(row);
  });
  ml.addEventListener('click',e=>{
    const ply=parseInt(e.target.dataset.ply);
    if(!isNaN(ply)){if(!State.boardsReady.replay){showPage('replay');}else{goToPly(ply);}}
  });
}

function goToPly(ply){
  if(!State.replayBoard||!State.replayMoves.length) return;
  const game=new Chess();
  for(let i=0;i<=ply&&i<State.replayMoves.length;i++){if(!game.move(State.replayMoves[i].san))break;}
  State.replayPly=ply;
  State.replayBoard.position(game.fen(),false);
  updateReplayInfo();
  document.querySelectorAll('.move-san').forEach(el=>el.classList.remove('active-move'));
  const active=document.querySelector(`[data-ply="${ply}"]`);
  if(active){
    active.classList.add('active-move');
    // Scroll only the move list panel
    const card=document.querySelector('.move-list-card');
    if(card){const top=active.getBoundingClientRect().top-card.getBoundingClientRect().top+card.scrollTop-card.clientHeight/2;card.scrollTo({top,behavior:'smooth'});}
  }
}

function updateReplayInfo(){
  const el=document.getElementById('replay-move-label');
  const moves=State.replayMoves; const ply=State.replayPly;
  if(!moves.length){el.textContent='No game loaded — analyse a game first.';return;}
  if(ply<0){el.textContent='Starting position — press ▶ to step through moves';return;}
  if(ply>=moves.length){el.textContent='End of game';return;}
  const m=moves[ply];
  let t=`Move ${m.move_number} · ${cap(m.side)}: ${m.san}`;
  if(m.severity==='blunder') t+='  🔴 Blunder!';
  else if(m.severity==='mistake') t+='  🟠 Mistake';
  else if(m.severity==='inaccuracy') t+='  🟡 Inaccuracy';
  if(m.best_move&&m.severity) t+=`  · Best: ${m.best_move}`;
  el.textContent=t;
}

document.getElementById('r-start').addEventListener('click',()=>{if(!State.replayBoard)return;State.replayPly=-1;State.replayBoard.position('start',false);updateReplayInfo();document.querySelectorAll('.move-san').forEach(el=>el.classList.remove('active-move'));});
document.getElementById('r-prev').addEventListener('click',()=>{if(State.replayPly>0)goToPly(State.replayPly-1);else if(State.replayPly===0){State.replayPly=-1;if(State.replayBoard)State.replayBoard.position('start',false);updateReplayInfo();}});
document.getElementById('r-next').addEventListener('click',()=>{if(State.replayMoves.length&&State.replayPly<State.replayMoves.length-1)goToPly(State.replayPly+1);});
document.getElementById('r-end').addEventListener('click',()=>{if(State.replayMoves.length)goToPly(State.replayMoves.length-1);});
document.getElementById('go-replay-btn').addEventListener('click',()=>showPage('replay'));
document.getElementById('go-lessons-btn').addEventListener('click',()=>showPage('lessons'));
document.addEventListener('keydown',e=>{const pg=document.querySelector('.page.active');if(pg?.id==='page-replay'){if(e.key==='ArrowRight')document.getElementById('r-next').click();if(e.key==='ArrowLeft')document.getElementById('r-prev').click();}});

/* ── PUZZLES ──────────────────────────────────────────────────────────────── */
function initPuzzleBoard(){
  if(State.boardsReady.puzzle&&State.puzzleBoard){if(State.puzzles.length)loadPuzzle(State.puzzleIdx);return;}
  if(State.puzzleBoard){try{State.puzzleBoard.destroy();}catch(e){}}
  State.puzzleGame=new Chess();
  State.puzzleBoard=Chessboard('puzzle-board',{position:'start',draggable:true,pieceTheme:PIECE_THEME,onDrop:handlePuzzleDrop,onSnapEnd:()=>{if(State.puzzleGame)State.puzzleBoard.position(State.puzzleGame.fen());}});
  State.boardsReady.puzzle=true;
  if(State.puzzles.length) loadPuzzle(State.puzzleIdx);
}
function loadPuzzle(idx){
  if(idx>=State.puzzles.length||!State.puzzleBoard)return;
  const p=State.puzzles[idx];
  State.puzzleGame=new Chess(p.fen);
  State.puzzleBoard.orientation(p.side==='white'?'white':'black');
  State.puzzleBoard.position(p.fen,false);
  document.getElementById('puzzle-status').textContent=`${cap(p.side)} to play — find the best move!`;
  document.getElementById('puzzle-status').style.color='';
  document.getElementById('puzzle-hint-text').classList.add('hidden');
  document.getElementById('puzzle-num').textContent=idx+1;
  document.getElementById('xp-earned').classList.add('hidden');
  document.getElementById('puzzle-meta').innerHTML=`<span><strong>Pattern:</strong> ${esc(p.pattern)}</span><span><strong>Phase:</strong> ${cap(p.phase)}</span><span><strong>Your move:</strong> ${esc(p.move_played)} (−${p.drop_cp}cp)</span>`;
  document.getElementById('p-correct').textContent=State.puzzleCorrect;
  document.getElementById('p-wrong').textContent=State.puzzleWrong;
}
function handlePuzzleDrop(src,tgt){
  const p=State.puzzles[State.puzzleIdx];
  if(!p||!State.puzzleGame)return'snapback';
  const mv=State.puzzleGame.move({from:src,to:tgt,promotion:'q'});
  if(!mv)return'snapback';
  const uci=src+tgt;
  const solUCI=p.solution.toLowerCase().replace(/[+#=qrbn]/g,'').slice(0,4);
  const ok=mv.san===p.solution||uci===solUCI;
  const status=document.getElementById('puzzle-status');
  if(ok){status.textContent='✅ Correct! Well done!';status.style.color='var(--green)';State.puzzleCorrect++;awardXP(50,'puzzle');}
  else{status.textContent=`❌ Not quite (${mv.san}) — try again!`;status.style.color='var(--red)';State.puzzleWrong++;State.puzzleGame.undo();State.puzzleBoard.position(State.puzzleGame.fen(),false);}
  document.getElementById('p-correct').textContent=State.puzzleCorrect;
  document.getElementById('p-wrong').textContent=State.puzzleWrong;
}
document.getElementById('hint-btn').addEventListener('click',()=>{const p=State.puzzles[State.puzzleIdx];if(!p)return;const h=document.getElementById('puzzle-hint-text');h.classList.remove('hidden');h.textContent=`💡 Best move: ${p.solution}`;});
document.getElementById('next-puzzle-btn').addEventListener('click',()=>{if(!State.puzzles.length)return;State.puzzleIdx=(State.puzzleIdx+1)%State.puzzles.length;loadPuzzle(State.puzzleIdx);});

/* ── CHALLENGES ───────────────────────────────────────────────────────────── */
async function initChallengePage(){
  if(State.boardsReady.challenge)return;
  if(State.challengeBoard){try{State.challengeBoard.destroy();}catch(e){}}
  State.challengeBoard=Chessboard('challenge-board',{position:'start',draggable:true,pieceTheme:PIECE_THEME,onDrop:handleChallengeDrop,onSnapEnd:()=>{if(State.challengeGame)State.challengeBoard.position(State.challengeGame.fen());}});
  State.boardsReady.challenge=true;
  const res=await fetch('/daily-challenges');
  const challenges=await res.json();
  const list=document.getElementById('challenge-list'); list.innerHTML='';
  challenges.forEach(ch=>{
    const item=document.createElement('div');
    item.className='challenge-item';
    item.innerHTML=`<div class="ch-title">${esc(ch.title)}${State.challengeSolved[ch.id]?' ✅':''}</div><div class="ch-desc">${esc(ch.desc)}</div><div class="ch-xp">🏆 ${ch.xp} XP</div>`;
    item.addEventListener('click',()=>{document.querySelectorAll('.challenge-item').forEach(i=>i.classList.remove('active'));item.classList.add('active');loadChallenge(ch);});
    list.appendChild(item);
  });
  if(challenges.length){list.firstChild.classList.add('active');loadChallenge(challenges[0]);}
}
function loadChallenge(ch){State.currentChallenge=ch;State.challengeGame=new Chess(ch.fen);State.challengeBoard.position(ch.fen,false);document.getElementById('challenge-status').textContent=ch.desc+' Find the best move!';document.getElementById('challenge-status').style.color='';document.getElementById('challenge-hint-text').classList.add('hidden');}
function handleChallengeDrop(src,tgt){
  if(!State.challengeGame||!State.currentChallenge)return'snapback';
  const mv=State.challengeGame.move({from:src,to:tgt,promotion:'q'});
  if(!mv)return'snapback';
  const ch=State.currentChallenge;
  const uci=src+tgt; const solUCI=ch.solution.toLowerCase().replace(/[+#=qrbn]/g,'').slice(0,4);
  const ok=mv.san===ch.solution||uci===solUCI;
  const s=document.getElementById('challenge-status');
  if(ok){s.textContent='✅ Brilliant!';s.style.color='var(--green)';if(!State.challengeSolved[ch.id]){State.challengeSolved[ch.id]=true;awardXP(ch.xp,'challenge',String(ch.id));}}
  else{s.textContent=`❌ Not quite (${mv.san}) — try again!`;s.style.color='var(--red)';State.challengeGame.undo();State.challengeBoard.position(State.challengeGame.fen(),false);}
}
document.getElementById('challenge-hint-btn').addEventListener('click',()=>{if(!State.currentChallenge)return;const h=document.getElementById('challenge-hint-text');h.classList.remove('hidden');h.textContent='💡 '+State.currentChallenge.hint;});

/* ── LESSONS ──────────────────────────────────────────────────────────────── */
const LESSONS={
  tactics:{title:'Tactics: Forks, Pins & Skewers',subtitle:'The most powerful short-term weapons in chess',priority:'high',icon:'⚔',sections:[
    {heading:'What are tactics?',body:'Tactics are short sequences of moves that win material or force checkmate. Unlike strategy (long-term plans), tactics are concrete and decisive. <strong>Most club-level games are decided by tactics</strong> — either a player spots one, or falls into one.'},
    {heading:'The Fork',body:'A fork attacks two or more enemy pieces at once. The opponent can only save one — you win the other. <strong>Knights are the best forking pieces</strong> because of their unusual L-shaped movement that opponents often forget to account for.'},
    {tip:'Before every move, ask: "Can any of my pieces attack two things at once from any square on the board?"'},
    {heading:'The Pin',body:'A pin attacks a piece that cannot move without exposing something more valuable behind it. <strong>Absolute pins</strong> involve the king (the piece literally cannot move). <strong>Relative pins</strong> involve the queen or another valuable piece.'},
    {heading:'The Skewer',body:'A skewer is a reverse pin. You attack a valuable piece, it moves, and you win what was behind it. Bishops and rooks are most effective at creating skewers along open lines.'},
    {heading:'How to spot tactics in your games',body:'',steps:['After every opponent move: "Did they just create a weakness?"','Scan for ALL undefended pieces on both sides','Look for pieces lined up on the same rank, file, or diagonal','Ask: "If I could play anything, what would win immediately?"','Check if the opponent\'s king has escape squares']},
    {warning:'The #1 reason players miss tactics: they stop looking after finding one candidate move. Always check if there\'s something even stronger.'},
    {heading:'Your daily drill',body:'<strong>Solve 10 puzzles every day.</strong> 10 minutes of consistent daily practice will transform your tactical vision within 2-3 months. Your puzzles tab has positions taken directly from YOUR games.'},
  ]},
  openings:{title:'Opening Principles That Actually Work',subtitle:'Stop memorising moves. Start understanding why.',priority:'medium',icon:'📖',sections:[
    {heading:'Why you\'re doing openings wrong',body:'Most players try to memorise opening moves without understanding why. This falls apart the moment the opponent deviates. Instead, master these 4 principles — they apply to every opening ever played.'},
    {heading:'Principle 1: Control the center',body:'The center squares (e4, e5, d4, d5) control the most of the board. Pieces placed in or aimed at the center are significantly more powerful than pieces on the edges. Open with <strong>1.e4 or 1.d4</strong> to claim central space immediately.'},
    {tip:'A knight in the center attacks up to 8 squares. A knight on the rim attacks only 2.'},
    {heading:'Principle 2: Develop your pieces',body:'Every opening move should bring a new piece into the game. <strong>Develop knights before bishops</strong>. Aim to have all minor pieces developed and your king castled within the first 10 moves.'},
    {warning:'Never move the same piece twice in the opening unless absolutely forced. Every repeated move costs you development and gives the opponent initiative.'},
    {heading:'Principle 3: Castle early',body:'Your king is a liability in the center. Castle within the first 8 moves in almost every game. Once castled, your king is safe and your rooks are connected.'},
    {heading:'Principle 4: No early queen',body:'The queen is your most powerful piece — which means it\'s the most costly to lose a tempo with. Bringing it out early lets the opponent attack it with minor pieces while developing for free. Keep the queen back until minor pieces are active.'},
    {heading:'The correct opening sequence',body:'',steps:['Move 1: e4 or d4 (control center)','Moves 2-3: Develop both knights','Moves 3-5: Develop bishops','Moves 5-8: Castle kingside','Only then: Activate the queen and connect rooks']},
  ]},
  blunders:{title:'How to Stop Blundering',subtitle:'The single biggest rating booster at every level',priority:'high',icon:'🚫',sections:[
    {heading:'Why we blunder',body:'Blunders almost never happen because you don\'t know chess — they happen because you didn\'t check before moving. The most common causes: moving too fast, emotional reactions to the position, not scanning the whole board, and "hope chess" (assuming your opponent won\'t find the response).'},
    {heading:'The one-move check — do this every single move',body:'Before touching any piece, run this mental checklist:',steps:['<strong>Am I walking into check or losing a piece immediately?</strong>','<strong>Did my move leave anything undefended?</strong> Scan all your pieces.','<strong>What is my opponent threatening on their next move?</strong>','<strong>Is my king safe?</strong> Can they attack it?','Only then — make the move.']},
    {tip:'The chess engine makes its move instantly. The difference isn\'t speed — it\'s that the engine checks everything. Slow down, even when you\'re sure.'},
    {heading:'LPDO — Loose Pieces Drop Off',body:'Before every move, identify all "loose" pieces — pieces that currently have no defender. Loose pieces are always targets. Either defend them, move them to safety, or trade them off before your opponent wins them for free.'},
    {warning:'If you ever say "I didn\'t see that" after a game — you weren\'t looking. Train yourself to look every time, even in won positions.'},
    {heading:'Time pressure is the enemy',body:'Blunder rates spike dramatically in time pressure. When under 30 seconds, simplify — do not calculate complex variations. When you have time, use it. A 5-second pause before every move to run the blunder check will cut your blunder rate by more than half.'},
  ]},
  capitalize:{title:'How to Punish Your Opponent\'s Mistakes',subtitle:'Turn their errors into decisive wins',priority:'medium',icon:'💥',sections:[
    {heading:'Games are given away, not won',body:'At club level, the vast majority of decisive games are decided by mistakes rather than brilliant play. The player who makes the last major mistake usually loses. So two skills matter equally: avoiding your own mistakes, and capitalising on your opponent\'s.'},
    {heading:'Step 1: Ask "why did they play that?"',body:'After every opponent move, before thinking about your own plans, ask: <em>"Why did they just do that? What are they threatening?"</em> If you can\'t find a good reason for their move, they may have blundered. If their move doesn\'t make sense — look harder.'},
    {tip:'If an opponent move seems random or pointless, don\'t just ignore it and play your plan. Investigate. Either you\'re missing something, or they are.'},
    {heading:'Step 2: Hanging pieces',body:'When your opponent makes a suspicious move, the first thing to check: <strong>did they leave anything undefended?</strong> Scan their entire position. Capture hanging pieces immediately — don\'t celebrate and then forget to take them.'},
    {heading:'Step 3: Long-term weaknesses',body:'Not all mistakes are immediate blunders. Many create permanent weaknesses:\n\n<strong>Pawn weaknesses:</strong> Isolated, doubled, or backward pawns need constant defence all game.\n<strong>King exposure:</strong> Attack a poorly-castled king or an uncastled king relentlessly.\n<strong>Open files:</strong> If they create an open file toward their own king, double rooks on it immediately.'},
    {heading:'Step 4: Don\'t let them back in',body:'The biggest mistake after your opponent blunders: letting them back into the game.',steps:['Simplify into a winning endgame when possible','Don\'t go for flashy complications you haven\'t fully calculated','Trade pieces (but not pawns) when ahead in material','Keep your king safe — don\'t get mated while winning']},
    {warning:'When you\'re winning, slow down even more than usual. Excitement causes blunders. The win isn\'t yours until it\'s over.'},
  ]},
  kingsafety:{title:'King Safety',subtitle:'Your king is not a piece to play with — until the endgame',priority:'high',icon:'👑',sections:[
    {heading:'Why king safety is everything',body:'Chess has one goal: checkmate the king. Every other advantage — material, position, activity — only matters if your king survives to use it. A single king safety lapse can undo 30 perfect moves.'},
    {heading:'Rule 1: Castle in the first 10 moves',body:'Castling moves your king to a safer square AND connects your rooks. There\'s almost never a valid reason to delay castling past move 10. The exceptions (launching a king march or center attack) require exact calculation almost no club player can perform reliably.'},
    {tip:'If you\'re past move 10 and haven\'t castled, ask yourself why. If there\'s no concrete tactical reason — castle immediately.'},
    {heading:'Rule 2: Don\'t move castled pawns',body:'The pawns in front of your castled king (f2/g2/h2 or f7/g7/h7) are its bodyguards. Moving them without a very specific concrete reason creates permanent weaknesses your opponent will target all game.'},
    {warning:'Never push h3 or g4 "just to give the king air" in the early middlegame. It weakens your king far more than it helps.'},
    {heading:'Rule 3: Watch the back rank',body:'Once pieces are exchanged, your back rank becomes a target. If your king is behind unmoved pawns and you haven\'t created escape room, a rook or queen can deliver back-rank mate. Play h3 or g3 early in rook endgames to create a "luft" (escape square).'},
    {heading:'Signs your king is in danger',body:'',steps:['Opponent has rooks or queens pointing toward your king\'s wing','Your king-side pawns have moved or been traded off','All your pieces are on the opposite side of the board','Your opponent has a knight outpost close to your king','You can\'t castle and the center files are open']},
  ]},
  endgame:{title:'Endgame Fundamentals',subtitle:'Where games are won and lost at every level',priority:'medium',icon:'🏁',sections:[
    {heading:'Why the endgame matters more than you think',body:'Most players spend nearly all their study time on openings and tactics. But at club level, games reach the endgame constantly — and the player who knows basic endgame technique almost always converts the win. These are not optional extras.'},
    {heading:'Activate your king immediately',body:'In the opening and middlegame, the king hides. In the endgame, the king becomes a powerful fighting piece. <strong>The most common endgame mistake: leaving the king passive.</strong> March your king toward the center or toward passed pawns — the moment the queens come off the board.'},
    {tip:'Every tempo your king spends sitting passively in the endgame is a tempo your opponent uses to activate their king or push their pawns.'},
    {heading:'The opposition',body:'When two kings face each other with one square between them, the player who must move is "in opposition" and loses ground. In king-and-pawn endgames, gaining the opposition is often the decisive technique. Practice K+P vs K until you win or draw from every position automatically.'},
    {heading:'Passed pawns must be pushed',body:'A passed pawn (no enemy pawn can stop it queening) is a massive advantage — but only if you advance it. Every tempo you wait, your opponent brings their king closer. Push passed pawns immediately and relentlessly.'},
    {heading:'Rook endgames: the essentials',body:'Rook endgames are the most common endgames in chess. Two rules that cover 80% of positions:\n\n<strong>Rooks belong behind passed pawns</strong> (yours or your opponent\'s).\n<strong>Know the Lucena and Philidor positions</strong> cold — these are the two most important rook endgame techniques.'},
  ]},
  pieces:{title:'Using Your Pieces Effectively',subtitle:'Good pieces win games. Passive pieces lose them.',priority:'medium',icon:'♞',sections:[
    {heading:'The fundamental positional principle',body:'Every piece should be on its best possible square. A bad piece — a knight on the rim, a bishop blocked by its own pawns, a rook on a closed file — is nearly worthless regardless of how many pieces you have. <strong>Every move, ask: "Is this piece doing its job?"</strong>'},
    {heading:'Knights: outposts are everything',body:'A knight needs a stable base to be effective. An <strong>outpost</strong> is a square in enemy territory that no enemy pawn can attack. A knight on an outpost in the center or near the king is a monster piece — it controls huge squares and is almost impossible to remove.'},
    {tip:'To create a knight outpost, trade the pawn that would attack it. Then march your knight in — your opponent can\'t kick it out.'},
    {heading:'Bishops: open diagonals',body:'Bishops are useless when their diagonals are blocked by your own pawns. Key rules:\n\n<strong>Don\'t fix pawns on the same colour as your bishop</strong> — this permanently limits it.\n<strong>In bishop vs knight endgames:</strong> open positions favour the bishop; closed positions favour the knight.'},
    {heading:'Rooks: open files and the 7th rank',body:'A rook needs an open file to penetrate. <strong>Control of open files controls the game.</strong> Double rooks on the open file and invade to the 7th rank — a rook on the 7th rank simultaneously attacks all unmoved enemy pawns.'},
    {heading:'The queen: power with care',body:'The queen is most effective coordinating with other pieces. Don\'t bring it out too early (see the Openings lesson). A queen alone achieves little — it\'s the combination of queen plus rooks, bishops, or knights that creates unstoppable threats.'},
    {heading:'Piece coordination check',body:'',steps:['Is any of my pieces doing nothing useful?','Can I trade my worst piece for a well-placed enemy piece?','Is there an outpost I can plant a knight on?','Are my rooks on open or half-open files?','Are all my pieces working toward the same plan?']},
  ]},
};

function initLessonsPage(){
  const sidebar=document.getElementById('lessons-sidebar'); sidebar.innerHTML='';
  const order=State.lessonOrder.length?State.lessonOrder:Object.keys(LESSONS);
  order.forEach((id,i)=>{
    if(!LESSONS[id])return;
    const L=LESSONS[id]; const done=State.completedLessons.includes(id);
    const item=document.createElement('div');
    item.className='lesson-nav-item'+(done?' completed':''); item.dataset.lesson=id;
    item.innerHTML=`<div class="lesson-nav-title">${L.icon} ${L.title}</div><div class="lesson-nav-tag">${i===0&&State.lessonOrder.length?'⭐ Top priority':'Lesson '+(i+1)}</div>`;
    item.addEventListener('click',()=>{document.querySelectorAll('.lesson-nav-item').forEach(el=>el.classList.remove('active'));item.classList.add('active');renderLesson(id);});
    sidebar.appendChild(item);
    if(i===0){item.classList.add('active');renderLesson(id);}
  });
}

function renderLesson(id){
  const L=LESSONS[id]; if(!L)return;
  const done=State.completedLessons.includes(id);
  let html=`<div class="lesson-priority-badge ${L.priority}">${L.priority==='high'?'⭐ High Priority':'📌 Recommended'}</div><div class="lesson-title">${L.icon} ${L.title}</div><div class="lesson-subtitle">${L.subtitle}</div>`;
  L.sections.forEach(s=>{
    html+=`<div class="lesson-section">`;
    if(s.heading) html+=`<h3>${s.heading}</h3>`;
    if(s.body) html+=`<p>${s.body.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>')}</p>`;
    if(s.tip) html+=`<div class="lesson-tip">💡 <strong>Pro tip:</strong> ${s.tip}</div>`;
    if(s.warning) html+=`<div class="lesson-warning">⚠️ <strong>Watch out:</strong> ${s.warning}</div>`;
    if(s.steps) html+=`<ol class="lesson-steps">${s.steps.map(st=>`<li>${st}</li>`).join('')}</ol>`;
    html+=`</div>`;
  });
  html+=`<div class="lesson-complete-btn">${done?`<button class="btn-outline" disabled>✅ Completed (+30 XP earned)</button>`:`<button class="btn-cyan" id="complete-btn" onclick="completeLesson('${id}')">✅ Mark Complete (+30 XP)</button>`}</div>`;
  document.getElementById('lesson-content').innerHTML=html;
}

async function completeLesson(id){
  await awardXP(30,'lesson',id);
  const btn=document.getElementById('complete-btn');
  if(btn){btn.textContent='✅ Completed!';btn.disabled=true;btn.className='btn-outline';}
}

/* ── OPENINGS ─────────────────────────────────────────────────────────────── */
async function initOpeningPage(){
  if(State.boardsReady.opening)return;
  if(State.openingBoard){try{State.openingBoard.destroy();}catch(e){}}
  State.openingBoard=Chessboard('opening-board',{position:'start',pieceTheme:PIECE_THEME});
  State.boardsReady.opening=true;
  const res=await fetch('/opening-trainer'); State.openings=await res.json();
  const list=document.getElementById('opening-list'); list.innerHTML='';
  State.openings.forEach((op,i)=>{
    const item=document.createElement('div'); item.className='opening-item';
    item.innerHTML=`<div class="op-name">${esc(op.name)}</div><div class="op-color">Playing as ${op.color} · ${op.moves.length} moves</div>`;
    item.addEventListener('click',()=>{document.querySelectorAll('.opening-item').forEach(el=>el.classList.remove('active'));item.classList.add('active');selectOpening(op);});
    list.appendChild(item);
    if(i===0){item.classList.add('active');selectOpening(op);}
  });
}
function selectOpening(op){State.currentOpening=op;State.openingStep=0;State.openingBoard.orientation(op.color==='black'?'black':'white');updateOpeningStep();}
function updateOpeningStep(){
  const op=State.currentOpening; if(!op)return;
  const game=new Chess();
  for(let i=0;i<State.openingStep;i++) game.move(op.moves[i]);
  State.openingBoard.position(game.fen(),false);
  const tip=document.getElementById('opening-tip'); tip.style.display='block';
  if(State.openingStep<op.moves.length){const side=State.openingStep%2===0?'White':'Black';tip.textContent=`Move ${State.openingStep+1}: ${side} plays ${op.moves[State.openingStep]}  ·  ${op.tip}`;}
  else{tip.textContent=`✅ Opening complete! ${op.tip}`;}
}
document.getElementById('op-next').addEventListener('click',()=>{if(State.currentOpening&&State.openingStep<State.currentOpening.moves.length){State.openingStep++;updateOpeningStep();}});
document.getElementById('op-prev').addEventListener('click',()=>{if(State.openingStep>0){State.openingStep--;updateOpeningStep();}});
document.getElementById('op-reset').addEventListener('click',()=>{if(State.currentOpening){State.openingStep=0;updateOpeningStep();}});

/* ── PROGRESS ─────────────────────────────────────────────────────────────── */
function renderProgressPage(){
  if(!State.loggedIn){showEl('progress-guest');hideEl('progress-content');}
  else{hideEl('progress-guest');showEl('progress-content');}
}
function renderSavedGames(games){
  const list=document.getElementById('saved-games-list'); if(!list)return;
  list.innerHTML='';
  if(!games.length){list.innerHTML='<p style="color:var(--muted);font-size:.85rem">No saved games yet. Analyse a game and click Save!</p>';return;}
  [...games].reverse().forEach(g=>{
    const d=new Date(g.saved*1000).toLocaleDateString();
    const item=document.createElement('div'); item.className='saved-game-item';
    item.innerHTML=`<div class="saved-game-info"><div>${esc(g.label)}</div><div class="saved-game-date">${d}</div></div><button class="load-btn">Load →</button>`;
    item.querySelector('button').addEventListener('click',()=>{document.getElementById('pgn-text').value=g.pgn;State.lastPGN=g.pgn;showPage('analyze');hideEl('step2-card');hideEl('step3-card');hideEl('results');});
    list.appendChild(item);
  });
}

/* ── TRAINING ─────────────────────────────────────────────────────────────── */
function renderTrainingPage(training){
  hideEl('no-training'); showEl('training-content');
  const list=document.getElementById('training-list'); list.innerHTML='';
  (training||[]).forEach(item=>{
    const drills=(item.drills||[]).map(d=>`<li>${esc(d)}</li>`).join('');
    list.innerHTML+=`<div class="training-item"><span class="t-priority ${item.priority}">${item.priority}</span><div class="t-title">${esc(item.title)}</div><div class="t-desc">${esc(item.description)}</div><ul class="t-drills">${drills}</ul></div>`;
  });
}

/* ── Init ─────────────────────────────────────────────────────────────────── */
checkSession();
