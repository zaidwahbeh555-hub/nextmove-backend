/* ChessForge Pro v6 — Complete JS */
const PIECE_THEME = 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png';

const State = {
  xp:0, user:null, loggedIn:false, plan:'free', pendingUpgrade:false,
  analysisData:null, lastPGN:'', lastPlayerColor:null, lastUploadedFile:null, lastActiveTab:'paste',
  replayMoves:[], replayPly:-1, replayBoard:null, replayGame:null,
  replayPaused:false, currentCritical:null,
  puzzles:[], puzzleIdx:0, puzzleBoard:null, puzzleGame:null,
  puzzleCorrect:0, puzzleWrong:0, selectedSquare:null,
  completedLessons:[], lessonOrder:[],
  boardsReady:{replay:false,puzzle:false},
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
  document.getElementById('user-xp-label').textContent=(State.plan==='pro'?'⭐ Pro · ':'')+val+' XP';
  document.getElementById('xp-fill').style.width=Math.min((val%500)/500*100,100)+'%';
}
async function awardXP(amount,type,lessonId){
  State.xp+=amount; setXP(State.xp);
  if(State.loggedIn){
    const body={amount,type};if(lessonId)body.lesson_id=lessonId;
    try{
      const r=await fetch('/auth/add-xp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'include'});
      const d=await r.json();
      if(d.xp!==undefined)setXP(d.xp);
      if(type==='lesson'&&lessonId&&!State.completedLessons.includes(lessonId)){
        State.completedLessons.push(lessonId);
        document.querySelectorAll(`[data-lesson="${lessonId}"]`).forEach(el=>el.classList.add('completed'));
        const el=document.getElementById('pg-lessons');if(el)el.textContent=State.completedLessons.length;
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
  const err=document.getElementById('login-error');err.textContent='';
  if(!u||!p){err.textContent='Please enter username and password.';return;}
  try{
    const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p}),credentials:'include'});
    const d=await r.json();if(d.error){err.textContent=d.error;return;}
    applySession(d);hideAuthModal();
  }catch(e){err.textContent='Connection error. Please try again.';}
});

document.getElementById('register-btn').addEventListener('click',async()=>{
  const u=document.getElementById('reg-username').value.trim();
  const em=document.getElementById('reg-email').value.trim();
  const p=document.getElementById('reg-password').value;
  const err=document.getElementById('register-error');err.textContent='';
  if(!u||!p){err.textContent='Please enter username and password.';return;}
  if(!em){err.textContent='Email is required — we use it to link your subscription.';return;}
  if(!em.includes('@')||!em.includes('.')){err.textContent='Please enter a valid email address.';return;}
  try{
    const r=await fetch('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,email:em,password:p}),credentials:'include'});
    const d=await r.json();if(d.error){err.textContent=d.error;return;}
    applySession(d);hideAuthModal();
  }catch(e){err.textContent='Connection error. Please try again.';}
});

document.getElementById('skip-auth').addEventListener('click',hideAuthModal);

document.getElementById('logout-btn').addEventListener('click',async()=>{
  await fetch('/auth/logout',{method:'POST',credentials:'include'});
  State.loggedIn=false;State.user=null;State.plan='free';
  document.getElementById('user-name').textContent='Guest';
  document.getElementById('user-avatar').textContent='?';
  setXP(0);showAuthModal();
});

function applySession(d){
  State.loggedIn=true;State.user=d.username;State.plan=d.plan||'free';
  document.getElementById('user-name').textContent=d.username;
  document.getElementById('user-avatar').textContent=d.username[0].toUpperCase();
  setXP(d.xp||0);
  State.completedLessons=d.progress?.lessons_completed||[];
  const upgradeBtn=document.getElementById('upgrade-btn');
  if(upgradeBtn)upgradeBtn.style.display=State.plan==='pro'?'none':'block';
  // Show cancel button for pro users
  let cancelBtn = document.getElementById('cancel-sub-btn');
  if(State.plan==='pro'){
    if(!cancelBtn){
      cancelBtn=document.createElement('button');
      cancelBtn.id='cancel-sub-btn';
      cancelBtn.className='logout-btn';
      cancelBtn.style.marginBottom='.4rem';
      cancelBtn.textContent='Cancel Pro';
      cancelBtn.onclick=cancelSubscription;
      const homeBtn=document.querySelector('.home-btn');
      if(homeBtn)homeBtn.parentNode.insertBefore(cancelBtn,homeBtn);
    }
  } else {
    if(cancelBtn) cancelBtn.remove();
  }
  if(d.progress){
    const p=d.progress;
    [['pg-games',p.games_analysed],['pg-blunders',p.blunders_found],['pg-puzzles',p.puzzles_solved],['pg-lessons',(p.lessons_completed||[]).length]].forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=v||0;});
  }
  if(d.games)renderSavedGames(d.games);
  hideEl('progress-guest');showEl('progress-content');
  document.getElementById('save-game-btn').style.display='inline-flex';
  if(State.pendingUpgrade&&State.plan!=='pro'){State.pendingUpgrade=false;setTimeout(()=>goToPro(),500);}
  setTimeout(checkOnboarding, 1500);
}

async function checkSession(){
  try{
    const r=await fetch('/auth/me',{credentials:'include'});
    const d=await r.json();
    if(d.loggedIn)applySession(d);else showAuthModal();
  }catch(e){showAuthModal();}
  return true;
}

/* ── Plan / Upgrade ───────────────────────────────────────────────────────── */
async function goToPro(){
  if(!State.loggedIn){showAuthModal();return;}
  try{
    const r=await fetch('/create-checkout-session',{method:'POST',credentials:'include'});
    const d=await r.json();
    if(d.error){alert(d.error);return;}
    window.location.href=d.url;
  }catch(e){alert('Could not start checkout. Please try again.');}
}

function showUpgradePrompt(msg){
  const existing=document.getElementById('upgrade-prompt');if(existing)existing.remove();
  const div=document.createElement('div');div.id='upgrade-prompt';
  div.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
  div.innerHTML=`<div style="background:#111118;border:1px solid #2a2a3a;border-radius:16px;padding:2.5rem;width:420px;max-width:95vw;text-align:center;box-shadow:0 0 60px rgba(0,212,255,.08)">
    <div style="font-size:2.5rem;margin-bottom:1rem">⚡</div>
    <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:.5rem;color:#00d4ff">Upgrade to Grandmaster</h2>
    <p style="color:#666680;font-size:.9rem;margin-bottom:1.5rem">${msg||'You have reached your free plan limit. Upgrade for unlimited analysis.'}</p>
    <div style="background:#18181f;border:1px solid #2a2a3a;border-radius:10px;padding:1.2rem;margin-bottom:1.5rem;text-align:left">
      <div style="color:#00d4ff;font-weight:700;font-size:1.1rem;margin-bottom:.8rem">Grandmaster — $9/mo</div>
      ${['Unlimited game analysis','Full psychological profiling','Custom drill generation','Blunder pattern tracking','Opening repertoire fixes'].map(f=>`<div style="color:#e8e8f0;font-size:.85rem;padding:.2rem 0">✅ ${f}</div>`).join('')}
    </div>
    <button onclick="document.getElementById('upgrade-prompt').remove();goToPro()" style="width:100%;background:#00d4ff;color:#000;border:none;border-radius:10px;padding:.85rem;font-weight:700;font-size:.95rem;cursor:pointer;margin-bottom:.8rem">Get Pro Access — $9/mo ⚡</button>
    <button onclick="document.getElementById('upgrade-prompt').remove()" style="background:transparent;border:none;color:#666680;font-size:.82rem;cursor:pointer;text-decoration:underline">Maybe later</button>
  </div>`;
  document.body.appendChild(div);
}

// Handle ?upgrade=true and ?payment=success in URL
(function(){
  const params=new URLSearchParams(window.location.search);
  if(params.get('upgrade')==='true'){
    window.history.replaceState({},'','/');
    State.pendingUpgrade=true;
  }
  if(params.get('payment')==='success'){
    window.history.replaceState({},'','/');
    setTimeout(()=>{
      const div=document.createElement('div');
      div.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#00d4ff;color:#000;padding:1rem 2rem;border-radius:10px;font-weight:700;font-size:1rem;z-index:9999;box-shadow:0 4px 20px rgba(0,212,255,.4)';
      div.textContent='🎉 Welcome to ChessForge Pro! Your account has been upgraded.';
      document.body.appendChild(div);
      setTimeout(()=>div.remove(),5000);
    },1000);
  }
})();

/* ── Nav ──────────────────────────────────────────────────────────────────── */
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  const lnk=document.querySelector(`[data-page="${name}"]`);if(lnk)lnk.classList.add('active');
  setTimeout(()=>{
    if(name==='replay')initReplayBoard();
    if(name==='puzzles')initPuzzleBoard();
    if(name==='lessons')initLessonsPage();
    if(name==='progress')renderProgressPage();
    if(name==='bot')initBotPage();
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

/* ── PGN auto-detect ──────────────────────────────────────────────────────── */
document.getElementById('pgn-text').addEventListener('input',function(){
  const wm=this.value.match(/\[White\s+"([^"]+)"\]/);
  const bm=this.value.match(/\[Black\s+"([^"]+)"\]/);
  if((wm||bm)&&!document.getElementById('username-badge')?.dataset.set){
    const badge=document.createElement('span');badge.className='username-badge';
  }
});

/* ── Step 1: Parse PGN ─────────────────────────────────────────────────────── */
document.getElementById('parse-btn').addEventListener('click',async()=>{
  const btn=document.getElementById('parse-btn');
  const spinner=document.getElementById('parse-spinner');
  const btnText=document.getElementById('parse-btn-text');
  const errBox=document.getElementById('parse-error');
  const activeTab=document.querySelector('#page-analyze .tab.active').dataset.tab;
  const fd=new FormData();
  State.lastActiveTab=activeTab;
  if(activeTab==='paste'){
    const pgn=document.getElementById('pgn-text').value.trim();
    if(!pgn){showParseError('Please paste a PGN game first.');return;}
    State.lastPGN=pgn;State.lastUploadedFile=null;fd.append('pgn_text',pgn);
  } else {
    const f=document.getElementById('pgn-file').files[0];
    if(!f){showParseError('Please select a PGN file.');return;}
    State.lastUploadedFile=f;State.lastPGN='';fd.append('pgn_file',f);
  }
  errBox.classList.add('hidden');
  btn.disabled=true;spinner.classList.add('on');btnText.textContent='Reading game…';
  try{
    const r=await fetch('/parse-pgn',{method:'POST',body:fd,credentials:'include'});
    const d=await r.json();
    if(!r.ok||d.error){showParseError(d.error||'Could not read the PGN.');return;}
    showPlayerSelection(d);
  }catch(e){showParseError('Network error: '+e.message);}
  finally{btn.disabled=false;spinner.classList.remove('on');btnText.textContent='Load Game →';}
});

function showParseError(msg){const b=document.getElementById('parse-error');b.textContent='⚠ '+msg;b.classList.remove('hidden');}

function showPlayerSelection(data){
  const card=document.getElementById('step2-card');card.classList.remove('hidden');
  const row=document.getElementById('player-select-row');
  const info=document.getElementById('game-info-row');
  let infoHtml='';
  if(data.event&&data.event!=='?')infoHtml+=`<span>📋 ${esc(data.event)}</span>`;
  if(data.date&&data.date!=='?')infoHtml+=`<span>📅 ${esc(data.date)}</span>`;
  info.innerHTML=infoHtml;
  row.innerHTML='';
  [{color:'white',name:data.white,label:'⬜ White'},{color:'black',name:data.black,label:'⬛ Black'}].forEach(p=>{
    if(!p.name)return;
    const btn=document.createElement('button');btn.className=`player-btn ${p.color}-btn`;
    btn.innerHTML=`<div class="player-btn-color">${p.label}</div><div class="player-btn-name">${esc(p.name)}</div>`;
    btn.addEventListener('click',()=>{row.querySelectorAll('.player-btn').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');setTimeout(()=>runAnalysis(p.color),300);});
    row.appendChild(btn);
  });
  const bothBtn=document.createElement('button');bothBtn.className='player-btn';
  bothBtn.innerHTML=`<div class="player-btn-color">Both sides</div><div class="player-btn-name">Analyse everyone</div>`;
  bothBtn.addEventListener('click',()=>{row.querySelectorAll('.player-btn').forEach(b=>b.classList.remove('selected'));bothBtn.classList.add('selected');setTimeout(()=>runAnalysis(''),300);});
  row.appendChild(bothBtn);
  card.scrollIntoView({behavior:'smooth',block:'start'});
}

/* ── Step 2: Run Analysis ──────────────────────────────────────────────────── */
async function runAnalysis(playerColor){
  const step3=document.getElementById('step3-card');step3.classList.remove('hidden');
  step3.scrollIntoView({behavior:'smooth',block:'start'});
  const fd=new FormData();
  if(State.lastUploadedFile)fd.append('pgn_file',State.lastUploadedFile);
  else fd.append('pgn_text',State.lastPGN);
  if(playerColor)fd.append('player_color',playerColor);
  State.lastPlayerColor=playerColor||null;
  try{
    const r=await fetch('/analyse',{method:'POST',body:fd,credentials:'include'});
    const d=await r.json();
    step3.classList.add('hidden');
    if(r.status===403&&d.upgrade){showUpgradePrompt(d.message);return;}
    if(!r.ok||d.error){showParseError(d.error||'Analysis failed.');return;}
    State.analysisData=d;
    renderAnalysis(d);
    showEl('results');
    if(State.loggedIn)document.getElementById('save-game-btn').style.display='inline-flex';
    if(d.xp)setXP(d.xp);
    // Auto-save game after analysis
    if(State.loggedIn && State.lastPGN){
      const metas=d.game_metas||[];
      const label=metas.length?`${metas[0].white} vs ${metas[0].black} (${metas[0].date})`:'Game';
      fetch('/auth/save-game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pgn:State.lastPGN,label}),credentials:'include'}).then(r=>r.json()).then(d=>{if(d.games)renderSavedGames(d.games);}).catch(()=>{});
    }
    if(d.plan==='free'&&d.games_today!==undefined){
      const remaining=Math.max(0,d.daily_limit-d.games_today);
      if(remaining===0){
        const prompt=document.getElementById('upgrade-training-prompt');
        if(prompt)prompt.classList.remove('hidden');
      }
    }
    setTimeout(()=>document.getElementById('results').scrollIntoView({behavior:'smooth'}),100);
  }catch(e){step3.classList.add('hidden');showParseError('Analysis error: '+e.message);}
}

/* ── Save Game ─────────────────────────────────────────────────────────────── */
document.getElementById('save-game-btn').addEventListener('click',async()=>{
  if(!State.loggedIn){showAuthModal();return;}
  if(!State.lastPGN){const b=document.getElementById('save-game-btn');b.textContent='⚠ Analyse a game first!';setTimeout(()=>b.textContent='💾 Save Game',2000);return;}
  const metas=State.analysisData?.game_metas||[];
  const label=metas.length?`${metas[0].white} vs ${metas[0].black} (${metas[0].date})`:'Game';
  try{
    const r=await fetch('/auth/save-game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pgn:State.lastPGN,label}),credentials:'include'});
    const d=await r.json();
    if(d.ok){
      const b=document.getElementById('save-game-btn');b.textContent='✅ Saved!';
      setTimeout(()=>b.textContent='💾 Save Game',2000);
      if(d.games)renderSavedGames(d.games);
    }
  }catch(e){}
});

/* ── Render Analysis ───────────────────────────────────────────────────────── */
function renderAnalysis(data){
  const icons={'Reckless Gambler':'🎲','Tactical Dreamer':'🔍','Opening Adventurer':'🗺','Middlegame Fighter':'⚔','Daring Attacker':'🔥','Solid but Passive':'🛡','Balanced Player':'⚖'};
  document.getElementById('profile-icon').textContent=icons[data.profile.style]||'♟';
  document.getElementById('profile-style').textContent=data.profile.style;
  document.getElementById('profile-desc').textContent=data.profile.description;
  const cb=document.getElementById('player-color-badge');cb.innerHTML='';
  const pc=data.player_color;
  if(pc){const b=document.createElement('span');b.className='color-badge '+pc;b.textContent=pc==='white'?'⬜ Analysed as White':'⬛ Analysed as Black';cb.appendChild(b);}
  const sev=data.severity_counts||{};
  document.getElementById('s-blunder').textContent=sev.blunder||0;
  document.getElementById('s-mistake').textContent=sev.mistake||0;
  document.getElementById('s-inaccuracy').textContent=sev.inaccuracy||0;
  document.getElementById('s-total').textContent=data.total_mistakes||0;
  const wl=document.getElementById('weaknesses-list');wl.innerHTML='';
  const ranks=['①','②','③'];
  (data.top_weaknesses||[]).forEach(([name,count],i)=>{
    const pct=data.total_mistakes>0?Math.round(count/data.total_mistakes*100):0;
    const bp=(data.top_weaknesses[0]?.[1]||1)>0?Math.round(count/data.top_weaknesses[0][1]*100):0;
    wl.innerHTML+=`<div class="weakness-item"><span class="weakness-rank">${ranks[i]||i+1}</span><div class="weakness-info"><div class="weakness-name">${esc(name)}</div><div class="weakness-count">${count} occurrence${count!==1?'s':''} · ${pct}% of errors</div></div><div class="weakness-bar-bg"><div class="weakness-bar" style="width:${bp}%"></div></div></div>`;
  });
  if(!(data.top_weaknesses?.length))wl.innerHTML='<p style="color:var(--muted);font-size:.85rem;padding:.4rem 0">No major patterns — strong game!</p>';
  const pb=document.getElementById('phase-bars');pb.innerHTML='';
  [{key:'opening',label:'Opening (1–10)'},{key:'middlegame',label:'Middlegame (11–30)'},{key:'endgame',label:'Endgame (31+)'}].forEach(({key,label})=>{
    const c=data.phase_counts[key]||0;
    const maxP=Math.max(...Object.values(data.phase_counts||{}),1);
    pb.innerHTML+=`<div class="phase-row"><span class="phase-label">${label}</span><div class="phase-bar-bg"><div class="phase-bar-fill ${key}" style="width:${Math.round(c/maxP*100)}%"></div></div><span class="phase-count">${c}</span></div>`;
  });
  const pg=document.getElementById('pattern-grid');pg.innerHTML='';
  Object.entries(data.pattern_counts||{}).sort((a,b)=>b[1]-a[1]).forEach(([n,c])=>{pg.innerHTML+=`<div class="chip"><span class="chip-name">${esc(n)}</span><span class="chip-count">${c}</span></div>`;});
  // Training inline
  renderTrainingInline(data.training);
  // Cognitive fingerprint
  if(data.cognitive_fingerprint) renderCognitiveFingerprint(data.cognitive_fingerprint);
  // Lesson order
  State.lessonOrder=data.lessons||Object.keys(LESSONS);
  // Puzzles
  if(data.puzzles?.length){
    State.puzzles=data.puzzles;State.puzzleIdx=0;State.puzzleCorrect=0;State.puzzleWrong=0;
    State.boardsReady.puzzle=false;
    hideEl('no-puzzles');showEl('puzzle-area');
    document.getElementById('puzzle-total').textContent=data.puzzles.length;
  }
  // Replay
  if(data.games_moves?.length){
    State.replayMoves=data.games_moves[0];State.replayPly=-1;State.boardsReady.replay=false;
    buildMoveList();
    document.getElementById('go-replay-btn').style.display='inline-flex';
    document.getElementById('go-lessons-btn').style.display='inline-flex';
  }
}

function renderTrainingInline(training){
  const list=document.getElementById('training-inline-list');list.innerHTML='';
  (training||[]).forEach(item=>{
    const drills=(item.drills||[]).map(d=>`<li>${esc(d)}</li>`).join('');
    list.innerHTML+=`<div class="training-item"><span class="t-priority ${item.priority}">${item.priority}</span><div class="t-title">${esc(item.title)}</div><div class="t-desc">${esc(item.description)}</div><ul class="t-drills">${drills}</ul></div>`;
  });
}

/* ── REPLAY ───────────────────────────────────────────────────────────────── */
function initReplayBoard(){
  if(State.replayBoard){try{State.replayBoard.destroy();}catch(e){}State.replayBoard=null;}
  State.replayBoard=Chessboard('replay-board',{position:'start',pieceTheme:PIECE_THEME});
  State.boardsReady.replay=true;
  if(State.replayMoves.length)goToPly(0);
  else document.getElementById('replay-move-label').textContent='No game loaded — analyse a game first.';
}

function buildMoveList(){
  const ml=document.getElementById('move-list');ml.innerHTML='';
  State.replayMoves.forEach((m,ply)=>{
    if(ply%2!==0)return;
    const bm=State.replayMoves[ply+1];
    const row=document.createElement('div');row.className='move-row';
    row.innerHTML=`<span class="move-num">${m.move_number}.</span><span class="move-san ${m.severity||''}" data-ply="${ply}">${esc(m.san)}</span>${bm?`<span class="move-san ${bm.severity||''}" data-ply="${ply+1}">${esc(bm.san)}</span>`:'<span></span>'}`;
    ml.appendChild(row);
  });
  ml.addEventListener('click',e=>{
    const ply=parseInt(e.target.dataset.ply);
    if(!isNaN(ply)){if(!State.boardsReady.replay)showPage('replay');else goToPly(ply);}
  });
}

function goToPly(ply){
  if(!State.replayBoard||!State.replayMoves.length)return;
  const game=new Chess();
  for(let i=0;i<=ply&&i<State.replayMoves.length;i++){if(!game.move(State.replayMoves[i].san))break;}
  State.replayPly=ply;State.replayGame=game;
  State.replayBoard.position(game.fen(),false);
  updateReplayInfo();
  // Check for blunder — show critical moment modal
  const m=State.replayMoves[ply];
  if(m&&m.severity==='blunder'&&m.best_move){
    showCriticalModal(m);
  }
  // Highlight in move list
  document.querySelectorAll('.move-san').forEach(el=>el.classList.remove('active-move'));
  const active=document.querySelector(`[data-ply="${ply}"]`);
  if(active){
    active.classList.add('active-move');
    const card=document.querySelector('.move-list-card');
    if(card){const top=active.getBoundingClientRect().top-card.getBoundingClientRect().top+card.scrollTop-card.clientHeight/2;card.scrollTo({top,behavior:'smooth'});}
  }
}

function updateReplayInfo(){
  const el=document.getElementById('replay-move-label');
  const moves=State.replayMoves;const ply=State.replayPly;
  if(!moves.length){el.textContent='No game loaded — analyse a game first.';return;}
  if(ply<0){el.textContent='Starting position — press ▶ to begin';return;}
  if(ply>=moves.length){el.textContent='End of game';return;}
  const m=moves[ply];
  let t=`Move ${m.move_number} · ${cap(m.side)}: ${m.san}`;
  if(m.severity==='blunder')t+='  🔴 Blunder!';
  else if(m.severity==='mistake')t+='  🟠 Mistake';
  else if(m.severity==='inaccuracy')t+='  🟡 Inaccuracy';
  if(m.best_move&&m.severity)t+=`  · Best: ${m.best_move}`;
  el.textContent=t;
}

/* ── Critical Moment Modal ─────────────────────────────────────────────────── */
function showCriticalModal(move){
  // This is called when a blunder is detected in replay
  const modal = document.getElementById('critical-modal');
  const board = document.getElementById('replay-board');
  if(board){
    const rect = board.getBoundingClientRect();
    const inner = modal.querySelector('.critical-inner');
    if(inner){
      // Show below the board controls
      inner.style.maxWidth = '520px';
    }
  }
  State.currentCritical=move;
  State.replayPaused=true;
  document.getElementById('critical-side').textContent=cap(move.side);
  document.getElementById('critical-move-played').textContent=move.san;
  document.getElementById('critical-answer').classList.add('hidden');
  document.getElementById('critical-modal').classList.remove('hidden');
}

function hideCriticalModal(){
  document.getElementById('critical-modal').classList.add('hidden');
  State.replayPaused=false;
}

function showCriticalAnswer(){
  const m=State.currentCritical;if(!m)return;
  document.getElementById('critical-best-move').textContent=m.best_move||'—';
  document.getElementById('critical-explanation').textContent=m.threat_desc||`You played ${m.san}. The engine recommends ${m.best_move} — a ${m.drop_cp} centipawn improvement.`;
  document.getElementById('critical-answer').classList.remove('hidden');
  // Change button to "Continue Replay"
  const actions = document.querySelector('.critical-actions');
  if(actions) actions.innerHTML = '<button class="btn-cyan" onclick="hideCriticalModal()" style="width:auto;margin-top:0">Continue Replay →</button>';
}

document.getElementById('r-start').addEventListener('click',()=>{if(!State.replayBoard)return;State.replayPly=-1;State.replayBoard.position('start',false);updateReplayInfo();document.querySelectorAll('.move-san').forEach(el=>el.classList.remove('active-move'));});
document.getElementById('r-prev').addEventListener('click',()=>{if(State.replayPaused)return;if(State.replayPly>0)goToPly(State.replayPly-1);else if(State.replayPly===0){State.replayPly=-1;if(State.replayBoard)State.replayBoard.position('start',false);updateReplayInfo();}});
document.getElementById('r-next').addEventListener('click',()=>{if(State.replayPaused)return;if(State.replayMoves.length&&State.replayPly<State.replayMoves.length-1)goToPly(State.replayPly+1);});
document.getElementById('r-end').addEventListener('click',()=>{if(State.replayMoves.length)goToPly(State.replayMoves.length-1);});
document.getElementById('go-replay-btn').addEventListener('click',()=>showPage('replay'));
document.getElementById('go-lessons-btn').addEventListener('click',()=>showPage('lessons'));
document.addEventListener('keydown',e=>{
  const pg=document.querySelector('.page.active');if(!pg)return;
  if(pg.id==='page-replay'&&!State.replayPaused){
    if(e.key==='ArrowRight')document.getElementById('r-next').click();
    if(e.key==='ArrowLeft')document.getElementById('r-prev').click();
  }
});

/* ── PUZZLES with click-to-move ───────────────────────────────────────────── */
function initPuzzleBoard(){
  if(State.boardsReady.puzzle&&State.puzzleBoard){if(State.puzzles.length)loadPuzzle(State.puzzleIdx);return;}
  if(State.puzzleBoard){try{State.puzzleBoard.destroy();}catch(e){}}
  State.puzzleGame=new Chess();
  State.puzzleBoard=Chessboard('puzzle-board',{
    position:'start',draggable:true,pieceTheme:PIECE_THEME,
    onDrop:handlePuzzleDrop,
    onSnapEnd:()=>{if(State.puzzleGame)State.puzzleBoard.position(State.puzzleGame.fen());},
    onSquareClick:handlePuzzleSquareClick,
  });
  State.boardsReady.puzzle=true;
  if(State.puzzles.length)loadPuzzle(State.puzzleIdx);
}

function handlePuzzleSquareClick(square){
  if(!State.puzzleGame||!State.puzzleBoard)return;
  const piece=State.puzzleGame.get(square);
  // Clicking selected square = deselect
  if(State.selectedSquare===square){
    clearHighlights();
    return;
  }
  // Have a piece selected — try to move to clicked square
  if(State.selectedSquare){
    const src=State.selectedSquare;
    clearHighlights();
    // Try the move
    const mv=State.puzzleGame.move({from:src,to:square,promotion:'q'});
    if(mv){
      // Valid move made
      State.puzzleBoard.position(State.puzzleGame.fen(),false);
      const p=State.puzzles[State.puzzleIdx];
      const uci=src+square;
      const solUCI=p?p.solution.toLowerCase().replace(/[+#=qrbn]/g,'').slice(0,4):'';
      const ok=p&&(mv.san===p.solution||uci===solUCI);
      const status=document.getElementById('puzzle-status');
      if(ok){status.textContent='✅ Correct! Well done!';status.style.color='var(--green)';State.puzzleCorrect++;awardXP(50,'puzzle');}
      else{status.textContent=`❌ Not quite (${mv.san}) — try again!`;status.style.color='var(--red)';State.puzzleWrong++;State.puzzleGame.undo();State.puzzleBoard.position(State.puzzleGame.fen(),false);}
      document.getElementById('p-correct').textContent=State.puzzleCorrect;
      document.getElementById('p-wrong').textContent=State.puzzleWrong;
    } else {
      // Invalid move — maybe selecting a new piece
      if(piece && piece.color===State.puzzleGame.turn()){
        State.selectedSquare=square;
        highlightMoves(square);
      }
    }
    return;
  }
  // No piece selected — select if it is the right color
  if(piece && piece.color===State.puzzleGame.turn()){
    State.selectedSquare=square;
    highlightMoves(square);
  }
}

function highlightMoves(square){
  const moves=State.puzzleGame.moves({square,verbose:true});
  if(!moves.length)return;
  // Use chessboard.js square elements (they have class like "square-e4")
  const selEl=document.querySelector(`#puzzle-board .square-${square}`);
  if(selEl)selEl.style.boxShadow='inset 0 0 0 4px rgba(0,212,255,.9)';
  moves.forEach(m=>{
    const el=document.querySelector(`#puzzle-board .square-${m.to}`);
    if(el){
      const dot=document.createElement('div');
      dot.className='move-dot';
      dot.style.cssText='position:absolute;width:33%;height:33%;background:rgba(0,212,255,.45);border-radius:50%;top:33%;left:33%;pointer-events:none;z-index:10';
      el.style.position='relative';el.appendChild(dot);
    }
  });
}

function clearHighlights(){
  // Clear puzzle board highlights
  document.querySelectorAll('#puzzle-board .square-55d63').forEach(el=>{el.style.boxShadow='';});
  // Also try data-square approach
  document.querySelectorAll('#puzzle-board [class*="square-"]').forEach(el=>{el.style.boxShadow='';});
  document.querySelectorAll('.move-dot').forEach(el=>el.remove());
  State.selectedSquare=null;
}

function loadPuzzle(idx){
  if(idx>=State.puzzles.length||!State.puzzleBoard)return;
  const p=State.puzzles[idx];
  State.puzzleGame=new Chess(p.fen);
  State.puzzleBoard.orientation(p.side==='white'?'white':'black');
  State.puzzleBoard.position(p.fen,false);
  clearHighlights();
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
  clearHighlights();
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

document.getElementById('hint-btn').addEventListener('click',()=>{
  const p=State.puzzles[State.puzzleIdx];if(!p)return;
  const h=document.getElementById('puzzle-hint-text');h.classList.remove('hidden');
  h.textContent=`💡 Best move: ${p.solution}`;
});
document.getElementById('next-puzzle-btn').addEventListener('click',async()=>{
  if(!State.puzzles.length)return;
  State.puzzleIdx++;
  if(State.puzzleIdx >= State.puzzles.length){
    // Fetch more puzzles
    document.getElementById('puzzle-status').textContent='Loading more puzzles…';
    const got = await fetchMorePuzzles();
    if(!got) State.puzzleIdx = 0; // loop back
  }
  loadPuzzle(State.puzzleIdx);
});

/* ── LESSONS DATA ─────────────────────────────────────────────────────────── */
const LESSONS={
  tactics:{title:'Tactics: Forks, Pins & Skewers',subtitle:'The most powerful short-term weapons in chess',priority:'high',icon:'⚔',sections:[
    {heading:'What are tactics?',body:'Tactics are short sequences of moves that win material or force checkmate. Unlike strategy, tactics are concrete and decisive. <strong>Most club-level games are decided by tactics</strong> — either a player spots one, or falls into one.'},
    {heading:'The Fork',body:'A fork attacks two or more enemy pieces simultaneously. The opponent can only save one — you win the other. <strong>Knights are the best forking pieces</strong> because their L-shaped movement is easy to overlook.'},
    {tip:'Before every move, ask: "Can any of my pieces attack two things at once from any square?"'},
    {heading:'The Pin',body:'A pin attacks a piece that cannot move without exposing something more valuable behind it. <strong>Absolute pins</strong> involve the king — the piece literally cannot move. <strong>Relative pins</strong> involve a queen or other valuable piece.'},
    {heading:'The Skewer',body:'A skewer is a reverse pin — you attack a valuable piece, it moves, and you win what was behind it. Bishops and rooks are most effective at creating skewers.'},
    {heading:'Discovered attacks',body:'A discovered attack occurs when you move one piece to uncover an attack from another piece behind it. The moved piece can simultaneously create its own threat, making discovered attacks extremely powerful.'},
    {heading:'How to spot tactics',body:'',steps:['After every opponent move: "Did they create any new weakness?"','Scan for ALL undefended pieces on both sides','Look for pieces lined up on the same rank, file, or diagonal','Ask: "If I could play anything, what would win immediately?"','Check if the opponent\'s king has escape squares']},
    {warning:'The #1 reason players miss tactics: they stop looking after finding one candidate move. Always check if something stronger exists.'},
    {heading:'Your daily drill',body:'<strong>Solve 10 puzzles every day.</strong> 10 minutes of consistent daily practice will transform your tactical vision within 2-3 months. Your Puzzles tab has positions from YOUR actual games.'},
  ]},
  blunders:{title:'How to Stop Blundering',subtitle:'The single biggest rating booster at every level',priority:'high',icon:'🚫',sections:[
    {heading:'Why we blunder',body:'Blunders rarely happen because you dont know chess — they happen because you didn\'t check before moving. The most common causes: moving too fast, emotional reactions, not scanning the whole board, and "hope chess" (assuming the opponent wont find the response).'},
    {heading:'The one-move check — do this EVERY move',body:'Before touching any piece, run this mental checklist:',steps:['<strong>Am I walking into check or losing a piece immediately?</strong>','<strong>Did my move leave anything undefended?</strong> Scan all your pieces.','<strong>What is my opponent threatening on their next move?</strong>','<strong>Is my king safe?</strong>','Only then — make the move.']},
    {tip:'The chess engine makes its move instantly. The difference isnt speed — its that the engine checks everything. Slow down, even when you\'re sure.'},
    {heading:'LPDO — Loose Pieces Drop Off',body:'Before every move, identify all "loose" pieces — pieces with no defender. Loose pieces are always targets. Either defend them, move them, or trade them before your opponent wins them for free.'},
    {heading:'The 3-question blunder check',body:'',steps:['Can my opponent capture any of my pieces for free after this move?','Can my opponent check me, and if so, where does my king go?','Did I just leave something hanging that was defended before?']},
    {warning:'If you ever say "I didn\'t see that" after a game — you weren\'t looking. Train yourself to look every time, even in completely won positions.'},
    {heading:'Time pressure',body:'<strong>Blunder rates spike dramatically in time pressure.</strong> When under 30 seconds, simplify — do not calculate complex variations. A 5-second pause before every move will cut your blunder rate by more than half.'},
  ]},
  kingsafety:{title:'King Safety',subtitle:'Your king is not a piece to play with — until the endgame',priority:'high',icon:'👑',sections:[
    {heading:'Why king safety is everything',body:'Chess has one goal: checkmate the king. Every other advantage only matters if your king survives to use it. A single king safety lapse can undo 30 perfect moves.'},
    {heading:'Rule 1: Castle in the first 10 moves',body:'Castling moves your king to safety AND connects your rooks. There\'s almost never a valid reason to delay castling past move 10. Castle as soon as your minor pieces are developed.'},
    {tip:'If you\'re past move 10 and haven\'t castled, ask yourself why. If there\'s no concrete tactical reason — castle immediately.'},
    {heading:'Rule 2: Don\'t move castled pawns',body:'The pawns in front of your castled king are its bodyguards. Moving them without a specific concrete reason creates permanent weaknesses your opponent will target all game.'},
    {warning:'Never push h3 or g4 "just to give the king air" in the early middlegame. It weakens your king far more than it helps.'},
    {heading:'Rule 3: Watch the back rank',body:'Once pieces are exchanged, your back rank becomes a target. If your king is behind unmoved pawns, a rook or queen can deliver back-rank mate. Play h3 or g3 early in rook endgames to create an escape square.'},
    {heading:'Signs your king is in danger',body:'',steps:['Opponent has rooks or queens pointing toward your king\'s wing','Your king-side pawns have moved or been traded','All your pieces are on the opposite side of the board','You cannot castle and the center files are open','Your opponent has a knight outpost near your king']},
  ]},
  openings:{title:'Opening Principles That Actually Work',subtitle:'Stop memorising moves. Start understanding why.',priority:'medium',icon:'📖',sections:[
    {heading:'Why you\'re doing openings wrong',body:'Most players try to memorise opening moves without understanding why. This falls apart the moment the opponent deviates. Instead, master these 4 principles — they apply to every opening ever played.'},
    {heading:'Principle 1: Control the center',body:'The center squares (e4, e5, d4, d5) control the most of the board. Pieces placed in or aimed at the center are significantly more powerful. Open with <strong>1.e4 or 1.d4</strong> to claim central space immediately.'},
    {tip:'A knight in the center attacks up to 8 squares. A knight on the rim attacks only 2.'},
    {heading:'Principle 2: Develop your pieces',body:'Every opening move should bring a new piece into the game. <strong>Develop knights before bishops.</strong> Aim to have all minor pieces developed and king castled within the first 10 moves.'},
    {warning:'Never move the same piece twice in the opening unless absolutely forced. Every repeated move costs you development.'},
    {heading:'Principle 3: Castle early',body:'Your king is a liability in the center. Castle within the first 8 moves in almost every game. Once castled, your king is safe and your rooks are connected.'},
    {heading:'Principle 4: No early queen',body:'Bringing the queen out early lets the opponent attack it with minor pieces while developing for free. Keep the queen back until minor pieces are active.'},
    {heading:'The correct sequence',body:'',steps:['Move 1: e4 or d4','Moves 2-3: Develop both knights','Moves 3-5: Develop both bishops','Moves 5-8: Castle','Only then: Activate the queen']},
  ]},
  capitalize:{title:'How to Punish Your Opponent\'s Mistakes',subtitle:'Turn their errors into decisive wins',priority:'medium',icon:'💥',sections:[
    {heading:'Games are given away, not won',body:'At club level, most decisive games are decided by mistakes rather than brilliant play. The player who makes the last major mistake usually loses. So two skills matter equally: avoiding your own mistakes AND capitalising on your opponent\'s.'},
    {heading:'Step 1: Ask "why did they play that?"',body:'After every opponent move, before thinking about your own plans, ask: "Why did they just do that? What are they threatening?" If you cannot find a good reason for their move, they may have blundered.'},
    {tip:'If an opponent move seems random or pointless, look harder. Either you\'re missing something, or they are.'},
    {heading:'Step 2: Check for hanging pieces',body:'When your opponent makes a suspicious move, the first thing to check: <strong>did they leave anything undefended?</strong> Capture hanging pieces immediately — dont celebrate and then forget to take them.'},
    {heading:'Step 3: Attack long-term weaknesses',body:'Not all mistakes are immediate blunders. Some create permanent weaknesses:\n\n<strong>Pawn weaknesses:</strong> Isolated, doubled, or backward pawns need constant defence.\n<strong>King exposure:</strong> Attack an uncastled or poorly-castled king relentlessly.\n<strong>Open files:</strong> If they open a file toward their own king, double rooks on it immediately.'},
    {heading:'Step 4: Don\'t let them back in',body:'The biggest mistake after your opponent blunders: letting them recover.',steps:['Simplify into a winning endgame when possible','Don\'t go for complications you haven\'t calculated','Trade pieces when ahead in material','Keep your own king safe']},
    {warning:'When you\'re winning, slow down even more than usual. Excitement causes blunders. The win isnt yours until its over.'},
  ]},
  calculation:{title:'How to Calculate Properly',subtitle:'See further, miss less, win more',priority:'high',icon:'🔢',sections:[
    {heading:'What is calculation?',body:'Calculation is the process of visualising sequences of moves in your head before making them. It\'s one of the most trainable skills in chess and directly determines your tactical strength.'},
    {heading:'The CANDIDATE method',body:'When you spot a promising position, identify 2-3 candidate moves before calculating any of them. This prevents you from tunnel-visioning on the first thing you see.',steps:['Find all forcing moves first (checks, captures, threats)','Then look for tactical ideas','Finally consider positional moves','Only then calculate each candidate in detail']},
    {tip:'The best move is rarely the first one you see. Always look for something better before committing.'},
    {heading:'Calculation discipline',body:'When calculating a line, <strong>never back out mid-calculation</strong> to check another line. Follow each variation to its logical conclusion before evaluating alternatives. This builds the mental "tree" of possibilities.'},
    {heading:'How deep should you calculate?',body:'Calculate until the position is "quiet" — no more captures, checks, or major threats. Many players stop too early and miss important continuations.'},
    {heading:'Visualisation training',body:'',steps:['Set up a position and close your eyes','Try to visualise where pieces would be after 3 moves','Open eyes and verify','Repeat — this builds your mental board'],},
    {warning:'Calculating 10 moves of a wrong variation is worse than calculating 3 moves of the right one. Quality over quantity.'},
  ]},
  threats:{title:'Evaluating Threats',subtitle:'See what your opponent is planning before its too late',priority:'high',icon:'⚠️',sections:[
    {heading:'The most important question in chess',body:'After every single opponent move, ask: <strong>"What is my opponent threatening?"</strong> This one habit will eliminate the majority of your losses. Most blunders happen not because we dont know tactics, but because we ignore the opponent\'s plans.'},
    {heading:'Types of threats',body:'<strong>Immediate threats:</strong> Can win material or checkmate next move. Must be dealt with immediately.\n\n<strong>Long-term threats:</strong> Plans the opponent is building toward. Can often be countered while making your own move.\n\n<strong>Positional threats:</strong> Subtle improvements like occupying an outpost or opening a file.'},
    {heading:'How to assess a threat',body:'When you identify a threat, ask: "If I dont respond, what happens?" Then evaluate how bad that outcome actually is. Sometimes the best response to a threat is to create a bigger counter-threat.'},
    {tip:'You dont always have to defend directly. Often the best response to a threat is a counter-attack.'},
    {heading:'The threat of the threat',body:'Advanced players think one level deeper — they consider not just the current threat, but what threat the opponent will make AFTER you respond. This prevents walking from one problem into another.'},
    {heading:'Threat evaluation checklist',body:'',steps:['What can my opponent do if I ignore their move?','Is the threat immediate or long-term?','Can I counter-attack instead of defending?','If I defend, does it create new threats for me?','After my move, what will they do next?']},
  ]},
  pieces:{title:'Using Your Pieces Effectively',subtitle:'Good pieces win games. Passive pieces lose them.',priority:'medium',icon:'♞',sections:[
    {heading:'The fundamental principle',body:'Every piece should be on its best possible square. A bad piece — a knight on the rim, a bishop blocked by its own pawns — is nearly worthless regardless of how many pieces you have. <strong>Every move, ask: "Is this piece doing its job?"</strong>'},
    {heading:'Knights: outposts are everything',body:'A knight needs a stable base to be effective. An <strong>outpost</strong> is a square in enemy territory that no enemy pawn can attack. A knight on an outpost in the center is a monster piece.'},
    {tip:'To create a knight outpost, trade the pawn that would attack it. Then march your knight in — your opponent cannot kick it out.'},
    {heading:'Bishops: open diagonals',body:'Bishops are useless when their diagonals are blocked by their own pawns. Key rule: <strong>Don\'t fix pawns on the same color as your bishop.</strong> In bishop vs knight endgames, open positions favour the bishop; closed positions favour the knight.'},
    {heading:'Rooks: open files and 7th rank',body:'A rook needs an open file to penetrate. <strong>Control of open files controls the game.</strong> Double rooks on the open file and invade to the 7th rank — a rook on the 7th rank simultaneously attacks all unmoved enemy pawns.'},
    {heading:'The queen: power with care',body:'The queen is most effective coordinating with other pieces. Don\'t bring it out early. A queen alone achieves little — its the combination of queen plus rooks, bishops, or knights that creates unstoppable threats.'},
    {heading:'Piece coordination check',body:'',steps:['Is any of my pieces doing nothing useful?','Can I trade my worst piece for a well-placed enemy piece?','Is there an outpost for a knight?','Are my rooks on open or half-open files?','Are all my pieces working toward the same plan?']},
  ]},
  endgame:{title:'Endgame Fundamentals',subtitle:'Where games are won and lost at every level',priority:'medium',icon:'🏁',sections:[
    {heading:'Why the endgame matters',body:'Most players spend 90% of study time on openings. But at club level, games reach the endgame constantly — and the player who knows basic endgame technique almost always converts the win. These are not optional extras.'},
    {heading:'Activate your king immediately',body:'In the opening and middlegame, the king hides. In the endgame, the king becomes a powerful fighting piece. <strong>The most common endgame mistake: leaving the king passive.</strong> March your king toward the center or passed pawns the moment queens come off.'},
    {tip:'Every tempo your king spends passively in the endgame is a tempo your opponent uses to activate their king or advance pawns.'},
    {heading:'The opposition',body:'When two kings face each other with one square between them, the player who must move is "in opposition" and loses ground. In king-and-pawn endgames, gaining the opposition is often decisive. Practice K+P vs K until you win or draw from any position automatically.'},
    {heading:'Passed pawns must be pushed',body:'A passed pawn (no enemy pawn can stop it queening) is a massive advantage — but only if you advance it. Push passed pawns immediately and relentlessly.'},
    {heading:'Rook endgames essentials',body:'<strong>Rooks belong behind passed pawns</strong> (yours or your opponent\'s).\n<strong>Know the Lucena and Philidor positions</strong> cold — the two most important rook endgame techniques.'},
    {heading:'Simplify when winning',body:'',steps:['When ahead in material, trade pieces (not pawns)','Keep rooks active — put them behind passed pawns','The side with more pawns should try to create a passed pawn','Use your king aggressively']},
  ]},
  pawnstructure:{title:'Pawn Structure',subtitle:'Pawns are the soul of chess',priority:'medium',icon:'♙',sections:[
    {heading:'Why pawns matter',body:'Pawns are the only pieces that cannot move backward. Every pawn move creates a permanent structural change. Understanding pawn structure means understanding what plans are available to both sides.'},
    {heading:'Pawn weaknesses to avoid',body:'<strong>Isolated pawn:</strong> A pawn with no friendly pawns on adjacent files. It needs piece protection and is a permanent target.\n\n<strong>Doubled pawns:</strong> Two pawns on the same file. One of them can never be protected by the other and they block each other.\n\n<strong>Backward pawn:</strong> A pawn that cannot be advanced without being captured, left behind by its neighbors.'},
    {tip:'Before making a pawn move, ask: "Will this pawn be a weakness or a strength?" Most pawn weaknesses are permanent.'},
    {heading:'Pawn majorities',body:'A pawn majority is having more pawns on one side of the board than your opponent. In endgames, a pawn majority creates a passed pawn. Identify your pawn majority and use it.'},
    {heading:'Open and half-open files',body:'When a pawn is traded, it opens files for rooks. The player who controls open files controls the game. Place your rooks on open files and semi-open files (files with only your opponent\'s pawns).'},
    {heading:'Pawn chains',body:'A pawn chain is a diagonal line of pawns protecting each other. <strong>Attack the base of the pawn chain</strong> — the back pawn that supports the whole structure. The head of the chain is strong; the base is weak.'},
  ]},
  planning:{title:'How to Make a Plan',subtitle:'Chess without a plan is just moving pieces',priority:'medium',icon:'🗺',sections:[
    {heading:'Why most players dont have a plan',body:'Most club players react to threats without ever having a clear plan. They move whatever piece looks active or responds to the opponent\'s last move. This reactive style means they\'re always a step behind.'},
    {heading:'How to form a plan',body:'After every move, assess the position:',steps:['What are the imbalances? (material, space, piece activity, pawn structure)','What does each side\'s ideal position look like?','What is preventing you from reaching that ideal position?','Make a move that improves your worst-placed piece or achieves part of the plan']},
    {tip:'A bad plan is better than no plan at all. Having a direction to work toward prevents random moves.'},
    {heading:'Short-term vs long-term plans',body:'<strong>Short-term plans</strong> (1-3 moves): Respond to immediate threats, capture material, deliver tactics.\n\n<strong>Long-term plans</strong> (5+ moves): Reposition pieces, create a passed pawn, undermine the opponent\'s king safety, trade into a favourable endgame.'},
    {heading:'Common plans to know',body:'',steps:['Minority attack: advance 2 pawns against 3 to create a weakness','Exchange sacrifice: give a rook for a bishop/knight to gain positional compensation','Piece sacrifice: give material for long-term positional advantage','King march: activate the king in the endgame']},
    {heading:'Changing plans',body:'A plan should be updated when the position changes. If your opponent makes a move that disrupts your plan, re-evaluate rather than blindly continuing.'},
  ]},
  exchanges:{title:'When to Trade Pieces',subtitle:'Knowing when to simplify changes everything',priority:'medium',icon:'🔄',sections:[
    {heading:'The exchange decision',body:'One of the most important decisions in chess is whether to trade pieces or avoid trades. There\'s no universal answer — it depends entirely on the position. Here are the guidelines.'},
    {heading:'Trade when you\'re ahead',body:'When you have more material, <strong>simplify by trading pieces</strong> (not pawns). Fewer pieces means your material advantage becomes more decisive. In a king and pawn endgame, extra material almost always wins.'},
    {heading:'Avoid trades when cramped',body:'When your position is cramped and your pieces have limited scope, trades give you more room. But if you\'re already active, avoid trades that give your opponent breathing room.'},
    {tip:'Trade your worst piece for your opponent\'s best piece. This principle alone will improve your positions significantly.'},
    {heading:'Trading into endgames',body:'<strong>Trade queens when you have a material advantage</strong> — queens give the trailing side the most chances to create complications. When ahead, simplify. When behind, keep queens.'},
    {heading:'The exchange sacrifice',body:'Sometimes giving a rook for a bishop or knight is correct. This "exchange sacrifice" makes sense when:\n- Your piece has no good moves and will be permanently passive\n- You get a massive positional advantage in return\n- You disrupt the opponent\'s pawn structure'},
    {heading:'When NOT to trade',body:'',steps:['When your piece is your strongest attacker','When trading gives the opponent an open file','When you\'re attacking and the piece is essential to the attack','When the trade releases tension you want to maintain']},
  ]},
  initiative:{title:'Playing with Initiative',subtitle:'The player who attacks decides the game',priority:'medium',icon:'⚡',sections:[
    {heading:'What is initiative?',body:'Initiative means your opponent must respond to your threats rather than pursuing their own plans. The player with initiative dictates the flow of the game. Maintaining initiative is often more important than winning material.'},
    {heading:'How to gain initiative',body:'',steps:['Develop faster than your opponent in the opening','Create threats your opponent must respond to','Open files and diagonals for your pieces','Attack the king before it has castled','Keep your pieces coordinated and active']},
    {tip:'Every tempo you spend responding to your opponent\'s threats is a tempo you\'re not using to build your own attack.'},
    {heading:'Maintaining initiative',body:'Once you have the initiative, <strong>dont let go.</strong> Create new threats before the old ones are resolved. Give your opponent no time to breathe. The moment you stop threatening, they can reorganise and take the initiative back.'},
    {heading:'Counter-initiative',body:'When your opponent has the initiative, look for counterplay rather than pure defence. A successful counter-attack is far more effective than passive defence. Ask: "Can I create a bigger threat on the other side of the board?"'},
    {heading:'Sacrificing for initiative',body:'Sometimes giving material to maintain initiative is completely correct. A pawn sacrifice that opens lines, brings all your pieces into the attack, and prevents your opponent from castling can be worth far more than the pawn.'},
  ]},
  defense:{title:'How to Defend',subtitle:'Great defence is a skill — not just "not blundering"',priority:'medium',icon:'🛡',sections:[
    {heading:'Defence is underrated',body:'Most chess improvement content focuses on attack. But the ability to defend accurately under pressure is what separates players who survive complications from those who collapse. Defence is a learnable skill.'},
    {heading:'The defensive mindset',body:'When under attack, the instinct is to panic and make impulsive moves. Instead:\n\n1. Take a deep breath\n2. Assess the ACTUAL danger (not perceived)\n3. Find the most accurate defence\n4. Look for counter-chances'},
    {tip:'Most attacks can be defended if you calculate carefully. The attacker needs everything to work. The defender only needs one good move.'},
    {heading:'Types of defence',body:'<strong>Direct defence:</strong> Move a threatened piece to safety or add a defender.\n<strong>Counter-attack:</strong> Create a bigger threat elsewhere.\n<strong>Simplification:</strong> Trade pieces to reduce attacking resources.\n<strong>Prophylaxis:</strong> Prevent the threat before it materialises.'},
    {heading:'Prophylactic thinking',body:'Great defenders dont wait for threats to materialise — they prevent them. Prophylaxis means making moves that stop your opponent\'s plans before they become dangerous. Ask yourself: "What is my opponent planning? Can I stop it now at minimal cost?"'},
    {heading:'When to defend, when to counter-attack',body:'',steps:['If the attack is decisive, defend accurately','If the attack is slow, counter-attack immediately','If material equal, look for simplification','If losing, complicate — dont go quietly']},
  ]},
  coordinates:{title:'Board Vision & Coordinates',subtitle:'See the whole board, not just where you\'re looking',priority:'medium',icon:'🗺',sections:[
    {heading:'Why board vision matters',body:'Many tactical mistakes happen not because players dont know the tactics, but because they literally dont see the whole board. Pieces in the corner or on the far side get ignored. Developing consistent, wide board vision is trainable.'},
    {heading:'The 64-square habit',body:'After every opponent move, before thinking about your own plans, do a quick scan of all 64 squares. It takes 3 seconds. Look for:\n- Undefended pieces\n- Pieces that have changed their attack patterns\n- New diagonals or files that opened'},
    {tip:'Specifically look at pieces that haven\'t moved recently — they\'re often the ones that get forgotten and left hanging.'},
    {heading:'Learning coordinates',body:'Being able to quickly identify squares by name (e4, f6, etc.) helps enormously when visualising moves. Practice by:\n1. Opening a board\n2. Closing your eyes\n3. Someone calls a square name\n4. Point to where it is\n5. Repeat until instant recognition'},
    {heading:'Piece awareness drill',body:'Before making any move, point to every one of your pieces and ask: "Is this piece safe? Is it doing something useful?" This sounds simple but most blunders happen to pieces we\'ve mentally forgotten about.'},
    {heading:'Peripheral vision',body:'',steps:['When calculating a line, periodically check the whole board','Don\'t get so focused on one area that you miss a piece elsewhere','Use process of elimination — if you cannot find the opponent\'s threat, check every piece systematically']},
  ]},
  mindset:{title:'Chess Mindset & Psychology',subtitle:'The mental game that decides who wins',priority:'medium',icon:'🧠',sections:[
    {heading:'Chess is 50% psychology',body:'At equal technical levels, the player with the stronger mental game wins. This includes: staying calm under pressure, bouncing back from mistakes, not tilting after a bad game, and maintaining focus throughout a long game.'},
    {heading:'After a blunder',body:'The moment you blunder, two things can happen:\n\n1. You panic, your calculation gets worse, you blunder again — you lose.\n2. You take a breath, reset mentally, find the best defence — you might still draw or win.\n\n<strong>The game isnt over when you blunder. It\'s over when you give up.</strong>'},
    {tip:'The most dangerous time in chess is the move AFTER you make a mistake. That\'s when players tilt and make a second, even worse mistake.'},
    {heading:'Managing emotions',body:'Chess generates strong emotions — frustration, excitement, fear, overconfidence. Learn to recognize when emotions are affecting your play:\n- Moving too fast after an emotional moment\n- Avoiding complications out of fear\n- Playing aggressively when angry\n- Relaxing after gaining an advantage'},
    {heading:'The process mindset',body:'Instead of focusing on winning or losing, focus on the process: making good decisions each move. You can play perfectly and still lose to a lucky blunder. You can make mistakes and still win. <strong>Judge your performance by the quality of your thinking, not the result.</strong>'},
    {heading:'Building a pre-move routine',body:'',steps:['Take a breath before each move','Ask: "What is my opponent threatening?"','Find 2-3 candidate moves','Calculate the best one','Check: any blunders in my move?','Play it with confidence']},
  ]},
  time:{title:'Time Management',subtitle:'Using your clock as a weapon, not losing to it',priority:'medium',icon:'⏱',sections:[
    {heading:'The clock is part of the game',body:'Time management is a skill that many players never consciously develop. Poor time management leads to time pressure, which leads to blunders. Learning to allocate your time correctly is as important as any tactical skill.'},
    {heading:'When to think long',body:'Spend more time when:\n- The position is sharp and tactical\n- You\'re about to make a pawn move (irreversible)\n- You\'re entering an endgame\n- Your opponent has just made an unexpected move\n- You\'re about to sacrifice material'},
    {heading:'When to move faster',body:'Move faster when:\n- The position is simple and forced\n- You\'ve already spent time on this position in previous moves\n- Your opponent is in severe time pressure\n- The move is obvious (like taking a free piece)'},
    {tip:'If you cannot figure out what to do, improve your worst-placed piece. This is almost never wrong and uses your time productively.'},
    {heading:'Managing time pressure',body:'When down to less than 2 minutes:\n1. Stop calculating long variations\n2. Look for the most forcing moves (checks, captures)\n3. Simplify the position if possible\n4. Trust your instincts — your first idea is often good enough'},
    {heading:'Building the time advantage',body:'Try to reach the time control (or endgame) with more time than your opponent. Players who consistently outplay opponents in time pressure develop it as a skill. Move confidently in simple positions to bank time for complex ones.'},
  ]},
  patterns:{title:'Pattern Recognition',subtitle:'The foundation of chess strength',priority:'high',icon:'🔍',sections:[
    {heading:'What is pattern recognition?',body:'Chess masters dont calculate everything from scratch — they recognise familiar patterns and know the correct responses almost instantly. This "chunking" of knowledge is what makes strong players faster and more accurate.'},
    {heading:'Types of patterns',body:'<strong>Tactical patterns:</strong> Forks, pins, skewers, back-rank mates, smothered mates, discovered attacks.\n\n<strong>Positional patterns:</strong> Outposts, bishop pairs, pawn majorities, rook on 7th.\n\n<strong>Opening patterns:</strong> Standard development schemes, common pawn breaks.\n\n<strong>Endgame patterns:</strong> Opposition, Lucena/Philidor, triangulation.'},
    {tip:'Every puzzle you solve correctly adds a pattern to your mental library. Consistent puzzle training is the most efficient way to build pattern recognition.'},
    {heading:'How patterns are built',body:'Pattern recognition is built through repeated exposure. Every time you see a position and correctly identify the key idea, that pattern becomes more accessible in future games. This is why puzzle training works — even "seeing" a pattern incorrectly and then seeing the answer builds the pattern.'},
    {heading:'Pattern vs calculation',body:'Strong players use pattern recognition to quickly identify candidate moves, then use calculation to verify them. Pure calculation without patterns is slow and error-prone. Pure patterns without calculation leads to tactical blunders.'},
    {heading:'Building your pattern library',body:'',steps:['Solve 10 puzzles daily, even if its just 5 minutes','Review games of great players and note recurring themes','After losing, identify the tactical or positional pattern you missed','Study endgame positions until you can recognise them instantly']},
  ]},
  strategy:{title:'Strategic Chess',subtitle:'The long-term thinking that creates winning positions',priority:'medium',icon:'♟',sections:[
    {heading:'Tactics vs strategy',body:'Tactics are about immediate gains — winning material or giving checkmate. Strategy is about building a position where tactics work in your favor. Strategy creates the conditions; tactics execute them.'},
    {heading:'Imbalances',body:'Great chess thinking starts by identifying the imbalances — the differences between the two positions. Common imbalances:\n\n- Material: who has more pieces or pawns?\n- Space: who controls more of the board?\n- Piece activity: whose pieces are better placed?\n- Pawn structure: who has weaknesses/strengths?\n- King safety: whose king is safer?'},
    {tip:'The player who correctly identifies the imbalances and chooses the right plan based on them wins more games than any brilliant calculator.'},
    {heading:'Working with your pawn structure',body:'Your pawn structure tells you what plan to play. Isolated d-pawn positions call for piece activity and attacking play. Carlsbad pawn structures suggest a minority attack. Understand common structures and their associated plans.'},
    {heading:'Piece vs piece decisions',body:'<strong>Bishop pair advantage:</strong> Two bishops vs bishop and knight, or two knights. The bishop pair is powerful in open positions.\n<strong>Knight vs bishop:</strong> Knights are better in closed positions with fixed pawn structures. Bishops shine in open games.'},
    {heading:'Strategic thinking process',body:'',steps:['Assess the current imbalances in the position','Determine whose position is better and why','Find the plan that improves your position or exploits the opponent\'s weakness','Execute the plan move by move while responding to threats']},
  ]},
  rooks:{title:'Mastering Rook Play',subtitle:'The most underutilised piece at club level',priority:'medium',icon:'♜',sections:[
    {heading:'Why rooks are underused',body:'At club level, rooks are often the last pieces to become active. Players develop minor pieces, castle, then forget about their rooks. Strong players prioritise rook activation and treat open files as highways to victory.'},
    {heading:'Rooks need open files',body:'A rook on a closed file is nearly useless. Your first priority should always be: <strong>put your rooks on open or semi-open files.</strong> Double rooks on an open file for maximum pressure.'},
    {tip:'Before making a positional move, ask: "Does this help or hurt my rooks?" Every time you open a file, your rooks benefit.'},
    {heading:'The 7th rank',body:'A rook on the 7th rank (your opponent\'s second rank) is devastatingly powerful. It attacks all unmoved pawns simultaneously and cuts off the enemy king. Invade to the 7th rank whenever possible.'},
    {heading:'Rooks behind passed pawns',body:'In endgames, always place your rook BEHIND a passed pawn — yours or your opponent\'s. Behind your passed pawn, the rook pushes it forward. Behind your opponent\'s, it restricts it.'},
    {heading:'Rook endgame technique',body:'',steps:['Put your king in front of your passed pawn', 'Place your rook behind your passed pawn','Cut off the enemy king from the queening square','Use the Lucena and Philidor positions as your foundation','Trade rooks into a won king-pawn endgame when ahead']},
  ]},
  bishops:{title:'The Power of Bishops',subtitle:'Long-range dominance when used correctly',priority:'medium',icon:'♗',sections:[
    {heading:'The bishop\'s strength',body:'Bishops are long-range pieces that can control an entire diagonal from across the board. In open positions, bishops are often stronger than knights. The bishop pair — having both bishops when the opponent doesnt — is considered a significant advantage.'},
    {heading:'Good bishop vs bad bishop',body:'A <strong>good bishop</strong> has open diagonals and is not blocked by its own pawns. A <strong>bad bishop</strong> is blocked by pawns fixed on the same color squares it travels. Avoid fixing your pawns on the same color as your bishop.'},
    {tip:'When placing pawns in the opening and middlegame, ask: "Is this pawn going on the same color as my bishop?" If yes, reconsider.'},
    {heading:'Bishop pair advantage',body:'The bishop pair is strongest in open positions where both bishops can be active simultaneously. To exploit the bishop pair:\n1. Open the position with pawn breaks\n2. Trade the opponent\'s good pieces\n3. Create targets on different parts of the board'},
    {heading:'Fianchetto',body:'A fianchettoed bishop (developed to g2/b2 or g7/b7) controls a long diagonal and is often very powerful. It\'s particularly strong when pointing at the opponent\'s castled king or controlling the center from a distance.'},
    {heading:'Trading bishop for knight',body:'',steps:['Trade your bad bishop for an active enemy knight','Keep your good bishop and trade the opponent\'s','In endgames, a bishop is usually better than a knight with passed pawns on both sides of the board']},
  ]},
  knights:{title:'Knight Mastery',subtitle:'The tricky piece that controls the board',priority:'medium',icon:'♞',sections:[
    {heading:'What makes knights special',body:'Knights are the only pieces that jump over other pieces. Their L-shaped movement means they\'re unpredictable and can surprise opponents. Unlike bishops, knights can access all 64 squares regardless of position color.'},
    {heading:'Knights need outposts',body:'An <strong>outpost</strong> is a square in the opponent\'s territory that cannot be attacked by an enemy pawn. A knight on an outpost is one of the most powerful pieces in chess — its a permanent fixture that the opponent cannot remove.'},
    {tip:'To create a knight outpost, trade the pawn that defends that square. Then station your knight there permanently.'},
    {heading:'Knight vs bishop',body:'Knights are superior to bishops in:\n- Closed positions with fixed pawn structures\n- Positions where the knight has a strong outpost\n- Endgames with pawns on only one side of the board\n\nBishops are superior in open positions and when pawns are on both sides.'},
    {heading:'Knight manoeuvres',body:'Knights often need several moves to reach their ideal squares. Plan these manoeuvres in advance — a knight heading to c5 might need to go Nd3-b4-c6-d4 or similar. Calculate the path and ensure its safe.'},
    {heading:'The octopus knight',body:'A knight placed on a central square that cannot be attacked is called an "octopus" knight. From d5 or e5 (for White), a knight attacks 8 squares and coordinates with other pieces to dominate the entire board. Achieving this structure is often a winning advantage.'},
  ]},
  queenplay:{title:'Queen Play',subtitle:'The most powerful piece — used wisely',priority:'medium',icon:'♛',sections:[
    {heading:'The queen\'s role',body:'The queen is the most powerful piece but also the most easily misused. Beginners bring it out too early. Advanced players sometimes under-activate it. The key is understanding WHEN and WHERE the queen belongs.'},
    {heading:'Don\'t centralise too early',body:'Bringing the queen out before developing other pieces gives the opponent tempo: they develop a piece while attacking your queen. Every time your queen runs away from an attack, your opponent gains time. Develop minor pieces first.'},
    {tip:'The queen is most powerful when the position is open and your other pieces are already active. Then it can coordinate with everything.'},
    {heading:'Queen and rook coordination',body:'Queens and rooks on the same file or rank create devastating battery attacks. A queen and rook (or two rooks) on an open file pointing at the king is often immediately decisive.'},
    {heading:'Lone queen attacks',body:'A queen attacking alone is rarely decisive — the opponent can defend with a single piece. Successful queen attacks always involve coordination with at least one other attacking piece. Never sacrifice material for a lone queen attack.'},
    {heading:'Queen in the endgame',body:'In queen endgames, activity is everything. A centralised queen that gives perpetual check threats or creates passed pawns is far stronger than a passive queen. King safety becomes critical — a queen can deliver checkmate alone with the king in the corner.'},
    {heading:'When to trade queens',body:'',steps:['Trade queens when you have a material advantage','Keep queens when you need counterplay','Trade queens to neutralise opponent\'s attack','Avoid queen trades when your queen is the only active piece']},
  ]},
  attacking:{title:'How to Attack the King',subtitle:'The art of the decisive assault',priority:'medium',icon:'🔥',sections:[
    {heading:'When to attack',body:'Not every position calls for a direct attack. You should attack when:\n- You have more pieces aimed at the king\'s area\n- Your opponent\'s king hasn\'t castled or has castled into a weak structure\n- You have a pawn storm already in motion\n- Your opponent\'s pieces are on the wrong side of the board'},
    {heading:'Prerequisites for a successful attack',body:'',steps:['Open files or diagonals pointing at the king','More attacking pieces than the defender has defenders','No immediate counter-attacks from the opponent','Calculation showing the attack works']},
    {tip:'The most common mistake in attacks: starting before the position is ready. Make sure ALL your pieces are participating before sacrificing material.'},
    {heading:'The pawn storm',body:'Advancing pawns toward the opponent\'s castled king creates open files for rooks and weakens the pawn shelter. The pawn storm works best when the king\'s position is already compromised and your pieces can quickly exploit the openings created.'},
    {heading:'The exchange sacrifice',body:'Giving a rook for a bishop or knight to destroy the king\'s defensive cover is a common attacking theme. If it removes the key defender and opens lines to the king, the exchange sacrifice is often sound.'},
    {heading:'Mating nets',body:'A mating net is a position where the king cannot escape checkmate regardless of what it does. Build mating nets by:\n1. Cut off king escape squares\n2. Bring all attacking pieces to bear\n3. Deliver the final blow'},
  ]},
  practical:{title:'Practical Decision Making',subtitle:'Chess is a game of decisions — make better ones',priority:'medium',icon:'🎯',sections:[
    {heading:'The practical approach',body:'In a game, you rarely have time for complete analysis. Practical chess means making good-enough decisions quickly — finding moves that are hard to refute even if not always technically best.'},
    {heading:'When to complicate',body:'Create complications when:\n- You\'re losing — a complicated position gives you more chances\n- Your opponent is in time pressure\n- The position favors the side that calculates better (usually the stronger player)\n\nAvoid complications when winning — a simple, technical win is always best.'},
    {tip:'If you have a good move, play it. You dont need to find the best move every time — good enough usually wins.'},
    {heading:'Choosing between moves',body:'When two moves seem equally good, choose the one that:\n- Is safer (harder to go wrong)\n- Keeps more options open\n- Puts pressure on your opponent\n- Is easier to execute correctly under time pressure'},
    {heading:'Prophylaxis in practice',body:'The most practical skill: preventing your opponent\'s plans before they materialise. Every move, ask: "What is my opponent planning for next move? Can I stop it now?" This prevents 90% of tactical disasters.'},
    {heading:'Decision-making framework',body:'',steps:['Identify what your opponent is threatening','Find 2-3 candidate moves that address the threat','Calculate each briefly','Choose the one that creates the most problems for the opponent','Sanity check: any blunders?','Play it']},
  ]},
  improvement:{title:'How to Actually Improve',subtitle:'The most efficient path to a higher rating',priority:'high',icon:'📈',sections:[
    {heading:'Why most players stop improving',body:'Most club players plateau because they play the same games the same way without structured review. Playing 100 games without analysis gives you 100 repetitions of the same mistakes. Playing 10 games with deep analysis gives you 10 lessons.'},
    {heading:'The improvement formula',body:'',steps:['Play a game (use a time control with increment — not blitz)','After the game, analyse it WITHOUT an engine first','Write down what you think you did wrong','THEN check with the engine','Focus on positions where your assessment was wrong']},
    {tip:'Analysing without the engine first is the most important step. It forces you to use your own judgment, which is what improves.'},
    {heading:'How to use ChessForge most effectively',body:'1. Analyse 2-3 games per week (not every blitz game)\n2. Look at your top weaknesses\n3. Go to your Lessons tab — sorted by your actual weaknesses\n4. Solve your personal puzzles (from YOUR blunders)\n5. In the next game, focus specifically on your #1 weakness'},
    {heading:'Consistent small habits beat intense bursts',body:'30 minutes every day will improve you faster than 5 hours on the weekend. The brain learns through repetition and sleep consolidation. Make chess improvement a daily habit, not an occasional marathon.'},
    {heading:'What to study based on your level',body:'Under 1000: Focus exclusively on not hanging pieces (LPDO). Tactics puzzles.\n\n1000-1400: Tactics + basic endgames (K+P vs K, basic rook endgames). Opening principles.\n\n1400-1800: Positional concepts, pawn structures, piece coordination. Deeper calculation.\n\nAbove 1800: Study your specific weaknesses through game analysis.'},
  ]},
};

/* ── LESSONS PAGE ─────────────────────────────────────────────────────────── */
function initLessonsPage(){
  const sidebar=document.getElementById('lessons-sidebar');sidebar.innerHTML='';
  // Show premium interactive lesson at top
  renderPremiumLesson();
  const order=State.lessonOrder.length?State.lessonOrder:Object.keys(LESSONS);
  // Add any missing lessons at end
  Object.keys(LESSONS).forEach(k=>{if(!order.includes(k))order.push(k);});
  order.forEach((id,i)=>{
    if(!LESSONS[id])return;
    const L=LESSONS[id];const done=State.completedLessons.includes(id);
    const item=document.createElement('div');
    item.className='lesson-nav-item'+(done?' completed':'');item.dataset.lesson=id;
    item.innerHTML=`<div class="lesson-nav-title">${L.icon} ${L.title}</div><div class="lesson-nav-tag">${i===0&&State.lessonOrder.length?'⭐ Priority':('Lesson '+(i+1))}</div>`;
    item.addEventListener('click',()=>{document.querySelectorAll('.lesson-nav-item').forEach(el=>el.classList.remove('active'));item.classList.add('active');renderLesson(id);});
    sidebar.appendChild(item);
    if(i===0){item.classList.add('active');renderLesson(id);}
  });
}

function renderLesson(id){
  const L=LESSONS[id];if(!L)return;
  const done=State.completedLessons.includes(id);
  let html=`<div class="lesson-priority-badge ${L.priority}">${L.priority==='high'?'⭐ High Priority':'📌 Recommended'}</div><div class="lesson-title">${L.icon} ${L.title}</div><div class="lesson-subtitle">${L.subtitle}</div>`;
  L.sections.forEach(s=>{
    html+=`<div class="lesson-section">`;
    if(s.heading)html+=`<h3>${s.heading}</h3>`;
    if(s.body)html+=`<p>${s.body.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>')}</p>`;
    if(s.tip)html+=`<div class="lesson-tip">💡 <strong>Pro tip:</strong> ${s.tip}</div>`;
    if(s.warning)html+=`<div class="lesson-warning">⚠️ <strong>Watch out:</strong> ${s.warning}</div>`;
    if(s.steps)html+=`<ol class="lesson-steps">${s.steps.map(st=>`<li>${st}</li>`).join('')}</ol>`;
    html+=`</div>`;
  });
  html+=`<div class="lesson-complete-btn">${done?`<button class="btn-outline" disabled>✅ Completed (+30 XP earned)</button>`:`<button class="btn-cyan" id="complete-btn" onclick="completeLesson('${id}')" style="max-width:280px">✅ Mark Complete (+30 XP)</button>`}</div>`;
  document.getElementById('lesson-content').innerHTML=html;
}

async function completeLesson(id){
  await awardXP(30,'lesson',id);
  const btn=document.getElementById('complete-btn');
  if(btn){btn.textContent='✅ Completed!';btn.disabled=true;btn.className='btn-outline';}
}

/* ── PROGRESS ─────────────────────────────────────────────────────────────── */
function renderProgressPage(){
  if(!State.loggedIn){showEl('progress-guest');hideEl('progress-content');}
  else{hideEl('progress-guest');showEl('progress-content');}
}

function renderSavedGames(games){
  const list=document.getElementById('saved-games-list');if(!list)return;
  list.innerHTML='';
  if(!games||!games.length){list.innerHTML='<p style="color:var(--muted);font-size:.85rem">No saved games yet. Analyse a game and click Save!</p>';return;}
  [...games].reverse().forEach(g=>{
    const d=new Date(g.saved*1000).toLocaleDateString();
    const item=document.createElement('div');item.className='saved-game-item';
    item.innerHTML=`<div class="saved-game-info"><div>${esc(g.label)}</div><div class="saved-game-date">${d}</div></div><button class="load-btn">Load →</button>`;
    item.querySelector('button').addEventListener('click',function(){
      document.getElementById('pgn-text').value=g.pgn;
      State.lastPGN=g.pgn;State.lastUploadedFile=null;
      showPage('analyze');
      hideEl('step2-card');hideEl('step3-card');hideEl('results');
    });
    list.appendChild(item);
  });
}

/* ── URL param handling ───────────────────────────────────────────────────── */
async function handleURLParams(){
  const params=new URLSearchParams(window.location.search);
  if(params.get('upgrade')==='true'||State.pendingUpgrade){
    window.history.replaceState({},'','/');
    await new Promise(r=>setTimeout(r,800));
    if(State.loggedIn){
      if(State.plan==='pro'){
        const div=document.createElement('div');
        div.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#00d4ff;color:#000;padding:1rem 2rem;border-radius:10px;font-weight:700;z-index:9999';
        div.textContent='⭐ You are already on ChessForge Pro!';
        document.body.appendChild(div);setTimeout(()=>div.remove(),3000);
      } else goToPro();
    } else {showAuthModal();State.pendingUpgrade=true;}
  }
}


/* ── Theme System ─────────────────────────────────────────────────────────── */
function setTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('cf-theme', theme);
  document.querySelectorAll('.theme-opt').forEach(el=>{
    el.classList.toggle('active', el.dataset.theme===theme);
  });
  document.getElementById('theme-panel').classList.add('hidden');
}

function toggleDarkMode(isDark){
  if(isDark){
    document.documentElement.removeAttribute('data-light');
    localStorage.setItem('cf-lightmode','0');
  } else {
    document.documentElement.setAttribute('data-light','1');
    localStorage.setItem('cf-lightmode','1');
  }
}

// Load saved theme + mode
(function(){
  const savedTheme = localStorage.getItem('cf-theme');
  if(savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.querySelectorAll('.theme-opt').forEach(el=>{
      el.classList.toggle('active', el.dataset.theme===savedTheme);
    });
  }
  const lightMode = localStorage.getItem('cf-lightmode');
  if(lightMode === '1'){
    document.documentElement.setAttribute('data-light','1');
    const tog = document.getElementById('dark-mode-toggle');
    if(tog) tog.checked = false;
  }
})();

function toggleThemePanel(){
  const panel = document.getElementById('theme-panel');
  panel.classList.toggle('hidden');
}

// Close theme panel when clicking outside
document.addEventListener('click', e=>{
  const panel = document.getElementById('theme-panel');
  const btn = document.getElementById('theme-btn');
  if(panel && !panel.contains(e.target) && e.target !== btn){
    panel.classList.add('hidden');
  }
});




/* ── Cognitive Fingerprint ───────────────────────────────────────────────── */
function renderCognitiveFingerprint(fp){
  if(!fp) return;
  // Remove existing card if any
  const existing = document.getElementById('fingerprint-card');
  if(existing) existing.remove();

  const card = document.createElement('div');
  card.id = 'fingerprint-card';
  card.className = 'fingerprint-card';

  const confidence = fp.confidence || 0;
  const gamesNeeded = fp.games_needed || 0;

  let html = `
    <div class="card-label">🧠 Thinking Process Fingerprint</div>
    <h2>${esc(fp.dominant_pattern)}</h2>
    <p style="color:var(--muted);font-size:.88rem;margin-bottom:.8rem">
      Based on your game analysis, ChessForge has identified the cognitive patterns behind your mistakes — not just what you do wrong, but <strong style="color:var(--text)">why</strong>.
      ${gamesNeeded > 0 ? `<br><em>Analyse ${gamesNeeded} more game${gamesNeeded!==1?'s':''} for a complete profile.</em>` : ''}
    </p>
    <div class="fp-confidence">
      <span>Profile confidence</span>
      <div class="fp-confidence-bar"><div class="fp-confidence-fill" style="width:${confidence}%"></div></div>
      <span>${confidence}%</span>
    </div>
    <div class="fingerprint-patterns">`;

  (fp.patterns || []).forEach(p => {
    html += `
      <div class="fp-pattern ${p.severity}">
        <div class="fp-name">⚠ ${esc(p.name)}</div>
        <div class="fp-desc">${esc(p.description)}</div>
        <div class="fp-trigger">📌 When it happens: ${esc(p.trigger)}</div>
        <div class="fp-fix">✅ Fix: ${esc(p.fix)}</div>
      </div>`;
  });

  html += `</div>`;

  if(fp.premove_checklist && fp.premove_checklist.length){
    html += `
      <div class="divider-label" style="margin-top:1.2rem">Your Personalised Pre-Move Checklist</div>
      <ul class="checklist">
        ${fp.premove_checklist.map(item=>`<li>${esc(item)}</li>`).join('')}
      </ul>`;
  }

  html += `</div>`;
  card.innerHTML = html;

  // Insert after profile card
  const profileCard = document.querySelector('.profile-card');
  if(profileCard) profileCard.insertAdjacentElement('afterend', card);
  else document.getElementById('results').prepend(card);
}


/* ── BOT GAME ─────────────────────────────────────────────────────────────── */
const BotState = {
  board: null, game: null, playerColor: 'white',
  moveHistory: [], gameActive: false, thinking: false,
  weaknesses: []
};

function initBotPage(){
  if(BotState.board) return;
  BotState.board = Chessboard('bot-board', {
    position: 'start',
    draggable: true,
    pieceTheme: PIECE_THEME,
    onDrop: handleBotDrop,
    onSnapEnd: ()=>{ if(BotState.game) BotState.board.position(BotState.game.fen()); },
    onSquareClick: handleBotSquareClick,
  });
  // Show weakness targets if we have analysis data
  if(State.analysisData){
    const wp = (State.analysisData.top_weaknesses || []).map(([n])=>n);
    BotState.weaknesses = wp;
    if(wp.length){
      showEl('bot-weakness-targets');
      const list = document.getElementById('bot-target-list');
      list.innerHTML = wp.slice(0,3).map(w=>`<div class="bot-target">🎯 ${esc(w)}</div>`).join('');
    }
  }
}

function startBotGame(){
  BotState.playerColor = document.getElementById('bot-color').value;
  BotState.game = new Chess();
  BotState.moveHistory = [];
  BotState.gameActive = true;
  BotState.thinking = false;
  BotState.board.orientation(BotState.playerColor);
  BotState.board.position('start', false);
  document.getElementById('bot-move-history').innerHTML = '';
  document.getElementById('bot-review-card').classList.add('hidden');
  setBotStatus('Game started! ' + (BotState.playerColor==='white' ? 'You play White — make your move!' : 'You play Black — bot is thinking…'));

  // If player is black, bot plays first
  if(BotState.playerColor === 'black'){
    setTimeout(makeBotMove, 800);
  }
}

function handleBotSquareClick(square){
  if(!BotState.gameActive || BotState.thinking) return;
  if(BotState.game.turn() !== BotState.playerColor[0]) return;
  clearBotHighlights();
  const piece = BotState.game.get(square);
  if(BotState.selectedSquare === square){ BotState.selectedSquare = null; return; }
  if(BotState.selectedSquare){
    const src = BotState.selectedSquare; BotState.selectedSquare = null;
    const mv = BotState.game.move({from:src, to:square, promotion:'q'});
    if(mv){ BotState.board.position(BotState.game.fen()); addBotMove(mv.san, src+square); checkBotGameOver(); if(!BotState.game.game_over()) setTimeout(makeBotMove, 600); }
    else if(piece && piece.color === BotState.playerColor[0]){ BotState.selectedSquare = square; highlightBotMoves(square); }
    return;
  }
  if(piece && piece.color === BotState.playerColor[0]){ BotState.selectedSquare = square; highlightBotMoves(square); }
}

function highlightBotMoves(square){
  const moves = BotState.game.moves({square, verbose:true});
  document.querySelectorAll(`#bot-board [data-square="${square}"]`).forEach(el=>el.style.boxShadow='inset 0 0 0 4px rgba(0,212,255,.9)');
  moves.forEach(m=>{
    document.querySelectorAll(`#bot-board [data-square="${m.to}"]`).forEach(el=>{
      const dot = document.createElement('div');
      dot.className = 'bot-dot';
      dot.style.cssText = 'position:absolute;width:30%;height:30%;background:rgba(0,212,255,.5);border-radius:50%;top:35%;left:35%;pointer-events:none;z-index:10';
      el.style.position = 'relative'; el.appendChild(dot);
    });
  });
}

function clearBotHighlights(){
  document.querySelectorAll('#bot-board [data-square]').forEach(el=>el.style.boxShadow='');
  document.querySelectorAll('.bot-dot').forEach(el=>el.remove());
  BotState.selectedSquare = null;
}

function handleBotDrop(src, tgt){
  if(!BotState.gameActive || BotState.thinking) return 'snapback';
  if(BotState.game.turn() !== BotState.playerColor[0]) return 'snapback';
  clearBotHighlights();
  const mv = BotState.game.move({from:src, to:tgt, promotion:'q'});
  if(!mv) return 'snapback';
  addBotMove(mv.san, src+tgt);
  checkBotGameOver();
  if(!BotState.game.game_over()) setTimeout(makeBotMove, 600);
}

async function makeBotMove(){
  if(!BotState.gameActive || BotState.game.game_over()) return;
  BotState.thinking = true;
  setBotStatus('🤖 Bot is thinking…');
  try{
    const diff = document.getElementById('bot-difficulty').value;
    const r = await fetch('/bot-move', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({fen: BotState.game.fen(), weaknesses: BotState.weaknesses, difficulty: diff}),
      credentials:'include'
    });
    const d = await r.json();
    if(d.error || !d.move){ setBotStatus('Bot error — your turn!'); BotState.thinking=false; return; }
    const mv = BotState.game.move({from:d.move.slice(0,2), to:d.move.slice(2,4), promotion:'q'});
    if(mv){
      BotState.board.position(BotState.game.fen(), false);
      addBotMove(mv.san, d.move, true);
      if(d.in_check) setBotStatus('♟ Bot played ' + mv.san + ' — You are in CHECK!');
      else setBotStatus('♟ Bot played ' + mv.san + ' — Your turn!');
      checkBotGameOver();
    }
  }catch(e){ setBotStatus('Connection error. Your turn!'); }
  BotState.thinking = false;
}

function addBotMove(san, uci, isBot=false){
  const hist = document.getElementById('bot-move-history');
  const moveNum = Math.ceil((BotState.game.history().length) / 2);
  if(!isBot){
    const row = document.createElement('div');
    row.className = 'bot-move-item'; row.id = 'bot-row-'+moveNum;
    row.innerHTML = `<span class="bot-move-num">${moveNum}.</span><span class="bot-move-w">${esc(san)}</span><span class="bot-move-b" id="bot-b-${moveNum}"></span>`;
    hist.appendChild(row);
  } else {
    const cell = document.getElementById('bot-b-'+moveNum);
    if(cell) cell.textContent = san;
  }
  hist.scrollTop = hist.scrollHeight;
}

function setBotStatus(msg){ document.getElementById('bot-status').textContent = msg; }

function checkBotGameOver(){
  if(!BotState.game.game_over()) return;
  BotState.gameActive = false;
  let result = '';
  if(BotState.game.in_checkmate()){
    const winner = BotState.game.turn() === 'w' ? 'Black' : 'White';
    const playerWon = (winner === 'White' && BotState.playerColor === 'white') || (winner === 'Black' && BotState.playerColor === 'black');
    result = playerWon ? '🎉 You won by checkmate!' : '😔 Bot won by checkmate. Review the game and analyse where it went wrong.';
  } else if(BotState.game.in_stalemate()){ result = '½ Stalemate — draw!'; }
  else if(BotState.game.in_draw()){ result = '½ Draw!'; }
  setBotStatus(result);
  showBotReview();
}

function getBotPGN(){
  // Generate PGN from bot game history
  const moves = BotState.game.history();
  let pgn = '[Event "ChessForge Bot Game"]\n';
  pgn += `[White "${BotState.playerColor==='white'?'You':'ChessForge Bot'}"]\n`;
  pgn += `[Black "${BotState.playerColor==='black'?'You':'ChessForge Bot'}"]\n`;
  pgn += `[Result "${BotState.game.game_over()?BotState.game.result():'*'}"]\n\n`;
  for(let i=0;i<moves.length;i++){
    if(i%2===0) pgn += `${Math.floor(i/2)+1}. `;
    pgn += moves[i] + ' ';
  }
  return pgn.trim();
}

function copyBotPGN(){
  const pgn = getBotPGN();
  navigator.clipboard.writeText(pgn).then(()=>{
    const btn = document.getElementById('copy-pgn-btn');
    if(btn){btn.textContent='✅ Copied!';setTimeout(()=>btn.textContent='📋 Copy PGN',2000);}
  }).catch(()=>{
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = pgn; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    const btn = document.getElementById('copy-pgn-btn');
    if(btn){btn.textContent='✅ Copied!';setTimeout(()=>btn.textContent='📋 Copy PGN',2000);}
  });
}

function showBotReview(){
  const card = document.getElementById('bot-review-card');
  const content = document.getElementById('bot-review-content');
  card.classList.remove('hidden');
  const moves = BotState.game.history({verbose:true});
  const total = moves.length;
  const playerMoves = moves.filter(m => (m.color === 'w') === (BotState.playerColor === 'white'));
  const captures = playerMoves.filter(m => m.captured).length;

  let html = `
    <div class="bot-review-item"><strong>Total moves:</strong> ${total}</div>
    <div class="bot-review-item"><strong>Your captures:</strong> ${captures}</div>
    <div class="bot-review-item"><strong>Tip:</strong> ${getBotTip()}</div>
    <div style="margin-top:.8rem;display:flex;gap:.6rem;flex-wrap:wrap">
      <button class="btn-outline" onclick="startBotGame()">Play Again</button>
      <button class="btn-outline" id="copy-pgn-btn" onclick="copyBotPGN()">📋 Copy PGN</button>
    </div>
    <p style="color:var(--muted);font-size:.78rem;margin-top:.5rem">Paste PGN into the Analyze tab to see exactly where mistakes happened!</p>`;
  content.innerHTML = html;
}

function getBotTip(){
  const tips = [
    'Analyse this game in the Analyze tab to see exactly where mistakes happened.',
    'The bot targeted your pattern weaknesses — did you notice?',
    'Try a harder difficulty once you can beat this level consistently.',
    'Check your Pre-Move Checklist before every move in your next game.',
    'The positions the bot created were chosen to expose your typical weaknesses.',
  ];
  return tips[Math.floor(Math.random()*tips.length)];
}


/* ── Tutorial ─────────────────────────────────────────────────────────────── */
const TUTORIAL_STEPS = [
  {title:'Welcome to ChessForge! ♟', desc:'Let me show you around in 30 seconds. ChessForge analyses YOUR games to find YOUR specific patterns — not generic advice.', target:null, pos:{top:'50%',left:'50%',transform:'translate(-50%,-50%)'}},
  {title:'Step 1: Analyze', desc:"Start by pasting a PGN from Chess.com or Lichess and clicking Load Game. We'll identify which player you are, then run Stockfish at depth 16.", target:'page-analyze', pos:{top:'20%',left:'50%',transform:'translateX(-50%)'}},
  {title:'Step 2: Your Fingerprint', desc:'After analysis, ChessForge builds your Thinking Process Fingerprint — identifying WHY you make mistakes, not just what.', target:null, pos:{top:'30%',left:'50%',transform:'translateX(-50%)'}},
  {title:'Step 3: Puzzles', desc:"Your blunders become puzzles you solve. After your puzzles run out, infinite puzzles target your specific weakness patterns.", target:'page-puzzles', pos:{top:'20%',left:'50%',transform:'translateX(-50%)'}},
  {title:'Step 4: Play the Bot', desc:"The bot knows your weaknesses and deliberately creates positions that test them. Beat the bot = you are improving!", target:'page-bot', pos:{top:'20%',left:'50%',transform:'translateX(-50%)'}},
];

let tutorialStep = 0;

function startTutorial(){
  tutorialStep = 0;
  showTutorialStep();
  document.getElementById('tutorial-overlay').classList.remove('hidden');
}

function showTutorialStep(){
  const step = TUTORIAL_STEPS[tutorialStep];
  if(!step){ skipTutorial(); return; }
  document.getElementById('t-step-num').textContent = tutorialStep + 1;
  document.getElementById('t-step-total').textContent = TUTORIAL_STEPS.length;
  document.getElementById('t-title').textContent = step.title;
  document.getElementById('t-desc').textContent = step.desc;
  const box = document.getElementById('tutorial-box');
  Object.assign(box.style, {top:'',left:'',transform:'', bottom:'', right:''});
  Object.assign(box.style, step.pos);
}

function nextTutorialStep(){
  tutorialStep++;
  if(tutorialStep >= TUTORIAL_STEPS.length){ skipTutorial(); return; }
  showTutorialStep();
}

function skipTutorial(){
  document.getElementById('tutorial-overlay').classList.add('hidden');
  localStorage.setItem('cf-tutorial-done', '1');
}

// Show tutorial for first-time users
(function(){
  if(!localStorage.getItem('cf-tutorial-done')){
    setTimeout(startTutorial, 2000);
  }
})();


/* ── Onboarding ───────────────────────────────────────────────────────────── */
function checkOnboarding(){
  if(!State.loggedIn) return;
  const done = localStorage.getItem('cf-onboarding-'+State.user);
  if(done) return;
  const analysed = State.analysisData ? 1 : 0;
  if(analysed < 1){
    showOnboarding();
  }
}

function showOnboarding(){
  const existing = document.getElementById('onboarding-overlay');
  if(existing) return;
  const div = document.createElement('div');
  div.id = 'onboarding-overlay';
  div.className = 'onboarding-overlay';
  div.innerHTML = `
    <div class="onboarding-modal">
      <div class="onboarding-step">Getting Started</div>
      <div class="onboarding-title">Lets learn your game 🎯</div>
      <div class="onboarding-desc">
        To build your personalised training plan, ChessForge needs to analyse a few of your games. The more games you add, the more accurate your pattern detection and Thinking Process Fingerprint become.
        <br><br>
        <strong style="color:var(--cyan)">Start by analysing your first game below!</strong> You can do this from the Analyze tab.
      </div>
      <div style="display:flex;gap:.8rem;flex-wrap:wrap;justify-content:center">
        <button class="btn-cyan" onclick="closeOnboarding();showPage('analyze')" style="width:auto">Analyse My First Game →</button>
        <button class="onboarding-skip" onclick="closeOnboarding()">Skip for now</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

function closeOnboarding(){
  const el = document.getElementById('onboarding-overlay');
  if(el) el.remove();
  if(State.user) localStorage.setItem('cf-onboarding-'+State.user, '1');
}


/* ── Cancel Subscription ─────────────────────────────────────────────────── */
async function cancelSubscription(){
  if(!confirm('This will open Stripe\'s billing portal where you can manage or cancel your subscription. Continue?')) return;
  try{
    const r = await fetch('/cancel-subscription', {method:'POST', credentials:'include'});
    const d = await r.json();
    if(d.url) window.open(d.url, '_blank');
    else alert(d.error || 'Could not open billing portal.');
  }catch(e){ alert('Connection error. Please try again.'); }
}


/* ── Infinite Puzzles ─────────────────────────────────────────────────────── */
async function fetchMorePuzzles(){
  const weakness = State.analysisData?.top_weaknesses?.[0]?.[0] || 'tactics';
  try{
    const r = await fetch('/generate-puzzles', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({weakness, count:5}),
      credentials:'include'
    });
    const d = await r.json();
    if(d.puzzles && d.puzzles.length){
      State.puzzles.push(...d.puzzles);
      document.getElementById('puzzle-total').textContent = State.puzzles.length;
      return true;
    }
  }catch(e){}
  return false;
}


/* ── Premium Interactive Lesson ───────────────────────────────────────────── */
function renderPremiumLesson(){
  const container = document.getElementById('lesson-content');
  if(!container) return;

  const gamesAnalysed = State.analysisData?.games_analysed || 0;
  const isPro = State.plan === 'pro';
  const fp = State.analysisData?.cognitive_fingerprint;
  const topWeakness = State.analysisData?.top_weaknesses?.[0]?.[0] || null;

  // Build the premium lesson section
  const premDiv = document.createElement('div');
  premDiv.id = 'premium-lesson-section';

  if(!isPro){
    premDiv.innerHTML = `
      <div class="locked-lesson">
        <div class="locked-lesson-icon">⭐</div>
        <h3>Personal Game Lessons</h3>
        <p>Upgrade to Pro to unlock interactive lessons built directly from your own games — with chessboard positions, theory, and personalised coaching.</p>
        <button class="btn-cyan" onclick="goToPro()" style="width:auto;margin:0 auto">Upgrade to Pro →</button>
      </div>`;
  } else if(gamesAnalysed < 5){
    const needed = 5 - gamesAnalysed;
    premDiv.innerHTML = `
      <div class="locked-lesson">
        <div class="locked-lesson-icon">📊</div>
        <h3>Personal Game Lessons — Almost Ready</h3>
        <p>Analyse <strong>${needed} more game${needed!==1?'s':''}</strong> so ChessForge can build lessons directly from your specific positions and mistakes.</p>
        <button class="btn-outline" onclick="showPage('analyze')">Analyse a Game →</button>
      </div>`;
  } else {
    // Build personalised lesson from their data
    const weakness = topWeakness || 'Hanging piece';
    const dominantPattern = fp?.dominant_pattern || 'Tactical Blind Spot';
    const puzzles = State.puzzles || [];
    const lessonPosition = puzzles.length > 0 ? puzzles[0] : null;

    const WEAKNESS_LESSONS = {
      'Hanging piece': {
        title: 'Stop Hanging Pieces',
        subtitle: 'Based on your ' + gamesAnalysed + ' analysed games',
        steps: [
          {label:'The Problem', text:`In your games, you have left pieces hanging ${State.analysisData?.pattern_counts?.['Hanging piece']||'multiple'} times. This is your #1 most costly mistake. Lets fix the thinking habit behind it.`, fen: lessonPosition?.fen || 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'},
          {label:'The Habit', text:'Before every move, your brain should automatically scan: "After I move this piece, does anything else become undefended?" Most players skip this scan when excited about their own plan.', fen: lessonPosition?.fen || 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'},
          {label:'The Fix', text:'From this moment: before every move, point (mentally or physically) at each of your pieces and ask "Is this safe?" It takes 3 seconds. It will immediately cut your hanging piece mistakes by more than half.', fen: lessonPosition?.fen || 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'},
        ]
      },
      'Missed tactic': {
        title: "Seeing Whats There",
        subtitle: 'Tactical vision from your actual games',
        steps: [
          {label:'Your Pattern', text:`You have missed ${State.analysisData?.pattern_counts?.['Missed tactic']||'several'} tactical opportunities. Good positions are being built then not converted. The issue is stopping your calculation too early.`, fen: lessonPosition?.fen || 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'},
          {label:'The Search', text:'After every opponent move, ask: "What did this move allow?" Check ALL forcing moves — checks, captures, and threats — before considering quiet moves. This is where your missed tactics hide.', fen: lessonPosition?.fen || 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'},
          {label:'The Drill', text:'Solve 10 tactics puzzles every day from your Puzzles tab. These come from YOUR actual games. Every puzzle you solve adds that pattern to your mental library.', fen: lessonPosition?.fen || 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'},
        ]
      },
      'King safety issue': {
        title: 'Protecting Your King',
        subtitle: 'King safety from your actual game positions',
        steps: [
          {label:'Your Vulnerability', text:`Your king has been in danger ${State.analysisData?.pattern_counts?.['King safety issue']||'multiple'} times. Every time this happened, it was preventable. Lets build the reflex to castle early.`, fen: lessonPosition?.fen || 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'},
          {label:'The Rule', text:'Castle within the first 10 moves. Every game. Without exception unless there is a concrete tactical reason not to. A king in the center is an accident waiting to happen.', fen: lessonPosition?.fen || 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'},
          {label:'The Habit', text:'In your next game, after moves 5 and 8, ask yourself: "Why have not I castled yet?" If you cannot give a concrete tactical answer, castle immediately.', fen: lessonPosition?.fen || 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'},
        ]
      },
    };

    const lesson = WEAKNESS_LESSONS[weakness] || WEAKNESS_LESSONS['Hanging piece'];
    let stepIdx = 0;

    const stepsHTML = lesson.steps.map((s,i)=>`<button class="premium-lesson-step${i===0?' active':''}" onclick="showPremiumStep(${i})">${s.label}</button>`).join('');

    premDiv.innerHTML = `
      <div class="premium-lesson-card">
        <div class="premium-lesson-badge">⭐ Your Personal Lesson</div>
        <div class="premium-lesson-title">${esc(lesson.title)}</div>
        <div class="premium-lesson-subtitle">${esc(lesson.subtitle)}</div>
        <div class="premium-lesson-nav">${stepsHTML}</div>
        <div class="premium-lesson-explanation" id="prem-lesson-text">${lesson.steps[0].text}</div>
        <div style="text-align:center;margin-top:.8rem;color:var(--muted);font-size:.78rem">Based on ${gamesAnalysed} games · ${State.analysisData?.total_mistakes||0} mistakes analysed</div>
      </div>`;

    // Store steps for navigation
    window._premiumLessonSteps = lesson.steps;
  }

  // Insert at very top of lesson-content
  const existingPrem = document.getElementById('premium-lesson-section');
  if(existingPrem) existingPrem.remove();
  container.insertBefore(premDiv, container.firstChild);
}

function showPremiumStep(idx){
  const steps = window._premiumLessonSteps;
  if(!steps || idx >= steps.length) return;
  document.getElementById('prem-lesson-text').textContent = steps[idx].text;
  document.querySelectorAll('.premium-lesson-step').forEach((el,i)=>{
    el.classList.toggle('active', i===idx);
  });
}


// Gold theme
if(!document.getElementById('gold-theme-style')){
  const s=document.createElement('style');s.id='gold-theme-style';
  s.textContent='[data-theme="gold"]{--cyan:#ffd32a;--cyan-dim:rgba(255,211,42,.12);--cyan-glow:rgba(255,211,42,.25)}';
  document.head.appendChild(s);
}
// Light mode
if(!document.getElementById('light-mode-style')){
  const s=document.createElement('style');s.id='light-mode-style';
  s.textContent='[data-light="1"]{--bg:#f5f5f7;--bg2:#ffffff;--bg3:#f0f0f5;--bg4:#e8e8f0;--border:#d0d0e0;--text:#1a1a2e;--muted:#555570}';
  document.head.appendChild(s);
}

/* ── Init ─────────────────────────────────────────────────────────────────── */
checkSession().then(handleURLParams);
