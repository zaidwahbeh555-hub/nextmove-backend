/* ChessForge Pro v6 — Complete JS */
const PIECE_VER = 'p2';
// chessboard.js accepts a function here, so the replay board picks up the
// equipped piece set at the moment it renders rather than at file-load time.
const PIECE_THEME = function(piece){
  return '/static/custom/' + Cosmetics.dir + piece + '.svg?v=' + PIECE_VER;
};

/* ── Cosmetics ──────────────────────────────────────────────────────────────
   A board theme is two CSS custom properties; a piece set is a directory
   prefix. Deliberately nothing else — no widths, no flex, no aspect-ratio.
   Board layout is where this app has broken before, so cosmetics stay clear
   of it entirely. Declared here, at the top, because fbPieceEl() reads
   Cosmetics.dir and declaration order has caused real bugs in this file. */
const Cosmetics = {
  board:'midnight', pieces:'classic', dir:'', owned:null,
  topper:'none', face:'none', outfit:'none',
  apply(c){
    if(!c) return;
    // GM Forge's slots are plain ids; the art lives in FORGE_ART.
    let forgeChanged = false;
    ['topper','face','outfit'].forEach(k=>{
      if(c[k] && c[k] !== this[k]){ this[k] = c[k]; forgeChanged = true; }
    });
    if(forgeChanged){ try{ applyForgeCosmetics(); }catch(e){} }
    if(c.light && c.dark){
      const root = document.documentElement.style;
      root.setProperty('--sq-light', c.light);
      root.setProperty('--sq-dark',  c.dark);
      // Texture is a CSS background-image layered over the flat colour. Still
      // paint only -- no geometry, no layout.
      root.setProperty('--sq-light-tex', c.tex_light || 'none');
      root.setProperty('--sq-dark-tex',  c.tex_dark  || 'none');
      this.board = c.board || this.board;
    }
    if(typeof c.dir === 'string' && c.dir !== this.dir){
      this.dir = c.dir;
      this.pieces = c.pieces || this.pieces;
      try{ (ForgeBoard.instances||[]).forEach(b=>{ try{ b.refreshPieces(); }catch(e){} }); }catch(e){}
    } else if(c.pieces){ this.pieces = c.pieces; }
    if(c.owned) this.owned = c.owned;
  }
};

const LESSONS={
  tactics:{title:'Tactics: Forks, Pins & Skewers',subtitle:'The most powerful short-term weapons in chess',priority:'high',icon:'',sections:[
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
  blunders:{title:'How to Stop Blundering',subtitle:'The single biggest rating booster at every level',priority:'high',icon:'',sections:[
    {heading:'Why we blunder',body:'Blunders rarely happen because you dont know chess — they happen because you didn\'t check before moving. The most common causes: moving too fast, emotional reactions, not scanning the whole board, and "hope chess" (assuming the opponent wont find the response).'},
    {heading:'The one-move check — do this EVERY move',body:'Before touching any piece, run this mental checklist:',steps:['<strong>Am I walking into check or losing a piece immediately?</strong>','<strong>Did my move leave anything undefended?</strong> Scan all your pieces.','<strong>What is my opponent threatening on their next move?</strong>','<strong>Is my king safe?</strong>','Only then — make the move.']},
    {tip:'The chess engine makes its move instantly. The difference isnt speed — its that the engine checks everything. Slow down, even when you\'re sure.'},
    {heading:'LPDO — Loose Pieces Drop Off',body:'Before every move, identify all "loose" pieces — pieces with no defender. Loose pieces are always targets. Either defend them, move them, or trade them before your opponent wins them for free.'},
    {heading:'The 3-question blunder check',body:'',steps:['Can my opponent capture any of my pieces for free after this move?','Can my opponent check me, and if so, where does my king go?','Did I just leave something hanging that was defended before?']},
    {warning:'If you ever say "I didn\'t see that" after a game — you weren\'t looking. Train yourself to look every time, even in completely won positions.'},
    {heading:'Time pressure',body:'<strong>Blunder rates spike dramatically in time pressure.</strong> When under 30 seconds, simplify — do not calculate complex variations. A 5-second pause before every move will cut your blunder rate by more than half.'},
  ]},
  kingsafety:{title:'King Safety',subtitle:'Your king is not a piece to play with — until the endgame',priority:'high',icon:'',sections:[
    {heading:'Why king safety is everything',body:'Chess has one goal: checkmate the king. Every other advantage only matters if your king survives to use it. A single king safety lapse can undo 30 perfect moves.'},
    {heading:'Rule 1: Castle in the first 10 moves',body:'Castling moves your king to safety AND connects your rooks. There\'s almost never a valid reason to delay castling past move 10. Castle as soon as your minor pieces are developed.'},
    {tip:'If you\'re past move 10 and haven\'t castled, ask yourself why. If there\'s no concrete tactical reason — castle immediately.'},
    {heading:'Rule 2: Don\'t move castled pawns',body:'The pawns in front of your castled king are its bodyguards. Moving them without a specific concrete reason creates permanent weaknesses your opponent will target all game.'},
    {warning:'Never push h3 or g4 "just to give the king air" in the early middlegame. It weakens your king far more than it helps.'},
    {heading:'Rule 3: Watch the back rank',body:'Once pieces are exchanged, your back rank becomes a target. If your king is behind unmoved pawns, a rook or queen can deliver back-rank mate. Play h3 or g3 early in rook endgames to create an escape square.'},
    {heading:'Signs your king is in danger',body:'',steps:['Opponent has rooks or queens pointing toward your king\'s wing','Your king-side pawns have moved or been traded','All your pieces are on the opposite side of the board','You cannot castle and the center files are open','Your opponent has a knight outpost near your king']},
  ]},
  openings:{title:'Opening Principles That Actually Work',subtitle:'Stop memorising moves. Start understanding why.',priority:'medium',icon:'',sections:[
    {heading:'Why you\'re doing openings wrong',body:'Most players try to memorise opening moves without understanding why. This falls apart the moment the opponent deviates. Instead, master these 4 principles — they apply to every opening ever played.'},
    {heading:'Principle 1: Control the center',body:'The center squares (e4, e5, d4, d5) control the most of the board. Pieces placed in or aimed at the center are significantly more powerful. Open with <strong>1.e4 or 1.d4</strong> to claim central space immediately.'},
    {tip:'A knight in the center attacks up to 8 squares. A knight on the rim attacks only 2.'},
    {heading:'Principle 2: Develop your pieces',body:'Every opening move should bring a new piece into the game. <strong>Develop knights before bishops.</strong> Aim to have all minor pieces developed and king castled within the first 10 moves.'},
    {warning:'Never move the same piece twice in the opening unless absolutely forced. Every repeated move costs you development.'},
    {heading:'Principle 3: Castle early',body:'Your king is a liability in the center. Castle within the first 8 moves in almost every game. Once castled, your king is safe and your rooks are connected.'},
    {heading:'Principle 4: No early queen',body:'Bringing the queen out early lets the opponent attack it with minor pieces while developing for free. Keep the queen back until minor pieces are active.'},
    {heading:'The correct sequence',body:'',steps:['Move 1: e4 or d4','Moves 2-3: Develop both knights','Moves 3-5: Develop both bishops','Moves 5-8: Castle','Only then: Activate the queen']},
  ]},
  capitalize:{title:'How to Punish Your Opponent\'s Mistakes',subtitle:'Turn their errors into decisive wins',priority:'medium',icon:'',sections:[
    {heading:'Games are given away, not won',body:'At club level, most decisive games are decided by mistakes rather than brilliant play. The player who makes the last major mistake usually loses. So two skills matter equally: avoiding your own mistakes AND capitalising on your opponent\'s.'},
    {heading:'Step 1: Ask "why did they play that?"',body:'After every opponent move, before thinking about your own plans, ask: "Why did they just do that? What are they threatening?" If you cannot find a good reason for their move, they may have blundered.'},
    {tip:'If an opponent move seems random or pointless, look harder. Either you\'re missing something, or they are.'},
    {heading:'Step 2: Check for hanging pieces',body:'When your opponent makes a suspicious move, the first thing to check: <strong>did they leave anything undefended?</strong> Capture hanging pieces immediately — dont celebrate and then forget to take them.'},
    {heading:'Step 3: Attack long-term weaknesses',body:'Not all mistakes are immediate blunders. Some create permanent weaknesses:\n\n<strong>Pawn weaknesses:</strong> Isolated, doubled, or backward pawns need constant defence.\n<strong>King exposure:</strong> Attack an uncastled or poorly-castled king relentlessly.\n<strong>Open files:</strong> If they open a file toward their own king, double rooks on it immediately.'},
    {heading:'Step 4: Don\'t let them back in',body:'The biggest mistake after your opponent blunders: letting them recover.',steps:['Simplify into a winning endgame when possible','Don\'t go for complications you haven\'t calculated','Trade pieces when ahead in material','Keep your own king safe']},
    {warning:'When you\'re winning, slow down even more than usual. Excitement causes blunders. The win isnt yours until its over.'},
  ]},
  calculation:{title:'How to Calculate Properly',subtitle:'See further, miss less, win more',priority:'high',icon:'',sections:[
    {heading:'What is calculation?',body:'Calculation is the process of visualising sequences of moves in your head before making them. It\'s one of the most trainable skills in chess and directly determines your tactical strength.'},
    {heading:'The CANDIDATE method',body:'When you spot a promising position, identify 2-3 candidate moves before calculating any of them. This prevents you from tunnel-visioning on the first thing you see.',steps:['Find all forcing moves first (checks, captures, threats)','Then look for tactical ideas','Finally consider positional moves','Only then calculate each candidate in detail']},
    {tip:'The best move is rarely the first one you see. Always look for something better before committing.'},
    {heading:'Calculation discipline',body:'When calculating a line, <strong>never back out mid-calculation</strong> to check another line. Follow each variation to its logical conclusion before evaluating alternatives. This builds the mental "tree" of possibilities.'},
    {heading:'How deep should you calculate?',body:'Calculate until the position is "quiet" — no more captures, checks, or major threats. Many players stop too early and miss important continuations.'},
    {heading:'Visualisation training',body:'',steps:['Set up a position and close your eyes','Try to visualise where pieces would be after 3 moves','Open eyes and verify','Repeat — this builds your mental board'],},
    {warning:'Calculating 10 moves of a wrong variation is worse than calculating 3 moves of the right one. Quality over quantity.'},
  ]},
  threats:{title:'Evaluating Threats',subtitle:'See what your opponent is planning before its too late',priority:'high',icon:'',sections:[
    {heading:'The most important question in chess',body:'After every single opponent move, ask: <strong>"What is my opponent threatening?"</strong> This one habit will eliminate the majority of your losses. Most blunders happen not because we dont know tactics, but because we ignore the opponent\'s plans.'},
    {heading:'Types of threats',body:'<strong>Immediate threats:</strong> Can win material or checkmate next move. Must be dealt with immediately.\n\n<strong>Long-term threats:</strong> Plans the opponent is building toward. Can often be countered while making your own move.\n\n<strong>Positional threats:</strong> Subtle improvements like occupying an outpost or opening a file.'},
    {heading:'How to assess a threat',body:'When you identify a threat, ask: "If I dont respond, what happens?" Then evaluate how bad that outcome actually is. Sometimes the best response to a threat is to create a bigger counter-threat.'},
    {tip:'You dont always have to defend directly. Often the best response to a threat is a counter-attack.'},
    {heading:'The threat of the threat',body:'Advanced players think one level deeper — they consider not just the current threat, but what threat the opponent will make AFTER you respond. This prevents walking from one problem into another.'},
    {heading:'Threat evaluation checklist',body:'',steps:['What can my opponent do if I ignore their move?','Is the threat immediate or long-term?','Can I counter-attack instead of defending?','If I defend, does it create new threats for me?','After my move, what will they do next?']},
  ]},
  pieces:{title:'Using Your Pieces Effectively',subtitle:'Good pieces win games. Passive pieces lose them.',priority:'medium',icon:'',sections:[
    {heading:'The fundamental principle',body:'Every piece should be on its best possible square. A bad piece — a knight on the rim, a bishop blocked by its own pawns — is nearly worthless regardless of how many pieces you have. <strong>Every move, ask: "Is this piece doing its job?"</strong>'},
    {heading:'Knights: outposts are everything',body:'A knight needs a stable base to be effective. An <strong>outpost</strong> is a square in enemy territory that no enemy pawn can attack. A knight on an outpost in the center is a monster piece.'},
    {tip:'To create a knight outpost, trade the pawn that would attack it. Then march your knight in — your opponent cannot kick it out.'},
    {heading:'Bishops: open diagonals',body:'Bishops are useless when their diagonals are blocked by their own pawns. Key rule: <strong>Don\'t fix pawns on the same color as your bishop.</strong> In bishop vs knight endgames, open positions favour the bishop; closed positions favour the knight.'},
    {heading:'Rooks: open files and 7th rank',body:'A rook needs an open file to penetrate. <strong>Control of open files controls the game.</strong> Double rooks on the open file and invade to the 7th rank — a rook on the 7th rank simultaneously attacks all unmoved enemy pawns.'},
    {heading:'The queen: power with care',body:'The queen is most effective coordinating with other pieces. Don\'t bring it out early. A queen alone achieves little — its the combination of queen plus rooks, bishops, or knights that creates unstoppable threats.'},
    {heading:'Piece coordination check',body:'',steps:['Is any of my pieces doing nothing useful?','Can I trade my worst piece for a well-placed enemy piece?','Is there an outpost for a knight?','Are my rooks on open or half-open files?','Are all my pieces working toward the same plan?']},
  ]},
  endgame:{title:'Endgame Fundamentals',subtitle:'Where games are won and lost at every level',priority:'medium',icon:'',sections:[
    {heading:'Why the endgame matters',body:'Most players spend 90% of study time on openings. But at club level, games reach the endgame constantly — and the player who knows basic endgame technique almost always converts the win. These are not optional extras.'},
    {heading:'Activate your king immediately',body:'In the opening and middlegame, the king hides. In the endgame, the king becomes a powerful fighting piece. <strong>The most common endgame mistake: leaving the king passive.</strong> March your king toward the center or passed pawns the moment queens come off.'},
    {tip:'Every tempo your king spends passively in the endgame is a tempo your opponent uses to activate their king or advance pawns.'},
    {heading:'The opposition',body:'When two kings face each other with one square between them, the player who must move is "in opposition" and loses ground. In king-and-pawn endgames, gaining the opposition is often decisive. Practice K+P vs K until you win or draw from any position automatically.'},
    {heading:'Passed pawns must be pushed',body:'A passed pawn (no enemy pawn can stop it queening) is a massive advantage — but only if you advance it. Push passed pawns immediately and relentlessly.'},
    {heading:'Rook endgames essentials',body:'<strong>Rooks belong behind passed pawns</strong> (yours or your opponent\'s).\n<strong>Know the Lucena and Philidor positions</strong> cold — the two most important rook endgame techniques.'},
    {heading:'Simplify when winning',body:'',steps:['When ahead in material, trade pieces (not pawns)','Keep rooks active — put them behind passed pawns','The side with more pawns should try to create a passed pawn','Use your king aggressively']},
  ]},
  pawnstructure:{title:'Pawn Structure',subtitle:'Pawns are the soul of chess',priority:'medium',icon:'',sections:[
    {heading:'Why pawns matter',body:'Pawns are the only pieces that cannot move backward. Every pawn move creates a permanent structural change. Understanding pawn structure means understanding what plans are available to both sides.'},
    {heading:'Pawn weaknesses to avoid',body:'<strong>Isolated pawn:</strong> A pawn with no friendly pawns on adjacent files. It needs piece protection and is a permanent target.\n\n<strong>Doubled pawns:</strong> Two pawns on the same file. One of them can never be protected by the other and they block each other.\n\n<strong>Backward pawn:</strong> A pawn that cannot be advanced without being captured, left behind by its neighbors.'},
    {tip:'Before making a pawn move, ask: "Will this pawn be a weakness or a strength?" Most pawn weaknesses are permanent.'},
    {heading:'Pawn majorities',body:'A pawn majority is having more pawns on one side of the board than your opponent. In endgames, a pawn majority creates a passed pawn. Identify your pawn majority and use it.'},
    {heading:'Open and half-open files',body:'When a pawn is traded, it opens files for rooks. The player who controls open files controls the game. Place your rooks on open files and semi-open files (files with only your opponent\'s pawns).'},
    {heading:'Pawn chains',body:'A pawn chain is a diagonal line of pawns protecting each other. <strong>Attack the base of the pawn chain</strong> — the back pawn that supports the whole structure. The head of the chain is strong; the base is weak.'},
  ]},
  planning:{title:'How to Make a Plan',subtitle:'Chess without a plan is just moving pieces',priority:'medium',icon:'',sections:[
    {heading:'Why most players dont have a plan',body:'Most club players react to threats without ever having a clear plan. They move whatever piece looks active or responds to the opponent\'s last move. This reactive style means they\'re always a step behind.'},
    {heading:'How to form a plan',body:'After every move, assess the position:',steps:['What are the imbalances? (material, space, piece activity, pawn structure)','What does each side\'s ideal position look like?','What is preventing you from reaching that ideal position?','Make a move that improves your worst-placed piece or achieves part of the plan']},
    {tip:'A bad plan is better than no plan at all. Having a direction to work toward prevents random moves.'},
    {heading:'Short-term vs long-term plans',body:'<strong>Short-term plans</strong> (1-3 moves): Respond to immediate threats, capture material, deliver tactics.\n\n<strong>Long-term plans</strong> (5+ moves): Reposition pieces, create a passed pawn, undermine the opponent\'s king safety, trade into a favourable endgame.'},
    {heading:'Common plans to know',body:'',steps:['Minority attack: advance 2 pawns against 3 to create a weakness','Exchange sacrifice: give a rook for a bishop/knight to gain positional compensation','Piece sacrifice: give material for long-term positional advantage','King march: activate the king in the endgame']},
    {heading:'Changing plans',body:'A plan should be updated when the position changes. If your opponent makes a move that disrupts your plan, re-evaluate rather than blindly continuing.'},
  ]},
  exchanges:{title:'When to Trade Pieces',subtitle:'Knowing when to simplify changes everything',priority:'medium',icon:'',sections:[
    {heading:'The exchange decision',body:'One of the most important decisions in chess is whether to trade pieces or avoid trades. There\'s no universal answer — it depends entirely on the position. Here are the guidelines.'},
    {heading:'Trade when you\'re ahead',body:'When you have more material, <strong>simplify by trading pieces</strong> (not pawns). Fewer pieces means your material advantage becomes more decisive. In a king and pawn endgame, extra material almost always wins.'},
    {heading:'Avoid trades when cramped',body:'When your position is cramped and your pieces have limited scope, trades give you more room. But if you\'re already active, avoid trades that give your opponent breathing room.'},
    {tip:'Trade your worst piece for your opponent\'s best piece. This principle alone will improve your positions significantly.'},
    {heading:'Trading into endgames',body:'<strong>Trade queens when you have a material advantage</strong> — queens give the trailing side the most chances to create complications. When ahead, simplify. When behind, keep queens.'},
    {heading:'The exchange sacrifice',body:'Sometimes giving a rook for a bishop or knight is correct. This "exchange sacrifice" makes sense when:\n- Your piece has no good moves and will be permanently passive\n- You get a massive positional advantage in return\n- You disrupt the opponent\'s pawn structure'},
    {heading:'When NOT to trade',body:'',steps:['When your piece is your strongest attacker','When trading gives the opponent an open file','When you\'re attacking and the piece is essential to the attack','When the trade releases tension you want to maintain']},
  ]},
  initiative:{title:'Playing with Initiative',subtitle:'The player who attacks decides the game',priority:'medium',icon:'',sections:[
    {heading:'What is initiative?',body:'Initiative means your opponent must respond to your threats rather than pursuing their own plans. The player with initiative dictates the flow of the game. Maintaining initiative is often more important than winning material.'},
    {heading:'How to gain initiative',body:'',steps:['Develop faster than your opponent in the opening','Create threats your opponent must respond to','Open files and diagonals for your pieces','Attack the king before it has castled','Keep your pieces coordinated and active']},
    {tip:'Every tempo you spend responding to your opponent\'s threats is a tempo you\'re not using to build your own attack.'},
    {heading:'Maintaining initiative',body:'Once you have the initiative, <strong>dont let go.</strong> Create new threats before the old ones are resolved. Give your opponent no time to breathe. The moment you stop threatening, they can reorganise and take the initiative back.'},
    {heading:'Counter-initiative',body:'When your opponent has the initiative, look for counterplay rather than pure defence. A successful counter-attack is far more effective than passive defence. Ask: "Can I create a bigger threat on the other side of the board?"'},
    {heading:'Sacrificing for initiative',body:'Sometimes giving material to maintain initiative is completely correct. A pawn sacrifice that opens lines, brings all your pieces into the attack, and prevents your opponent from castling can be worth far more than the pawn.'},
  ]},
  defense:{title:'How to Defend',subtitle:'Great defence is a skill — not just "not blundering"',priority:'medium',icon:'',sections:[
    {heading:'Defence is underrated',body:'Most chess improvement content focuses on attack. But the ability to defend accurately under pressure is what separates players who survive complications from those who collapse. Defence is a learnable skill.'},
    {heading:'The defensive mindset',body:'When under attack, the instinct is to panic and make impulsive moves. Instead:\n\n1. Take a deep breath\n2. Assess the ACTUAL danger (not perceived)\n3. Find the most accurate defence\n4. Look for counter-chances'},
    {tip:'Most attacks can be defended if you calculate carefully. The attacker needs everything to work. The defender only needs one good move.'},
    {heading:'Types of defence',body:'<strong>Direct defence:</strong> Move a threatened piece to safety or add a defender.\n<strong>Counter-attack:</strong> Create a bigger threat elsewhere.\n<strong>Simplification:</strong> Trade pieces to reduce attacking resources.\n<strong>Prophylaxis:</strong> Prevent the threat before it materialises.'},
    {heading:'Prophylactic thinking',body:'Great defenders dont wait for threats to materialise — they prevent them. Prophylaxis means making moves that stop your opponent\'s plans before they become dangerous. Ask yourself: "What is my opponent planning? Can I stop it now at minimal cost?"'},
    {heading:'When to defend, when to counter-attack',body:'',steps:['If the attack is decisive, defend accurately','If the attack is slow, counter-attack immediately','If material equal, look for simplification','If losing, complicate — dont go quietly']},
  ]},
  coordinates:{title:'Board Vision & Coordinates',subtitle:'See the whole board, not just where you\'re looking',priority:'medium',icon:'',sections:[
    {heading:'Why board vision matters',body:'Many tactical mistakes happen not because players dont know the tactics, but because they literally dont see the whole board. Pieces in the corner or on the far side get ignored. Developing consistent, wide board vision is trainable.'},
    {heading:'The 64-square habit',body:'After every opponent move, before thinking about your own plans, do a quick scan of all 64 squares. It takes 3 seconds. Look for:\n- Undefended pieces\n- Pieces that have changed their attack patterns\n- New diagonals or files that opened'},
    {tip:'Specifically look at pieces that haven\'t moved recently — they\'re often the ones that get forgotten and left hanging.'},
    {heading:'Learning coordinates',body:'Being able to quickly identify squares by name (e4, f6, etc.) helps enormously when visualising moves. Practice by:\n1. Opening a board\n2. Closing your eyes\n3. Someone calls a square name\n4. Point to where it is\n5. Repeat until instant recognition'},
    {heading:'Piece awareness drill',body:'Before making any move, point to every one of your pieces and ask: "Is this piece safe? Is it doing something useful?" This sounds simple but most blunders happen to pieces we\'ve mentally forgotten about.'},
    {heading:'Peripheral vision',body:'',steps:['When calculating a line, periodically check the whole board','Don\'t get so focused on one area that you miss a piece elsewhere','Use process of elimination — if you cannot find the opponent\'s threat, check every piece systematically']},
  ]},
  mindset:{title:'Chess Mindset & Psychology',subtitle:'The mental game that decides who wins',priority:'medium',icon:'',sections:[
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
  patterns:{title:'Pattern Recognition',subtitle:'The foundation of chess strength',priority:'high',icon:'',sections:[
    {heading:'What is pattern recognition?',body:'Chess masters dont calculate everything from scratch — they recognise familiar patterns and know the correct responses almost instantly. This "chunking" of knowledge is what makes strong players faster and more accurate.'},
    {heading:'Types of patterns',body:'<strong>Tactical patterns:</strong> Forks, pins, skewers, back-rank mates, smothered mates, discovered attacks.\n\n<strong>Positional patterns:</strong> Outposts, bishop pairs, pawn majorities, rook on 7th.\n\n<strong>Opening patterns:</strong> Standard development schemes, common pawn breaks.\n\n<strong>Endgame patterns:</strong> Opposition, Lucena/Philidor, triangulation.'},
    {tip:'Every puzzle you solve correctly adds a pattern to your mental library. Consistent puzzle training is the most efficient way to build pattern recognition.'},
    {heading:'How patterns are built',body:'Pattern recognition is built through repeated exposure. Every time you see a position and correctly identify the key idea, that pattern becomes more accessible in future games. This is why puzzle training works — even "seeing" a pattern incorrectly and then seeing the answer builds the pattern.'},
    {heading:'Pattern vs calculation',body:'Strong players use pattern recognition to quickly identify candidate moves, then use calculation to verify them. Pure calculation without patterns is slow and error-prone. Pure patterns without calculation leads to tactical blunders.'},
    {heading:'Building your pattern library',body:'',steps:['Solve 10 puzzles daily, even if its just 5 minutes','Review games of great players and note recurring themes','After losing, identify the tactical or positional pattern you missed','Study endgame positions until you can recognise them instantly']},
  ]},
  strategy:{title:'Strategic Chess',subtitle:'The long-term thinking that creates winning positions',priority:'medium',icon:'',sections:[
    {heading:'Tactics vs strategy',body:'Tactics are about immediate gains — winning material or giving checkmate. Strategy is about building a position where tactics work in your favor. Strategy creates the conditions; tactics execute them.'},
    {heading:'Imbalances',body:'Great chess thinking starts by identifying the imbalances — the differences between the two positions. Common imbalances:\n\n- Material: who has more pieces or pawns?\n- Space: who controls more of the board?\n- Piece activity: whose pieces are better placed?\n- Pawn structure: who has weaknesses/strengths?\n- King safety: whose king is safer?'},
    {tip:'The player who correctly identifies the imbalances and chooses the right plan based on them wins more games than any brilliant calculator.'},
    {heading:'Working with your pawn structure',body:'Your pawn structure tells you what plan to play. Isolated d-pawn positions call for piece activity and attacking play. Carlsbad pawn structures suggest a minority attack. Understand common structures and their associated plans.'},
    {heading:'Piece vs piece decisions',body:'<strong>Bishop pair advantage:</strong> Two bishops vs bishop and knight, or two knights. The bishop pair is powerful in open positions.\n<strong>Knight vs bishop:</strong> Knights are better in closed positions with fixed pawn structures. Bishops shine in open games.'},
    {heading:'Strategic thinking process',body:'',steps:['Assess the current imbalances in the position','Determine whose position is better and why','Find the plan that improves your position or exploits the opponent\'s weakness','Execute the plan move by move while responding to threats']},
  ]},
  rooks:{title:'Mastering Rook Play',subtitle:'The most underutilised piece at club level',priority:'medium',icon:'',sections:[
    {heading:'Why rooks are underused',body:'At club level, rooks are often the last pieces to become active. Players develop minor pieces, castle, then forget about their rooks. Strong players prioritise rook activation and treat open files as highways to victory.'},
    {heading:'Rooks need open files',body:'A rook on a closed file is nearly useless. Your first priority should always be: <strong>put your rooks on open or semi-open files.</strong> Double rooks on an open file for maximum pressure.'},
    {tip:'Before making a positional move, ask: "Does this help or hurt my rooks?" Every time you open a file, your rooks benefit.'},
    {heading:'The 7th rank',body:'A rook on the 7th rank (your opponent\'s second rank) is devastatingly powerful. It attacks all unmoved pawns simultaneously and cuts off the enemy king. Invade to the 7th rank whenever possible.'},
    {heading:'Rooks behind passed pawns',body:'In endgames, always place your rook BEHIND a passed pawn — yours or your opponent\'s. Behind your passed pawn, the rook pushes it forward. Behind your opponent\'s, it restricts it.'},
    {heading:'Rook endgame technique',body:'',steps:['Put your king in front of your passed pawn', 'Place your rook behind your passed pawn','Cut off the enemy king from the queening square','Use the Lucena and Philidor positions as your foundation','Trade rooks into a won king-pawn endgame when ahead']},
  ]},
  bishops:{title:'The Power of Bishops',subtitle:'Long-range dominance when used correctly',priority:'medium',icon:'',sections:[
    {heading:'The bishop\'s strength',body:'Bishops are long-range pieces that can control an entire diagonal from across the board. In open positions, bishops are often stronger than knights. The bishop pair — having both bishops when the opponent doesnt — is considered a significant advantage.'},
    {heading:'Good bishop vs bad bishop',body:'A <strong>good bishop</strong> has open diagonals and is not blocked by its own pawns. A <strong>bad bishop</strong> is blocked by pawns fixed on the same color squares it travels. Avoid fixing your pawns on the same color as your bishop.'},
    {tip:'When placing pawns in the opening and middlegame, ask: "Is this pawn going on the same color as my bishop?" If yes, reconsider.'},
    {heading:'Bishop pair advantage',body:'The bishop pair is strongest in open positions where both bishops can be active simultaneously. To exploit the bishop pair:\n1. Open the position with pawn breaks\n2. Trade the opponent\'s good pieces\n3. Create targets on different parts of the board'},
    {heading:'Fianchetto',body:'A fianchettoed bishop (developed to g2/b2 or g7/b7) controls a long diagonal and is often very powerful. It\'s particularly strong when pointing at the opponent\'s castled king or controlling the center from a distance.'},
    {heading:'Trading bishop for knight',body:'',steps:['Trade your bad bishop for an active enemy knight','Keep your good bishop and trade the opponent\'s','In endgames, a bishop is usually better than a knight with passed pawns on both sides of the board']},
  ]},
  knights:{title:'Knight Mastery',subtitle:'The tricky piece that controls the board',priority:'medium',icon:'',sections:[
    {heading:'What makes knights special',body:'Knights are the only pieces that jump over other pieces. Their L-shaped movement means they\'re unpredictable and can surprise opponents. Unlike bishops, knights can access all 64 squares regardless of position color.'},
    {heading:'Knights need outposts',body:'An <strong>outpost</strong> is a square in the opponent\'s territory that cannot be attacked by an enemy pawn. A knight on an outpost is one of the most powerful pieces in chess — its a permanent fixture that the opponent cannot remove.'},
    {tip:'To create a knight outpost, trade the pawn that defends that square. Then station your knight there permanently.'},
    {heading:'Knight vs bishop',body:'Knights are superior to bishops in:\n- Closed positions with fixed pawn structures\n- Positions where the knight has a strong outpost\n- Endgames with pawns on only one side of the board\n\nBishops are superior in open positions and when pawns are on both sides.'},
    {heading:'Knight manoeuvres',body:'Knights often need several moves to reach their ideal squares. Plan these manoeuvres in advance — a knight heading to c5 might need to go Nd3-b4-c6-d4 or similar. Calculate the path and ensure its safe.'},
    {heading:'The octopus knight',body:'A knight placed on a central square that cannot be attacked is called an "octopus" knight. From d5 or e5 (for White), a knight attacks 8 squares and coordinates with other pieces to dominate the entire board. Achieving this structure is often a winning advantage.'},
  ]},
  queenplay:{title:'Queen Play',subtitle:'The most powerful piece — used wisely',priority:'medium',icon:'',sections:[
    {heading:'The queen\'s role',body:'The queen is the most powerful piece but also the most easily misused. Beginners bring it out too early. Advanced players sometimes under-activate it. The key is understanding WHEN and WHERE the queen belongs.'},
    {heading:'Don\'t centralise too early',body:'Bringing the queen out before developing other pieces gives the opponent tempo: they develop a piece while attacking your queen. Every time your queen runs away from an attack, your opponent gains time. Develop minor pieces first.'},
    {tip:'The queen is most powerful when the position is open and your other pieces are already active. Then it can coordinate with everything.'},
    {heading:'Queen and rook coordination',body:'Queens and rooks on the same file or rank create devastating battery attacks. A queen and rook (or two rooks) on an open file pointing at the king is often immediately decisive.'},
    {heading:'Lone queen attacks',body:'A queen attacking alone is rarely decisive — the opponent can defend with a single piece. Successful queen attacks always involve coordination with at least one other attacking piece. Never sacrifice material for a lone queen attack.'},
    {heading:'Queen in the endgame',body:'In queen endgames, activity is everything. A centralised queen that gives perpetual check threats or creates passed pawns is far stronger than a passive queen. King safety becomes critical — a queen can deliver checkmate alone with the king in the corner.'},
    {heading:'When to trade queens',body:'',steps:['Trade queens when you have a material advantage','Keep queens when you need counterplay','Trade queens to neutralise opponent\'s attack','Avoid queen trades when your queen is the only active piece']},
  ]},
  attacking:{title:'How to Attack the King',subtitle:'The art of the decisive assault',priority:'medium',icon:'',sections:[
    {heading:'When to attack',body:'Not every position calls for a direct attack. You should attack when:\n- You have more pieces aimed at the king\'s area\n- Your opponent\'s king hasn\'t castled or has castled into a weak structure\n- You have a pawn storm already in motion\n- Your opponent\'s pieces are on the wrong side of the board'},
    {heading:'Prerequisites for a successful attack',body:'',steps:['Open files or diagonals pointing at the king','More attacking pieces than the defender has defenders','No immediate counter-attacks from the opponent','Calculation showing the attack works']},
    {tip:'The most common mistake in attacks: starting before the position is ready. Make sure ALL your pieces are participating before sacrificing material.'},
    {heading:'The pawn storm',body:'Advancing pawns toward the opponent\'s castled king creates open files for rooks and weakens the pawn shelter. The pawn storm works best when the king\'s position is already compromised and your pieces can quickly exploit the openings created.'},
    {heading:'The exchange sacrifice',body:'Giving a rook for a bishop or knight to destroy the king\'s defensive cover is a common attacking theme. If it removes the key defender and opens lines to the king, the exchange sacrifice is often sound.'},
    {heading:'Mating nets',body:'A mating net is a position where the king cannot escape checkmate regardless of what it does. Build mating nets by:\n1. Cut off king escape squares\n2. Bring all attacking pieces to bear\n3. Deliver the final blow'},
  ]},
  practical:{title:'Practical Decision Making',subtitle:'Chess is a game of decisions — make better ones',priority:'medium',icon:'',sections:[
    {heading:'The practical approach',body:'In a game, you rarely have time for complete analysis. Practical chess means making good-enough decisions quickly — finding moves that are hard to refute even if not always technically best.'},
    {heading:'When to complicate',body:'Create complications when:\n- You\'re losing — a complicated position gives you more chances\n- Your opponent is in time pressure\n- The position favors the side that calculates better (usually the stronger player)\n\nAvoid complications when winning — a simple, technical win is always best.'},
    {tip:'If you have a good move, play it. You dont need to find the best move every time — good enough usually wins.'},
    {heading:'Choosing between moves',body:'When two moves seem equally good, choose the one that:\n- Is safer (harder to go wrong)\n- Keeps more options open\n- Puts pressure on your opponent\n- Is easier to execute correctly under time pressure'},
    {heading:'Prophylaxis in practice',body:'The most practical skill: preventing your opponent\'s plans before they materialise. Every move, ask: "What is my opponent planning for next move? Can I stop it now?" This prevents 90% of tactical disasters.'},
    {heading:'Decision-making framework',body:'',steps:['Identify what your opponent is threatening','Find 2-3 candidate moves that address the threat','Calculate each briefly','Choose the one that creates the most problems for the opponent','Sanity check: any blunders?','Play it']},
  ]},
  improvement:{title:'How to Actually Improve',subtitle:'The most efficient path to a higher rating',priority:'high',icon:'',sections:[
    {heading:'Why most players stop improving',body:'Most club players plateau because they play the same games the same way without structured review. Playing 100 games without analysis gives you 100 repetitions of the same mistakes. Playing 10 games with deep analysis gives you 10 lessons.'},
    {heading:'The improvement formula',body:'',steps:['Play a game (use a time control with increment — not blitz)','After the game, analyse it WITHOUT an engine first','Write down what you think you did wrong','THEN check with the engine','Focus on positions where your assessment was wrong']},
    {tip:'Analysing without the engine first is the most important step. It forces you to use your own judgment, which is what improves.'},
    {heading:'How to use ChessForge most effectively',body:'1. Analyse 2-3 games per week (not every blitz game)\n2. Look at your top weaknesses\n3. Go to your Lessons tab — sorted by your actual weaknesses\n4. Solve your personal puzzles (from YOUR blunders)\n5. In the next game, focus specifically on your #1 weakness'},
    {heading:'Consistent small habits beat intense bursts',body:'30 minutes every day will improve you faster than 5 hours on the weekend. The brain learns through repetition and sleep consolidation. Make chess improvement a daily habit, not an occasional marathon.'},
    {heading:'What to study based on your level',body:'Under 1000: Focus exclusively on not hanging pieces (LPDO). Tactics puzzles.\n\n1000-1400: Tactics + basic endgames (K+P vs K, basic rook endgames). Opening principles.\n\n1400-1800: Positional concepts, pawn structures, piece coordination. Deeper calculation.\n\nAbove 1800: Study your specific weaknesses through game analysis.'},
  ]},
};

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
function setXP(val, balance){
  State.xp = val;
  if(balance !== undefined && balance !== null) State.balance = balance;
  // The chip opens the shop, so it shows what is actually spendable. Lifetime
  // XP still drives the level bar — that is what it measures.
  const spend = (State.balance === undefined || State.balance === null) ? val : State.balance;
  const c = document.getElementById('xp-count'); if(c) c.textContent = spend;
  const l = document.getElementById('user-xp-label');
  if(l) l.textContent = (State.plan==='pro'?'GM · ':'') + spend + ' XP to spend';
  const f = document.getElementById('xp-fill');
  if(f) f.style.width = Math.min((val%500)/500*100,100)+'%';
}
// Anything that changes the balance repaints the chip, so the two can never
// drift apart on screen.
function syncBalance(balance){
  if(balance === undefined || balance === null) return;
  State.balance = balance;
  setXP(State.xp, balance);
}
window.syncBalance = syncBalance;
async function awardXP(amount,type,lessonId,fen){
  State.xp+=amount; setXP(State.xp);
  if(State.loggedIn){
    const body={amount,type};if(lessonId)body.lesson_id=lessonId;if(fen)body.fen=fen;
    try{
      const r=await fetch('/auth/add-xp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'include'});
      const d=await r.json();
      if(d.xp!==undefined)setXP(d.xp, d.balance);
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

/* ── Retractable side rails ──────────────────────────────────────────────────
   The play screen puts coaching in three places at once — a rail on the left, a
   strip above the board and a panel on the right — so the eye has to travel and
   the board gets squeezed. Either side can now be folded away, the board takes
   the space back, and the choice is remembered. Nothing is destroyed by
   collapsing; the panel is still in the DOM and still updating. */
const Rails = (function(){
  const KEY = 'cf_rails';
  let state = {right:true};

  function load(){
    try{ const s = JSON.parse(localStorage.getItem(KEY)||'null');
      if(s && typeof s.right === 'boolean') state = {right: s.right};
    }catch(e){}
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }

  function apply(){
    document.body.classList.toggle('rail-right-off', !state.right);
    const r = document.getElementById('side-toggle');
    if(r){ r.setAttribute('aria-label', state.right ? 'Hide the coach panel' : 'Show the coach panel');
           r.title = r.getAttribute('aria-label'); }
    // The pointer arm is drawn against live geometry, so it has to be redrawn
    // once the board has moved.
    setTimeout(()=>{ try{
      if(window.ForgePointer && ForgePointer.active && ForgePointer.lastSquare)
        ForgePointer.pointAt(ForgePointer.lastSquare, {sweep:true});
    }catch(e){} }, 300);
  }
  function toggle(side){ state[side] = !state[side]; save(); apply(); }

  function init(){
    load(); apply();
    const r = document.getElementById('side-toggle');
    if(r) r.addEventListener('click', ()=>toggle('right'));
  }
  return {init, toggle};
})();
window.Rails = Rails;

/* ── Think it through ────────────────────────────────────────────────────────
   The answer to "I have no idea what to do here". Rather than narrating an
   observation, it walks the actual procedure: count the attackers and
   defenders, decide whether anything is genuinely loose, then choose. Every
   number comes from the server, measured off the real position.

   The board is never dimmed, covered or moved during any of it — the whole
   point is to look at the position while thinking about it. */
const Ladder = (function(){
  const $ = (id)=>document.getElementById(id);
  let steps = [], i = 0, answered = false;

  function el(){ return $('ladder'); }

  // The position one move ago. Replayed rather than undone, because a board
  // rebuilt from a FEN has no history to step back through.
  function prevFen(){
    try{
      const h = BotState.game.history();
      if(!h.length) return '';
      const tmp = new Chess();
      for(let n=0; n<h.length-1; n++) tmp.move(h[n]);
      return tmp.fen();
    }catch(e){ return ''; }
  }
  function show(on){
    const l = el(), b = $('ladder-open');
    if(l) l.classList.toggle('hidden', !on);
    if(b) b.classList.toggle('hidden', on);
    if(!on && window.ForgePointer) ForgePointer.retract();
  }

  // `about` lets the ladder open in response to something -- the opponent's
  // last move, or a mistake -- so it starts from what just changed rather than
  // from a cold count.
  async function open(about){
    if(!BotState || !BotState.game){ return; }
    // Leaning on the coach is counted, so the Progress page can show you
    // needing him less over time.
    BotState.helpUsed = (BotState.helpUsed || 0) + 1;
    const btn = $('ladder-open');
    if(btn){ btn.disabled = true; btn.textContent = 'Reading the position…'; }
    try{
      const r = await fetch('/coach/ladder', {method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({fen: BotState.game.fen(),
                              last_san: (about && about.last) || '',
                              prev_fen: prevFen(),
                              reason:   (about && about.reason) || ''})});
      const d = await r.json();
      if(!r.ok || !d.steps || !d.steps.length){
        if(btn) btn.textContent = "I don't know what to do here";
        return;
      }
      steps = d.steps; i = 0; show(true); render();
    }catch(e){ console.error('ladder failed:', e); }
    finally{
      if(btn){ btn.disabled = false; btn.innerHTML =
        '<svg class="ic" aria-hidden="true"><use href="#ic-bulb"/></svg> I don\'t know what to do here'; }
    }
  }

  function render(){
    const s = steps[i]; if(!s) return;
    answered = false;
    $('ladder-step').textContent = (i+1) + ' of ' + steps.length;
    $('ladder-title').textContent = s.title || '';
    $('ladder-body').textContent = s.body || '';
    const fb = $('ladder-fb'); fb.classList.add('hidden'); fb.textContent = '';
    const next = $('ladder-next'); next.classList.add('hidden');

    // Counting table — the numbers, shown rather than asserted.
    const rows = $('ladder-rows');
    if(s.kind === 'count' && (s.rows||[]).length){
      rows.innerHTML = s.rows.map(r=>
        '<div class="lrow'+(r.loose?' is-loose':'')+'">'+
          '<span class="lrow-pc">'+esc(r.piece)+' '+esc(r.square)+'</span>'+
          '<span class="lrow-n">'+r.attackers+' attacking</span>'+
          '<span class="lrow-n">'+r.defenders+' defending</span>'+
          (r.loose?'<span class="lrow-tag">loose</span>':'')+
        '</div>').join('');
      rows.classList.remove('hidden');
    } else { rows.innerHTML=''; rows.classList.add('hidden'); }

    // Point at what is being discussed.
    if((s.point||[]).length && window.ForgePointer){
      if(s.point.length > 1) ForgePointer.sequence(s.point, 850);
      else ForgePointer.pointAt(s.point[0]);
    } else if(window.ForgePointer){ ForgePointer.retract(); }

    const opts = $('ladder-opts');
    if(s.kind === 'yesno'){
      opts.innerHTML = '<button class="lopt" data-v="1">Yes</button>'+
                       '<button class="lopt" data-v="0">No</button>';
      wire(opts, (v)=>{
        const right = (!!+v) === !!s.answer;
        mark(opts, v, s.answer ? '1' : '0');
        say(right ? (s.answer ? s.why_yes : s.why_no) : (s.answer ? s.why_yes : s.why_no), right);
      });
    } else if(s.kind === 'mcq'){
      opts.innerHTML = (s.options||[]).map((o,n)=>
        '<button class="lopt" data-v="'+n+'">'+esc(o)+'</button>').join('');
      wire(opts, (v)=>{
        const right = (+v === s.answer);
        mark(opts, v, String(s.answer));
        say(right ? s.why_right : s.why_wrong, right);
      });
    } else {
      // 'count' and 'note' rungs are read-then-continue.
      opts.innerHTML = '';
      next.textContent = (i < steps.length - 1) ? 'Next' : 'Got it';
      next.classList.remove('hidden');
    }
  }

  // Draw attention to the button without opening anything, for moments that are
  // worth a look but not worth interrupting for.
  function nudge(label){
    const b = $('ladder-open');
    if(!b || !el() || !el().classList.contains('hidden')) return;
    if(label) b.dataset.label = label;
    b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#ic-bulb"/></svg> ' +
                  esc(label || "I don't know what to do here");
    b.classList.add('is-calling');
    clearTimeout(nudge._t);
    nudge._t = setTimeout(()=>b.classList.remove('is-calling'), 6000);
  }

  function wire(box, cb){
    box.querySelectorAll('.lopt').forEach(b=>b.addEventListener('click',()=>{
      if(answered) return;
      answered = true;
      cb(b.dataset.v);
    }));
  }
  function mark(box, chosen, correct){
    box.querySelectorAll('.lopt').forEach(b=>{
      b.disabled = true;
      if(b.dataset.v === correct) b.classList.add('is-right');
      else if(b.dataset.v === chosen) b.classList.add('is-wrong');
    });
  }
  function say(text, right){
    const fb = $('ladder-fb');
    fb.textContent = text || '';
    // Explicit rather than relying on a className reassignment to drop .hidden
    // as a side effect.
    fb.classList.remove('hidden', 'ok', 'no');
    fb.classList.add(right ? 'ok' : 'no');
    const next = $('ladder-next');
    if(i < steps.length - 1){ next.textContent = 'Next'; next.classList.remove('hidden'); }
    else { next.textContent = 'Got it'; next.classList.remove('hidden'); }
    try{ right ? ChessSFX.playSelect() : ChessSFX.playWrong(); }catch(e){}
  }

  function advance(){
    if(i < steps.length - 1){ i++; render(); }
    else show(false);
  }

  function init(){
    const o = $('ladder-open'); if(o) o.addEventListener('click', ()=>open());
    const x = $('ladder-close'); if(x) x.addEventListener('click', ()=>show(false));
    const n = $('ladder-next'); if(n) n.addEventListener('click', advance);
  }
  function isOpen(){ const l = el(); return !!l && !l.classList.contains('hidden'); }
  function reset(){
    steps=[]; i=0; show(false);
    const b = $('ladder-open');
    if(b){ b.classList.remove('is-calling');
           b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#ic-bulb"/></svg> '+
                         "I don't know what to do here"; }
  }
  return {init, open, reset, nudge, isOpen};
})();
window.Ladder = Ladder;

/* ── GM Forge cosmetics ─────────────────────────────────────────────────────
   Art layered onto the coach's inline SVG (viewBox 0 0 200 220). Anchors that
   matter: head is an ellipse at cx=100 cy=88 rx=44 ry=48, so its crown sits at
   y=40 and the hair reaches y=30; the nose ends at y=106 and the mouth starts
   at y=114, which is the only gap a moustache can occupy; the torso begins at
   y=138. Everything here is drawn against those numbers rather than by eye.
   Skin tones match the face: #eab387 lit, #e0a878 shadow, #dd9a68 deep. */
const FORGE_SKIN = '#eab387', FORGE_SKIN_D = '#dd9a68', FORGE_SKIN_S = '#e0a878';

const FORGE_ART = {
  topper: {
    none: '',
    beanie:
      '<path d="M58 44 C58 16 142 16 142 44 Z" fill="#C2483F"/>'+
      '<path d="M56 42 H144 V52 A6 6 0 0 1 138 58 H62 A6 6 0 0 1 56 52 Z" fill="#E05A50"/>'+
      '<circle cx="100" cy="14" r="9" fill="#F2EDE4"/>',
    cap:
      '<path d="M58 44 C58 18 142 18 142 44 Z" fill="#2F6BC4"/>'+
      '<path d="M100 18 C118 18 134 26 140 40 L100 40 Z" fill="#3B7FD4"/>'+
      '<path d="M56 42 H144 V50 H56 Z" fill="#24549B"/>'+
      '<path d="M144 44 C160 44 168 50 168 56 L144 56 Z" fill="#24549B"/>'+
      '<circle cx="100" cy="20" r="3.4" fill="#E8ECF5"/>',
    party:
      '<path d="M100 2 L124 48 H76 Z" fill="#5B6CFF"/>'+
      '<path d="M100 2 L112 25 L88 25 Z" fill="#8A96FF"/>'+
      '<circle cx="100" cy="4" r="7" fill="#FFD166"/>'+
      '<circle cx="90" cy="36" r="3" fill="#FFD166"/><circle cx="110" cy="40" r="3" fill="#4ED6A1"/>'+
      '<circle cx="100" cy="28" r="2.6" fill="#FF8FA3"/>',
    cowboy:
      '<path d="M40 46 C40 34 62 30 100 30 C138 30 160 34 160 46 C160 54 130 58 100 58 C70 58 40 54 40 46 Z" fill="#7A5334"/>'+
      '<path d="M70 44 C70 14 130 14 130 44 Z" fill="#8C5F3C"/>'+
      '<path d="M68 40 H132 V48 H68 Z" fill="#4A3320"/>'+
      '<circle cx="118" cy="44" r="3.4" fill="#D8B26A"/>',
    tophat:
      '<ellipse cx="100" cy="40" rx="52" ry="8" fill="#14161F"/>'+
      '<path d="M74 6 H126 V40 H74 Z" fill="#1B1E29"/>'+
      '<ellipse cx="100" cy="6" rx="26" ry="5" fill="#232735"/>'+
      '<path d="M74 28 H126 V37 H74 Z" fill="#5B6CFF"/>',
    crown:
      '<path d="M60 44 L60 20 L76 32 L88 12 L100 30 L112 12 L124 32 L140 20 L140 44 Z" fill="#E8B23C"/>'+
      '<path d="M58 42 H142 V52 H58 Z" fill="#C9922A"/>'+
      '<circle cx="88" cy="24" r="3.6" fill="#E5484D"/>'+
      '<circle cx="112" cy="24" r="3.6" fill="#4ED6A1"/>'+
      '<circle cx="100" cy="40" r="4" fill="#5B9DFF"/>'
  },
  face: {
    none: '',
    // Sits in the 106-114 gap between the nose and the mouth, curling upward
    // past the cheeks so it reads at small sizes.
    moustache:
      '<path d="M100 108 C92 102 78 102 70 108 C64 112 64 120 70 121 C77 122 80 116 84 112 '+
      'C89 108 95 108 100 111 C105 108 111 108 116 112 C120 116 123 122 130 121 '+
      'C136 120 136 112 130 108 C122 102 108 102 100 108 Z" fill="#2a2018"/>',
    beard:
      '<path d="M60 92 C60 132 78 142 100 142 C122 142 140 132 140 92 '+
      'C138 116 124 126 100 126 C76 126 62 116 60 92 Z" fill="#2a2018"/>'+
      '<path d="M100 108 C93 103 80 103 73 108 C68 112 69 118 74 119 C80 120 83 115 87 112 '+
      'C91 109 96 109 100 112 C104 109 109 109 113 112 C117 115 120 120 126 119 '+
      'C131 118 132 112 127 108 C120 103 107 103 100 108 Z" fill="#3a2c20"/>',
    shades:
      '<path d="M62 86 H138 V90 H62 Z" fill="#14161F"/>'+
      '<rect x="64" y="82" width="32" height="20" rx="7" fill="#14161F"/>'+
      '<rect x="104" y="82" width="32" height="20" rx="7" fill="#14161F"/>'+
      '<path d="M68 86 L78 86 L70 96 Z" fill="#3E4457" opacity=".8"/>'+
      '<path d="M108 86 L118 86 L110 96 Z" fill="#3E4457" opacity=".8"/>',
    monocle:
      '<circle cx="116" cy="91" r="15" fill="#AFC8E8" opacity=".22"/>'+
      '<circle cx="116" cy="91" r="15" fill="none" stroke="#D8B26A" stroke-width="3"/>'+
      '<path d="M116 106 Q120 124 134 132" stroke="#D8B26A" stroke-width="2" fill="none"/>'
  },
  outfit: {
    none: '',
    hoodie:
      '<path d="M8 220 C8 158 52 138 100 138 C148 138 192 158 192 220 Z" fill="#39415A"/>'+
      '<path d="M64 142 C64 122 136 122 136 142 C120 150 80 150 64 142 Z" fill="#2C3348"/>'+
      '<path d="M84 140 L100 156 L116 140 L112 172 L88 172 Z" fill="#2C3348"/>'+
      '<path d="M92 152 L94 190" stroke="#E8ECF5" stroke-width="3.2" stroke-linecap="round"/>'+
      '<path d="M108 152 L106 190" stroke="#E8ECF5" stroke-width="3.2" stroke-linecap="round"/>'+
      '<circle cx="94" cy="192" r="2.6" fill="#E8ECF5"/><circle cx="106" cy="192" r="2.6" fill="#E8ECF5"/>',
    // Sleeveless: bare shoulders and arms in skin tone, tank over the middle.
    muscle:
      '<path d="M8 220 C8 158 52 138 100 138 C148 138 192 158 192 220 Z" fill="'+FORGE_SKIN+'"/>'+
      '<path d="M30 220 C30 176 44 152 62 144 L62 220 Z" fill="'+FORGE_SKIN_S+'"/>'+
      '<path d="M170 220 C170 176 156 152 138 144 L138 220 Z" fill="'+FORGE_SKIN_S+'"/>'+
      '<path d="M68 220 L68 154 C78 146 122 146 132 154 L132 220 Z" fill="#E8ECF5"/>'+
      '<path d="M78 148 C84 168 116 168 122 148 L132 154 C124 178 76 178 68 154 Z" fill="'+FORGE_SKIN+'"/>'+
      '<path d="M62 172 C56 182 56 196 62 206" stroke="'+FORGE_SKIN_D+'" stroke-width="2.4" fill="none"/>'+
      '<path d="M138 172 C144 182 144 196 138 206" stroke="'+FORGE_SKIN_D+'" stroke-width="2.4" fill="none"/>',
    tuxedo:
      '<path d="M8 220 C8 158 52 138 100 138 C148 138 192 158 192 220 Z" fill="#14161F"/>'+
      '<path d="M80 140 L100 150 L120 140 L118 220 L82 220 Z" fill="#F2F3F7"/>'+
      '<path d="M82 140 L100 152 L84 186 L68 158 Z" fill="#1B1E29"/>'+
      '<path d="M118 140 L100 152 L116 186 L132 158 Z" fill="#1B1E29"/>'+
      '<path d="M100 148 L88 156 L94 164 L100 158 L106 164 L112 156 Z" fill="#1B1E29"/>'+
      '<circle cx="100" cy="176" r="2.4" fill="#2A2E3C"/><circle cx="100" cy="194" r="2.4" fill="#2A2E3C"/>',
    // Bare torso. Pecs and abs are drawn as shading strokes, not outlines, so
    // he reads as built rather than diagrammed.
    ripped:
      '<path d="M8 220 C8 158 52 138 100 138 C148 138 192 158 192 220 Z" fill="'+FORGE_SKIN+'"/>'+
      '<path d="M30 220 C30 176 44 152 62 144 L62 220 Z" fill="'+FORGE_SKIN_S+'"/>'+
      '<path d="M170 220 C170 176 156 152 138 144 L138 220 Z" fill="'+FORGE_SKIN_S+'"/>'+
      '<path d="M66 158 C76 176 96 178 100 168 C104 178 124 176 134 158" stroke="'+FORGE_SKIN_D+'" '+
        'stroke-width="3" fill="none" stroke-linecap="round"/>'+
      '<path d="M100 170 L100 214" stroke="'+FORGE_SKIN_D+'" stroke-width="2.6" stroke-linecap="round"/>'+
      '<path d="M84 182 H116 M84 196 H116 M88 210 H112" stroke="'+FORGE_SKIN_D+'" '+
        'stroke-width="2.2" stroke-linecap="round"/>'+
      '<path d="M62 170 C55 182 55 198 62 208" stroke="'+FORGE_SKIN_D+'" stroke-width="2.4" fill="none"/>'+
      '<path d="M138 170 C145 182 145 198 138 208" stroke="'+FORGE_SKIN_D+'" stroke-width="2.4" fill="none"/>'
  }
};

// Paint the equipped Forge cosmetics into the placeholder groups.
function applyForgeCosmetics(){
  const set = (id, html)=>{ const g = document.getElementById(id); if(g) g.innerHTML = html || ''; };
  set('forge-topper',   FORGE_ART.topper[Cosmetics.topper] || '');
  set('forge-facewear', FORGE_ART.face[Cosmetics.face]     || '');
  set('forge-outfit',   FORGE_ART.outfit[Cosmetics.outfit] || '');
  // Any outfit draws its own torso, so the stock shirt must go or it shows
  // through at the shoulders.
  document.querySelectorAll('.forge-shirt').forEach(el=>{
    el.style.display = (Cosmetics.outfit && Cosmetics.outfit !== 'none') ? 'none' : '';
  });
}

// A standalone Forge portrait for shop previews: head, hair and the item.
function forgePreview(kind, id){
  const art = (FORGE_ART[kind] || {})[id] || '';
  const showShirt = !(kind==='outfit' && id && id!=='none');
  return '<svg class="forge-mini" viewBox="0 0 200 220" aria-hidden="true">'+
    (showShirt
      ? '<path d="M8 220 C8 158 52 138 100 138 C148 138 192 158 192 220 Z" fill="#243044"/>'+
        '<path d="M82 140 L100 138 L118 140 L109 168 L91 168 Z" fill="#0f1520"/>'+
        '<path d="M95 146 L105 146 L112 200 L100 212 L88 200 Z" fill="#3b7fd4"/>'
      : '')+
    (kind==='outfit' ? art : '')+
    '<rect x="87" y="120" width="26" height="30" rx="11" fill="'+FORGE_SKIN_S+'"/>'+
    '<ellipse cx="100" cy="88" rx="44" ry="48" fill="'+FORGE_SKIN+'"/>'+
    '<circle cx="57" cy="90" r="8.5" fill="'+FORGE_SKIN_S+'"/>'+
    '<circle cx="143" cy="90" r="8.5" fill="'+FORGE_SKIN_S+'"/>'+
    '<path d="M56 84 C54 42 84 30 100 30 C116 30 146 42 144 84 C140 66 130 58 118 56 '+
      'C122 62 122 70 120 74 C114 58 96 54 84 58 C82 66 82 72 84 76 C74 66 62 68 56 84 Z" fill="#2a2018"/>'+
    '<g><ellipse cx="84" cy="91" rx="7.8" ry="8.8" fill="#F7F9FF"/><circle cx="85" cy="92" r="5.4" fill="#4A6FA5"/>'+
    '<circle cx="85" cy="92" r="3.1" fill="#141821"/><circle cx="82.7" cy="89.3" r="1.3" fill="#FFFFFF" opacity=".95"/>'+
    '<ellipse cx="116" cy="91" rx="7.8" ry="8.8" fill="#F7F9FF"/><circle cx="117" cy="92" r="5.4" fill="#4A6FA5"/>'+
    '<circle cx="117" cy="92" r="3.1" fill="#141821"/><circle cx="114.7" cy="89.3" r="1.3" fill="#FFFFFF" opacity=".95"/></g>'+
    '<path d="M100 95 L96 106 L104 106 Z" fill="'+FORGE_SKIN_D+'"/>'+
    '<path d="M86 114 Q100 125 114 114" stroke="#b5673c" stroke-width="4.2" fill="none" stroke-linecap="round"/>'+
    (kind==='face' ? art : '')+
    (kind==='topper' ? art : '')+
    '</svg>';
}

/* "?" buttons that reveal an explanation. The text used to sit on screen
   permanently; it is one press away instead, and stays open once opened. Each
   button names what it controls via aria-controls, so this is one
   implementation rather than one per panel. */
(function(){
  function init(){
    document.querySelectorAll('.cp-help[aria-controls]').forEach(function(btn){
      const tip = document.getElementById(btn.getAttribute('aria-controls'));
      if(!tip) return;
      btn.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        const open = tip.classList.toggle('hidden') === false;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.classList.toggle('is-open', open);
      });
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ── Rating trajectory ───────────────────────────────────────────────────────
   One series, so no legend — the caption names it. A 2px line over a gradient
   area, a recessive grid, and a crosshair with a tooltip, which a line chart
   gets by default. The draw-in is a one-off on render, not a loop: the point is
   to make improvement feel like something, not to fidget.

   Colours were checked against the panel rather than picked: the line at 4.4:1,
   the up/down chips at 8.9:1 and 4.7:1, the grid deliberately recessive. */
const Traj = (function(){
  const W = 1000, H = 380, PAD = {t:26, r:18, b:34, l:52};

  function esc2(t){ return String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function render(history){
    const svg = document.getElementById('traj-svg');
    const empty = document.getElementById('traj-empty');
    const fig = document.querySelector('.traj-figure');
    if(!svg) return;
    // Solo games are the honest measurement, and only those carry a rating.
    // Which series to draw. Rating only exists on solo games -- coached games
    // record elo 0 -- so gating on it left the chart empty for anyone playing
    // the coached mode, which is most of the product. Accuracy is on every
    // game, so that is the fallback rather than showing nothing.
    const hist = (history||[]).filter(h=>h && typeof h === 'object');
    const rated = hist.filter(h=>h.mode === 'solo' && +h.elo > 0);
    const useRating = rated.length >= 2;
    const src = useRating ? rated : hist;
    // Accuracy from average centipawn loss: 0 lost is 100, and it falls away
    // from there. Higher is better either way, so the line means the same thing
    // in both modes — up is improvement.
    const acc = a => Math.max(0, Math.min(100, 100 - (+a || 0) / 1.6));
    const pts = src.map(h=>({
      v: useRating ? +h.elo : acc(h.acpl),
      elo: +h.elo || 0, d: h.d || '', acpl: +h.acpl || 0,
      blunders: +h.blunders || 0, result: h.result || '', mode: h.mode || ''
    }));
    const enough = pts.length >= 2;
    if(empty) empty.classList.toggle('hidden', enough);
    if(fig)   fig.classList.toggle('hidden', !enough);
    if(!enough){ svg.innerHTML = ''; return; }

    const lo0 = Math.min(...pts.map(p=>p.v)), hi0 = Math.max(...pts.map(p=>p.v));
    const span = Math.max(hi0 - lo0, useRating ? 60 : 12);   // never a flat, misleading line
    const lo = lo0 - span * 0.25, hi = hi0 + span * 0.25;
    const x = i => PAD.l + (W - PAD.l - PAD.r) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
    const y = v => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo));

    // Grid: four recessive lines with their values, so the scale is readable
    // without a number on every point.
    let grid = '', ticks = '';
    for(let g = 0; g <= 3; g++){
      const v = lo + (hi - lo) * (g / 3), yy = y(v);
      grid  += '<line class="tj-grid" x1="'+PAD.l+'" y1="'+yy+'" x2="'+(W-PAD.r)+'" y2="'+yy+'"/>';
      ticks += '<text class="tj-tick" x="'+(PAD.l-10)+'" y="'+(yy+4)+'" text-anchor="end">'
             + Math.round(v) + (useRating ? '' : '%') + '</text>';
    }

    const line = pts.map((p,i)=>(i?'L':'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
    const area = line + ' L ' + x(pts.length-1).toFixed(1) + ' ' + (H-PAD.b)
               + ' L ' + x(0).toFixed(1) + ' ' + (H-PAD.b) + ' Z';
    const dots = pts.map((p,i)=>
      '<circle class="tj-dot" data-i="'+i+'" cx="'+x(i).toFixed(1)+'" cy="'+y(p.v).toFixed(1)+'" r="4"/>'
    ).join('');
    // Generous invisible hit targets — bigger than the mark, as they should be.
    const hits = pts.map((p,i)=>
      '<rect class="tj-hit" data-i="'+i+'" x="'+(x(i)-14)+'" y="'+PAD.t+'" width="28" height="'+(H-PAD.t-PAD.b)+'"/>'
    ).join('');

    const up = pts[pts.length-1].v >= pts[0].v;
    svg.innerHTML =
      '<defs>'
      + '<linearGradient id="tjFill" x1="0" y1="0" x2="0" y2="1">'
      +   '<stop offset="0" stop-color="var(--accent)" stop-opacity=".34"/>'
      +   '<stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>'
      + '</linearGradient>'
      + '<filter id="tjGlow" x="-20%" y="-40%" width="140%" height="180%">'
      +   '<feGaussianBlur stdDeviation="5" result="b"/><feMerge>'
      +   '<feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>'
      + '</filter>'
      + '</defs>'
      + grid + ticks
      // Inline rather than via CSS so the fill does not depend on the
      // stylesheet resolving a same-document gradient reference.
      + '<path class="tj-area" fill="url(#tjFill)" d="'+area+'"/>'
      + '<line class="tj-cross hidden" id="tj-cross" y1="'+PAD.t+'" y2="'+(H-PAD.b)+'"/>'
      + '<path class="tj-line'+(up?' is-up':'')+'" id="tj-line" d="'+line+'" filter="url(#tjGlow)"/>'
      + dots + hits;

    // Draw it on once. stroke-dasharray on the real length so it traces out.
    const path = document.getElementById('tj-line');
    try{
      const len = path.getTotalLength();
      path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
      if(!window.matchMedia || !matchMedia('(prefers-reduced-motion: reduce)').matches){
        requestAnimationFrame(()=>{
          path.style.transition = 'stroke-dashoffset 1100ms cubic-bezier(.32,.72,0,1)';
          path.style.strokeDashoffset = 0;
        });
      } else { path.style.strokeDashoffset = 0; }
    }catch(e){}

    wireHover(svg, pts, x, y, useRating);
    // Say what is being plotted, so a number on the axis is never ambiguous.
    const cap = document.getElementById('traj-cap');
    if(cap) cap.textContent = useRating
      ? 'Your estimated rating across recent solo games.'
      : 'Accuracy per game — 100 means you gave nothing away. Every game counts, coached or not.';
    return {first:pts[0].v, last:pts[pts.length-1].v, n:pts.length, rating:useRating};
  }

  function wireHover(svg, pts, x, y, useRating){
    const tip = document.getElementById('traj-tip');
    const cross = document.getElementById('tj-cross');
    svg.querySelectorAll('.tj-hit').forEach(function(r){
      r.addEventListener('mouseenter', function(){
        const i = +r.dataset.i, p = pts[i];
        svg.querySelectorAll('.tj-dot').forEach(d=>d.classList.toggle('on', +d.dataset.i === i));
        if(cross){ cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.classList.remove('hidden'); }
        if(!tip) return;
        const prev = i > 0 ? pts[i-1].v : null;
        const dv = prev == null ? null : Math.round(p.v - prev);
        const shown = useRating ? Math.round(p.v) : Math.round(p.v) + '%';
        tip.innerHTML = '<b>' + shown + '</b>'
          + (dv == null || dv === 0 ? '' : '<i class="' + (dv > 0 ? 'up' : 'down') + '">'
              + (dv > 0 ? '+' : '') + dv + '</i>')
          + '<span>' + esc2(p.d) + (p.mode ? ' · ' + esc2(p.mode) : '') + '</span>'
          + '<span>' + p.blunders + ' blunder' + (p.blunders === 1 ? '' : 's')
          + ' · ' + Math.round(p.acpl) + ' avg loss</span>';
        tip.classList.remove('hidden');
        const box = svg.getBoundingClientRect();
        const px = box.left + box.width * (x(i) / W);
        const py = box.top  + box.height * (y(p.v) / H);
        const wrap = tip.offsetParent ? tip.offsetParent.getBoundingClientRect() : box;
        tip.style.left = Math.min(Math.max(px - wrap.left - 70, 4), wrap.width - 148) + 'px';
        tip.style.top  = Math.max(py - wrap.top - 92, 4) + 'px';
      });
    });
    svg.addEventListener('mouseleave', function(){
      if(tip) tip.classList.add('hidden');
      if(cross) cross.classList.add('hidden');
      svg.querySelectorAll('.tj-dot').forEach(d=>d.classList.remove('on'));
    });
  }
  return {render};
})();
window.Traj = Traj;

/* ── Shop ─────────────────────────────────────────────────────────────────── */
const XP_RULE_LABELS = {
  puzzle_solved:'Solve a puzzle', drill_passed:'Pass a drill',
  pattern_mastered:'Master a pattern', lesson_done:'Finish a lesson',
  game_coached:'Finish a coached game', game_solo:'Finish a solo game',
  clean_game:'Finish a game with no blunders', candidates_reviewed:'Weigh two or more candidate moves',
  found_best:'Have the engine move among your candidates', streak_day:'Keep your drill streak alive'
};

// A small board drawn in a theme's own colours, with real pieces from a set.
// Fixed pixel sizing on purpose: this never participates in the page's flex
// layout, so it cannot repeat the collapsed-board bug.
function shopMiniBoard(light, dark, dir, texL, texD){
  const back = ['r','n','b','q'], out = [];
  for(let r=0;r<4;r++) for(let f=0;f<4;f++){
    const isLight = (r+f)%2===0;
    let inner = '';
    if(r===0) inner = '<img alt="" src="/static/custom/'+dir+'b'+back[f].toUpperCase()+'.svg?v='+PIECE_VER+'">';
    if(r===3) inner = '<img alt="" src="/static/custom/'+dir+'w'+back[f].toUpperCase()+'.svg?v='+PIECE_VER+'">';
    // A textured theme must preview textured, or its card sells a flat board.
    const tex = isLight ? texL : texD;
    const bg = 'background-color:'+(isLight?light:dark)+(tex ? ';background-image:'+tex : '');
    out.push('<i style="'+bg+'">'+inner+'</i>');
  }
  return '<div class="shop-mini">'+out.join('')+'</div>';
}

const SHOP_VERBS = {board:'Use these colours', pieces:'Use this set',
                    topper:'Put it on', face:'Wear it', outfit:'Wear it'};

function shopCard(kind, it, ctx){
  const cur = kind==='board'  ? shopMiniBoard(it.light, it.dark, Cosmetics.dir, it.tex_light, it.tex_dark)
            : kind==='pieces' ? shopMiniBoard(ctx.light, ctx.dark, it.dir, ctx.texL, ctx.texD)
            :                   forgePreview(kind, it.id);
  // Free players get the action they wanted to take, worded plainly, and are
  // told why it did not happen only once they reach for it. A button that says
  // "Pro only" up front reads as a wall; one that says "Change colours" and
  // then explains reads as something they are one step away from.
  const verb = SHOP_VERBS[kind] || 'Equip';
  let action, locked = false;
  if(it.equipped)      action = '<button class="shop-btn is-on" disabled>Equipped</button>';
  else if(it.owned)    action = '<button class="shop-btn" onclick="shopEquip(\''+kind+'\',\''+it.id+'\')">'+verb+'</button>';
  else if(!ctx.is_pro){
    locked = true;
    action = '<button class="shop-btn is-locked" onclick="showProGate(\''+kind+'\')">'+
             '<svg class="ic" aria-hidden="true"><use href="#ic-lock"/></svg> '+verb+'</button>';
  }
  else if(!it.affordable) action = '<button class="shop-btn is-short" disabled>'+(it.price-ctx.balance)+' XP to go</button>';
  else                 action = '<button class="shop-btn is-buy" onclick="shopBuy(\''+kind+'\',\''+it.id+'\')">'+verb+' · '+it.price+' XP</button>';
  return '<div class="shop-card'+(it.equipped?' is-equipped':'')+(locked?' is-locked':'')+'">'+
    '<div class="shop-card-art">'+cur+(locked?'<span class="shop-card-lock"><svg class="ic" aria-hidden="true"><use href="#ic-lock"/></svg></span>':'')+'</div>'+
    '<div class="shop-card-body"><div class="shop-card-top"><b>'+it.name+'</b>'+
    (it.price===0?'<span class="shop-tag">Free</span>':'<span class="shop-price">'+it.price+' XP</span>')+
    '</div><p>'+it.blurb+'</p>'+action+'</div></div>';
}

/* ── Pro gate ─────────────────────────────────────────────────────────────── */
let _gateCatalog = null;

// Any endpoint that refuses on plan grounds sends back a `locked` key naming
// what was blocked. Routing it through here keeps the gate's wording matched to
// what the player was actually doing.
function handleLocked(d){
  if(!d || !(d.locked || d.upgrade || d.error === 'free_limit_reached' ||
             d.error === 'pro_required')) return false;
  const kind = d.locked || (d.error === 'pro_required' ? 'ask' : 'shop');
  try{ showProGate(kind); }catch(e){}
  return true;
}
window.handleLocked = handleLocked;

// Entry point for every cosmetic affordance outside the shop.
function openCosmetics(kind){
  if(State.plan==='pro'){ showPage('shop'); return; }
  showProGate(kind||'board');
}

// What the gate says has to match what was actually blocked. It used to say
// "only Pro members can change the board" whatever you had run into --
// including running out of coached games, which has nothing to do with boards.
const GATE_COPY = {
  board:    ['Only Grandmasters can change the board',
             'Board themes are bought with XP you are already earning on the free plan.'],
  pieces:   ['Only Grandmasters can change the pieces',
             'Piece sets are bought with XP you are already earning on the free plan.'],
  coached:  ['That was your free coached game for today',
             'Free includes one coached game a day. Grandmaster puts GM Forge beside you every '
             + 'game, which is where the improvement actually comes from.'],
  analysis: ['That was your free analysis for today',
             'Free analyses one game a day. Grandmaster analyses every game you play, in full depth.'],
  ask:      ['Ask GM Forge is a Grandmaster feature',
             'Ask him about any position in any of your games and get a real answer, grounded in '
             + 'the engine rather than generic advice.'],
  puzzles:  ['That is your five puzzles for today',
             'Your games keep producing puzzles from your own mistakes. Grandmaster serves all of '
             + 'them instead of the first five.'],
  lesson:   ['One exercise per theme on the free plan',
             'Grandmaster repeats a theme until it is automatic, which is the entire point of '
             + 'spaced practice.'],
  shop:     ['The shop is a Grandmaster feature',
             'You keep earning XP on the free plan and none of it expires. Grandmaster is what '
             + 'lets you spend it.']
};

async function showProGate(kind){
  const el = document.getElementById('pro-gate');
  if(!el) return;
  const title = document.getElementById('pg-title');
  const sub   = document.getElementById('pg-sub');
  const copy  = GATE_COPY[kind] || GATE_COPY.shop;
  if(title) title.textContent = copy[0];
  if(sub)   sub.textContent   = copy[1];
  el.hidden = false;
  document.addEventListener('keydown', _gateKey);
  // Show the real thing, not a description of it.
  const strip = document.getElementById('pg-strip');
  if(!strip) return;
  try{
    if(!_gateCatalog){
      const r = await fetch('/shop/catalog',{credentials:'include'});
      if(r.ok) _gateCatalog = await r.json();
    }
    const d = _gateCatalog;
    if(!d){ strip.innerHTML = ''; renderPlanCompare(); return; }
    const cosmetic = (kind === 'board' || kind === 'pieces');
    if(!cosmetic){
      // Nothing to preview for a quota you have run out of.
      strip.innerHTML = '';
      renderPlanCompare();
      return;
    }
    if(sub && d.balance>0){
      sub.textContent = 'You have already earned ' + d.balance + ' XP on the free plan and none of '
        + 'it expires. Grandmaster is what lets you spend it.';
    }
    const picks = kind==='pieces'
      ? (d.pieces||[]).filter(i=>i.price>0).slice(0,4)
          .map(i=>({label:i.name, art:shopMiniBoard('#2E3446','#1E2231', i.dir)}))
      : (d.board||[]).filter(i=>i.price>0).slice(0,4)
          .map(i=>({label:i.name, art:shopMiniBoard(i.light, i.dark, Cosmetics.dir)}));
    strip.innerHTML = picks.map(p=>
      '<figure class="pg-tile">'+p.art+'<figcaption>'+p.label+'</figcaption></figure>').join('');
    renderPlanCompare();
  }catch(e){ console.error('showProGate failed:', e); }
}

// The side-by-side. Reads /plan/features so the wall and the product can never
// drift apart -- the limits shown here are the ones actually enforced.
let _planRows = null;
async function renderPlanCompare(){
  const box = document.getElementById('plan-compare');
  if(!box) return;
  try{
    if(!_planRows){
      const r = await fetch('/plan/features', {credentials:'include'});
      if(!r.ok) return;
      _planRows = await r.json();
    }
    const d = _planRows;
    const cell = (v)=> v
      ? '<span class="pc-yes">'+esc(v)+'</span>'
      : '<span class="pc-no"><svg class="ic" aria-hidden="true"><use href="#ic-close"/></svg>Not included</span>';
    box.innerHTML =
      '<div class="pc-head"><span></span><span>Free</span><span class="pc-gm">'+esc(d.plan_name)+'</span></div>'+
      d.rows.map(row=>
        '<div class="pc-row'+(row.free?'':' is-locked')+'">'+
          '<span class="pc-label">'+esc(row.label)+'</span>'+
          cell(row.free)+
          '<span class="pc-pro">'+esc(row.pro)+'</span>'+
        '</div>').join('')+
      '<p class="pc-foot">'+
        d.rows.filter(r=>!r.free).length +
        ' of these are switched off on Free right now.</p>';
  }catch(e){ console.error('renderPlanCompare failed:', e); }
}

function closeProGate(){
  const el = document.getElementById('pro-gate');
  if(el) el.hidden = true;
  document.removeEventListener('keydown', _gateKey);
}
function _gateKey(e){ if(e.key==='Escape') closeProGate(); }

document.addEventListener('click', function(e){
  const t = e.target;
  if(t.closest && t.closest('[data-gate-close]')){ e.preventDefault(); closeProGate(); return; }
  const gate = document.getElementById('pro-gate');
  if(gate && !gate.hidden && t === gate){ closeProGate(); }
});

// Reflect plan on the play-screen affordance.
function syncCosmeticAffordances(){
  const lock = document.getElementById('gm-skin-lock');
  if(lock) lock.hidden = State.plan==='pro';
  const dot = document.getElementById('nav-shop-new');
  if(dot) dot.hidden = State.plan==='pro' ? true : false;
}

async function renderShop(){
  const bal = document.getElementById('shop-balance');
  try{
    const r = await fetch('/shop/catalog',{credentials:'include'});
    if(!r.ok) throw new Error('catalog '+r.status);
    const d = await r.json();
    if(bal) bal.textContent = d.balance;
    syncBalance(d.balance);
    _gateCatalog = d;
    const locked = document.getElementById('shop-locked');
    if(locked) locked.classList.toggle('hidden', !!d.is_pro);
    if(!d.is_pro){
      const lx = document.getElementById('shop-locked-xp');
      if(lx) lx.textContent = d.balance;
      // Ground the pitch in what they have actually earned, not a slogan.
      const all = (d.board||[]).concat(d.pieces||[]).filter(i=>i.price>0);
      const afford = all.filter(i=>d.balance >= i.price);
      const note = document.getElementById('shop-locked-note');
      if(note){
        if(afford.length){
          note.textContent = 'You could already afford ' + afford.length +
            (afford.length===1?' of these.':' of these.');
        } else if(all.length){
          const cheapest = all.reduce((a,b)=>a.price<b.price?a:b);
          note.textContent = (cheapest.price - d.balance) + ' XP from your first one.';
        } else { note.textContent = ''; }
      }
    }
    // The equipped board's colours are the backdrop for piece-set previews.
    const eqBoard = (d.board||[]).find(b=>b.equipped) || d.board[0];
    const ctx = {is_pro:d.is_pro, light:eqBoard.light, dark:eqBoard.dark,
                 texL:eqBoard.tex_light, texD:eqBoard.tex_dark, balance:d.balance};
    ['board','pieces','topper','face','outfit'].forEach(kind=>{
      const el = document.getElementById('shop-'+kind);
      if(el) el.innerHTML = (d[kind]||[]).map(it=>shopCard(kind,it,ctx)).join('');
    });
    const g = document.getElementById('shop-earn-grid');
    if(g) g.innerHTML = Object.keys(d.rules||{}).map(k=>
      '<div class="shop-earn-row"><span>'+(XP_RULE_LABELS[k]||k)+'</span><b>+'+d.rules[k]+'</b></div>').join('');
  }catch(e){
    console.error('renderShop failed:', e);
    if(bal) bal.textContent = '—';
  }
}

async function shopBuy(kind, id){
  try{
    const r = await fetch('/shop/buy',{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,id})});
    const d = await r.json();
    if(!r.ok){ toastShop(d.error || 'Could not buy that'); return; }
    await refreshCosmetics();
    renderShop();
  }catch(e){ console.error('shopBuy failed:', e); }
}

async function shopEquip(kind, id){
  try{
    const r = await fetch('/shop/equip',{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,id})});
    const d = await r.json();
    if(!r.ok){ toastShop(d.error || 'Could not equip that'); return; }
    await refreshCosmetics();
    renderShop();
  }catch(e){ console.error('shopEquip failed:', e); }
}

// Re-read the resolved cosmetics and repaint every board.
async function refreshCosmetics(){
  try{
    const r = await fetch('/auth/me',{credentials:'include'});
    const d = await r.json();
    if(d.loggedIn){
      Cosmetics.apply(d.cosmetics);
      if(d.xp!==undefined) setXP(d.xp, d.balance);
    }
  }catch(e){ console.error('refreshCosmetics failed:', e); }
}

function toastShop(msg){
  const el = document.getElementById('shop-balance');
  if(!el) return;
  const p = el.parentNode;
  let t = document.getElementById('shop-toast');
  if(!t){ t = document.createElement('div'); t.id='shop-toast'; t.className='shop-toast'; p.appendChild(t); }
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastShop._t);
  toastShop._t = setTimeout(()=>t.classList.remove('is-on'), 2600);
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
    try{ UpgradeIntent.run(); }catch(e){}
    try{ maybeStartTour(d); }catch(e){}
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
    try{ UpgradeIntent.run(); }catch(e){}
    try{ maybeStartTour(d); }catch(e){}
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
  State.onboarding=d.onboarding||null;
  document.getElementById('user-name').textContent=d.username;
  document.getElementById('user-avatar').textContent=d.username[0].toUpperCase();
  if(d.balance!==undefined) State.balance=d.balance;
  setXP(d.xp||0, d.balance);
  Cosmetics.apply(d.cosmetics);
  try{ syncCosmeticAffordances(); }catch(e){}
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
      cancelBtn.textContent='Cancel Grandmaster';
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
  // Games auto-save now
  if(State.pendingUpgrade&&State.plan!=='pro'){State.pendingUpgrade=false;setTimeout(()=>goToPro(),500);}
  setTimeout(checkOnboarding, 1500);
}

async function checkSession(){
  try{
    const r=await fetch('/auth/me',{credentials:'include'});
    const d=await r.json();
    if(d.loggedIn)applySession(d);else showAuthModal();
    try{ maybeStartTour(d); }catch(e){}
    try{ UpgradeIntent.run(); }catch(e){}
  }catch(e){showAuthModal();}
  return true;
}

/* ── Arriving from the landing page's "Become a Grandmaster" ─────────────────
   The link lands here with ?upgrade=1. If they are already signed in, open the
   account menu and draw the eye to the upgrade button. If they are not, the
   intent is parked in sessionStorage and honoured once they finish signing up —
   otherwise the login detour would quietly swallow what they came to do. */
const UpgradeIntent = {
  KEY: 'cf_upgrade_intent',
  wanted(){
    try{
      const q = new URLSearchParams(location.search);
      if(q.get('upgrade') === '1' || location.hash === '#upgrade') return true;
      return sessionStorage.getItem(this.KEY) === '1';
    }catch(e){ return false; }
  },
  park(){ try{ sessionStorage.setItem(this.KEY, '1'); }catch(e){} },
  clear(){ try{ sessionStorage.removeItem(this.KEY); }catch(e){} },
  // Tidy the URL so a refresh does not reopen the menu forever.
  scrub(){
    try{
      if(location.search.indexOf('upgrade=') === -1 && location.hash !== '#upgrade') return;
      const u = new URL(location.href);
      u.searchParams.delete('upgrade');
      if(u.hash === '#upgrade') u.hash = '';
      history.replaceState(null, '', u.pathname + u.search);
    }catch(e){}
  },
  run(){
    if(!this.wanted()) return;
    if(!State.loggedIn){ this.park(); showAuthModal(); return; }
    this.clear(); this.scrub();
    // Already a member: nothing to sell them.
    if(State.plan === 'pro'){ return; }
    setTimeout(()=>{
      const menu = document.getElementById('tb-menu');
      const btn  = document.getElementById('upgrade-btn');
      if(menu) menu.classList.remove('hidden');
      if(btn){
        btn.classList.add('is-calling');
        btn.scrollIntoView({block:'nearest'});
        setTimeout(()=>btn.classList.remove('is-calling'), 4200);
      }
    }, 700);   // let the board and session settle first
  }
};
window.UpgradeIntent = UpgradeIntent;

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
  div.innerHTML=`<div style="background:#111118;border:1px solid #2a2a3a;border-radius:16px;padding:2.5rem;width:420px;max-width:95vw;text-align:center;box-shadow:0 0 60px rgba(240,230,210,.08)">
    <div style="font-size:2.5rem;margin-bottom:1rem"></div>
    <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:.5rem;color:#22E5FF">Upgrade to Grandmaster</h2>
    <p style="color:#666680;font-size:.9rem;margin-bottom:1.5rem">${msg||'You have reached your free plan limit. Upgrade for unlimited analysis.'}</p>
    <div style="background:#18181f;border:1px solid #2a2a3a;border-radius:10px;padding:1.2rem;margin-bottom:1.5rem;text-align:left">
      <div style="color:#22E5FF;font-weight:700;font-size:1.1rem;margin-bottom:.8rem">Grandmaster — $19.99 CAD/mo</div>
      ${['Unlimited game analysis','Full psychological profiling','Custom drill generation','Blunder pattern tracking','Opening repertoire fixes'].map(f=>`<div style="color:#e8e8f0;font-size:.85rem;padding:.2rem 0"> ${f}</div>`).join('')}
    </div>
    <button onclick="document.getElementById('upgrade-prompt').remove();goToPro()" style="width:100%;background:#22E5FF;color:#0D0D14;border:none;border-radius:10px;padding:.85rem;font-weight:700;font-size:.95rem;cursor:pointer;margin-bottom:.8rem">Get Pro Access — $19.99 CAD/mo </button>
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
      div.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#22E5FF;color:#0D0D14;padding:1rem 2rem;border-radius:10px;font-weight:700;font-size:1rem;z-index:9999;box-shadow:0 4px 20px rgba(240,230,210,.4)';
      div.textContent='Welcome to ChessForge Pro! Your account has been upgraded.';
      document.body.appendChild(div);
      setTimeout(()=>div.remove(),5000);
    },1000);
  }
})();

/* ── Nav ──────────────────────────────────────────────────────────────────── */

/* pull puzzles saved from previous coached games */
async function loadMyPuzzles(){
  try{
    const r=await fetch('/my-puzzles',{credentials:'include'});
    const d=await r.json();
    if(d && d.puzzles && d.puzzles.length){
      // Take the server's order outright. Merging into the existing array kept
      // the original sequence forever, which is why the same puzzles came back
      // after every game.
      State.puzzles = d.puzzles;
      State.puzzleIdx = 0;
      return State.puzzles.length;
    }
  }catch(e){}
  return (State.puzzles||[]).length;
}
window.loadMyPuzzles = loadMyPuzzles;

function showPage(name){
  try{ document.body.classList.toggle('play-locked', name==='coach'); }catch(e){}
  if(name==='puzzles'){ loadMyPuzzles().then(function(n){
      if(!n) return;
      const np=document.getElementById('no-puzzles'); if(np) np.classList.add('hidden');
      const pa=document.getElementById('puzzle-area'); if(pa) pa.classList.remove('hidden');
      if(State.puzzleIdx==null) State.puzzleIdx=0;
      // Defer until after this function makes the page active — a chessboard.js
      // board built inside a display:none page measures 0 and renders invisible.
      setTimeout(function(){
        try{ initPuzzleBoard(); }catch(e){}
        try{ loadPuzzle(State.puzzleIdx||0); }catch(e){}
        try{ /* ForgeBoard is CSS-sized; no resize() needed */ }catch(e){}
      }, 80);
    }).catch(function(e){ console.error('loadMyPuzzles failed:', e); }); }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  const lnk=document.querySelector(`[data-page="${name}"]`);if(lnk)lnk.classList.add('active');
  setTimeout(()=>{
    if(name==='replay')initReplayBoard();
    if(name==='puzzles'){
      initPuzzleBoard();
      // Board is only measurable now that the page is active.
      setTimeout(function(){ try{
        /* ForgeBoard is CSS-sized; no resize() needed */
      }catch(e){} }, 60);
    }
    if(name==='lessons')initLessonsPage();
    if(name==='progress'){ renderProgressPage(); try{renderProgressReport();}catch(e){} }
    if(name==='shop'){ try{renderShop();}catch(e){ console.error('renderShop failed:', e); } }
    if(name==='training'){ try{renderThinkingProfile();}catch(e){} }
    if(name==='training')renderTrainingPage().catch(function(e){ console.error("renderTrainingPage failed:", e); });
    if(name==='coach'||name==='bot'){ initCoachPage(); try{loadDailyNudge();}catch(e){} }
  },60);
}

/* ── Training (first pass — weakness-targeted drill launchers) ─────────────── */
const MM_COLORS = {Vulnerable:'#ff5d6c', Learning:'#ff9f43', Building:'#ffd54a', Automatic:'#26d07c'};
async function renderTrainingPage(force){
  const grid=document.getElementById('train-grid'); if(!grid) return;
  if(grid.dataset.loaded && !force) return;
  grid.innerHTML = '<div class="train-loading">Loading your patterns…</div>';
  let d;
  try{
    const r=await fetch('/training/weaknesses',{credentials:'include'});
    d=await r.json();
    if(d.error){ grid.innerHTML='<div class="train-loading">Sign in to build your training profile.</div>'; return; }
  }catch(e){ grid.innerHTML='<div class="train-loading">Could not load training right now.</div>'; return; }
  grid.dataset.loaded='1';
  // streak flame
  const sc=document.getElementById('streak-count'); if(sc) sc.textContent=(d.streak&&d.streak.count)||0;
  const flame=document.getElementById('streak-flame'); if(flame) flame.classList.toggle('lit', ((d.streak&&d.streak.count)||0)>0);
  // due-for-review
  const due=(d.weaknesses||[]).filter(w=>w.due_now);
  const dueBox=document.getElementById('train-due'), dueList=document.getElementById('train-due-list');
  if(dueBox&&dueList){
    if(due.length){ dueBox.classList.remove('hidden');
      dueList.innerHTML=due.map(w=>`<button class="due-chip" onclick="TrainingStages.start('${w.pattern}')">${esc(w.pattern)} <span></span></button>`).join('');
    } else dueBox.classList.add('hidden');
  }
  // weakness cards with muscle-memory meters
  const ws=(d.weaknesses||[]);
  grid.innerHTML=ws.map(w=>{
    const col=MM_COLORS[w.band]||'#7a7a9a';
    return `<div class="train-card">
      <div class="train-card-main" onclick="TrainingStages.start('${w.pattern}')">
        <div class="train-card-head"><span class="train-card-name">${esc(w.pattern)}</span><span class="train-band" style="color:${col};border-color:${col}44">${esc(w.band)}</span></div>
        <p class="train-card-note">${esc(w.note||'')}</p>
        <div class="mm-bar"><div class="mm-fill" style="width:${w.strength}%;background:${col}"></div></div>
        <div class="train-card-foot"><span>${w.strength}% muscle memory</span>${w.due_now?'<span class="due-pill">Due</span>':''}</div>
      </div>
      <button class="train-rewrite" onclick="TrainingDrill.start('${w.pattern}',{rewrite:true})"> Rewrite the mistake</button>
    </div>`;
  }).join('');
  buildConstellation(ws);
  // mastered
  const mBox=document.getElementById('train-mastered');
  if(mBox){ mBox.innerHTML = d.mastered ? `<span class="mastered-badge"> ${d.mastered} pattern${d.mastered>1?'s':''} mastered (80%+)</span>` : ''; }
}

/* ── Weakness constellation: nodes sized by frequency, coloured by muscle memory ── */
function buildConstellation(ws){
  const wrap=document.getElementById('constellation-wrap'), el=document.getElementById('constellation');
  if(!el||!wrap) return;
  if(!ws || !ws.length){ wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  const W=680, H=250, pad=52;
  const freq=w=>(w.count||w.frequency||w.mistakes||w.n||6);
  const maxF=Math.max.apply(null, ws.map(freq).concat([1]));
  const nodes=ws.map((w,i)=>{
    const t=(i/ws.length)*Math.PI*2 + 0.6;
    const cx=W/2 + Math.cos(t)*(150 - (i%2?36:0)) + ((i*29)%40-20);
    const cy=H/2 + Math.sin(t)*(70 - (i%3?10:0));
    const r=12 + freq(w)/maxF*22;
    return {w, cx:Math.max(pad,Math.min(W-pad,cx)), cy:Math.max(pad,Math.min(H-pad,cy)), r:Math.max(12,Math.min(34,r))};
  });
  let links='';
  if(nodes.length>1) for(let i=0;i<nodes.length;i++){ const a=nodes[i], b=nodes[(i+1)%nodes.length]; links+=`<line x1="${a.cx}" y1="${a.cy}" x2="${b.cx}" y2="${b.cy}" stroke="rgba(240,230,210,.09)" stroke-width="1"/>`; }
  const circles=nodes.map(n=>{
    const col=MM_COLORS[n.w.band]||'#7a7a9a';
    return `<g class="cm-node" onclick="TrainingStages.start('${n.w.pattern}')">
      <circle cx="${n.cx}" cy="${n.cy}" r="${n.r}" fill="${col}22" stroke="${col}" stroke-width="2"/>
      <circle cx="${n.cx}" cy="${n.cy}" r="${Math.max(3,n.r*0.28)}" fill="${col}"/>
      <text x="${n.cx}" y="${n.cy+n.r+13}" text-anchor="middle" fill="#93918a" font-size="11" font-family="Satoshi,sans-serif">${esc(n.w.pattern)}</text>
    </g>`;
  }).join('');
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${links}${circles}</svg>`;
}


/* ── Training: 5-stage learning sequence (lesson -> guided -> MCQ -> solve -> rewrite) ── */
const STAGE_NAMES = ['Micro-lesson','Guided example','Recognise it','Play it','Rewrite the mistake'];
const TrainingStages = {
  data:null, pattern:'', stage:0, choice:null, confidence:null,
  async start(pattern){
    this.pattern = pattern; this.stage = 0; this.choice = null; this.confidence = null;
    let d = null;
    try{
      const r = await fetch('/training/lesson',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({pattern:pattern}),credentials:'include'});
      d = await r.json();
    }catch(e){}
    if(!d || d.error || !d.lesson){ TrainingDrill.start(pattern); return; }   // fall back to plain drill
    this.data = d;
    const ov=document.getElementById('drill-overlay');
    ov.classList.remove('hidden','rewrite');
    document.getElementById('drill-pattern').textContent = d.pattern;
    document.getElementById('drill-summary').classList.add('hidden');
    const body=document.querySelector('.drill-body'); if(body) body.style.display='none';
    document.getElementById('stage-shell').classList.remove('hidden');
    this.render();
  },
  showBoard(fen, side){
    if(!fen || !window.ForgeBoard) return;
    const el=document.getElementById('stage-board'); if(!el) return;
    try{
      if(!this._board || this._boardEl!==el){
        this._board=new ForgeBoard('stage-board',{interactive:false,orientation:(side==='black'?'black':'white')});
        this._boardEl=el;
      } else if(side){ this._board.flip(side==='black'?'black':'white'); }
      this._board.setPosition(fen);
    }catch(e){}
  },
  rail(){
    return STAGE_NAMES.map((n,i)=>`<div class="stage-dot ${i<this.stage?'done':(i===this.stage?'now':'')}"></div>`).join('');
  },
  render(){
    document.getElementById('stage-rail').innerHTML = this.rail();
    const el = document.getElementById('stage-body');
    const d = this.data, L = d.lesson;
    if(this.stage===0){
      el.innerHTML = `<div class="stage-kicker">Stage 1 of 5 — ${esc(STAGE_NAMES[0])}</div>
        <div class="stage-h">${esc(L.title)}</div>
        ${L.body.map(p=>`<p class="stage-p">${esc(p)}</p>`).join('')}
        <div class="stage-habit"><b>The habit</b><span>${esc(L.habit)}</span></div>
        <p class="stage-p" style="font-size:13px;color:var(--text-low)">${esc(L.vocab)}</p>
        <button class="stage-next" onclick="TrainingStages.next()">Show me an example</button>`;
      this.showBoard(d.guided && d.guided.fen, d.guided && d.guided.side);
    } else if(this.stage===1){
      const g = d.guided;
      el.innerHTML = `<div class="stage-kicker">Stage 2 of 5 — ${esc(STAGE_NAMES[1])}</div>
        <div class="stage-h">Watch the thought process</div>
        <p class="stage-p">GM Forge walks this position out loud. You are not solving yet — you are watching how the scan works.</p>
        <p class="stage-p" id="guided-say">${esc((g&&g.hint)||L.habit)}</p>
        <button class="stage-next" onclick="TrainingStages.next()">I follow — let me try</button>`;
      this.showBoard(g && g.fen, g && g.side);
      if(g && g.fen && window.CoachFigure){        // he points at the square the example is about
        const sq=(g.solution||'').match(/[a-h][1-8]/);
        if(sq) setTimeout(function(){ CoachFigure.point(sq[0]); }, 500);
      }
    } else if(this.stage===2){
      const m = d.mcq;
      if(!m){ this.next(); return; }
      el.innerHTML = `<div class="stage-kicker">Stage 3 of 5 — ${esc(STAGE_NAMES[2])}</div>
        <div class="stage-h">Which move does the position want?</div>
        <div id="mcq-opts">${m.options.map((o,i)=>
          `<button class="mcq-opt" data-mv="${esc(o)}" onclick="TrainingStages.choose('${esc(o)}',this)">
             <span class="ltr">${'ABC'[i]}</span><span>${esc(o)}</span>
             <span class="sel-check"><svg class="ic"><use href="#ic-check"/></svg></span></button>`).join('')}</div>
        <div id="conf-wrap"></div><div id="mcq-fb"></div>`;
      this.showBoard(m.fen, m.side);
    }
  },
  choose(mv, btn){
    this.choice = mv;
    document.querySelectorAll('.mcq-opt').forEach(b=>b.classList.remove('selected'));
    if(btn) btn.classList.add('selected');
    document.getElementById('conf-wrap').innerHTML =
      `<div class="stage-kicker" style="margin-top:1rem">Before you see the answer — how sure are you?</div>
       <div class="conf-row">
         <button class="conf-btn" onclick="TrainingStages.reveal('Certain')">Certain</button>
         <button class="conf-btn" onclick="TrainingStages.reveal('Fairly sure')">Fairly sure</button>
         <button class="conf-btn" onclick="TrainingStages.reveal('Guessing')">Guessing</button>
       </div>`;
  },
  reveal(conf){
    this.confidence = conf;
    const d=this.data, m=d.mcq, fb=d.feedback||{};
    const right = this.choice === m.answer;
    document.getElementById('conf-wrap').innerHTML='';
    const strong = (conf==='Certain' && !right);   // hypercorrection: confident + wrong = fullest correction
    let html;
    if(right){
      html = `<div class="fb3"><div class="part rule"><b>Correct — ${esc(conf)}</b>
        <p>${esc(m.answer)} is the move. ${esc(fb.rule||'')}</p></div></div>`;
      if(window.CoachFigure) CoachFigure.mood('proud');
    } else {
      html = `<div class="fb3">
        ${strong?'<div class="part"><b>You were confident here</b><p>That is exactly the kind of mistake that corrects hardest and sticks longest. Read this one carefully.</p></div>':''}
        <div class="part"><b>What you were probably thinking</b><p>${esc(fb.thinking||'')}</p></div>
        <div class="part"><b>Where that breaks</b><p>${esc(fb.breaks||'')} The move was <b>${esc(m.answer)}</b>.</p></div>
        <div class="part rule"><b>The rule to carry forward</b><p>${esc(fb.rule||'')}</p></div></div>`;
      if(window.CoachFigure) CoachFigure.mood('alarm');
    }
    document.getElementById('mcq-fb').innerHTML = html +
      `<button class="stage-next" onclick="TrainingStages.next()">Now play it on the board</button>`;
  },
  next(){
    this.stage++;
    if(this.stage >= 3){          // stages 4 + 5 are the live board: solve, then rewrite
      document.getElementById('stage-shell').classList.add('hidden');
      const body=document.querySelector('.drill-body'); if(body) body.style.display='';
      TrainingDrill.start(this.pattern, {fromStages:true});
      return;
    }
    this.render();
  }
};
window.TrainingStages = TrainingStages;

/* ── Drill session — full-screen, one pattern, spaced repetition ── */
const TrainingDrill = {
  positions:[], idx:0, correct:0, pattern:'', streak:0, board:null, game:null, solved:false, rewrite:false,
  async start(pattern, opts){
    this.rewrite = !!(opts && opts.rewrite);
    this.fromStages = !!(opts && opts.fromStages);
    let d;
    try{
      const r=await fetch('/training/next',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pattern,count:this.rewrite?3:8}),credentials:'include'});
      d=await r.json();
    }catch(e){ return; }
    // Out of free exercises for this theme: say so in the gate, named correctly.
    if(handleLocked(d)) return;
    if(!d || !d.positions || !d.positions.length) return;
    this.positions=d.positions; this.idx=0; this.correct=0; this.pattern=d.pattern; this.streak=0;
    document.getElementById('drill-overlay').classList.toggle('rewrite', this.rewrite);
    document.getElementById('drill-pattern').textContent=(this.rewrite?'Rewrite · ':'')+d.pattern;
    document.getElementById('drill-streak-count').textContent='0';
    document.getElementById('drill-summary').classList.add('hidden');
    document.querySelector('.drill-body').style.display='';
    document.getElementById('drill-overlay').classList.remove('hidden');
    if(!this.board){
      this.board=new ForgeBoard('drill-board',{
        orientation:'white',
        getTargets:(sq)=>{
          if(this.solved || !this.game) return null;
          const p=this.game.get(sq); if(!p || p.color!==this.game.turn()) return null;
          return this.game.moves({square:sq,verbose:true}).map(m=>m.to);
        },
        onMove:(from,to)=>this._move(from,to),
      });
    }
    this._load();
  },
  _load(){
    const p=this.positions[this.idx];
    this.game=new Chess(p.fen); this.solved=false;
    this.board.flip(p.side==='white'?'white':'black');
    this.board.setPosition(p.fen);
    document.getElementById('drill-progress').textContent=`${this.idx+1} / ${this.positions.length}`;
    document.getElementById('drill-progress-fill').style.width=(this.idx/this.positions.length*100)+'%';
    document.getElementById('drill-prompt').textContent=(p.side==='white'?'White':'Black')+(this.rewrite?' to move — rewrite the mistake. What should you have played?':' to move — find the best move.');
    document.getElementById('drill-feedback').classList.add('hidden');
    document.getElementById('drill-next').classList.add('hidden');
  },
  _move(from,to){
    if(this.solved) return false;
    const p=this.positions[this.idx];
    const before=this.game.fen();
    const mv=this.game.move({from,to,promotion:'q'});
    if(!mv) return false;
    this.solved=true;
    const norm=s=>String(s).replace(/[+#!?]/g,'');
    const ok = norm(mv.san)===norm(p.solution);
    const fb=document.getElementById('drill-feedback');
    if(ok){
      this.correct++; this.streak++;
      this.board.setPosition(this.game.fen(),{lastMove:{from,to}});
      fb.className='drill-feedback good';
      const rw = this.rewrite ? ' — this is how it should have gone.' : '';
      fb.innerHTML=` <b>${esc(mv.san)}</b> — that's it${rw?esc(rw):"."} <span class="fb-tag">${esc(p.pattern)}</span> ${esc(p.hint||'')}`;
      if(this.rewrite && (p.continuation||p.line)) this._playLine(p.continuation||p.line);
      if(window.ChessSFX) ChessSFX.playWin();
    } else {
      this.game.undo(); this.board.setPosition(before);
      fb.className='drill-feedback bad';
      // Was: straight to the answer. Now leads with the method, so a wrong
      // attempt teaches how to find it next time rather than just what it was.
      const _m = window.SolveHelp ? SolveHelp.forPattern(p.pattern) : null;
      fb.innerHTML = `Not that one. <span class="fb-tag">${esc(p.pattern)}</span>`
        + (_m ? `<div class="drill-method"><b>How to find it:</b> ${esc(_m.steps[0])} ${esc(_m.tell)}</div>` : '')
        + `<div class="drill-answer">The move was <b>${esc(p.solution)}</b>. ${esc(p.hint||'')}</div>`;
      if(window.ChessSFX) ChessSFX.playWrong();
    }
    fb.classList.remove('hidden');
    document.getElementById('drill-streak-count').textContent=this.streak;
    document.getElementById('drill-next').classList.remove('hidden');
    return true;
  },
  _playLine(line){
    // "See how it should have gone" — animate the engine continuation, if the backend provided one.
    try{
      const g=new Chess(this.game.fen());
      const moves = Array.isArray(line) ? line : String(line).trim().split(/\s+/);
      let i=0;
      const step=()=>{
        if(i>=moves.length || i>=6) return;
        const tok=moves[i];
        const mv = (typeof tok==='object') ? g.move(tok) : g.move(tok,{sloppy:true});
        if(mv){ this.board.setPosition(g.fen(),{lastMove:{from:mv.from,to:mv.to}}); i++; setTimeout(step,650); }
      };
      setTimeout(step,750);
    }catch(e){}
  },
  next(){ this.idx++;
    if(this.idx>=this.positions.length){
      if(this.fromStages && !this.rewrite && this.positions.length){   // Stage 5 — rewrite the mistake
        this.rewrite=true; this.idx=this.positions.length-1;
        document.getElementById('drill-overlay').classList.add('rewrite');
        document.getElementById('drill-pattern').textContent='Rewrite - '+this.pattern;
        this._load(); return;
      }
      this._finish();
    } else { this._load(); }
  },
  async _finish(){
    const total=this.positions.length;
    let d={};
    try{
      const r=await fetch('/training/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pattern:this.pattern,correct:this.correct,total}),credentials:'include'});
      d=await r.json();
    }catch(e){}
    document.querySelector('.drill-body').style.display='none';
    const sum=document.getElementById('drill-summary');
    const col=MM_COLORS[d.band]||'#7a7a9a';
    sum.innerHTML=`
      <div class="ds-score">${this.correct} / ${total}</div>
      <div class="ds-line">${d.passed?'Session passed!':'Keep at it — run it again.'}</div>
      <div class="ds-mm"><div class="ds-mm-label">${esc(this.pattern)} — muscle memory</div>
        <div class="mm-bar big"><div class="mm-fill" style="width:${(d.strength||0)}%;background:${col}"></div></div>
        <div class="ds-band" style="color:${col}">${esc(d.band||'')} · ${(d.strength||0)}%</div></div>
      ${d.mastered?'<div class="ds-master"> Pattern mastered!</div>':''}
      <div class="ds-next">Next review in ${d.next_review_days||1} day${(d.next_review_days||1)>1?'s':''} ·  ${d.streak||0} day streak</div>
      <div class="ds-actions"><button class="onb-btn" onclick="TrainingDrill.exit()">Done</button><button class="onb-btn ghost" onclick="TrainingDrill.start('${this.pattern}')">Again</button></div>`;
    sum.classList.remove('hidden');
  },
  exit(){ const ov=document.getElementById('drill-overlay'); ov.classList.add('hidden'); ov.classList.remove('rewrite'); this.rewrite=false; renderTrainingPage(true).catch(function(e){ console.error("renderTrainingPage failed:", e); }); }
};
window.TrainingDrill = TrainingDrill;
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
  // (auto-detect of player names from PGN headers is handled server-side)
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
  finally{btn.disabled=false;spinner.classList.remove('on');btnText.textContent='Load Game ';}
});

function showParseError(msg){const b=document.getElementById('parse-error');b.textContent=' '+msg;b.classList.remove('hidden');}

function showPlayerSelection(data){
  const card=document.getElementById('step2-card');card.classList.remove('hidden');
  const row=document.getElementById('player-select-row');
  const info=document.getElementById('game-info-row');
  let infoHtml='';
  if(data.event&&data.event!=='?')infoHtml+=`<span> ${esc(data.event)}</span>`;
  if(data.date&&data.date!=='?')infoHtml+=`<span> ${esc(data.date)}</span>`;
  info.innerHTML=infoHtml;
  row.innerHTML='';
  [{color:'white',name:data.white,label:'White'},{color:'black',name:data.black,label:'Black'}].forEach(p=>{
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
    // Auto-saved above
    if(d.xp)setXP(d.xp);
    // Track total games analysed for premium lesson unlock
    const prev = parseInt(localStorage.getItem('cf-games-analysed') || '0');
    localStorage.setItem('cf-games-analysed', prev + (d.games_analysed || 1));
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
// Save Game lived on the deprecated Analyse page; #save-game-btn no longer exists.


/* ── Render Analysis ───────────────────────────────────────────────────────── */
function renderAnalysis(data){
  const icons={'Reckless Gambler':'','Tactical Dreamer':'','Opening Adventurer':'','Middlegame Fighter':'','Daring Attacker':'','Solid but Passive':'','Balanced Player':''};
  document.getElementById('profile-icon').textContent=icons[data.profile.style]||'';
  document.getElementById('profile-style').textContent=data.profile.style;
  document.getElementById('profile-desc').textContent=data.profile.description;
  const cb=document.getElementById('player-color-badge');cb.innerHTML='';
  const pc=data.player_color;
  if(pc){const b=document.createElement('span');b.className='color-badge '+pc;b.textContent=pc==='white'?'Analysed as White':'Analysed as Black';cb.appendChild(b);}
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

function skipToNextBlunder(){
  const moves = State.replayMoves;
  if(!moves.length) return;
  const start = State.replayPly + 1;
  for(let i = start; i < moves.length; i++){
    if(moves[i].severity === 'blunder' || moves[i].severity === 'mistake'){
      goToPly(i);
      return;
    }
  }
  // No more blunders — go to end
  goToPly(moves.length - 1);
  document.getElementById('replay-move-label').textContent = 'No more critical moments — end of game.';
}

function initReplayBoard(){
  if(State.replayBoard){try{State.replayBoard.destroy();}catch(e){}State.replayBoard=null;}
  const orientation = State.lastPlayerColor === 'black' ? 'black' : 'white';
  State.replayBoard=Chessboard('replay-board',{position:'start',pieceTheme:PIECE_THEME,orientation:orientation});
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
  // Show position BEFORE the move (so player can think)
  const game=new Chess();
  for(let i=0;i<ply&&i<State.replayMoves.length;i++){if(!game.move(State.replayMoves[i].san))break;}
  State.replayPly=ply;State.replayGame=game;
  State.replayBoard.position(game.fen(),false);
  updateReplayInfo();
  // Check if this move is a blunder — show critical moment BEFORE playing the move
  const m=State.replayMoves[ply];
  if(m&&m.severity==='blunder'&&m.best_move&&!State.replayPaused){
    showCriticalModal(m);
    return; // Don't advance the board yet — user must dismiss modal first
  }
  // Show position AFTER this move
  const game2=new Chess();
  for(let i=0;i<=ply&&i<State.replayMoves.length;i++){if(!game2.move(State.replayMoves[i].san))break;}
  State.replayBoard.position(game2.fen(),false);
  // Highlight in move list
  document.querySelectorAll('.move-san').forEach(el=>el.classList.remove('active-move'));
  const active2=document.querySelector('[data-ply="'+ply+'"]');
  if(active2){active2.classList.add('active-move');const card=document.querySelector('.move-list-card');if(card){const top=active2.getBoundingClientRect().top-card.getBoundingClientRect().top+card.scrollTop-card.clientHeight/2;card.scrollTo({top,behavior:'smooth'});}}
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
  if(m.severity==='blunder')t+='Blunder!';
  else if(m.severity==='mistake')t+='Mistake';
  else if(m.severity==='inaccuracy')t+='Inaccuracy';
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
  // Now show the actual blunder move on the board
  if(State.currentCritical){
    const ply = State.replayPly;
    const game=new Chess();
    for(let i=0;i<=ply&&i<State.replayMoves.length;i++){if(!game.move(State.replayMoves[i].san))break;}
    State.replayBoard.position(game.fen(),false);
  }
}

function showCriticalAnswer(){
  const m = State.currentCritical; if(!m) return;
  const bestEl = document.getElementById('critical-best-move');
  const expEl = document.getElementById('critical-explanation');
  if(bestEl) bestEl.textContent = m.best_move || 'No clear best move found';
  if(expEl){
    const drop = m.drop_cp;
    let severity = drop >= 300 ? 'a massive blunder' : drop >= 200 ? 'a serious blunder' : 'a significant mistake';
    expEl.textContent = `You played ${m.san} — ${severity} (lost ${Math.round(drop/100*10)/10} pawns of advantage). The engine recommends ${m.best_move||'a different move'}. ${m.threat_desc||''}`;
  }
  document.getElementById('critical-answer').classList.remove('hidden');
  const actions = document.querySelector('.critical-actions');
  if(actions) actions.innerHTML = `
    <button class="btn-cyan" onclick="hideCriticalModal()" style="width:auto;margin-top:0;padding:.5rem 1.2rem;font-size:.85rem">Continue ▶</button>
  `;
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
// ── Puzzle highlight helpers ──
function getPuzzleSquareEl(square, boardId){
  boardId = boardId || 'puzzle-board';
  // chessboard.js gives each square a class like "square-e4"
  return document.querySelector(`#${boardId} .square-${square}`);
}

function highlightSquare(square, color, boardId){
  const el = getPuzzleSquareEl(square, boardId);
  if(el) el.style.background = color;
}

function clearAllHighlights(boardId){
  boardId = boardId || 'puzzle-board';
  document.querySelectorAll(`#${boardId} .square-55d63`).forEach(el=>{
    el.style.background = '';
    el.style.boxShadow = '';
  });
  document.querySelectorAll('.move-dot').forEach(el=>el.remove());
  State.selectedSquare = null;
}

function showMoveDots(moves, boardId){
  boardId = boardId || 'puzzle-board';
  moves.forEach(m=>{
    const el = getPuzzleSquareEl(m.to, boardId);
    if(!el) return;
    // Create dot overlay
    const dot = document.createElement('div');
    dot.className = 'move-dot';
    const hasPiece = State.puzzleGame.get(m.to);
    if(hasPiece){
      // Capture ring
      dot.style.cssText = 'position:absolute;inset:0;border:4px solid rgba(240,230,210,.7);border-radius:50%;pointer-events:none;z-index:100;box-sizing:border-box';
    } else {
      // Move dot
      dot.style.cssText = 'position:absolute;width:34%;height:34%;background:rgba(240,230,210,.5);border-radius:50%;top:33%;left:33%;pointer-events:none;z-index:100';
    }
    el.style.position = 'relative';
    el.appendChild(dot);
  });
}

function initPuzzleBoard(){
  if(State.boardsReady.puzzle&&State.puzzleBoard){if(State.puzzles.length)loadPuzzle(State.puzzleIdx);return;}
  State.puzzleGame=new Chess();
  // Puzzles used chessboard.js: different tiles, drop-shadowed pieces, drag only,
  // no click-to-select dots, no right-click arrows. Now the same ForgeBoard the
  // Play screen uses, so the whole app behaves and looks like one product.
  State.puzzleBoard = new ForgeBoard('puzzle-board', {
    orientation: 'white',
    getTargets: (sq)=>{
      const g = State.puzzleGame; if(!g) return null;
      const pc = g.get(sq);
      if(!pc || pc.color !== g.turn()) return null;
      return g.moves({square:sq, verbose:true}).map(m=>m.to);
    },
    onMove: (from, to)=>{
      const g = State.puzzleGame; if(!g) return false;
      const mv = g.move({from, to, promotion:'q'});
      if(!mv) return false;
      State.puzzleBoard.setPosition(g.fen(), {lastMove:{from,to}});
      checkPuzzleMove(mv, from, to);
      return true;
    },
  });
  State.boardsReady.puzzle=true;
  if(State.puzzles.length)loadPuzzle(State.puzzleIdx);
}

function onMouseoverPuzzleSquare(square){
  if(State.selectedSquare) return; // already selected, dont show hover hints
  if(!State.puzzleGame) return;
  const piece = State.puzzleGame.get(square);
  if(!piece || piece.color !== State.puzzleGame.turn()) return;
  const moves = State.puzzleGame.moves({square, verbose:true});
  if(!moves.length) return;
  highlightSquare(square, 'rgba(240,230,210,.25)', 'puzzle-board');
}

function onMouseoutPuzzleSquare(square){
  if(State.selectedSquare === square) return;
  const el = getPuzzleSquareEl(square, 'puzzle-board');
  if(el) el.style.background = '';
}

function handlePuzzleSquareClick(square){
  if(!State.puzzleGame||!State.puzzleBoard) return;
  const piece = State.puzzleGame.get(square);
  const turn = State.puzzleGame.turn();

  // Clicking selected square = deselect
  if(State.selectedSquare === square){
    clearAllHighlights('puzzle-board');
    return;
  }

  // Have a selected square — try to move
  if(State.selectedSquare){
    const src = State.selectedSquare;
    clearAllHighlights('puzzle-board');

    const mv = State.puzzleGame.move({from:src, to:square, promotion:'q'});
    if(mv){
      State.puzzleBoard.setPosition(State.puzzleGame.fen(), {animate:false});
      checkPuzzleMove(mv, src, square);
    } else {
      // Not a valid move — maybe user clicked another own piece
      if(piece && piece.color === turn){
        State.selectedSquare = square;
        highlightSquare(square, 'rgba(240,230,210,.4)', 'puzzle-board');
        const moves = State.puzzleGame.moves({square, verbose:true});
        showMoveDots(moves, 'puzzle-board');
      }
    }
    return;
  }

  // Nothing selected — select own piece
  if(piece && piece.color === turn){
    State.selectedSquare = square;
    clearAllHighlights('puzzle-board');
    highlightSquare(square, 'rgba(240,230,210,.4)', 'puzzle-board');
    const moves = State.puzzleGame.moves({square, verbose:true});
    showMoveDots(moves, 'puzzle-board');
  }
}

function checkPuzzleMove(mv, src, tgt){
  const p = State.puzzles[State.puzzleIdx];
  if(!p) return;
  const uci = src + tgt;
  const solUCI = p.solution.toLowerCase().replace(/[+#=qrbn]/g,'').slice(0,4);
  const ok = mv.san === p.solution || uci === solUCI;
  const status = document.getElementById('puzzle-status');
  if(ok){
    status.textContent = 'Correct! Well done!';
    status.style.color = 'var(--green)';
    State.puzzleCorrect++;
    awardXP(50,'puzzle',null,(State.puzzles[State.puzzleIdx]||{}).fen)
      .catch(function(e){ console.error("awardXP failed:", e); });
  } else {
    status.textContent = ` Not quite (${mv.san}) — try again!`;
    status.style.color = 'var(--red)';
    State.puzzleWrong++;
    State.puzzleGame.undo();
    State.puzzleBoard.setPosition(State.puzzleGame.fen(), {animate:false});
  }
  document.getElementById('p-correct').textContent = State.puzzleCorrect;
  document.getElementById('p-wrong').textContent = State.puzzleWrong;
}

function clearHighlights(){
  // chessboard.js square classes are gone; ForgeBoard owns its own highlighting.
  try{ clearAllHighlights('puzzle-board'); }catch(e){}
}

/* Claim a puzzle attempt before showing it. The daily allowance is counted on
   the server, so it holds however the puzzle got onto the board -- capping the
   list alone did nothing, because the client keeps what it has already been
   given and re-solving was free. */
async function claimPuzzle(){
  if(!State.loggedIn) return true;
  if(State.plan === 'pro') return true;
  try{
    const r = await fetch('/puzzles/claim', {method:'POST', credentials:'include'});
    const d = await r.json();
    if(!r.ok){ handleLocked(d); return false; }
    if(typeof d.left === 'number'){
      const el = document.getElementById('puzzle-status');
      if(el && d.left === 0) el.dataset.last = '1';
    }
    return true;
  }catch(e){ return true; }        // never lock someone out on a network blip
}

async function loadPuzzle(idx){
  if(idx>=State.puzzles.length||!State.puzzleBoard)return;
  if(!(await claimPuzzle())) return;
  const p=State.puzzles[idx];
  State.puzzleGame=new Chess(p.fen);
  const side = (p.side==='white'?'white':'black');
  State.puzzleBoard.flip(side);                       // rebuilds squares in the right orientation
  State.puzzleBoard.setPosition(p.fen, {animate:false});
  if(State.puzzleBoard.clearMarks) State.puzzleBoard.clearMarks();
  clearHighlights();
  document.getElementById('puzzle-status').textContent=`${cap(p.side)} to play — find the best move!`;
  document.getElementById('puzzle-status').style.color='';
  document.getElementById('puzzle-hint-text').classList.add('hidden');
  // Fresh puzzle: collapse the ladder and show the method for THIS pattern.
  State.hintRung = 0;
  const _lad = document.getElementById('puzzle-ladder');
  if(_lad){ _lad.classList.add('hidden'); _lad.innerHTML=''; }
  const _hb = document.getElementById('hint-btn');
  if(_hb){ _hb.disabled = false; }
  const _hl = document.getElementById('hint-btn-label');
  if(_hl) _hl.textContent = 'Help me find it';
  const _pm = document.getElementById('puzzle-method');
  if(_pm && window.SolveHelp) _pm.innerHTML = SolveHelp.methodHTML(p.pattern);
  document.getElementById('puzzle-num').textContent=idx+1;
  document.getElementById('xp-earned').classList.add('hidden');
  document.getElementById('puzzle-meta').innerHTML=`<span><strong>Pattern:</strong> ${esc(p.pattern)}</span><span><strong>Phase:</strong> ${cap(p.phase)}</span><span><strong>Your move:</strong> ${esc(p.move_played)} (−${p.drop_cp}cp)</span>`;
  document.getElementById('p-correct').textContent=State.puzzleCorrect;
  document.getElementById('p-wrong').textContent=State.puzzleWrong;
}

function handlePuzzleDrop(src,tgt){
  if(!State.puzzleGame) return 'snapback';
  clearAllHighlights('puzzle-board');
  const mv = State.puzzleGame.move({from:src, to:tgt, promotion:'q'});
  if(!mv) return 'snapback';
  checkPuzzleMove(mv, src, tgt);
}

/* Hint used to print the answer outright, which solves the puzzle and teaches
   nothing. It now walks a four-rung ladder: what to look for, how to search,
   a narrowing clue derived from the solution, and only then the move itself. */
State.hintRung = 0;
function renderPuzzleLadder(){
  const p = State.puzzles[State.puzzleIdx]; if(!p) return;
  const box = document.getElementById('puzzle-ladder');
  const lbl = document.getElementById('hint-btn-label');
  if(!box) return;
  const rungs = SolveHelp.ladder(p.pattern, p.solution, p.threat_desc || '');
  const n = Math.min(State.hintRung, rungs.length);
  if(n === 0){ box.classList.add('hidden'); box.innerHTML=''; return; }
  box.classList.remove('hidden');
  box.innerHTML = rungs.slice(0, n).map(r =>
    '<div class="sh-rung' + (r.isAnswer ? ' sh-rung-answer' : '') + '">'
    + '<span class="sh-rung-label">' + esc(r.label) + '</span>'
    + '<p>' + esc(r.body) + '</p></div>').join('');
  if(lbl) lbl.textContent = n >= rungs.length ? 'That is the whole ladder'
                          : (n === 0 ? 'Help me find it' : 'Still stuck — tell me more');
  const btn = document.getElementById('hint-btn');
  if(btn) btn.disabled = n >= rungs.length;
}
document.getElementById('hint-btn').addEventListener('click',()=>{
  if(!State.puzzles[State.puzzleIdx]) return;
  State.hintRung++;
  renderPuzzleLadder();
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
// LESSONS moved to top

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
    item.innerHTML=`<div class="lesson-nav-title">${L.icon} ${L.title}</div><div class="lesson-nav-tag">${i===0&&State.lessonOrder.length?'Priority':('Lesson '+(i+1))}</div>`;
    item.addEventListener('click',()=>{document.querySelectorAll('.lesson-nav-item').forEach(el=>el.classList.remove('active'));item.classList.add('active');renderLesson(id);});
    sidebar.appendChild(item);
    if(i===0){item.classList.add('active');renderLesson(id);}
  });
}

function renderLesson(id){
  const L=LESSONS[id];if(!L)return;
  const done=State.completedLessons.includes(id);
  // Save premium lesson section before wiping
  const premSaved = document.getElementById('premium-lesson-section');
  const premHTML = premSaved ? premSaved.outerHTML : null;
  let html=`<div class="lesson-priority-badge ${L.priority}">${L.priority==='high'?'High Priority':'Recommended'}</div><div class="lesson-title">${L.icon} ${L.title}</div><div class="lesson-subtitle">${L.subtitle}</div>`;
  L.sections.forEach(s=>{
    html+=`<div class="lesson-section">`;
    if(s.heading)html+=`<h3>${s.heading}</h3>`;
    if(s.body)html+=`<p>${s.body.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>')}</p>`;
    if(s.tip)html+=`<div class="lesson-tip"> <strong>Pro tip:</strong> ${s.tip}</div>`;
    if(s.warning)html+=`<div class="lesson-warning"> <strong>Watch out:</strong> ${s.warning}</div>`;
    if(s.steps)html+=`<ol class="lesson-steps">${s.steps.map(st=>`<li>${st}</li>`).join('')}</ol>`;
    html+=`</div>`;
  });
  html+=`<div class="lesson-complete-btn">${done?`<button class="btn-outline" disabled> Completed (+30 XP earned)</button>`:`<button class="btn-cyan" id="complete-btn" onclick="completeLesson('${id}')" style="max-width:280px"> Mark Complete (+30 XP)</button>`}</div>`;
  const lc = document.getElementById('lesson-content');
  lc.innerHTML = html;
  // Restore premium lesson at top
  if(premHTML){
    const tmp = document.createElement('div');
    tmp.innerHTML = premHTML;
    lc.insertBefore(tmp.firstChild, lc.firstChild);
    setTimeout(()=>showPremiumMCQ(window._premiumMCQIdx||0), 50);
  }
}

async function completeLesson(id){
  await awardXP(30,'lesson',id);
  const btn=document.getElementById('complete-btn');
  if(btn){btn.textContent='Completed!';btn.disabled=true;btn.className='btn-outline';}
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
    item.innerHTML=`<div class="saved-game-info"><div>${esc(g.label)}</div><div class="saved-game-date">${d}</div></div><button class="load-btn">Load </button>`;
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
        div.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#22E5FF;color:#0D0D14;padding:1rem 2rem;border-radius:10px;font-weight:700;z-index:9999';
        div.textContent='You are already on ChessForge Pro!';
        document.body.appendChild(div);setTimeout(()=>div.remove(),3000);
      } else goToPro().catch(function(e){ console.error("goToPro failed:", e); });
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
  // Default to cyan dark if never set
  if(!localStorage.getItem('cf-theme')) localStorage.setItem('cf-theme','cyan');
  if(!localStorage.getItem('cf-lightmode')) localStorage.setItem('cf-lightmode','0');
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

// Close theme panel when clicking outside.
// The command palette's Settings entry toggles this panel from a click handler,
// and that same click kept bubbling to here — which re-hid the panel in the same
// tick, so Settings appeared to do nothing. Clicks that came from the palette
// are what opened it, so they are never "outside".
document.addEventListener('click', e=>{
  const panel = document.getElementById('theme-panel');
  if(!panel || panel.classList.contains('hidden')) return;
  if(e.target.closest && e.target.closest('.cmdk')) return;
  if(!panel.contains(e.target)) panel.classList.add('hidden');
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
    <div class="card-label"> Thinking Process Fingerprint</div>
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
        <div class="fp-name"> ${esc(p.name)}</div>
        <div class="fp-desc">${esc(p.description)}</div>
        <div class="fp-trigger"> When it happens: ${esc(p.trigger)}</div>
        <div class="fp-fix"> Fix: ${esc(p.fix)}</div>
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

function getEloFromAnalysis(){
  if(!State.analysisData) return null;
  const metas = State.analysisData.game_metas || [];
  if(!metas.length) return null;
  // Try to get ELO from PGN headers stored in meta
  // We'll use a reasonable default based on pattern data
  const total = State.analysisData.total_mistakes || 0;
  const games = State.analysisData.games_analysed || 1;
  const errPerGame = total / games;
  // Estimate ELO from error rate (rough heuristic)
  if(errPerGame > 15) return 600;
  if(errPerGame > 10) return 800;
  if(errPerGame > 7) return 1000;
  if(errPerGame > 5) return 1200;
  if(errPerGame > 3) return 1400;
  if(errPerGame > 2) return 1600;
  return 1800;
}

function startBotGame(){
  // Every entry point lands here, so this is where the colour is decided.
  const _sel = document.getElementById('bot-color');
  if(_sel && _sel.value === 'random'){
    BotState.playerColor = Math.random() < 0.5 ? 'white' : 'black';
    BotState.randomSide = true;      // leave the select on random for next time
  } else {
    BotState.randomSide = false;
  }
  const _pgnBtn = document.getElementById('setup-pgn');
  if(_pgnBtn) _pgnBtn.classList.add('hidden');
  const _svBtn = document.getElementById('setup-save');
  if(_svBtn) _svBtn.classList.add('hidden');
  BotState.saveRequested = false;
  BotState.helpUsed = 0;
  // Coached games are limited on Free. Claim one first — the server decides, so
  // the limit is real rather than a thing the browser politely observes.
  if(State.coachMode === 'coached' && State.loggedIn && State.plan !== 'pro'){
    fetch('/coach/begin', {method:'POST', credentials:'include'})
      .then(r=>r.json().then(d=>({ok:r.ok, d})))
      .then(({ok, d})=>{
        if(!ok && d && d.upgrade){
          Coach.speak(d.message || 'That is your free coached game for today.');
          try{ showProGate('coached'); }catch(e){}
        } else if(d && d.left === 0){
          Coach.speak('That is your last free coached game today. Make it count.');
        }
      })
      .catch(e=>console.error('coach/begin failed:', e));
  }
  if(!BotState.randomSide){
    BotState.playerColor = document.getElementById('bot-color').value;
  }
  // Games start from the setup panel AND the command palette; hide from here
  // so both entry points leave the same UI state.
  if(window.GameSetup) GameSetup.showSetup(false);
  if(window.Candidates) Candidates.reset();
  if(window.CoachRail) CoachRail.reset();
  BotState.game = new Chess();
  BotState.moveHistory = [];
  BotState.gameActive = true;
  BotState.thinking = false;
  if(window.Premove) Premove.clear();
  if(window.EvalBar) EvalBar.reset();
  if(BotState.board && BotState.board.clearUser) BotState.board.clearUser();
  BotState.lastBotSan = '';
  BotState.lastPlayerMove = null;
  BotState.lastBotMove = null;
  BotState.perf = [];
  BotState.moveData = [];
  BotState.board.flip(BotState.playerColor);
  BotState.board.setPosition(START_FEN);
  BotState.board.clearMarks();
  document.getElementById('bot-move-history').innerHTML = '';
  document.getElementById('bot-review-card').classList.add('hidden');
  if(window.AskForge){ AskForge.reset(); const _af=document.getElementById('askf'); if(_af) _af.classList.add('hidden'); }   // new game -> fresh conversation
  hidePause();
  Coach.reset();
  const estElo = getEloFromAnalysis();
  const eloStr = estElo ? ` · ~${estElo} ELO` : '';
  setBotStatus('Game on' + eloStr + (BotState.playerColor==='white' ? ' — you play White, make your move!' : ' — you play Black, bot is moving…'));
  enableCoachButtons(true);
  if(State.coachMode==='coached'){
    Coach.setStatus('Watching the board');
    Coach.speak('Game on. Take your time before every move — I\'ll ask questions and point things out.');
    if(BotState.playerColor === 'white'){
      setTimeout(()=>Coach.afterBotMove(''), 350);
    }
  } else {
    Coach.speak('');
  }
  if(BotState.playerColor === 'black'){
    setTimeout(makeBotMove, 800);
  }
}


/* Squares a piece could move to if it were your turn. chess.js only generates
   moves for the side to move, so we load the same position with the side-to-move
   flipped. Deliberately optimistic — like chess.com, a premove is validated for
   real at fire time and silently cancelled if the opponent's reply made it
   illegal. Returns null if the flipped position will not load (e.g. it leaves a
   king capturable), in which case no premove is offered for that piece. */
function premoveTargets(sq){
  try{
    if(typeof Chess === 'undefined' || !BotState.game) return null;
    const parts = BotState.game.fen().split(' ');
    parts[1] = BotState.playerColor[0];   // side to move -> the player
    parts[3] = '-';                       // en-passant target is no longer valid
    const g = new Chess();
    if(g.load(parts.join(' '))){
      const p = g.get(sq);
      if(!p || p.color !== BotState.playerColor[0]) return null;
      const t = g.moves({square:sq, verbose:true}).map(m=>m.to);
      if(t.length) return t;
    }
    // Flipping the turn can make a position chess.js refuses to load (a king
    // left capturable), which used to return an empty list — and an empty array
    // is truthy, so the piece selected, showed no dots, and nothing happened.
    // Be permissive instead, like chess.com: offer every square that is not
    // occupied by your own piece. Legality is checked for real when it fires.
    const own = BotState.playerColor[0];
    const out = [];
    for(const f of 'abcdefgh') for(let r=1; r<=8; r++){
      const t = f + r;
      if(t === sq) continue;
      const occ = BotState.game.get(t);
      if(occ && occ.color === own) continue;
      out.push(t);
    }
    return out;
  }catch(e){ return null; }
}
window.premoveTargets = premoveTargets;

/* ══════════ Premoves — queue one move while the opponent thinks ══════════ */
const Premove = {
  pending:null,
  queue(from,to){
    if(!BotState.game || !BotState.gameActive) return false;
    const pc=BotState.game.get(from);
    if(!pc || pc.color!==BotState.playerColor[0]) return false;   // must be your own piece
    this.clear();
    this.pending={from:from,to:to};
    this._paint(true);
    Coach.setStatus('Premove queued: ' + from + '-' + to);
    return true;                                                   // consumed, but nothing moves yet
  },
  clear(){
    if(!this.pending) return;
    this._paint(false);
    this.pending=null;
  },
  _paint(on){
    if(!this.pending) return;
    [this.pending.from,this.pending.to].forEach(sq=>{
      const root = (BotState.board && BotState.board.el) || document;
      const c = root.querySelector('.fb-sq[data-square="'+sq+'"]');
      if(c) c.classList.toggle('fb-premove', !!on);
    });
  },
  /* called the instant the opponent's move lands */
  fire(){
    const p=this.pending; if(!p) return false;
    this.clear();
    if(!BotState.game || BotState.game.turn()!==BotState.playerColor[0]) return false;
    const mv=BotState.game.move({from:p.from,to:p.to,promotion:'q'});   // auto-queen
    if(!mv){ return false; }                                            // illegal now -> silent cancel
    BotState.game.undo();
    // handleCoachMove re-queues anything arriving while BotState.thinking is set.
    // Without this flag a premove could re-queue itself instead of ever playing.
    this.firing = true;
    try{ return handleCoachMove(p.from,p.to); }
    finally{ this.firing = false; }
  }
};
window.Premove = Premove;
// cancel: Esc, right-click, or clicking an empty square
document.addEventListener('keydown',e=>{ if(e.key==='Escape') Premove.clear(); });
document.addEventListener('contextmenu',e=>{
  if(e.target.closest && e.target.closest('.fb-board')) Premove.clear();
});

/* Jump the board to a given ply from the move list (read-only preview). */
BotState.jumpToPly = function(ply){
  try{
    if(!BotState.game || typeof Chess === 'undefined') return;
    const hist = BotState.game.history();
    if(!hist.length) return;
    const n = Math.max(0, Math.min(ply + 1, hist.length));
    const tmp = new Chess();
    let last = null;
    for(let i = 0; i < n; i++){
      const mv = tmp.move(hist[i]);
      if(mv) last = {from: mv.from, to: mv.to};
    }
    BotState.previewPly = (n === hist.length) ? null : n;   // null = live position
    if(BotState.board) BotState.board.setPosition(tmp.fen(), {lastMove: last, animate: false});
    if(window.MoveRail) MoveRail.render(hist, null, n - 1);
    Coach.setStatus(BotState.previewPly === null
      ? 'Live position.'
      : 'Reviewing move ' + n + ' of ' + hist.length + ' - play a move to return to live.');
  }catch(e){}
};

/* Arrow keys step back through the game and return to the present.
   Left/Right walk a move at a time, Up/Home jump to the start, Down/End back to
   the live position. Playing a move also returns you to live, which
   handleCoachMove already did. */
document.addEventListener('keydown', function(e){
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  // Never steal keys from a text field, and never from the command palette,
  // which navigates its own list with the same arrows.
  const t = e.target;
  if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
           t.isContentEditable)) return;
  if(window.CommandPalette && CommandPalette.isOpen && CommandPalette.isOpen()) return;
  const gate = document.getElementById('pro-gate');
  if(gate && !gate.hidden) return;
  if(!BotState.game || !BotState.gameActive) return;
  const hist = BotState.game.history();
  if(!hist.length) return;

  // How many moves are on the board right now.
  const cur = (BotState.previewPly == null) ? hist.length : BotState.previewPly;
  let target = null;
  switch(e.key){
    case 'ArrowLeft':  target = cur - 2; break;            // show one fewer
    case 'ArrowRight': target = cur;     break;            // show one more
    case 'ArrowUp':
    case 'Home':       target = -1;             break;     // the starting position
    case 'ArrowDown':
    case 'End':        target = hist.length - 1; break;    // back to the present
    default: return;
  }
  if(target < -1) target = -1;
  if(target > hist.length - 1) target = hist.length - 1;
  e.preventDefault();
  BotState.jumpToPly(target);
});

// Player made a legal move on the ForgeBoard.
function handleCoachMove(from, to){
  if(!BotState.gameActive || BotState.boardLocked) return false;
  if(BotState.previewPly != null){        // was reviewing an earlier move - restore live board
    BotState.previewPly = null;
    if(BotState.board) BotState.board.setPosition(BotState.game.fen(), {animate:false});
    return false;
  }
  // Opponent is thinking -> queue a premove instead of rejecting the input.
  // Premove.fire() sets .firing so a premove being played cannot re-queue itself.
  if(!Premove.firing && (BotState.thinking || BotState.game.turn() !== BotState.playerColor[0])){
    return Premove.queue(from, to);
  }
  Premove.clear();
  const fenBefore = BotState.game.fen();
  // Snapshot the arrows now — playing the move clears them.
  const _cands = (window.Candidates ? Candidates.marked() : []);
  const mv = BotState.game.move({from, to, promotion:'q'});
  if(!mv) return false;
  if(window.Candidates){
    Candidates.clearVerdict();
    Candidates.review(fenBefore, mv.san, _cands);
  }
  ChessSFX.playMove(mv);
  BotState.lastPlayerMove = {from, to};
  BotState.lastBotMove = null;
  BotState.board.setPosition(BotState.game.fen(), {lastMove:{from,to}, checkSquare:coachKingCheckSquare()});
  rebuildBotHistory();
  BotState.board.clearMarks();
  if(BotState.game.game_over()){ checkBotGameOver(); return true; }
  if(State.coachMode === 'coached'){
    Coach.reviewPlayerMove(fenBefore, mv.san);   // may PAUSE before the bot replies
  } else {
    setTimeout(makeBotMove, 450);
  }
  return true;
}

function rebuildBotHistory(){
  const hist = document.getElementById('bot-move-history');
  if(!hist) return;
  hist.innerHTML = '';
  const moves = BotState.game.history();
  for(let i=0;i<moves.length;i+=2){
    const num = i/2+1;
    const row = document.createElement('div');
    row.className = 'bot-move-item'; row.id = 'bot-row-'+num;
    row.innerHTML = `<span class="bot-move-num">${num}.</span><span class="bot-move-w">${esc(moves[i]||'')}</span><span class="bot-move-b">${esc(moves[i+1]||'')}</span>`;
    hist.appendChild(row);
  }
  hist.scrollTop = hist.scrollHeight;
}

/* ── Red PAUSE-before-blunder overlay ─────────────────────────────────────── */
function checkSqForFen(fen){
  try{
    const g = new Chess(fen);
    if(!g.in_check()) return null;
    const turn = g.turn();
    for(const f of 'abcdefgh'){ for(let r=1;r<=8;r++){ const sq=f+r; const p=g.get(sq); if(p&&p.type==='k'&&p.color===turn) return sq; } }
  }catch(e){}
  return null;
}
// Build the "what happens" playback: your move  opponent's punishment, plus the better move.
function buildPauseFrames(fenBefore, sanPlayed, d){
  const frames=[];
  try{
    const g0=new Chess(fenBefore);
    frames.push({fen:fenBefore, label:'Before — your move', last:null});
    const m1=g0.move(sanPlayed);
    frames.push({fen:g0.fen(), label:'You played '+sanPlayed, last:m1?{from:m1.from,to:m1.to}:null});
    if(d && d.opp_best_san){
      const g1=new Chess(g0.fen());
      const m2=g1.move(d.opp_best_san);
      if(m2) frames.push({fen:g1.fen(), label:'Opponent hits back with '+d.opp_best_san+' — you\'re worse', last:{from:m2.from,to:m2.to}});
    }
    if(d && d.best_move_san){
      const gb=new Chess(fenBefore);
      const mb=gb.move(d.best_move_san);
      if(mb) frames.push({fen:gb.fen(), label:'Better was '+d.best_move_san, last:{from:mb.from,to:mb.to}, better:{from:mb.from,to:mb.to}});
    }
  }catch(e){}
  return frames;
}
function renderPauseFrame(){
  const frames = BotState._pbFrames||[]; const f = frames[BotState._pbIdx]; if(!f) return;
  BotState.board.setPosition(f.fen, {lastMove:f.last, checkSquare:checkSqForFen(f.fen)});
  BotState.board.clearMarks();
  if(f.better) BotState.board.arrow(f.better.from, f.better.to, '#26d07c');
  else if(f.last) BotState.board.arrow(f.last.from, f.last.to, f.better?'#26d07c':'#ff5d6c');
  const fl=document.getElementById('ba-frame'); if(fl) fl.textContent=f.label;
}
function pbStep(dir){
  const frames = BotState._pbFrames||[];
  BotState._pbIdx = Math.max(0, Math.min(frames.length-1, (BotState._pbIdx||0)+dir));
  renderPauseFrame();
}
window.pbStep = pbStep;

function showPause(data, fenBefore, sanPlayed){
  BotState.boardLocked = true;
  BotState._pauseFen = fenBefore;
  BotState._pauseData = data || {};
  BotState._pbFrames = buildPauseFrames(fenBefore, sanPlayed, data||{});
  BotState._pbIdx = Math.min(1, BotState._pbFrames.length-1);  // start on "you played"
  const flag=document.getElementById('blunder-flag');
  if(flag){
    flag.classList.remove('hidden');
    // Auto-clear: this used to stay until something else happened to hide it,
    // so a warning from three moves ago was still on screen.
    clearTimeout(window._blunderFlagT);
    window._blunderFlagT = setTimeout(()=>flag.classList.add('hidden'), 4000);
  }
  const alert=document.getElementById('blunder-alert');
  if(alert){ alert.classList.remove('hidden'); document.body.classList.add('blunder-open'); }
  const ttl=document.querySelector('#blunder-alert .ba-title');
  // Was "That move loses material — see why." — that is the verdict, not coaching.
  if(ttl) ttl.textContent = 'Hold on — look at this before you commit.';
  const txt=document.getElementById('ba-text');
  if(txt) txt.textContent = (data && data.commentary)
    ? data.commentary
    : 'Step forward through the moves and watch what your opponent gets. What did they gain?';
  renderPauseFrame();
  Coach.speak('Wait — breathe. Step through it: see what your opponent does next.');
  if(window.CoachFigure) CoachFigure.mood('alarm');   // the coach looks alarmed
  ChessSFX.playWrong();
}
function hidePause(){
  const flag=document.getElementById('blunder-flag'); if(flag) flag.classList.add('hidden');
  const alert=document.getElementById('blunder-alert');
  if(alert) alert.classList.add('hidden');
  document.body.classList.remove('blunder-open');
  BotState.boardLocked = false;
}
function pauseTakeBack(){
  if(BotState.game){ try{ BotState.game.undo(); }catch(e){} }
  BotState.lastPlayerMove = null;
  BotState.board.setPosition(BotState.game.fen(), {checkSquare:coachKingCheckSquare()});
  rebuildBotHistory();
  hidePause();
  Coach.setStatus('Smart — rethink it.');
  Coach.speak('Good call. Now scan: what is your opponent threatening, and which of your pieces is loose?');
  coachApplyMarks(BotState._pauseData||{});
}
function pausePlayAnyway(){
  const d = BotState._pauseData || {};
  hidePause();
  // restore the real board (position after your move) and continue
  BotState.board.setPosition(BotState.game.fen(), {lastMove:BotState.lastPlayerMove, checkSquare:coachKingCheckSquare()});
  Coach.renderFeedback(d.commentary||'', d.severity||'');
  coachApplyMarks(d);
  // The "what went wrong" quiz used to open forced, dimming the whole board the
  // instant you chose to play on. You had already decided; interrogating you
  // over a board you cannot see teaches nothing. It now goes in the coach panel
  // beside the board, answerable or ignorable.
  if(d.mcq){ try{ Coach.offerQuiz(d.mcq); }catch(e){} }
  checkBotGameOver();
  if(!BotState.game.game_over()) setTimeout(makeBotMove, 600);
}
// Take the move back and reason it out properly, rather than being told what
// was wrong with it. Same walk-through the coach uses everywhere else.
function pauseWalkThrough(){
  if(BotState.game){ try{ BotState.game.undo(); }catch(e){} }
  BotState.lastPlayerMove = null;
  BotState.board.setPosition(BotState.game.fen(), {checkSquare:coachKingCheckSquare()});
  rebuildBotHistory();
  hidePause();
  try{ Ladder.open({reason:'blunder'}); }catch(e){}
}
window.pauseTakeBack = pauseTakeBack;
window.pausePlayAnyway = pausePlayAnyway;
window.pauseWalkThrough = pauseWalkThrough;

async function makeBotMove(){
  if(!BotState.gameActive || BotState.game.game_over()) return;
  BotState.thinking = true;
  setBotStatus('Bot is thinking…');
  try{
    const r = await fetch('/bot-move', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({fen: BotState.game.fen(), weaknesses: BotState.weaknesses, perf: BotState.perf||[]}),
      credentials:'include'
    });
    const d = await r.json();
    // Returning here used to skip the premove flush at the end of this function,
    // leaving a queued premove stuck pending forever after a single bot error.
    if(d.error || !d.move){ setBotStatus('Bot error — your turn!'); BotState.thinking=false; flushPremove(); return; }
    const from = d.move.slice(0,2), to = d.move.slice(2,4);
    const mv = BotState.game.move({from, to, promotion:'q'});
    if(mv){
      ChessSFX.playMove(mv);
      BotState.lastBotMove = {from, to};
      BotState.lastPlayerMove = null;
      BotState.board.setPosition(BotState.game.fen(), {lastMove:{from,to}, checkSquare:coachKingCheckSquare()});
      rebuildBotHistory();
      BotState.lastBotSan = mv.san;
      setBotStatus(d.in_check ? ('Bot played ' + mv.san + ' — you are in CHECK!') : ('Bot played ' + mv.san + ' — your turn.'));
      if(State.coachMode==='coached' && !BotState.game.game_over()){
        setTimeout(()=>Coach.afterBotMove(mv.san), 300);
      }
      if(window.EvalBar && typeof d.eval === 'number') EvalBar.push(d.eval);
      if(typeof d.est_elo === 'number') BotState.lastEstElo = d.est_elo;
      if(window.MoveRail && BotState.game) MoveRail.render(BotState.game.history(), null, null);
      checkBotGameOver();
    }
  }catch(e){ setBotStatus('Connection error. Your turn!'); }
  BotState.thinking = false;
  flushPremove();
}

// the opponent's move has landed — attempt any queued premove
function flushPremove(){
  if(window.Premove && Premove.pending){
    setTimeout(()=>{ try{ Premove.fire(); }catch(e){ Premove.clear(); } }, 120);
  }
}
window.flushPremove = flushPremove;

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
  enableCoachButtons(false);
  hidePause();
  if(BotState.board && BotState.board.clearMarks) BotState.board.clearMarks();
  let result = '';
  if(BotState.game.in_checkmate()){
    const winner = BotState.game.turn() === 'w' ? 'Black' : 'White';
    const playerWon = (winner === 'White' && BotState.playerColor === 'white') || (winner === 'Black' && BotState.playerColor === 'black');
    result = playerWon ? 'You won by checkmate!' : 'Bot won by checkmate.';
  } else if(BotState.game.in_stalemate()){ result = '½ Stalemate — draw!'; }
  else if(BotState.game.in_draw()){ result = '½ Draw!'; }
  setBotStatus(result);
  // Fold this game into the long-term record. Solo games are what the rating
  // estimate reads, so the mode matters.
  try{
    const perf = BotState.perf || [];
    const bl = perf.filter(x=>x>=300).length, mi = perf.filter(x=>x>=150&&x<300).length,
          ina = perf.filter(x=>x>=60&&x<150).length;
    fetch('/progress/record', {method:'POST', headers:{'Content-Type':'application/json'},
      credentials:'include', body: JSON.stringify({
        coached: State.coachMode === 'coached',
        moves: Math.ceil(BotState.game.history().length/2),
        blunders: bl, mistakes: mi, inaccuracies: ina,
        acpl: perf.length ? Math.round(perf.reduce((a,b)=>a+b,0)/perf.length) : 0,
        est_elo: BotState.lastEstElo || 0,
        patterns: BotState.weaknesses || [], result: result,
        help: BotState.helpUsed || 0
      })}).catch(()=>{});
  }catch(e){}
  Coach.setStatus('Game over');
  // They pressed Save during the game; the finished game is what gets stored.
  if(BotState.saveRequested){ try{ doSaveGame(); }catch(e){} }
  // Surface the next game immediately instead of leaving a dead board.
  if(window.GameSetup){
    setTimeout(()=>{
      GameSetup.showSetup(true);
      const go = document.getElementById('setup-go');
      if(go) go.textContent = 'Play again';
      // Pick the mode again for the next one, and offer the game you just
      // finished as a PGN.
      const pgn = document.getElementById('setup-pgn');
      if(pgn) pgn.classList.remove('hidden');
      const sv = document.getElementById('setup-save');
      if(sv) sv.classList.remove('hidden');
      const sub = document.querySelector('.gm-setup-sub');
      if(sub) sub.textContent = 'Another one? Choose how you want to play it.';
    }, 1600);
  }
  Coach.renderQuestions(['Game over. Click "Train These Positions" when the review finishes — those puzzles come from THIS game.']);
  showBotReview();
  // Auto-launch post-game review
  if(State.coachMode==='coached'){
    setTimeout(()=>runPostgameReview(), 600);
  }
}


// chess.js 0.10.3 has no .result() — derive the PGN result tag ourselves.
function botResultString(g){
  try{
    if(!g || !g.game_over()) return '*';
    if(g.in_checkmate()) return g.turn()==='w' ? '0-1' : '1-0';
    return '1/2-1/2';
  }catch(e){ return '*'; }
}

function getBotPGN(){
  // A PGN other sites will actually accept: the seven-tag roster, and the
  // result repeated as a token at the end of the movetext, which is required
  // and was missing. Lichess and Chess.com both reject or mangle it otherwise.
  if(!BotState.game) return '';
  const moves = BotState.game.history();
  const result = botResultString(BotState.game);
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  const date = d.getFullYear() + '.' + pad(d.getMonth()+1) + '.' + pad(d.getDate());
  const me = (State.user || 'You');
  const white = BotState.playerColor === 'white' ? me : 'GM Forge';
  const black = BotState.playerColor === 'black' ? me : 'GM Forge';
  let pgn = '';
  pgn += '[Event "ChessForge coached game"]\n';
  pgn += '[Site "https://app.chessforge.org"]\n';
  pgn += '[Date "' + date + '"]\n';
  pgn += '[Round "-"]\n';
  pgn += '[White "' + white + '"]\n';
  pgn += '[Black "' + black + '"]\n';
  pgn += '[Result "' + result + '"]\n\n';
  let body = '';
  for(let i=0;i<moves.length;i++){
    if(i%2===0) body += (Math.floor(i/2)+1) + '. ';
    body += moves[i] + ' ';
  }
  body += result;                       // the closing token PGN requires
  // Wrap at 80 columns, as the spec asks for.
  const words = body.trim().split(/\s+/);
  let line = '';
  words.forEach(w=>{
    if((line + ' ' + w).trim().length > 80){ pgn += line.trim() + '\n'; line = w; }
    else line += ' ' + w;
  });
  pgn += line.trim();
  return pgn;
}

/* Save the game to the account. Pressed mid-game it does not save a half game
   — it marks the game, and the complete one is saved the moment it ends, which
   is what you actually want from a button you hit on move 12. Pressed after the
   game it saves immediately. */
function saveBotGame(){
  if(!BotState.game || !BotState.game.history().length){ flashSave('Nothing to save yet'); return; }
  const over = !BotState.gameActive || BotState.game.game_over();
  if(!over){
    BotState.saveRequested = true;
    flashSave('Saving when the game ends', true);
    return;
  }
  doSaveGame();
}

function doSaveGame(){
  const pgn = getBotPGN();
  if(!pgn) return;
  if(!State.loggedIn){ flashSave('Sign in to save'); return; }
  const label = 'vs GM Forge · ' + new Date().toLocaleDateString();
  fetch('/auth/save-game', {method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify({pgn, label})})
    .then(r=>r.json())
    .then(d=>{
      if(d && d.ok){ BotState.saveRequested = false; flashSave('Game saved', true); }
      else flashSave((d && d.error) || 'Could not save');
    })
    .catch(e=>{ console.error('saveBotGame failed:', e); flashSave('Could not save'); });
}

function flashSave(msg, good){
  ['save-game-btn','setup-save'].forEach(id=>{
    const b = document.getElementById(id);
    if(!b || b.classList.contains('hidden')) return;
    if(!b.dataset.label) b.dataset.label = b.textContent.trim();
    b.textContent = msg;
    b.classList.toggle('is-done', !!good);
    clearTimeout(b._t);
    b._t = setTimeout(()=>{ b.textContent = b.dataset.label; b.classList.remove('is-done'); }, 2600);
  });
}
window.saveBotGame = saveBotGame;

function copyBotPGN(){
  const pgn = getBotPGN();
  const btn = document.getElementById('copy-pgn-btn');
  // Most reliable cross-browser copy
  try {
    const ta = document.createElement('textarea');
    ta.value = pgn;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const success = document.execCommand('copy');
    document.body.removeChild(ta);
    if(success && btn){
      btn.textContent = 'Copied to clipboard!';
      btn.style.color = 'var(--green)';
      btn.style.borderColor = 'var(--green)';
      setTimeout(()=>{btn.textContent='Copy PGN';btn.style.color='';btn.style.borderColor='';}, 2500);
    }
  } catch(e) {
    // Try clipboard API as fallback
    if(navigator.clipboard){
      navigator.clipboard.writeText(pgn).then(()=>{
        if(btn){btn.textContent='Copied!';setTimeout(()=>btn.textContent='Copy PGN',2500);}
      });
    }
  }
}

function showBotReview(){
  const card = document.getElementById('bot-review-card');
  const content = document.getElementById('bot-review-content');
  card.classList.remove('hidden');
  // The review is the moment the player has questions — open the chat with it.
  if(window.AskForge) AskForge.open();
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
      <button class="btn-outline" id="copy-pgn-btn" onclick="copyBotPGN()"> Copy PGN</button>
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


/* ── Guided tour ─────────────────────────────────────────────────────────────
   Walks a new account through the whole app. Each step navigates to the screen
   it is describing, so you are looking at the real thing rather than reading
   about it. Tied to the account, not the browser, so a new account on an old
   browser still gets it and an old account on a new browser does not.
   Re-runnable any time from the command palette. */
const TOUR = [
  {title:'Welcome to ChessForge',
   desc:'This is not a tool that tells you what you did wrong after the fact. GM Forge sits '
      + 'beside you while you play, asks the question you should have asked yourself, and turns '
      + 'the mistakes you actually make into practice. Two minutes and you will know your way '
      + 'around.'},

  {page:'coach', focus:'bot-board', title:'The board is the whole product',
   desc:'Play here against an engine set near your level. Click a piece and every legal move '
      + 'lights up; drag or click to move. Right-click-drag draws an arrow, which matters in a '
      + 'moment.'},

  {page:'coach', focus:'bot-board', title:'Arrow keys review the game',
   desc:'Left and right walk back through the moves, up jumps to the start, down returns to the '
      + 'present. You can look back at any point mid-game without losing your place — playing a '
      + 'move puts you back to live.'},

  {page:'coach', focus:'coach-panel', title:'Everything GM Forge does is in one column',
   desc:'He speaks at the top. Below that sit the walk-throughs, your candidate moves, and the '
      + 'questions worth asking in this position. Nothing coaching-related lives anywhere else on '
      + 'this screen.'},

  {page:'coach', focus:'ladder-open', title:'"I don\'t know what to do here"',
   desc:'The most useful button in the app. It walks you through the actual procedure: count the '
      + 'attackers and defenders, decide whether anything is genuinely loose, then choose a move. '
      + 'He never just hands you the answer. He also opens it himself when something important '
      + 'happens.'},

  {page:'coach', focus:'coach-panel', title:'Weighing two moves? Draw both',
   desc:'Right-click-drag an arrow for each move you are considering, then press Play them out. '
      + 'Each line is played forward on the real board with a sentence for each move, so you can '
      + 'see what your opponent gets. Then he asks which you would rather have — and if you say '
      + 'you are not sure, he explains before he ever reveals.'},

  {page:'coach', focus:'bot-board', title:'About to blunder',
   desc:'If a move is going to cost you, the board pauses before it counts. You can take it back, '
      + 'play it anyway, or have him walk you through what was wrong with it. The board stays '
      + 'visible the whole time.'},

  {page:'training', sel:'[data-page="training"]', title:'Training drills your actual weaknesses',
   desc:'Not generic puzzles. The patterns here come from mistakes you have really made, scheduled '
      + 'so they come back just before you would forget them. The Thinking Profile on this page '
      + 'shows how you tend to decide, not just what you played.'},

  {page:'puzzles', sel:'[data-page="puzzles"]', title:'Puzzles built from your own games',
   desc:'Every blunder you make becomes a position to solve. Stuck? The hint ladder narrows it '
      + 'step by step and only names the move on the last rung.'},

  {page:'progress', sel:'[data-page="progress"]', title:'Progress tells you the truth',
   desc:'Your rating estimate comes only from games you play WITHOUT the coach, because those are '
      + 'the honest ones. Blunder rate, average centipawn loss, and which mistakes keep coming '
      + 'back are all here.'},

  {page:'shop', focus:'tb-xp-btn', title:'XP you earn, and what it buys',
   desc:'Playing, drilling and thinking carefully all earn XP. Spend it on board themes, piece '
      + 'sets, and outfits for GM Forge. Your balance is in the top bar and never expires.'},

  {focus:'cmdk-hint', title:'Command palette',
   desc:'Press Cmd-K or Ctrl-K anywhere to jump between screens, start a game, switch between '
      + 'Coached and Free Play, or replay this tour.'},

  {title:'That is the tour',
   desc:'Free includes one coached game a day, five puzzles, and one training exercise per theme. '
      + 'Grandmaster removes every limit and adds deep analysis, Ask GM Forge, Trap Trainer and '
      + 'the shop. Now go play a game — the coaching only makes sense once you are in one.'}
];

let tourStep = 0;

function startTutorial(){
  tourStep = 0;
  const box = document.getElementById('tutorial-box');
  if(box) delete box.dataset.moved;
  showTutorialStep();
  const ov = document.getElementById('tutorial-overlay');
  if(ov) ov.classList.remove('hidden');
}

function showTutorialStep(){
  const step = TOUR[tourStep];
  if(!step){ skipTutorial(); return; }
  // Show the screen being described, so the words have something to point at.
  if(step.page){ try{ showPage(step.page); }catch(e){} }
  const n = document.getElementById('t-step-num');
  const t = document.getElementById('t-step-total');
  const ti = document.getElementById('t-title');
  const de = document.getElementById('t-desc');
  if(n) n.textContent = tourStep + 1;
  if(t) t.textContent = TOUR.length;
  if(ti) ti.textContent = step.title;
  if(de) de.textContent = step.desc;

  // Spotlight the thing being described and put the card beside it. The old
  // version dimmed the whole screen, which hid the very thing it was talking
  // about.
  clearTourFocus();
  setTimeout(()=>{
    const el = step.focus ? document.getElementById(step.focus)
             : step.sel   ? document.querySelector(step.sel)
             : null;
    if(el){ el.classList.add('tour-focus'); }
    placeTourBox(el);
  }, 140);
  const back = document.getElementById('t-back');
  if(back) back.classList.toggle('hidden', tourStep === 0);
  const next = document.getElementById('t-next');
  if(next) next.textContent = (tourStep === TOUR.length - 1) ? 'Start playing' : 'Next';
}


function clearTourFocus(){
  document.querySelectorAll('.tour-focus').forEach(el=>el.classList.remove('tour-focus'));
}

/* Put the card next to what it is describing, never on top of it. Below if
   there is room, otherwise above, otherwise beside — then clamped so it can
   never sit off-screen. The user can still drag it afterwards. */
function placeTourBox(target){
  const box = document.getElementById('tutorial-box');
  if(!box) return;
  if(box.dataset.moved === '1') return;          // they positioned it themselves
  const bw = box.offsetWidth  || 340;
  const bh = box.offsetHeight || 200;
  const vw = window.innerWidth, vh = window.innerHeight;
  const gap = 18;
  let left, top;
  if(!target){                                    // no target: sit low and centred
    left = (vw - bw) / 2;
    top  = vh - bh - 40;
  } else {
    const r = target.getBoundingClientRect();
    const below = vh - r.bottom, above = r.top;
    if(below >= bh + gap)      top = r.bottom + gap;
    else if(above >= bh + gap) top = r.top - bh - gap;
    else                       top = Math.max(gap, (vh - bh) / 2);
    left = r.left + r.width / 2 - bw / 2;         // centred on the target
  }
  left = Math.max(gap, Math.min(left, vw - bw - gap));
  top  = Math.max(gap, Math.min(top,  vh - bh - gap));
  box.style.left = left + 'px';
  box.style.top  = top + 'px';
  box.style.bottom = 'auto';
  box.style.right  = 'auto';
  box.style.transform = 'none';
}

/* Draggable by its header, in case the automatic spot is still in the way. */
(function(){
  let dragging = false, ox = 0, oy = 0;
  document.addEventListener('mousedown', function(e){
    const box = document.getElementById('tutorial-box');
    if(!box || !box.contains(e.target)) return;
    if(e.target.closest && e.target.closest('button')) return;   // buttons still click
    const r = box.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    dragging = true; box.dataset.moved = '1';
    box.classList.add('is-dragging');
    e.preventDefault();
  });
  window.addEventListener('mousemove', function(e){
    if(!dragging) return;
    const box = document.getElementById('tutorial-box');
    if(!box) return;
    const bw = box.offsetWidth, bh = box.offsetHeight;
    box.style.left = Math.min(Math.max(0, e.clientX - ox), window.innerWidth  - bw) + 'px';
    box.style.top  = Math.min(Math.max(0, e.clientY - oy), window.innerHeight - bh) + 'px';
    box.style.bottom = 'auto'; box.style.right = 'auto'; box.style.transform = 'none';
  });
  window.addEventListener('mouseup', function(){
    dragging = false;
    const box = document.getElementById('tutorial-box');
    if(box) box.classList.remove('is-dragging');
  });
})();

function nextTutorialStep(){
  tourStep++;
  if(tourStep >= TOUR.length){ skipTutorial(); return; }
  showTutorialStep();
}
function prevTutorialStep(){
  if(tourStep > 0){ tourStep--; showTutorialStep(); }
}

function skipTutorial(){
  const ov = document.getElementById('tutorial-overlay');
  if(ov) ov.classList.add('hidden');
  clearTourFocus();
  try{ localStorage.setItem('cf-tutorial-done', '1'); }catch(e){}
  // Remember it against the account, so it does not follow the browser around.
  if(State.loggedIn){
    fetch('/auth/tutorial-seen', {method:'POST', credentials:'include'})
      .catch(e=>console.error('tutorial-seen failed:', e));
  }
  try{ showPage('coach'); }catch(e){}
}
window.startTutorial = startTutorial;
window.nextTutorialStep = nextTutorialStep;
window.prevTutorialStep = prevTutorialStep;
window.skipTutorial = skipTutorial;

// Esc leaves the tour.
document.addEventListener('keydown', function(e){
  const ov = document.getElementById('tutorial-overlay');
  if(!ov || ov.classList.contains('hidden')) return;
  if(e.key === 'Escape'){ e.preventDefault(); skipTutorial(); }
  else if(e.key === 'ArrowRight'){ e.preventDefault(); nextTutorialStep(); }
  else if(e.key === 'ArrowLeft'){ e.preventDefault(); prevTutorialStep(); }
});

// A brand-new account gets it once, after the session has settled.
function maybeStartTour(d){
  if(!d || !d.loggedIn && !d.ok) return;
  if(d.tutorial_done) return;
  setTimeout(()=>{ try{ startTutorial(); }catch(e){} }, 900);
}
window.maybeStartTour = maybeStartTour;

/* ── Onboarding ───────────────────────────────────────────────────────────── */
// Onboarding is driven by server state (State.onboarding). New users are guided
// through the calibration flow; existing users are marked complete server-side.
// The guided new-account tutorial (overlay, arrows, step rectangles) was removed
// at the user's request. New accounts now land straight in the app; the server
// also marks them onboarding-complete so nothing re-triggers this.
function checkOnboarding(){ /* intentionally empty — tutorial removed */ }


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
    if(!r.ok){ handleLocked(d); return false; }
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
  // Remove existing
  const existing = document.getElementById('premium-lesson-section');
  if(existing) existing.remove();

  const container = document.getElementById('lesson-content');
  if(!container) return;

  const premDiv = document.createElement('div');
  premDiv.id = 'premium-lesson-section';
  premDiv.style.marginBottom = '1.5rem';

  const isPro = State.plan === 'pro';
  const hasData = !!(State.analysisData && State.analysisData.total_mistakes >= 0);
  const gamesAnalysed = State.analysisData?.games_analysed || parseInt(localStorage.getItem('cf-games-analysed') || '0');
  const topWeakness = State.analysisData?.top_weaknesses?.[0]?.[0] || 'Hanging piece';

  if(!isPro){
    premDiv.innerHTML = `
      <div class="locked-lesson">
        <div class="locked-lesson-icon"></div>
        <h3>Personal Game Lessons</h3>
        <p>Grandmaster unlocks interactive lessons built from YOUR games — multiple choice questions, personalised theory, and coaching drawn from the mistakes you actually make.</p>
        <button class="btn-cyan" onclick="goToPro()" style="width:auto;margin:0 auto">Upgrade to Grandmaster</button>
      </div>`;
    container.insertBefore(premDiv, container.firstChild);
    return;
  }

  if(!hasData){
    premDiv.innerHTML = `
      <div class="locked-lesson">
        <div class="locked-lesson-icon"></div>
        <h3>Personal Game Lessons</h3>
        <p>Analyse a game first — ChessForge will build an interactive lesson from your specific mistakes.</p>
        <button class="btn-outline" onclick="showPage('analyze')">Analyse a Game </button>
      </div>`;
    container.insertBefore(premDiv, container.firstChild);
    return;
  }

  // Build lesson content from weakness
  const WEAKNESS_CONTENT = {
    'Hanging piece': {
      title: 'Stop Hanging Pieces — Your #1 Problem',
      theory: 'In your analysed games, leaving pieces undefended is your most costly mistake. This is not a knowledge problem — it is a habit problem. You need to build an automatic pre-move scan into your thinking process.',
      steps: ['Before every move: mentally point at each of your pieces', 'Ask "Is this safe after my move?"', 'Only then commit to the move'],
      keyLesson: 'LPDO — Loose Pieces Drop Off. Every loose piece is a target. Make defending your pieces automatic.',
    },
    'Missed tactic': {
      title: 'Seeing the Tactics That Are Already There',
      theory: 'Your games show you build good positions but miss opportunities to win material or deliver decisive attacks. The tactics are there — you are not yet looking for them at the right moment.',
      steps: ['After every opponent move: ask "What did this move allow?"', 'Check all checks, captures, and threats before quiet moves', 'If a position feels good, look harder — something might be winning'],
      keyLesson: 'The best move is rarely the first one you see. Always check for forcing moves before committing.',
    },
    'King safety issue': {
      title: 'Your King Keeps Getting into Trouble',
      theory: 'Your analysed games show recurring king safety problems. Every time your king was endangered, it was preventable. The fix is a simple rule applied consistently.',
      steps: ['Castle within the first 10 moves — every game', 'Never move the pawns in front of your castled king without a concrete reason', 'If center files open, your king must be castled'],
      keyLesson: 'A king in the center is an accident waiting to happen. Castle early, castle every game.',
    },
    'Early queen development': {
      title: 'Stop Moving Your Queen Too Early',
      theory: 'You are bringing your queen out before developing your other pieces. Every time your queen gets attacked, you lose a tempo — your opponent develops a piece for free while you run away.',
      steps: ['Develop both knights before moving your queen', 'Develop both bishops before moving your queen', 'Castle — then consider activating the queen'],
      keyLesson: 'The queen is most powerful when it coordinates with active pieces. Alone in the opening, it is just a target.',
    },
    'Opening mistake': {
      title: 'Building Better Opening Habits',
      theory: 'Most of your mistakes happen in the first 10 moves. You are starting games on the wrong foot, which makes the rest of the game an uphill battle.',
      steps: ['Move 1: Claim central space with e4 or d4', 'Moves 2-5: Develop knights then bishops toward the center', 'Moves 5-8: Castle your king to safety'],
      keyLesson: 'You do not need to memorise openings. Master the 4 principles: control center, develop pieces, castle early, no early queen.',
    },
  };

  const content = WEAKNESS_CONTENT[topWeakness] || WEAKNESS_CONTENT['Hanging piece'];

  // MCQ per weakness
  const MCQ_SETS = {
    'Hanging piece': [
      {q:'Before making a move, what should you ALWAYS check?', opts:['Is my queen active?','Are any of my pieces left undefended after this move?','Can I attack the king?','Is my pawn structure good?'], correct:1},
      {q:'What does LPDO stand for?', opts:['Long Pawns Drop Off','Loose Pieces Drop Off','Last Piece Defence Option','Lateral Pawn Defence Only'], correct:1},
      {q:'You spot a great attack. What do you do FIRST?', opts:['Launch it immediately','Check if any of your pieces become undefended first','Move your queen into the attack','Develop another piece'], correct:1},
    ],
    'Missed tactic': [
      {q:'After your opponent makes a move, what is the FIRST question?', opts:['What is my long-term plan?','What is my opponent threatening?','Should I castle now?','Which piece needs developing?'], correct:1},
      {q:'Which moves should you calculate FIRST?', opts:['Quiet positional moves','Pawn structure improvements','Forcing moves: checks, captures, threats','King safety moves'], correct:2},
      {q:'You find a good move. Should you play it immediately?', opts:['Yes always','No — first check if something even better exists','Only if it wins material','Only in tactical positions'], correct:1},
    ],
    'King safety issue': [
      {q:'By which move should you castle in most games?', opts:['Move 5','Move 10','Move 20','Move 30'], correct:1},
      {q:'Which pawns are most dangerous to move when castled kingside?', opts:['Center pawns d and e','The f, g, h pawns in front of your king','The a and b pawns','Opponent pawns'], correct:1},
      {q:'Your king has not castled by move 12. What should you do?', opts:['Keep developing, castle later','Castle immediately unless there is a concrete tactical reason not to','Push h pawn for luft','Move king to the center temporarily'], correct:1},
    ],
    'Early queen development': [
      {q:'When should you bring your queen out in the opening?', opts:['Move 1 or 2','As soon as possible','After both knights and bishops are developed','Never in the opening'], correct:2},
      {q:'Why is early queen development bad?', opts:['The queen is not powerful enough early','Opponent can attack it with developing moves and gain tempo','It controls too many squares','It blocks your pawns'], correct:1},
      {q:'Your queen is on d3 on move 4 and gets attacked by Nc6. What happened?', opts:['You gained an attack','Your opponent wasted a move','Your opponent developed a piece for free while you moved your queen again','You created a pin'], correct:2},
    ],
    'Opening mistake': [
      {q:'What is the most important principle on move 1?', opts:['Develop a knight','Control the center with a pawn','Protect your king','Develop a bishop'], correct:1},
      {q:'Which sequence is correct?', opts:['Queen first, then pieces','Knights then bishops then castle','Bishops then knights then queen','Castle first then develop'], correct:1},
      {q:'Your opponent plays an unusual move 3. What do you do?', opts:['Copy their move','Ignore it and follow your plan','Ask yourself: what is the threat? Then respond','Immediately attack their king'], correct:2},
    ],
  };

  const mcqSet = MCQ_SETS[topWeakness] || MCQ_SETS['Hanging piece'];
  window._premiumLessonContent = content;
  window._premiumMCQ = mcqSet;
  window._premiumMCQIdx = 0;
  window._premiumMCQScore = 0;

  const stepsHTML = content.steps.map((s,i)=>`<div style="display:flex;gap:.7rem;align-items:flex-start;margin-bottom:.5rem;font-size:.85rem;color:var(--muted)"><span style="background:var(--cyan);color:#0D0D14;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;flex-shrink:0">${i+1}</span>${s}</div>`).join('');

  premDiv.innerHTML = `
    <div class="premium-lesson-card">
      <div class="premium-lesson-badge"> Your Personal Lesson — Based on ${gamesAnalysed} Game${gamesAnalysed!==1?'s':''}</div>
      <div class="premium-lesson-title">${content.title}</div>
      <div style="background:var(--bg3);border-radius:8px;padding:1rem;margin:1rem 0;font-size:.87rem;color:var(--muted);line-height:1.7">${content.theory}</div>
      <div class="card-label" style="margin-bottom:.6rem">The 3-Step Fix</div>
      ${stepsHTML}
      <div style="background:var(--cyan-dim);border-left:2px solid var(--cyan);padding:.7rem 1rem;border-radius:0 8px 8px 0;margin:1rem 0;font-size:.85rem;color:var(--cyan)">
         <strong>Key lesson:</strong> ${content.keyLesson}
      </div>
      <div class="card-label" style="margin-top:1.2rem;padding-top:1.2rem;border-top:1px solid var(--border)"> Test Your Understanding</div>
      <div id="prem-mcq-area" style="margin-top:.8rem"></div>
    </div>`;

  container.insertBefore(premDiv, container.firstChild);

  // Start the quiz
  setTimeout(()=>showPremiumMCQ(0), 100);
}

function showPremiumMCQ(idx){
  const area = document.getElementById('prem-mcq-area');
  if(!area) return;
  const mcq = window._premiumMCQ;
  if(!mcq || idx >= mcq.length){
    area.innerHTML = `<div style="color:var(--green);font-size:.95rem;font-weight:600;padding:1rem 0"> Quiz complete! Score: ${window._premiumMCQScore}/${mcq?mcq.length:0}. Great work!</div>`;
    return;
  }
  const q = mcq[idx];
  const optsHTML = q.opts.map((o,i)=>`
    <button onclick="answerPremiumMCQ(${i})" style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text);font-family:var(--font-ui);font-size:.85rem;padding:.6rem 1rem;border-radius:8px;cursor:pointer;text-align:left;margin-bottom:.4rem;transition:all .2s" onmouseover="this.style.borderColor='var(--cyan)'" onmouseout="this.style.borderColor='var(--border)'">${o}</button>
  `).join('');
  area.innerHTML = `
    <div style="font-size:.88rem;font-weight:600;color:var(--text);margin-bottom:.8rem">Q${idx+1}/${mcq.length}: ${esc(q.q)}</div>
    ${optsHTML}`;
}

function answerPremiumMCQ(chosen){
  const mcq = window._premiumMCQ;
  const idx = window._premiumMCQIdx;
  if(!mcq || idx >= mcq.length) return;
  const q = mcq[idx];
  const correct = q.correct;
  const area = document.getElementById('prem-mcq-area');
  if(!area) return;
  const btns = area.querySelectorAll('button');
  btns.forEach((b,i)=>{
    b.disabled = true;
    b.style.cursor = 'default';
    if(i === correct) b.style.background = 'rgba(46,213,115,.15)', b.style.borderColor = 'var(--green)', b.style.color = 'var(--green)';
    else if(i === chosen && chosen !== correct) b.style.background = 'rgba(255,71,87,.15)', b.style.borderColor = 'var(--red)', b.style.color = 'var(--red)';
  });
  if(chosen === correct) window._premiumMCQScore++;
  const feedback = document.createElement('div');
  feedback.style.cssText = 'margin-top:.8rem;padding:.7rem 1rem;border-radius:8px;font-size:.85rem;';
  feedback.style.background = chosen===correct ? 'rgba(46,213,115,.1)' : 'rgba(255,71,87,.1)';
  feedback.style.color = chosen===correct ? 'var(--green)' : 'var(--red)';
  feedback.innerHTML = chosen===correct ? 'Correct! ' : ` The correct answer is: <strong>${q.opts[correct]}</strong>. `;
  area.appendChild(feedback);
  const nextBtn = document.createElement('button');
  nextBtn.textContent = idx+1 < mcq.length ? 'Next Question ' : 'Finish Quiz';
  nextBtn.style.cssText = 'margin-top:.6rem;background:var(--cyan);color:#0D0D14;border:none;border-radius:8px;padding:.5rem 1.2rem;font-weight:700;cursor:pointer;font-family:var(--font-ui);';
  nextBtn.onclick = ()=>{ window._premiumMCQIdx++; showPremiumMCQ(window._premiumMCQIdx); };
  area.appendChild(nextBtn);
}





/* ── Coach Page ───────────────────────────────────────────────────────────── */
function setBotMode(mode){
  State.coachMode = mode;
  // Null-guarded: this is reachable from the command palette now, not only from
  // the two cards on the play screen.
  const c=document.getElementById('mode-coached'), f=document.getElementById('mode-free');
  if(c) c.classList.toggle('active', mode==='coached');
  if(f) f.classList.toggle('active', mode==='free');
  Coach.speak(mode==='coached'
    ? 'Coached mode on — I\'ll talk you through every move.'
    : 'Free play — no hints. Just play.');
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function coachKingCheckSquare(){
  if(!BotState.game || !BotState.game.in_check()) return null;
  const turn = BotState.game.turn();
  for(const f of 'abcdefgh'){ for(let r=1;r<=8;r++){ const sq=f+r; const p=BotState.game.get(sq); if(p&&p.type==='k'&&p.color===turn) return sq; } }
  return null;
}

function initCoachPage(){
  if(!document.getElementById('bot-board')) return;
  if(BotState.board && BotState.board.__forge) return;
  // Clean, tap-to-move ForgeBoard (same board as the onboarding calibration game)
  BotState.board = new ForgeBoard('bot-board', {
    orientation: 'white',
    getTargets:(sq)=>{
      if(!BotState.gameActive || BotState.boardLocked) return null;
      if(!BotState.game) return null;
      const p = BotState.game.get(sq);
      if(!p || p.color !== BotState.playerColor[0]) return null;
      // Your turn: real legal moves.
      if(!BotState.thinking && BotState.game.turn() === BotState.playerColor[0]){
        return BotState.game.moves({square:sq, verbose:true}).map(m=>m.to);
      }
      // Opponent's turn: offer premove targets. This used to return null, which
      // meant a piece could not even be picked up while the bot was thinking —
      // so Premove.queue() was never reachable and premoves never worked at all.
      return premoveTargets(sq);
    },
    onMove:(from,to)=>handleCoachMove(from,to),
  });
  BotState.board.__forge = true;
  if(State.analysisData){
    BotState.weaknesses = (State.analysisData.top_weaknesses||[]).map(([n])=>n);
  }
}

// Draw the coach's arrows / highlights on the ForgeBoard and point the coach's arm at the key square.
function coachApplyMarks(d){
  const b = BotState.board; if(!b || !b.clearMarks) return;
  b.clearMarks();
  (d.arrows||[]).forEach(a=>{ if(a && a.from && a.to) b.arrow(a.from, a.to, a.color); });
  (d.highlights||[]).forEach(h=>{ if(h && h.square) b.highlight(h.square, h.color); });
  // Precise pointing happens on the board itself (finger + arrows).
  let handSq = null;
  if(d.highlights && d.highlights.length) handSq = d.highlights[0].square;
  else if(d.arrows && d.arrows.length) handSq = d.arrows[0].to;
  if(handSq && BotState.board && BotState.board.point) BotState.board.point(handSq);
}

/* ── GM Forge: expression layers + arm control ── */
const CoachFigure = (function(){
  const EXPR={idle:'neutral', think:'curious', alarm:'concerned', happy:'excited', proud:'impressed'};
  function stage(){ return document.getElementById('coach-big'); }
  function setExpr(name){ const S=stage(); if(S) S.setAttribute('data-expr', name||'neutral'); }
  function mood(m){
    const S=stage();
    if(S){ S.classList.remove('idle','think','alarm','happy','proud'); S.classList.add(m||'idle','entered'); }
    setExpr(EXPR[m]||'neutral');
  }
  function point(sq){ if(sq && window.ForgePointer) ForgePointer.pointAt(sq); }
  function pointSeq(list){ if(window.ForgePointer) ForgePointer.sequence(list); }
  function rest(){ if(window.ForgePointer) ForgePointer.retract(); }
  function enter(){ const S=stage(); if(S) S.classList.add('entered'); }
  function exit(){ const S=stage(); if(S) S.classList.remove('entered'); rest(); }
  return {mood:mood, point:point, pointSeq:pointSeq, rest:rest, enter:enter, exit:exit, setExpr:setExpr};
})();
window.CoachFigure = CoachFigure;

/* ── GM Forge pointing arm: shoulder -> board square, on a full-viewport overlay ── */
const ForgePointer = {
  active:false, holdTimer:0,
  layer(){ return document.getElementById('forge-pointer-layer'); },
  sync(){ const l=this.layer(); if(l) l.setAttribute('viewBox','0 0 '+window.innerWidth+' '+window.innerHeight); },
  _shoulder(){ return document.getElementById('forge-shoulder'); },
  _square(sq){ return document.querySelector('.fb-sq[data-square="'+sq+'"]'); },
  /* pure geometry (unit-tested): quadratic bezier shoulder -> wrist, wrist = gap short of square centre */
  geom(shRect, sqRect, gap){
    gap = (gap==null) ? 28 : gap;
    const x1 = shRect.left + shRect.width/2,  y1 = shRect.top + shRect.height/2;
    const cx = sqRect.left + sqRect.width/2,  cy = sqRect.top  + sqRect.height/2;
    const dx = cx-x1, dy = cy-y1;
    const len = Math.hypot(dx,dy) || 1;
    const ux = dx/len, uy = dy/len;
    const x2 = cx - ux*gap, y2 = cy - uy*gap;
    const mx = (x1+x2)/2, my = (y1+y2)/2;
    const off = Math.hypot(x2-x1, y2-y1) * 0.15;
    const qx = mx - uy*off, qy = my + ux*off;
    const ang = Math.atan2(y2-qy, x2-qx) * 180/Math.PI;
    return {x1:x1,y1:y1,qx:qx,qy:qy,x2:x2,y2:y2,cx:cx,cy:cy,ang:ang,len:len};
  },
  /* hand transform — art has its FINGERTIP at local (0,0), so the tip lands exactly on centre */
  handTransform(g){ return 'translate('+g.cx+','+g.cy+') rotate('+g.ang+')'; },
  pointAt(square, opts){
    opts = opts || {};
    const l=this.layer(), sh=this._shoulder(), sqEl=this._square(square);
    if(!l || !sh || !sqEl) return false;          // not mounted -> skip, never throw
    this.sync();
    const g = this.geom(sh.getBoundingClientRect(), sqEl.getBoundingClientRect(), opts.gap);
    if(!isFinite(g.x1) || !isFinite(g.cx)) return false;
    const d = 'M'+g.x1+' '+g.y1+'Q'+g.qx+' '+g.qy+' '+g.x2+' '+g.y2;
    const arm=document.getElementById('forge-arm'), out=document.getElementById('forge-arm-out'), hand=document.getElementById('forge-hand');
    if(!arm||!out||!hand) return false;
    [out,arm].forEach(function(p){ p.setAttribute('d', d); });
    const sweeping = this.active && opts.sweep;
    if(!sweeping){
      const L = arm.getTotalLength ? arm.getTotalLength() : g.len;
      [out,arm].forEach(function(p){
        p.style.transition='none';
        p.style.strokeDasharray=L; p.style.strokeDashoffset=L;
      });
      void arm.getBoundingClientRect();
      requestAnimationFrame(function(){
        [out,arm].forEach(function(p){
          p.style.transition='stroke-dashoffset .42s cubic-bezier(.34,1.4,.64,1)';
          p.style.strokeDashoffset=0;
        });
      });
      hand.style.transition='none'; hand.style.opacity=0;
      hand.setAttribute('transform', this.handTransform(g));
      const self=this;
      setTimeout(function(){
        hand.style.transition='opacity .18s ease-out, transform .18s cubic-bezier(.34,1.4,.64,1)';
        hand.style.opacity=1; hand.setAttribute('transform', self.handTransform(g));
      }, 300);
    } else {
      hand.style.transition='opacity .18s ease-out';
      hand.setAttribute('transform', this.handTransform(g));   // sweep: endpoint slides, arm stays out
    }
    document.querySelectorAll('.fb-sq--pointed').forEach(function(s){ s.classList.remove('fb-sq--pointed'); });
    sqEl.classList.add('fb-sq--pointed');
    this.active=true; this.lastSquare=square;
    // A dismiss button parked on the pointed square, so the hand can always be
    // waved away instead of waited out.
    const xb=document.getElementById('forge-point-x');
    if(xb){
      xb.classList.remove('hidden');
      xb.style.left=(g.cx+26)+'px'; xb.style.top=(g.cy-26)+'px';
    }
    return true;
  },
  /* hold on A, then sweep to B without retracting: "this piece attacks this AND this" */
  sequence(squares, holdMs){
    if(!squares || !squares.length) return;
    const self=this; holdMs = holdMs||1200;
    clearTimeout(this.holdTimer);
    this.pointAt(squares[0]);
    let i=1;
    (function step(){
      if(i>=squares.length) return;
      self.holdTimer=setTimeout(function(){
        self.pointAt(squares[i], {sweep:true}); i++; step();
      }, holdMs);
    })();
  },
  retract(){
    clearTimeout(this.holdTimer);
    const arm=document.getElementById('forge-arm'), out=document.getElementById('forge-arm-out'), hand=document.getElementById('forge-hand');
    document.querySelectorAll('.fb-sq--pointed').forEach(function(s){ s.classList.remove('fb-sq--pointed'); });
    const x=document.getElementById('forge-point-x'); if(x) x.classList.add('hidden');
    if(hand){ hand.style.transition='opacity .2s ease-in'; hand.style.opacity=0; }
    [out,arm].forEach(function(p){
      if(!p) return;
      const L = p.getTotalLength ? p.getTotalLength() : 0;
      p.style.transition='stroke-dashoffset .3s ease-in';
      p.style.strokeDashoffset = L;
    });
    this.active=false;
  }
};
window.ForgePointer = ForgePointer;
document.addEventListener('click', function(e){
  const x = e.target.closest && e.target.closest('#forge-point-x');
  if(x){ e.preventDefault(); ForgePointer.retract(); }
});
window.addEventListener('resize', function(){
  ForgePointer.sync();
  if(ForgePointer.active && ForgePointer.lastSquare) ForgePointer.pointAt(ForgePointer.lastSquare, {sweep:true});
});

/* ── Two-phase coaching: ask -> (player engages) -> reveal, with synced marks ── */


/* ══════════ Play-screen chrome: eval graph, move rail, command palette, coach dots ══════════ */
const EvalBar = {
  history:[],
  label(v){ const a=Math.abs(v);
    return a<0.5?'Equal':a<1.0?'Small Advantage':a<2.5?'Clear Advantage':a<5.0?'Winning':'Decisive'; },
  push(v){
    if(typeof v!=='number' || isNaN(v)) return;
    this.history.push(v); if(this.history.length>120) this.history.shift();
    const s=document.getElementById('eval-score'), l=document.getElementById('eval-label');
    if(s) s.textContent=(v>=0?'+':'')+v.toFixed(2);
    if(l) l.textContent=this.label(v);
    this.draw();
  },
  draw(){
    const g=document.getElementById('eval-graph'); if(!g) return;
    const W=600,H=84,pad=8,n=this.history.length;
    const y=v=>H/2-(Math.max(-3,Math.min(3,v))/3)*(H/2-pad);
    let d='';
    if(n>1){
      this.history.forEach((v,i)=>{ const x=(i/(n-1))*W; d+=(i?' L':'M')+x.toFixed(1)+' '+y(v).toFixed(1); });
    } else if(n===1){ d='M0 '+y(this.history[0]).toFixed(1)+' L'+W+' '+y(this.history[0]).toFixed(1); }
    const cursor=n>1?((n-1)/(n-1))*W:W;
    g.innerHTML=
      '<line x1="0" y1="'+(H/2)+'" x2="'+W+'" y2="'+(H/2)+'" stroke="var(--border)" stroke-width="1"/>'+
      (d?'<path d="'+d+' L'+W+' '+H+' L0 '+H+' Z" fill="var(--accent)" opacity=".08"/>':'')+
      (d?'<path d="'+d+'" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/>':'')+
      '<line x1="'+cursor+'" y1="0" x2="'+cursor+'" y2="'+H+'" stroke="var(--accent)" stroke-width="1" opacity=".8"/>'+
      '<text x="'+(W-4)+'" y="10" fill="var(--text-3)" font-size="10" text-anchor="end">+3</text>'+
      '<text x="'+(W-4)+'" y="'+(H/2+4)+'" fill="var(--text-3)" font-size="10" text-anchor="end">0</text>'+
      '<text x="'+(W-4)+'" y="'+(H-4)+'" fill="var(--text-3)" font-size="10" text-anchor="end">-3</text>';
  },
  reset(){ this.history=[]; this.draw();
    const s=document.getElementById('eval-score'); if(s) s.textContent='0.00';
    const l=document.getElementById('eval-label'); if(l) l.textContent='Equal'; }
};
window.EvalBar = EvalBar;

const MoveRail = {
  open:false, rows:[], cur:-1,
  init(){
    const tab=document.getElementById('move-rail-tab'), rail=document.getElementById('move-rail');
    const panel=document.getElementById('move-panel');
    if(!tab||!panel) return;
    tab.addEventListener('click',()=>this.toggle());
    tab.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();this.toggle();} });
    if(rail) rail.addEventListener('mouseenter',()=>this.set(true));
    panel.addEventListener('mouseleave',()=>{ if(window.innerWidth>1100) this.set(false); });
  },
  toggle(){ this.set(!this.open); },
  set(v){ this.open=v; const p=document.getElementById('move-panel'); if(p) p.classList.toggle('open',v); },
  render(sans, evals, current){
    this.rows=sans||[]; this.cur=(current==null?this.rows.length-1:current);
    const box=document.getElementById('move-scroll'); if(!box) return;
    let html='';
    for(let i=0;i<this.rows.length;i+=2){
      const n=i/2+1, w=this.rows[i]||'', b=this.rows[i+1]||'';
      const ev=(evals&&evals[i+1]!=null)?evals[i+1]:(evals&&evals[i]!=null?evals[i]:null);
      const isCur=(this.cur===i||this.cur===i+1);
      html+='<div class="mv-row'+(isCur?' cur':'')+'" data-ply="'+i+'">'+
            '<span class="n">'+n+'.</span><span>'+esc(w)+'</span><span>'+esc(b)+'</span>'+
            '<span class="ev">'+(ev==null?'':((ev>=0?'+':'')+Number(ev).toFixed(2)))+'</span></div>';
    }
    box.innerHTML=html;
    box.querySelectorAll('.mv-row').forEach(r=>r.addEventListener('click',()=>{
      const ply=+r.dataset.ply;
      if(window.BotState && BotState.jumpToPly) BotState.jumpToPly(ply);
    }));
    const c=box.querySelector('.mv-row.cur');
    if(c && c.scrollIntoView) c.scrollIntoView({block:'center'});
  }
};
window.MoveRail = MoveRail;

const CommandPalette = {
  items:[
    {icon:'ic-bolt',    label:'New Game',        key:'N', run:()=>window.startBotGame&&startBotGame()},
    {icon:'ic-coach',   label:'Play vs Computer', key:'',  run:()=>window.startBotGame&&startBotGame()},
    // Mode was only switchable from the two cards on the play screen, which are
    // out of sight once a game is under way. `on` marks the active one.
    {icon:'ic-coach',   label:'Coached mode — GM Forge talks you through it', key:'',
     on:()=>State.coachMode==='coached',
     run:()=>{ showPage('coach'); setBotMode('coached'); }},
    {icon:'ic-bolt',    label:'Free Play — silent, no coaching', key:'',
     on:()=>State.coachMode!=='coached',
     run:()=>{ showPage('coach'); setBotMode('free'); }},
    {icon:'ic-target',  label:'Training',         key:'T', run:()=>showPage('training')},
    {icon:'ic-puzzle',  label:'Puzzles',          key:'P', run:()=>showPage('puzzles')},
    {icon:'ic-sliders', label:'Shop',             key:'',  run:()=>showPage('shop')},
    {icon:'ic-chart',   label:'Game Review',      key:'',  run:()=>{ if(window.runPostgameReview) runPostgameReview(); }},
    {icon:'ic-book',    label:'Lessons',          key:'',  run:()=>showPage('training')},
    {icon:'ic-bulb',    label:'Tutorial — show me around again', key:'',
     run:()=>{ if(window.startTutorial) startTutorial(); }},
  ],
  sel:0, filtered:[], lastFocus:null,
  init(){
    document.addEventListener('keydown',e=>{
      if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); this.toggle(); return; }
      if(!this.isOpen()) return;
      if(e.key==='Escape'){ e.preventDefault(); this.close(); }
      else if(e.key==='ArrowDown'){ e.preventDefault(); this.move(1); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); this.move(-1); }
      else if(e.key==='Enter'){ e.preventDefault(); this.run(); }
      else if(e.key==='Tab'){ e.preventDefault(); }              // focus trapped
    });
    const el=document.getElementById('cmdk');
    if(el) el.addEventListener('click',e=>{ if(e.target===el) this.close(); });
    const inp=document.getElementById('cmdk-input');
    if(inp) inp.addEventListener('input',()=>{ this.sel=0; this.render(inp.value); });
  },
  isOpen(){ const el=document.getElementById('cmdk'); return el && !el.hidden; },
  toggle(){ this.isOpen()?this.close():this.open(); },
  open(){
    const el=document.getElementById('cmdk'); if(!el) return;
    this.lastFocus=document.activeElement;
    el.hidden=false; this.sel=0;
    const inp=document.getElementById('cmdk-input'); if(inp){ inp.value=''; inp.focus(); }
    this.render('');
    const hint=document.getElementById('cmdk-hint'); if(hint) hint.classList.add('used');
  },
  close(){
    const el=document.getElementById('cmdk'); if(el) el.hidden=true;
    if(this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },
  render(q){
    q=(q||'').toLowerCase().trim();
    this.filtered=this.items.filter(it=>{                 // fuzzy: chars in order
      if(!q) return true;
      const s=it.label.toLowerCase(); let i=0;
      for(const ch of q){ i=s.indexOf(ch,i); if(i<0) return false; i++; }
      return true;
    });
    const list=document.getElementById('cmdk-list'); if(!list) return;
    list.innerHTML=this.filtered.map((it,i)=>{
      let active=false;
      if(it.on){ try{ active=!!it.on(); }catch(e){} }
      return '<div class="cmdk-item'+(i===this.sel?' sel':'')+(active?' on':'')+'" data-i="'+i+'">'+
      '<svg class="ic"><use href="#'+it.icon+'"/></svg><span>'+esc(it.label)+'</span>'+
      (active?'<span class="cmdk-on">Active</span>':'')+
      (it.key?'<span class="keycap">'+it.key+'</span>':'')+'</div>';
    }).join('');
    list.querySelectorAll('.cmdk-item').forEach(r=>r.addEventListener('click',()=>{
      this.sel=+r.dataset.i; this.run();
    }));
  },
  move(d){
    if(!this.filtered.length) return;
    this.sel=(this.sel+d+this.filtered.length)%this.filtered.length;
    const inp=document.getElementById('cmdk-input');
    this.render(inp?inp.value:'');
  },
  run(){
    const it=this.filtered[this.sel]; this.close();
    if(it && it.run) try{ it.run(); }catch(e){}
  }
};
window.CommandPalette = CommandPalette;

/* coach bubble pagination dots */
const CoachQueue = {
  msgs:[], idx:0,
  set(list){ this.msgs=list||[]; this.idx=0; this.render(); },
  show(i){ if(i<0||i>=this.msgs.length) return; this.idx=i; this.render(); },
  render(){
    const t=document.getElementById('coach-bubble-text');
    if(t && this.msgs.length) t.textContent=this.msgs[this.idx];
    let dots=document.getElementById('coach-dots');
    const bub=document.getElementById('coach-bubble');
    if(!bub) return;
    if(this.msgs.length<2){ if(dots) dots.remove(); return; }
    if(!dots){ dots=document.createElement('div'); dots.className='coach-dots'; dots.id='coach-dots'; bub.appendChild(dots); }
    dots.innerHTML=this.msgs.map((_,i)=>'<i class="'+(i===this.idx?'on':'')+'" data-i="'+i+'"></i>').join('');
    dots.querySelectorAll('i').forEach(d=>d.addEventListener('click',()=>this.show(+d.dataset.i)));
  }
};
window.CoachQueue = CoachQueue;

document.addEventListener('DOMContentLoaded',function(){
  try{ MoveRail.init(); CommandPalette.init(); EvalBar.draw(); }catch(e){}
  try{ Ladder.init(); Rails.init(); }catch(e){}
});

/* ══════════ CoachMoment — sequenced dialogue, tile-tap, MCQ, help, stop sign ══════════ */
const CoachMoment = {
  data:null, step:0, timer:0, tapHandler:null, revealed:false, answered:false,
  start(d){
    this.stop();
    if(!d || d.silent) return;
    this.data=d; this.step=0; this.revealed=false; this.answered=false;
    if(window.CoachFigure) CoachFigure.mood(({critical:'alarm',opportunity:'happy',notable:'think'})[d.intensity]||'idle');
    if(d.intensity==='opportunity'){ StopSign.show(d); }
    if(d.blocking){ document.body.classList.add('coach-blocking'); BotState.boardLocked=true; }
    else { BotState.boardLocked=false; }
    this._playStep();
  },
  _playStep(){
    const d=this.data; if(!d) return;
    const steps=d.dialogue||[];
    if(this.step>=steps.length){ this._afterSteps(); return; }
    const s=steps[this.step];
    Coach.speak(s.text);
    this._dim(s.point||[]);
    if(s.point && s.point.length && window.ForgePointer){
      if(s.point.length>1) ForgePointer.sequence(s.point, 900);   // sweep A -> B
      else ForgePointer.pointAt(s.point[0]);
    }
    this._renderStepMeta();
    this.step++;
    this.timer=setTimeout(()=>this._playStep(), 1400);            // 1.4s cadence
  },
  skip(){                                                          // click anywhere skips ahead
    clearTimeout(this.timer);
    const steps=(this.data&&this.data.dialogue)||[];
    if(this.step<steps.length){ this._playStep(); } else { this._afterSteps(); }
  },
  _renderStepMeta(){
    const el=document.getElementById('coach-stepmeta'); if(!el||!this.data) return;
    const n=(this.data.dialogue||[]).length;
    el.textContent='Step '+Math.min(this.step+1,n)+' of '+n+'  ·  '+
      String(this.data.intensity||'').toUpperCase()+'  ·  '+String(this.data.pattern||'').replace(/_/g,' ').toUpperCase();
  },
  _afterSteps(){
    clearTimeout(this.timer);
    this._renderHelp();
    const q=(this.data&&this.data.question)||{kind:'none'};
    if(q.kind==='tile_tap') this._tileTap(q);
    else if(q.kind==='mcq') this._mcq(q);
    else if(this.data && this.data.blocking) this._release();
  },
  /* ── 3d. tile-tap on the real board ── */
  _tileTap(q){
    const el=document.getElementById('coach-engage'); if(!el) return;
    document.body.classList.add('tile-tap-mode');
    el.classList.remove('hidden');
    el.innerHTML='<div class="tap-prompt">'+esc(q.prompt||'Tap the square.')+'</div>';
    let wrong=0; const self=this;
    this.tapHandler=function(e){
      const cell=e.target.closest && e.target.closest('.fb-sq'); if(!cell) return;
      e.preventDefault(); e.stopPropagation();
      const sq=cell.dataset.square;
      if((q.correct||[]).indexOf(sq)!==-1){
        cell.classList.add('tap-right');
        if(window.CoachFigure) CoachFigure.mood('proud');
        Coach.speak('That is the one. '+esc(sq)+' is the square everything hangs on.');
        self._endTap(); self._release();
      } else {
        wrong++;
        cell.classList.add('tap-wrong');
        setTimeout(()=>cell.classList.remove('tap-wrong'), 500);
        if(wrong>=2){
          Coach.speak('Here it is.');
          if(window.ForgePointer && (q.correct||[]).length) ForgePointer.pointAt(q.correct[0]);
          const c=document.querySelector('.fb-sq[data-square="'+q.correct[0]+'"]');
          if(c) c.classList.add('tap-right');
          self._endTap(); self._release();
        } else {
          Coach.speak(q.on_wrong||'Not that one - look again.');
          if(window.CoachFigure) CoachFigure.mood('alarm');
        }
      }
    };
    document.addEventListener('click', this.tapHandler, true);
  },
  _endTap(){
    if(this.tapHandler){ document.removeEventListener('click', this.tapHandler, true); this.tapHandler=null; }
    document.body.classList.remove('tile-tap-mode');
    setTimeout(()=>document.querySelectorAll('.tap-right').forEach(c=>c.classList.remove('tap-right')), 1200);
  },
  /* ── 3c. MCQ in the bubble ── */
  _mcq(q){
    const el=document.getElementById('coach-engage'); if(!el) return;
    el.classList.remove('hidden');
    el.innerHTML='<div class="tap-prompt">'+esc(q.prompt||'')+'</div>'+
      (q.options||[]).map((o,i)=>'<button class="coach-engage-btn" data-i="'+i+'" onclick="CoachMoment.answerMCQ('+i+')">'+
        '<u>'+(i+1)+'</u> '+esc(o)+'</button>').join('');
  },
  answerMCQ(i){
    const q=(this.data&&this.data.question)||{};
    const ok = i===q.answer_index;
    this.answered=true;
    Coach.speak(ok ? ('Correct. '+(q.explain_right||'')) : ('Not quite. '+(q.on_wrong||'')));
    if(window.CoachFigure) CoachFigure.mood(ok?'proud':'alarm');
    if(!ok && (q.correct||[]).length && window.ForgePointer) ForgePointer.pointAt(q.correct[0]);
    this._release();
  },
  /* ── 3e. the three help buttons ── */
  _renderHelp(){
    const box=document.getElementById('coach-help'); if(!box||!this.data) return;
    const h=this.data.help||{};
    box.classList.remove('hidden');
    box.innerHTML=
      (h.concept_label?'<button class="help-btn" onclick="CoachMoment.showConcept()">'+esc(h.concept_label)+'</button>':'')+
      (h.hint?'<button class="help-btn" onclick="CoachMoment.showHint()">Hint</button>':'')+
      (h.answer_move?'<button class="help-btn" onclick="CoachMoment.showAnswer()">Answer</button>':'');
  },
  showConcept(){ const h=(this.data||{}).help||{}; Coach.speak(h.concept_text||''); },
  showHint(){ const h=(this.data||{}).help||{}; Coach.speak(h.hint||''); },
  showAnswer(){
    const h=(this.data||{}).help||{};
    this.revealed=true;                                   // tracked for post-game training
    Coach.speak(h.answer_text||'');
    if(h.answer_move && window.BotState && BotState.board){
      const d=this.data;
      if(d && d.answer_from && d.answer_to && BotState.board.arrow) BotState.board.arrow(d.answer_from,d.answer_to,'#2DE1FF');
    }
    if(window.GameLog) GameLog.markRevealed(this.data);
    this._release();
  },
  _dim(keep){
    document.querySelectorAll('.fb-sq.sq-focus').forEach(c=>c.classList.remove('sq-focus'));
    if(!this.data || !this.data.blocking) return;
    (keep||[]).forEach(sq=>{
      const c=document.querySelector('.fb-sq[data-square="'+sq+'"]');
      if(c) c.classList.add('sq-focus');
    });
  },
  _release(){
    document.body.classList.remove('coach-blocking');
    document.querySelectorAll('.fb-sq.sq-focus').forEach(c=>c.classList.remove('sq-focus'));
    BotState.boardLocked=false;
    Coach.setStatus('');
    setTimeout(()=>{ if(window.ForgePointer) ForgePointer.retract(); }, 900);   // was 1800 — hand overstayed
  },
  stop(){
    clearTimeout(this.timer); this._endTap();
    document.body.classList.remove('coach-blocking');
    // These two were left set. boardLocked kept the board unclickable and
    // forge-focus kept every square dimmed to 60%, so a finished prompt stayed
    // on screen and the board stayed dead until the page was reloaded.
    document.body.classList.remove('forge-focus');
    BotState.boardLocked = false;
    document.querySelectorAll('.fb-sq.sq-focus').forEach(c=>c.classList.remove('sq-focus'));
    const e=document.getElementById('coach-engage'); if(e){ e.classList.add('hidden'); e.innerHTML=''; }
    const h=document.getElementById('coach-help'); if(h){ h.classList.add('hidden'); h.innerHTML=''; }
    StopSign.hide();
    if(window.ForgePointer) ForgePointer.retract();
  }
};
window.CoachMoment = CoachMoment;

/* ══════════ 3a. Non-blocking stop sign — draggable, board stays live ══════════ */
const StopSign = {
  el:null, drag:null,
  show(d){
    this.hide();
    const wrap=document.querySelector('.gm-board-wrap'); if(!wrap) return;
    const n=document.createElement('div');
    n.className='stop-sign'; n.id='stop-sign';
    n.innerHTML='<svg viewBox="0 0 48 48" aria-hidden="true">'+
      '<path d="M15.2 4h17.6L44 15.2v17.6L32.8 44H15.2L4 32.8V15.2Z" fill="#E24B4A" stroke="#0D0D14" stroke-width="2.4" stroke-linejoin="round"/>'+
      '<path d="M16 24h16" stroke="#F7F9FF" stroke-width="4" stroke-linecap="round"/></svg>'+
      '<span>Wait - there is something here for you.</span>';
    wrap.appendChild(n); this.el=n;
    n.addEventListener('pointerdown', e=>this._down(e));
    setTimeout(()=>n.classList.add('in'), 20);
    // A nudge should not become furniture. It clears itself, and any click on
    // the board clears it too — the player has seen it by then.
    clearTimeout(this._t);
    this._t = setTimeout(()=>this.hide(), 6000);
  },
  _down(e){
    const r=this.el.getBoundingClientRect();
    this.drag={dx:e.clientX-r.left, dy:e.clientY-r.top};
    this.el.setPointerCapture(e.pointerId);
    this.el.classList.add('dragging');
    const move=ev=>{
      if(!this.drag) return;
      const p=this.el.parentNode.getBoundingClientRect();
      this.el.style.left=(ev.clientX-p.left-this.drag.dx)+'px';
      this.el.style.top=(ev.clientY-p.top-this.drag.dy)+'px';
      this.el.style.transform='none';
    };
    const up=()=>{ this.drag=null; this.el.classList.remove('dragging');
      document.removeEventListener('pointermove',move); document.removeEventListener('pointerup',up); };
    document.addEventListener('pointermove',move); document.addEventListener('pointerup',up);
  },
  hide(){ if(this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el); this.el=null; }
};
window.StopSign = StopSign;

/* ══════════ game log -> post-game review ══════════ */
const GameLog = {
  moments:[],
  record(d, moveNo){
    if(!d || d.silent) return;
    if(d.intensity!=='critical' && d.intensity!=='opportunity') return;
    this.moments.push({move_no:moveNo||0, pattern:d.pattern, cost_cp:Math.abs(Math.round((d.eval||0)*100)),
                       outcome:'seen', fen:d.fen||null});
  },
  markRevealed(d){
    const m=this.moments[this.moments.length-1]; if(m) m.outcome='revealed';
  },
  markSolved(){ const m=this.moments[this.moments.length-1]; if(m) m.outcome='solved'; },
  reset(){ this.moments=[]; }
};
window.GameLog = GameLog;

const CoachDialogue = {
  data:null, reveal:null,
  start(d){
    this.data = d;
    const q = (d.dialogue||[]).find(x=>x.phase==='question');
    this.reveal = (d.dialogue||[]).find(x=>x.phase==='reveal') || null;
    CoachFigure.mood(this._mood(d.reaction));
    // question phase — highlight the danger/target in red/green, point the finger, no arrow yet
    if(BotState.board && BotState.board.clearMarks){
      BotState.board.clearMarks();
      (d.highlights||[]).forEach(h=>{ if(h && h.square) BotState.board.highlight(h.square, h.color); });
      const hs=(d.highlights||[]).map(function(h){return h&&h.square;}).filter(Boolean);
      if(hs.length>1) CoachFigure.pointSeq(hs); else if(hs.length===1) CoachFigure.point(hs[0]);
      if(hs.length) document.body.classList.add('forge-focus');
    }
    const blocking = (d.blocking === true) || (d.engagement === 'critical');
    if(q && blocking){
      Coach.speak(q.text);
      this._renderEngage(d.scenario);   // chips inside the bubble — the only way forward
      BotState.boardLocked = true;      // critical only: cannot move until answered
      Coach.setStatus('GM Forge is asking - answer first.');
    } else if(q){
      Coach.speak(q.text);              // notable: a short question, board stays free
      BotState.boardLocked = false;
      Coach.setStatus('');
    } else {
      this._reveal('see');             // hint/explain style: straight to the point
    }
  },
  engage(choice){
    const el = document.getElementById('coach-engage'); if(el){ el.classList.add('hidden'); el.innerHTML=''; }
    BotState.boardLocked = false;
    this._reveal(choice);
  },
  _reveal(choice){
    const d = this.data || {};
    if(this.reveal) Coach.speak(this.reveal.text);
    // reveal phase — draw the green engine-move arrow (kept in sync with the words)
    if(BotState.board && BotState.board.arrow){
      (d.arrows||[]).forEach(a=>{ if(a && a.from && a.to) BotState.board.arrow(a.from, a.to, a.color); });
    }
    Coach.setStatus('');
    document.body.classList.remove('forge-focus');
    setTimeout(function(){ if(window.ForgePointer) ForgePointer.retract(); }, 1200);  // was 2600
    setTimeout(()=>CoachFigure.mood('idle'), 2400);
  },
  _renderEngage(scenario){
    const el = document.getElementById('coach-engage'); if(!el) return;
    const opts = ({
      opponent_fork:                [['see','I see the fork'],['notsure','Not sure'],['show','Which do I keep?']],
      opponent_pin:                 [['see','I see the pin'],['notsure','Not sure'],['show','How do I break it?']],
      opponent_threat_single_piece: [['see','I see it'],['notsure','Not sure'],['show','Show me']],
      player_can_win_material:      [['see','I found it'],['notsure','Not sure'],['show','Show me']],
      player_about_to_blunder:      [['see','Good catch'],['notsure','What am I missing?'],['show','Show me']],
      critical_castling_decision:   [['see','Castle it'],['notsure','Not yet'],['show','Why now?']],
      opening_deviation:            [['see','Develop a piece'],['notsure','Not sure'],['show','Show me']],
      endgame_technique_moment:     [['see','I know the plan'],['notsure','Not sure'],['show','Show me']],
      player_found_brilliancy:      [['see','I saw it'],['notsure','Got lucky'],['show','Why so strong?']],
    })[scenario] || [['see','I see it'],['notsure','Not sure'],['show','Show me']];
    el.innerHTML = opts.map((o,i)=>`<button class="coach-engage-btn${i===opts.length-1?' show':''}" onclick="CoachDialogue.engage('${o[0]}')">${esc(o[1])}${i===opts.length-1?' ':''}</button>`).join('');
    el.classList.remove('hidden');
  },
  _mood(reaction){ return ({concerned:'alarm', excited:'happy', curious:'think', neutral:'idle'})[reaction] || 'idle'; },
  reset(){ this.data=null; this.reveal=null; const el=document.getElementById('coach-engage'); if(el){ el.classList.add('hidden'); el.innerHTML=''; } document.body.classList.remove('forge-focus'); if(window.ForgePointer) ForgePointer.retract(); }
};
window.CoachDialogue = CoachDialogue;

/* ── Chessboard SFX (Web Audio — no asset needed) ─────────────────────────── */
const ChessSFX = (function(){
  let ctx=null, enabled=true;
  function getCtx(){
    if(!ctx){
      try{ ctx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ ctx=null; }
    }
    return ctx;
  }
  function tone(freq, duration, type='sine', gainV=0.08, attack=0.005, decay=null){
    if(!enabled) return;
    const c = getCtx(); if(!c) return;
    try{
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(gainV, c.currentTime + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
      o.connect(g).connect(c.destination);
      o.start(); o.stop(c.currentTime + duration + 0.02);
    }catch(e){}
  }
  function noiseBurst(duration=0.05, gainV=0.06){
    if(!enabled) return;
    const c = getCtx(); if(!c) return;
    try{
      const bufferSize = Math.floor(c.sampleRate * duration);
      const buf = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for(let i=0;i<bufferSize;i++){ data[i] = (Math.random()*2-1) * (1 - i/bufferSize); }
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.setValueAtTime(gainV, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.7;
      src.connect(bp).connect(g).connect(c.destination);
      src.start();
    }catch(e){}
  }
  function playMove(mv){
    // chess.js move object: flags string. 'c' capture, 'e' en-passant, 'k'/'q' castle, '+'/# from move object via in_check()
    const flags = mv && mv.flags ? mv.flags : '';
    const isCapture = flags.includes('c') || flags.includes('e');
    const isCastle  = flags.includes('k') || flags.includes('q');
    const checkmate = BotState.game && BotState.game.in_checkmate && BotState.game.in_checkmate();
    const check     = !checkmate && BotState.game && BotState.game.in_check && BotState.game.in_check();
    if(checkmate){ tone(220, 0.5, 'sawtooth', 0.1); setTimeout(()=>tone(165, 0.7, 'sawtooth', 0.1), 120); return; }
    if(isCapture){ noiseBurst(0.07, 0.09); tone(380, 0.08, 'square', 0.05); }
    else if(isCastle){ tone(520, 0.06, 'triangle', 0.07); setTimeout(()=>tone(700, 0.08, 'triangle', 0.06), 70); }
    else { noiseBurst(0.035, 0.06); tone(540, 0.045, 'sine', 0.04); }
    if(check) setTimeout(()=>tone(880, 0.16, 'triangle', 0.07), 90);
  }
  function playSelect(){ tone(720, 0.025, 'sine', 0.02); }
  function playWrong(){ tone(180, 0.18, 'sawtooth', 0.06); }
  function playWin(){ tone(660, 0.12, 'triangle', 0.08); setTimeout(()=>tone(880, 0.14, 'triangle', 0.08), 120); setTimeout(()=>tone(1100, 0.2, 'triangle', 0.08), 260); }
  return {playMove, playSelect, playWrong, playWin, setEnabled:(v)=>enabled=!!v};
})();

function updateEvalBar(evalPawns){
  const bar = document.getElementById('eval-bar');
  const num = document.getElementById('eval-num');
  if(!bar||!num) return;
  const pct = Math.max(5, Math.min(95, 50 + evalPawns * 8));
  bar.style.width = pct + '%';
  num.textContent = (evalPawns >= 0 ? '+' : '') + evalPawns;
  num.style.color = evalPawns > 0.5 ? 'var(--green)' : evalPawns < -0.5 ? 'var(--red)' : 'var(--cyan)';
}

function enableCoachButtons(on){ /* standalone buttons removed — the coach speaks proactively */ }

/* ── Board Overlay (arrows + highlights) ──────────────────────────────────── */

/* ── GM Coach module v2 — theory + selective speaking + force engagement ── */
const Coach = (function(){
  function setStatus(t){
    const el = document.getElementById('coach-status-label');
    if(el) el.textContent = t;
  }
  function setSpeaking(on){
    const av = document.querySelector('.gm-avatar');
    if(av) av.classList.toggle('speaking', !!on);
  }
  function setThinking(on){
    const el = document.getElementById('coach-thinking');
    if(el) el.classList.toggle('hidden', !on);
    setSpeaking(on);
    if(window.CoachFigure) CoachFigure.mood(on ? 'think' : '');
  }
  function renderQuestions(qs){
    const ul = document.getElementById('coach-questions');
    if(!ul) return;
    if(!qs || !qs.length){ ul.innerHTML = '<li class="gm-q-empty">…</li>'; return; }
    ul.innerHTML = qs.map(q=>`<li>${esc(q)}</li>`).join('');
  }
  function renderFeedback(text, severity){
    const fb = document.getElementById('coach-feedback');
    if(!fb) return;
    if(!text){ fb.classList.add('hidden'); fb.textContent=''; return; }
    fb.textContent = text;
    fb.className = 'gm-feedback ' + (severity||'');
    fb.classList.remove('hidden');
  }
  // A quiz offered beside the board rather than over it. The board stays fully
  // visible and interactive, and the question can simply be ignored -- unlike
  // the forced modal this replaces, which dimmed the position you needed to
  // look at in order to answer.
  function offerQuiz(q){
    const el = document.getElementById('coach-engage');
    if(!el || !q || !(q.options||[]).length) return;
    const opts = (q.options||[]).map((o,i)=>
      '<button class="coach-engage-btn" data-qi="'+i+'">'+esc(typeof o==='string'?o:(o.text||o.label||''))+'</button>'
    ).join('');
    el.innerHTML = '<div class="cq-ask">'+esc(q.question||q.prompt||'What went wrong there?')+'</div>'+
                   '<div class="cq-opts">'+opts+'</div>'+
                   '<div class="cq-fb hidden"></div>';
    el.classList.remove('hidden');
    const correct = (q.correct!=null) ? q.correct : q.answer;
    el.querySelectorAll('.coach-engage-btn').forEach(b=>b.addEventListener('click',()=>{
      const i = +b.dataset.qi;
      const right = (i === correct);
      el.querySelectorAll('.coach-engage-btn').forEach(x=>x.disabled = true);
      b.classList.add(right ? 'is-right' : 'is-wrong');
      if(!right && typeof correct === 'number'){
        const c = el.querySelector('.coach-engage-btn[data-qi="'+correct+'"]');
        if(c) c.classList.add('is-right');
      }
      const fb = el.querySelector('.cq-fb');
      if(fb){
        const why = right ? (q.why_right || q.explain || 'That is it.')
                          : (q.why_wrong || q.explain || '');
        if(why){ fb.textContent = why; fb.classList.remove('hidden'); }
      }
      try{ right ? ChessSFX.playSelect() : ChessSFX.playWrong(); }catch(e){}
    }));
  }
  function renderPositionBadge(type){
    const el = document.getElementById('coach-position-badge');
    if(!el) return;
    if(!type){ el.classList.add('hidden'); return; }
    const labels = {
      opening:'Opening',
      tactical:'Tactical Moment',
      positional:'Strategic Decision',
      endgame:'Endgame',
      critical_decision:'Critical Moment',
    };
    el.textContent = labels[type] || type;
    el.className = 'gm-position-badge ' + type;
  }
  function renderTheory(theory){
    const el = document.getElementById('coach-theory');
    if(!el) return;
    if(!theory || !theory.length){ el.classList.add('hidden'); el.innerHTML=''; return; }
    el.innerHTML = theory.map(t=>{
      const icon = t.type==='opening' ? '' : '';
      return `<span class="gm-chip ${esc(t.type)}"><span class="gm-chip-icon">${icon}</span>${esc(t.label)}</span>`;
    }).join('');
    el.classList.remove('hidden');
  }
  function reset(){
    renderQuestions(['Watching the board…']);
    renderFeedback('', '');
    renderPositionBadge(null);
    renderTheory([]);
    if(BotState.board && BotState.board.clearMarks) BotState.board.clearMarks();
    setThinking(false);
    BotState.boardLocked = false;
    showBoardLock(false);
    speak('');
    if(window.CoachFigure){ CoachFigure.rest(); CoachFigure.mood(''); }
    if(window.CoachDialogue) CoachDialogue.reset();
  }
  // The coach's ONE voice: a short line in his speech bubble. Keep it brief.
  function speak(text){
    const b = document.getElementById('coach-bubble');
    const t = document.getElementById('coach-bubble-text');
    if(!b || !t) return;
    if(!text){ t.textContent='…'; return; }
    let s = String(text).replace(/\s+/g,' ').trim();
    const m = s.match(/^(.*?[.!?])(\s|$)/);           // first sentence only
    if(m && m[1].length >= 12) s = m[1];
    if(s.length > 150) s = s.slice(0,148)+'…';
    t.innerHTML = esc(s);
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  }
  function getPlayedSAN(){
    if(!BotState.game) return [];
    return BotState.game.history();
  }
  async function afterBotMove(lastBotSan){
    if(State.coachMode !== 'coached') return;
    if(!BotState.game || !BotState.gameActive) return;
    if(BotState.game.turn() !== BotState.playerColor[0]) return;
    setStatus('Looking at the position');
    setThinking(true);
    let d = {silent:true};
    try{
      const r = await fetch('/coach-position', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          fen: BotState.game.fen(),
          weaknesses: BotState.weaknesses,
          played_moves: getPlayedSAN(),
        }),
        credentials:'include'
      });
      d = await r.json();
    }catch(e){ d = {silent:true}; }
    setThinking(false);
    if(typeof d.eval === 'number') updateEvalBar(d.eval);
    if(d.silent){
      // nothing worth saying — coach stays quiet, board stays free
      if(BotState.board && BotState.board.clearMarks) BotState.board.clearMarks();
      CoachFigure.mood('idle');
      setStatus('');
      return;
    }
    // there's a teaching moment — run the two-phase ask -> reveal
    setStatus('Coach is asking…');
    if(d && d.intensity){ GameLog.record(d, (BotState.game && BotState.game.history().length)||0); CoachMoment.start(d); }
    else CoachDialogue.start(d);
    // Being walked through the reasoning beats being told a fact, so a real
    // moment offers the walk-through rather than only a line. Critical moments
    // open it; lesser ones light the button and leave the choice alone.
    try{
      if(!Ladder.isOpen()){
        if(d.intensity === 'critical'){
          Ladder.open({last:lastBotSan||'', reason:'moment'});
        } else if(d.intensity === 'notable'){
          Ladder.nudge('Something changed — walk me through it');
        }
      }
    }catch(e){}
  }
  // Review the move the player just made. On a blunder/mistake, PAUSE (red overlay)
  // and hold the bot's reply until the player decides. Otherwise, play on.
  async function reviewPlayerMove(fenBefore, sanPlayed){
    if(State.coachMode !== 'coached'){ setTimeout(makeBotMove, 400); return; }
    setStatus('Checking your move…');
    setThinking(true);
    let d = {};
    try{
      const r = await fetch('/coach-move-feedback', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          fen_before: fenBefore,
          san_played: sanPlayed,
          weaknesses: BotState.weaknesses,
          played_moves: getPlayedSAN().slice(0,-1),
        }),
        credentials:'include'
      });
      d = await r.json();
    }catch(e){ d = {silent:true}; }
    setThinking(false);
    // Record perf for live calibration + post-game puzzles
    BotState.perf = BotState.perf || []; BotState.moveData = BotState.moveData || [];
    BotState.perf.push(typeof d.drop_cp==='number' ? d.drop_cp : 0);
    BotState.moveData.push({fen_before:fenBefore, san:sanPlayed, severity:d.severity, drop_cp:d.drop_cp, best_move:d.best_move_san, best_pv:d.best_pv, side:BotState.playerColor});
    if(typeof d.eval_after === 'number') updateEvalBar(d.eval_after);

    if(d.severity === 'blunder' || d.severity === 'mistake'){
      setStatus(d.severity==='blunder' ? 'Blunder — pause!' : 'Mistake — pause!');
      showPause(d, fenBefore, sanPlayed);   // bot reply waits until the player resolves the pause
      return;
    }
    if(d.silent || !d.commentary){
      renderFeedback('', '');
      if(BotState.board && BotState.board.clearMarks) BotState.board.clearMarks();
      speak('');
    } else {
      renderFeedback(d.commentary, d.severity||'');
      coachApplyMarks(d);
      speak(d.commentary);
    }
    setStatus(d.severity==='best' ? 'Top move ' : (d.severity==='inaccuracy' ? 'Slight inaccuracy' : 'Watching the board'));
    setTimeout(makeBotMove, 500);
  }
  async function ask(type){
    if(!BotState.gameActive) return;
    setThinking(true);
    try{
      const r = await fetch('/coach-position', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          fen: BotState.game.fen(),
          weaknesses: BotState.weaknesses,
          played_moves: getPlayedSAN(),
          type: (type === 'quiz' ? 'position' : type),   // quiz reuses the classifier
        }),
        credentials:'include'
      });
      const d = await r.json();
      setThinking(false);
      if(typeof d.eval === 'number') updateEvalBar(d.eval);
      if(d.silent){ speak("Position's calm — nothing loud to say. Just play a solid move."); CoachFigure.mood('idle'); return; }
      if(d && d.intensity){ GameLog.record(d, (BotState.game && BotState.game.history().length)||0); CoachMoment.start(d); }
    else CoachDialogue.start(d);   // hint/explain = single reveal; quiz = full ask -> reveal
    }catch(e){ setThinking(false); }
  }
  return {afterBotMove, reviewPlayerMove, ask, reset, speak, renderQuestions, renderFeedback, setStatus, setThinking, renderPositionBadge, renderTheory, offerQuiz};
})();

/* Board lock — force engagement when an MCQ is open */
// A pointed finger is an invitation to look. The moment the player touches the
// board they have looked, so it should get out of the way rather than sit there.
(function(){
  function dismiss(){
    if(window.ForgePointer) ForgePointer.retract();
    document.body.classList.remove('forge-focus');
    document.querySelectorAll('.fb-sq--pointed').forEach(c=>c.classList.remove('fb-sq--pointed'));
    const f = document.getElementById('blunder-flag'); if(f) f.classList.add('hidden');
    if(window.StopSign && StopSign.hide) StopSign.hide();
  }
  function bind(){
    const b = document.getElementById('bot-board');
    if(b) b.addEventListener('mousedown', dismiss, true);
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape') dismiss(); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.forgeDismissPointer = dismiss;
})();

function showBoardLock(on){
  const el = document.getElementById('board-lock');
  if(!el) return;
  el.classList.toggle('hidden', !on);
}

function askCoach(type){ Coach.ask(type); }

// Top-bar account menu (behind the avatar)
function toggleUserMenu(e){
  if(e) e.stopPropagation();
  const m=document.getElementById('tb-menu'); if(m) m.classList.toggle('hidden');
}
document.addEventListener('click',(e)=>{
  const m=document.getElementById('tb-menu'); const btn=document.getElementById('avatar-btn');
  if(!m||m.classList.contains('hidden')) return;
  if(!m.contains(e.target) && btn && !btn.contains(e.target)) m.classList.add('hidden');
});
window.toggleUserMenu=toggleUserMenu;

/* ── MCQ Modal — force engagement, no skip ──────────────────────────────── */
const MCQ = (function(){
  let current = null;
  let answered = false;
  function open(mcq, contextSan, force){
    if(!mcq || !mcq.options) return;
    current = mcq;
    answered = false;
    document.getElementById('mcq-question').textContent = mcq.question || 'Which move is best?';
    const wrap = document.getElementById('mcq-options');
    wrap.innerHTML = '';
    const letters = ['A','B','C','D','E','F'];
    mcq.options.forEach((opt,i)=>{
      const btn = document.createElement('button');
      btn.className = 'mcq-option';
      btn.innerHTML = `<span class="mcq-letter">${letters[i]||(i+1)}</span><span>${esc(opt)}</span>`;
      btn.onclick = ()=>answer(i, btn);
      wrap.appendChild(btn);
    });
    document.getElementById('mcq-explanation').classList.add('hidden');
    document.getElementById('mcq-continue').classList.add('hidden');
    const must = document.getElementById('mcq-must-answer');
    if(must) must.classList.remove('hidden');
    document.getElementById('mcq-modal').classList.remove('hidden');
    // FORCE: lock the board so they can't dodge the coach
    if(force){
      BotState.boardLocked = true;
      showBoardLock(true);
    }
    ChessSFX.playSelect();
  }
  function answer(idx, btn){
    if(!current || answered) return;
    answered = true;
    const opts = document.querySelectorAll('.mcq-option');
    opts.forEach(o=>o.classList.add('locked'));
    if(idx === current.correct_index){
      btn.classList.add('correct');
      ChessSFX.playWin();
    } else {
      btn.classList.add('wrong');
      opts[current.correct_index].classList.add('correct');
      ChessSFX.playWrong();
    }
    const exp = document.getElementById('mcq-explanation');
    exp.textContent = current.explanation || '';
    exp.classList.remove('hidden');
    const must = document.getElementById('mcq-must-answer');
    if(must) must.classList.add('hidden');
    document.getElementById('mcq-continue').classList.remove('hidden');
  }
  function close(){
    // No-skip: only allow close if answered
    if(!answered && current){ ChessSFX.playWrong(); return; }
    document.getElementById('mcq-modal').classList.add('hidden');
    current = null;
    answered = false;
    BotState.boardLocked = false;
    showBoardLock(false);
  }
  function isOpen(){ return !!current; }
  return {open, close, isOpen};
})();
function closeMCQ(){ MCQ.close(); }
// Block Escape key while MCQ is open (no escape — engage!)
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && MCQ.isOpen()){ e.preventDefault(); e.stopPropagation(); ChessSFX.playWrong(); }
}, true);

/* ── Post-Game Review ─────────────────────────────────────────────────────── */
let _postgamePuzzles = [];
async function runPostgameReview(){
  const modal = document.getElementById('postgame-modal');
  if(!modal) return;
  modal.classList.remove('hidden');
  document.getElementById('postgame-loading').classList.remove('hidden');
  document.getElementById('postgame-results').classList.add('hidden');
  document.getElementById('postgame-train-btn').classList.add('hidden');
  document.getElementById('postgame-title').textContent = 'Analyzing your game with Stockfish…';
  try{
    const pgn = getBotPGN();
    const r = await fetch('/analyze-bot-game', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({pgn, player_color: BotState.playerColor}),
      credentials:'include'
    });
    const d = await r.json();
    if(d.error){
      document.getElementById('postgame-title').textContent = 'Review failed: ' + d.error;
      document.getElementById('postgame-loading').classList.add('hidden');
      return;
    }
    renderPostgameResults(d);
  }catch(e){
    document.getElementById('postgame-title').textContent = 'Review failed — try again later.';
    document.getElementById('postgame-loading').classList.add('hidden');
  }
}

function renderPostgameResults(d){
  document.getElementById('postgame-loading').classList.add('hidden');
  document.getElementById('postgame-results').classList.remove('hidden');
  const c = d.counts || {};
  const title = (d.mistakes && d.mistakes.length)
    ? `${d.mistakes.length} thing${d.mistakes.length===1?'':'s'} to fix in this game`
    : 'Clean game — no major mistakes!';
  document.getElementById('postgame-title').textContent = title;
  document.getElementById('postgame-summary').innerHTML = `
    <div class="postgame-stat blunder"><div class="n">${c.blunder||0}</div><div class="l">Blunders</div></div>
    <div class="postgame-stat mistake"><div class="n">${c.mistake||0}</div><div class="l">Mistakes</div></div>
    <div class="postgame-stat inaccuracy"><div class="n">${c.inaccuracy||0}</div><div class="l">Inaccuracies</div></div>
    <div class="postgame-stat ok"><div class="n">${(c.ok||0)+(c.best||0)}</div><div class="l">Solid</div></div>`;
  const list = document.getElementById('postgame-mistakes');
  list.innerHTML = (d.mistakes||[]).slice(0,8).map(m=>`
    <div class="postgame-row ${esc(m.severity)}">
      <div class="pg-move">${m.move_number}.${m.side==='black'?'..':''}</div>
      <div class="pg-detail">
        <div class="pg-line"><span class="played">${esc(m.san)}</span>
          <span class="pg-arrow">&rarr;</span>
          <span class="best">${esc(m.best_move||'?')}</span></div>
        ${m.why ? `<p class="pg-why">${esc(m.why)}</p>` : ''}
      </div>
      <div class="pg-drop">−${(m.drop_cp/100).toFixed(1)}</div>
    </div>`).join('') || '<div style="color:var(--muted2);font-size:.88rem">No mistakes detected — well played!</div>';
  _postgamePuzzles = d.puzzles || [];
  if(_postgamePuzzles.length){
    document.getElementById('postgame-train-btn').classList.remove('hidden');
  }
}

function closePostgame(){ document.getElementById('postgame-modal').classList.add('hidden'); }

function trainPostgamePuzzles(){
  if(!_postgamePuzzles.length){ closePostgame(); return; }
  State.puzzles = _postgamePuzzles.slice();
  State.puzzleIdx = 0;
  State.puzzleCorrect = 0;
  State.puzzleWrong = 0;
  document.getElementById('puzzle-total').textContent = State.puzzles.length;
  // Show puzzle area, hide empty state
  const np = document.getElementById('no-puzzles'); if(np) np.classList.add('hidden');
  const pa = document.getElementById('puzzle-area'); if(pa) pa.classList.remove('hidden');
  closePostgame();
  showPage('puzzles');
}


/* ── Init ─────────────────────────────────────────────────────────────────── */
// Inject theme styles + set defaults
(function(){
  if(!document.getElementById('gold-theme-style')){
    const s=document.createElement('style');s.id='gold-theme-style';
    s.textContent='[data-theme="gold"]{--cyan:#ffd32a;--cyan-dim:rgba(255,211,42,.12);--cyan-glow:rgba(255,211,42,.25)}[data-light="1"]{--bg:#f5f5f7;--bg2:#ffffff;--bg3:#f0f0f5;--bg4:#e8e8f0;--border:#d0d0e0;--text:#1a1a2e;--muted:#555570}';
    document.head.appendChild(s);
  }
  // Default to cyan dark if never set
  if(!localStorage.getItem('cf-theme')) localStorage.setItem('cf-theme','cyan');
  if(!localStorage.getItem('cf-lightmode')) localStorage.setItem('cf-lightmode','0');
  const savedTheme = localStorage.getItem('cf-theme');
  if(savedTheme){
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.querySelectorAll('.theme-opt').forEach(el=>el.classList.toggle('active', el.dataset.theme===savedTheme));
  }
  if(localStorage.getItem('cf-lightmode')==='1'){
    document.documentElement.setAttribute('data-light','1');
    const tog=document.getElementById('dark-mode-toggle');
    if(tog) tog.checked=false;
  }
})();

checkSession().then(handleURLParams);

// Init coach page on first load (since it's the default active page)
setTimeout(()=>{
  try { initCoachPage(); } catch(e) { console.error('Coach init error:', e); }
  setBotMode('coached');
}, 300);


/* ═══════════════════════════════════════════════════════════════════════════
   ForgeBoard — clean, custom chessboard (SVG pieces, flat squares, overlays)
   Rules-agnostic: the app supplies legal targets + validates moves via chess.js.
   ═══════════════════════════════════════════════════════════════════════════ */
const FB_BASE = '<path d="M9.5 42.5 L35.5 42.5 L35.5 39.5 Q35.5 37.5 33 37.5 L12 37.5 Q9.5 37.5 9.5 39.5 Z"/><path d="M12.5 37.5 L32.5 37.5 L31 32 L14 32 Z"/>';
const FB_PIECES = {
  k:'<rect x="21" y="4" width="3" height="8" rx="1"/><rect x="18.5" y="6.5" width="8" height="3" rx="1"/><path d="M22.5 12 C16 12 13 18 17 24 Q22.5 20 28 24 C32 18 29 12 22.5 12 Z"/><path d="M15 24 Q22.5 20 30 24 L29 32 L16 32 Z"/>'+FB_BASE,
  q:'<circle cx="10" cy="13" r="2.6"/><circle cx="17.5" cy="9.5" r="2.6"/><circle cx="27.5" cy="9.5" r="2.6"/><circle cx="35" cy="13" r="2.6"/><circle cx="22.5" cy="8" r="2.6"/><path d="M10 14 L13.5 27 L31.5 27 L35 14 L29 20 L25.5 12 L22.5 19 L19.5 12 L16 20 Z"/><path d="M13.5 27 L31.5 27 L30 32 L15 32 Z"/>'+FB_BASE,
  b:'<circle cx="22.5" cy="6" r="2.6"/><path d="M22.5 9 C29 13 30 21 24 27 L21 27 C15 21 16 13 22.5 9 Z"/><rect x="20.5" y="15" width="4" height="1.8" rx=".6"/><rect x="21.6" y="13.9" width="1.8" height="4" rx=".6"/><path d="M17 27 L28 27 L29.5 32 L15.5 32 Z"/>'+FB_BASE,
  n:'<path d="M13 42 C12 33 14 28 18 25 C13.5 24 12 19 15 15 C17 12 15 11 14.5 8 L18 10 C20 7 25 7 28 11 C31.5 15.5 32 24 31 30 C30.5 34 31 38 31 42 Z"/><circle class="fb-eye" cx="17.5" cy="17" r="1.5"/>',
  r:'<path d="M12 9 L12 15 L33 15 L33 9 L28.5 9 L28.5 11.5 L25 11.5 L25 9 L20 9 L20 11.5 L16.5 11.5 L16.5 9 Z"/><path d="M14.5 15 L30.5 15 L29 20 L16 20 Z"/><path d="M16 20 L29 20 L30.5 32 L14.5 32 Z"/>'+FB_BASE,
  p:'<circle cx="22.5" cy="11" r="5.2"/><path d="M18 17 L27 17 L26 20 L19 20 Z"/><path d="M17.5 32 Q16 24 22.5 20 Q29 24 27.5 32 Z"/>'+FB_BASE
};
function fbPieceSVG(type, color){
  return '<svg class="fb-piece '+color+'" viewBox="0 0 45 45">'+FB_PIECES[type.toLowerCase()]+'</svg>';
}
// Custom piece SVGs live in /static/custom/ (wK.svg, bQ.svg, …). If a file is
// missing, fall back to the built-in vector piece so the board is never broken.
// Cosmetic sets are subdirectories of the same file names, so switching a set is
// only a change of prefix — the geometry, sizing and markup are identical.
function fbPieceCode(type, color){ return (color==='w'?'w':'b') + type.toUpperCase(); }
function fbPieceEl(type, color){
  const code = fbPieceCode(type, color);
  return '<img class="fb-piece-img" draggable="false" alt="" src="/static/custom/'+Cosmetics.dir+code+'.svg?v='+PIECE_VER+'" '+
         'onerror="fbPieceImgFail(this,\''+type+'\',\''+color+'\')">';
}
function fbPieceImgFail(img, type, color){
  try{ img.outerHTML = fbPieceSVG(type, color); }catch(e){}
}
window.fbPieceImgFail = fbPieceImgFail;

class ForgeBoard {
  constructor(elId, opts={}){
    this.el = document.getElementById(elId);
    if(!this.el) throw new Error('ForgeBoard: no element '+elId);
    this.orientation = opts.orientation || 'white';
    this.interactive = opts.interactive !== false;
    this.onMove = opts.onMove || (()=>false);
    this.getTargets = opts.getTargets || (()=>null);
    this.pos = {};              // square -> {type,color}
    this.selected = null;
    this.lastMove = null;       // {from,to}
    this.checkSquare = null;
    this.dragging = false;
    this._build();
    // Every board registers itself, so equipping a piece set repaints all of
    // them — Play, Puzzles, drills and stage — without anyone having to
    // remember to add the new surface to a list.
    (ForgeBoard.instances || (ForgeBoard.instances = [])).push(this);
  }

  // Repaint the pieces in place after a cosmetic change. This walks only
  // occupied squares and reuses the normal paint path; it does NOT rebuild the
  // grid, so it is not the full-redraw that once caused the flicker bug.
  refreshPieces(){
    for(const sq in this.pos){ if(this.pos[sq]) this._paint(sq, this.pos[sq]); }
  }
  _build(){
    this.el.classList.add('fb-board');
    this.el.innerHTML = '';
    this.overlay = document.createElement('div');
    this.overlay.className = 'fb-overlay';
    this.overlay.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><g class="fb-hls"></g><g class="fb-arrows"></g><g class="fb-user"></g></svg><div class="fb-hands"></div>';
    this.userArrows = [];   // {from,to} — user's own right-click arrows
    this.userHls = [];      // squares the user right-clicked to mark red
    this.el.appendChild(this.overlay);   // attach overlay first so square inserts have a valid anchor
    this.cells = {};        // square -> cell element (built ONCE, never destroyed on a move)
    this.slots = {};        // square -> piece slot inside the cell
    this._buildSquares();
    this._bindDrag();
  }
  _order(){
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['8','7','6','5','4','3','2','1'];
    const rows = this.orientation==='white' ? ranks : ranks.slice().reverse();
    const cols = this.orientation==='white' ? files : files.slice().reverse();
    return {rows, cols};
  }
  // Build the 64 cells ONCE. Only runs on mount + flip — never on a move, so pieces never flash.
  _buildSquares(){
    this.el.querySelectorAll('.fb-sq').forEach(s=>s.remove());
    this.cells = {}; this.slots = {};
    const {rows, cols} = this._order();
    const frag = document.createDocumentFragment();
    rows.forEach((rank, ri)=>{
      cols.forEach((file, ci)=>{
        const sq = file+rank;
        const fi = 'abcdefgh'.indexOf(file);
        const isLight = ((fi + parseInt(rank,10)) % 2) === 0;
        const cell = document.createElement('div');
        cell.className = 'fb-sq '+(isLight?'fb-light':'fb-dark');
        cell.dataset.square = sq;
        if(this.lastMove && (this.lastMove.from===sq || this.lastMove.to===sq)) cell.classList.add('fb-last');
        if(this.checkSquare===sq) cell.classList.add('fb-check');
        if(this.selected===sq) cell.classList.add('fb-selected');
        const slot = document.createElement('div');
        slot.className = 'fb-piece-slot';
        const pc = this.pos[sq];
        if(pc) slot.innerHTML = fbPieceEl(pc.type, pc.color);
        cell.appendChild(slot);
        // coordinate ticks on edges
        if(ri===7) cell.insertAdjacentHTML('beforeend','<span class="fb-coord file">'+file+'</span>');
        if(ci===0) cell.insertAdjacentHTML('beforeend','<span class="fb-coord rank">'+rank+'</span>');
        this.cells[sq] = cell; this.slots[sq] = slot;
        frag.appendChild(cell);
      });
    });
    if(this.overlay && this.overlay.parentNode === this.el) this.el.insertBefore(frag, this.overlay);
    else this.el.appendChild(frag);
  }
  _pieceKey(pc){ return pc ? pc.color+pc.type : ''; }
  _paint(sq, pc){ const slot = this.slots[sq]; if(slot) slot.innerHTML = pc ? fbPieceEl(pc.type, pc.color) : ''; }
  // Diff-based update: repaint ONLY the squares whose piece changed, then slide the moved piece.
  // Never rebuilds the grid, so unchanged pieces never re-decode or flash.
  setPosition(fen, opts={}){
    const next = {};
    const placement = (fen||'').split(' ')[0];
    if(placement){
      const ranks = placement.split('/');
      for(let r=0; r<8; r++){
        const rankNum = 8 - r; let f = 0;
        for(const ch of ranks[r]){
          if(/\d/.test(ch)){ f += parseInt(ch,10); }
          else { const color = ch===ch.toUpperCase()?'w':'b'; next['abcdefgh'[f]+rankNum] = {type:ch.toLowerCase(), color}; f++; }
        }
      }
    }
    if(!this.cells || !Object.keys(this.cells).length) this._buildSquares();
    // repaint only changed squares
    const files='abcdefgh';
    for(let f=0; f<8; f++) for(let r=1; r<=8; r++){
      const sq = files[f]+r;
      if(this._pieceKey(this.pos[sq]) !== this._pieceKey(next[sq])) this._paint(sq, next[sq]);
    }
    this.pos = next;
    // decoration classes — toggle in place, no rebuild
    this.el.querySelectorAll('.fb-sq.fb-last,.fb-sq.fb-check,.fb-sq.fb-selected').forEach(c=>c.classList.remove('fb-last','fb-check','fb-selected'));
    if(opts.lastMove) this.lastMove = opts.lastMove;
    if('checkSquare' in opts) this.checkSquare = opts.checkSquare;
    this.selected = null; this._clearDots();
    if(this.lastMove){ const a=this.cells[this.lastMove.from], b=this.cells[this.lastMove.to]; if(a)a.classList.add('fb-last'); if(b)b.classList.add('fb-last'); }
    if(this.checkSquare && this.cells[this.checkSquare]) this.cells[this.checkSquare].classList.add('fb-check');
    // 200ms slide (FLIP) for the piece that just moved — only that one piece animates
    if(opts.lastMove && opts.animate!==false){
      const {from,to}=opts.lastMove;
      const slot=this.slots[to], img=slot && slot.firstElementChild, cf=this.cells[from], ct=this.cells[to];
      if(img && cf && ct){
        const dx=cf.offsetLeft-ct.offsetLeft, dy=cf.offsetTop-ct.offsetTop;
        if(dx||dy){
          img.style.transition='none';
          img.style.transform='translate('+dx+'px,'+dy+'px)';
          requestAnimationFrame(()=>{ img.style.transition='transform .2s ease-out'; img.style.transform='translate(0,0)'; });
        }
      }
    }
    if(this.overlay && this.clearUser) this.clearUser();
  }
  flip(color){ this.orientation = color; this._buildSquares(); }
  markLast(from,to){ this.lastMove = {from,to}; }
  setCheck(sq){ this.checkSquare = sq || null; }
  _cellFor(sq){ return this.el.querySelector('.fb-sq[data-square="'+sq+'"]'); }
  _clearDots(){ this.el.querySelectorAll('.fb-dot, .fb-ring').forEach(d=>d.remove()); }
  _select(sq){
    this.selected = sq;
    this._clearDots();
    this.el.querySelectorAll('.fb-selected').forEach(c=>c.classList.remove('fb-selected'));
    const cell = this._cellFor(sq); if(cell) cell.classList.add('fb-selected');
    const targets = this.getTargets(sq) || [];
    targets.forEach(t=>{
      const tc = this._cellFor(t); if(!tc) return;
      const capture = !!this.pos[t];
      const mark = document.createElement('div');
      mark.className = capture ? 'fb-ring' : 'fb-dot';
      tc.appendChild(mark);
    });
    return targets;
  }
  _deselect(){
    this.selected = null; this._clearDots();
    this.el.querySelectorAll('.fb-selected').forEach(c=>c.classList.remove('fb-selected'));
  }
  _tryMove(from,to){
    const ok = this.onMove(from, to);
    this._deselect();
    return ok;
  }
  _handleClick(sq){
    if(!this.interactive) return;
    if(this.selected){
      if(sq===this.selected){ this._deselect(); return; }
      const targets = this.getTargets(this.selected) || [];
      if(targets.indexOf(sq) !== -1){ this._tryMove(this.selected, sq); return; }
      // clicked another own piece?
      const t = this.getTargets(sq);
      if(t){ this._select(sq); return; }
      this._deselect(); return;
    }
    const t = this.getTargets(sq);
    if(t){ this._select(sq); }
  }
  _bindDrag(){
    let startSq=null, moved=false, ghost=null;
    const THRESH=6; let sx=0, sy=0;
    const squareAt = (x,y)=>{
      const el = document.elementFromPoint(x,y);
      if(!el) return null;
      const cell = el.closest ? el.closest('.fb-sq') : null;
      return cell ? cell.dataset.square : null;
    };
    const down = (e)=>{
      // Left button = piece interaction; a left click also clears the user's own arrows (chess.com behaviour).
      if(e.button && e.button!==0) return;   // ignore right/middle here
      if(!this.interactive) return;
      const pt = e.touches ? e.touches[0] : e;
      const sq = squareAt(pt.clientX, pt.clientY);
      if(!sq) return;
      if(this.userArrows.length || this.userHls.length) this.clearUser();
      startSq = sq; moved=false; sx=pt.clientX; sy=pt.clientY;
    };
    // ── Right-click arrows + red square highlights (like chess.com) ──
    let rcFrom = null;
    const modColor = (e)=> e.shiftKey ? '#E5484D'
                        : e.altKey   ? '#5B9DFF'
                        : (e.ctrlKey||e.metaKey) ? '#E5A73D'
                        : '#7BC96F';
    this.el.addEventListener('contextmenu', e=>e.preventDefault());   // board only
    this.el.addEventListener('mousedown', e=>{
      if(e.button!==2) return;
      e.preventDefault();
      rcFrom = squareAt(e.clientX, e.clientY);
    });
    this.el.addEventListener('mouseup', e=>{
      if(e.button!==2 || !rcFrom) return;
      const to = squareAt(e.clientX, e.clientY);
      const col = modColor(e);
      if(to && to===rcFrom) this.toggleUserHighlight(rcFrom, col);
      else if(to) this.toggleUserArrow(rcFrom, to, col);
      rcFrom = null;
    });
    const move = (e)=>{
      if(!startSq) return;
      const pt = e.touches ? e.touches[0] : e;
      if(!moved){
        if(Math.abs(pt.clientX-sx)+Math.abs(pt.clientY-sy) < THRESH) return;
        moved = true;
        // A real drag began — select the piece so its move dots show, and lift a ghost.
        const t = this.getTargets(startSq);
        if(t) this._select(startSq);
        const pc = this.pos[startSq];
        if(pc){
          ghost = document.createElement('div');
          ghost.className = 'fb-drag-ghost';
          ghost.innerHTML = fbPieceSVG(pc.type, pc.color);
          document.body.appendChild(ghost);
          const cell = this._cellFor(startSq); if(cell) cell.classList.add('fb-drag-piece');
        }
      }
      if(ghost){ ghost.style.left = pt.clientX+'px'; ghost.style.top = pt.clientY+'px'; e.preventDefault(); }
    };
    const up = (e)=>{
      if(!startSq) return;
      const pt = e.changedTouches ? e.changedTouches[0] : e;
      const cell = this._cellFor(startSq); if(cell) cell.classList.remove('fb-drag-piece');
      if(ghost){ ghost.remove(); ghost=null; }
      if(moved){
        // Drag release  drop on target square if legal, else cancel selection.
        const to = squareAt(pt.clientX, pt.clientY);
        const targets = this.getTargets(startSq) || [];
        if(to && targets.indexOf(to)!==-1){ this._tryMove(startSq, to); }
        else { this._deselect(); }
      } else {
        // Plain click  select / move / deselect, handled in one place.
        this._handleClick(startSq);
      }
      startSq=null; moved=false;
    };
    this.el.addEventListener('mousedown', down);
    this.el.addEventListener('touchstart', down, {passive:false});
    // Window listeners used to be added per board and never removed. Boards are
    // rebuilt for every drill, stage and new game, so handlers piled up and each
    // one ran on every mousemove — the board got progressively laggier the longer
    // a session went on. These detach themselves once their board leaves the DOM.
    const self = this;
    const bind = (type, fn, opts)=>{
      const wrapped = (e)=>{
        if(!self.el || !self.el.isConnected){ window.removeEventListener(type, wrapped, opts); return; }
        fn(e);
      };
      window.addEventListener(type, wrapped, opts);
    };
    bind('mousemove', move, {passive:false});
    bind('mouseup', up);
    bind('touchmove', move, {passive:false});
    bind('touchend', up);
  }
  /* ── overlay drawing ── */
  _xy(sq){
    const fi = 'abcdefgh'.indexOf(sq[0]);
    const rk = parseInt(sq[1],10);
    let col = this.orientation==='white' ? fi : 7-fi;
    let row = this.orientation==='white' ? 8-rk : rk-1;
    return {x: col*12.5+6.25, y: row*12.5+6.25};
  }
  clearMarks(){
    const a = this.overlay.querySelector('.fb-arrows'); if(a) a.innerHTML='';
    const h = this.overlay.querySelector('.fb-hls'); if(h) h.innerHTML='';
    const hands = this.overlay.querySelector('.fb-hands'); if(hands) hands.innerHTML='';
  }
  arrow(from,to,color){
    color = color || '#26d07c';
    const g = this.overlay.querySelector('.fb-arrows');
    const a = this._xy(from), b = this._xy(to);
    const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy)||1;
    const ux=dx/len, uy=dy/len;
    const ex=b.x-ux*5.5, ey=b.y-uy*5.5;         // shaft end (leave room for head)
    const hb=4.6;                                 // head size
    const hx1=ex-ux*hb+(-uy)*hb*0.7, hy1=ey-uy*hb+(ux)*hb*0.7;
    const hx2=ex-ux*hb-(-uy)*hb*0.7, hy2=ey-uy*hb-(ux)*hb*0.7;
    const ns='http://www.w3.org/2000/svg';
    const line=document.createElementNS(ns,'line');
    line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',ex);line.setAttribute('y2',ey);
    line.setAttribute('class','fb-arrow');line.setAttribute('stroke',color);line.setAttribute('stroke-width','3.4');
    const head=document.createElementNS(ns,'polygon');
    head.setAttribute('points',b.x+','+b.y+' '+hx1+','+hy1+' '+hx2+','+hy2);
    head.setAttribute('fill',color);head.setAttribute('opacity','.9');
    g.appendChild(line);g.appendChild(head);
  }
  highlight(sq,color){
    color=color||'#26d07c';
    const g=this.overlay.querySelector('.fb-hls');
    const c=this._xy(sq);
    const ns='http://www.w3.org/2000/svg';
    const circ=document.createElementNS(ns,'circle');
    circ.setAttribute('cx',c.x);circ.setAttribute('cy',c.y);circ.setAttribute('r','5.4');
    circ.setAttribute('class','fb-hl');circ.setAttribute('stroke',color);
    g.appendChild(circ);
  }
  point(sq){
    const hands=this.overlay.querySelector('.fb-hands');
    const c=this._xy(sq);
    const hand=document.createElement('div');
    hand.className='fb-hand';hand.textContent='';
    hand.style.left=c.x+'%';hand.style.top=c.y+'%';
    hands.appendChild(hand);
  }
  /* ── user's own right-click marks ── */
  toggleUserArrow(from,to,color){
    color = color || '#7BC96F';
    const i=this.userArrows.findIndex(a=>a.from===from && a.to===to);
    if(i>=0){
      if(this.userArrows[i].color===color) this.userArrows.splice(i,1);  // same colour = remove
      else this.userArrows[i].color=color;                               // different modifier = recolour
    } else this.userArrows.push({from,to,color});
    this._renderUser();
  }
  toggleUserHighlight(sq,color){
    color = color || '#7BC96F';
    const i=this.userHls.findIndex(h=>(h.sq||h)===sq);
    if(i>=0){
      const cur=this.userHls[i];
      if((cur.color||'#7BC96F')===color) this.userHls.splice(i,1);
      else this.userHls[i]={sq:sq,color:color};
    } else this.userHls.push({sq:sq,color:color});
    this._renderUser();
  }
  clearUser(){ this.userArrows=[]; this.userHls=[]; this._renderUser(); }
  _renderUser(){
    const g=this.overlay.querySelector('.fb-user'); if(!g) return;
    g.innerHTML='';
    const ns='http://www.w3.org/2000/svg';
    this.userHls.forEach(h=>{
      const sq=h.sq||h, col=h.color||'#7BC96F';
      const c=this._xy(sq);
      const rect=document.createElementNS(ns,'rect');
      rect.setAttribute('x',c.x-6.25);rect.setAttribute('y',c.y-6.25);
      rect.setAttribute('width','12.5');rect.setAttribute('height','12.5');
      rect.setAttribute('fill',col);rect.setAttribute('opacity','0.45');
      g.appendChild(rect);
    });
    const FW=12.5;                                   // one square in overlay units
    this.userArrows.forEach(a=>{
      const col=a.color||'#7BC96F';
      const p=this._xy(a.from), q=this._xy(a.to);
      const dx=q.x-p.x, dy=q.y-p.y;
      const fx=Math.round(Math.abs(dx)/FW), fy=Math.round(Math.abs(dy)/FW);
      const knight=(fx===1&&fy===2)||(fx===2&&fy===1);
      const shaft=FW*0.12*8/8*1.5, headLen=FW*0.28;
      const mk=(el,attrs)=>{const n=document.createElementNS(ns,el);
        for(const k in attrs) n.setAttribute(k,attrs[k]); g.appendChild(n); return n;};
      if(knight){
        // L-shaped path: long leg first, then the short leg — matches how the knight moves
        const midX = (fx===2) ? q.x : p.x;
        const midY = (fx===2) ? p.y : q.y;
        const lastdx = q.x-midX, lastdy = q.y-midY;
        const L=Math.hypot(lastdx,lastdy)||1, ux=lastdx/L, uy=lastdy/L;
        const ex=q.x-ux*headLen, ey=q.y-uy*headLen;
        mk('path',{d:'M'+p.x+' '+p.y+' L'+midX+' '+midY+' L'+ex+' '+ey,
                   fill:'none',stroke:col,'stroke-width':shaft,'stroke-linecap':'round',
                   'stroke-linejoin':'round',opacity:'0.65'});
        mk('polygon',{points:q.x+','+q.y+' '+(ex-uy*headLen*0.55)+','+(ey+ux*headLen*0.55)+' '+
                             (ex+uy*headLen*0.55)+','+(ey-ux*headLen*0.55),fill:col,opacity:'0.65'});
      } else {
        const len=Math.hypot(dx,dy)||1, ux=dx/len, uy=dy/len;
        const ex=q.x-ux*headLen, ey=q.y-uy*headLen;
        mk('line',{x1:p.x,y1:p.y,x2:ex,y2:ey,stroke:col,'stroke-width':shaft,
                   'stroke-linecap':'round',opacity:'0.65'});
        mk('polygon',{points:q.x+','+q.y+' '+(ex-uy*headLen*0.55)+','+(ey+ux*headLen*0.55)+' '+
                             (ex+uy*headLen*0.55)+','+(ey-ux*headLen*0.55),fill:col,opacity:'0.65'});
      }
    });
  }

}


/* ═══════════════════════════════════════════════════════════════════════════
   Onboarding — guided first-run flow (Phase 1: Step 1 calibration game)
   ═══════════════════════════════════════════════════════════════════════════ */
// (Onboarding tutorial module removed.)

/* ── Legal modals: Esc, click-outside, focus trap ── */
(function(){
  var open=null, lastFocus=null;
  function fous(m){ return m.querySelectorAll('a[href],button,[tabindex]:not([tabindex="-1"])'); }
  function openLegal(id){
    var m=document.getElementById('lg-'+id); if(!m) return;
    lastFocus=document.activeElement; m.hidden=false; open=m;
    document.body.style.overflow='hidden';
    var f=fous(m); if(f.length) f[0].focus();
  }
  function closeLegal(){
    if(!open) return;
    open.hidden=true; document.body.style.overflow='';
    if(lastFocus&&lastFocus.focus) lastFocus.focus();
    open=null;
  }
  document.addEventListener('click',function(e){
    var t=e.target.closest&&e.target.closest('[data-legal]');
    if(t){ e.preventDefault(); openLegal(t.getAttribute('data-legal')); return; }
    if(e.target.closest&&e.target.closest('[data-legal-close]')){ e.preventDefault(); closeLegal(); return; }
    if(open && e.target===open) closeLegal();
  });
  document.addEventListener('keydown',function(e){
    if(!open) return;
    if(e.key==='Escape'){ closeLegal(); return; }
    if(e.key==='Tab'){
      var f=fous(open); if(!f.length) return;
      var a=f[0], b=f[f.length-1];
      if(e.shiftKey && document.activeElement===a){ e.preventDefault(); b.focus(); }
      else if(!e.shiftKey && document.activeElement===b){ e.preventDefault(); a.focus(); }
    }
  });
  window.openLegal=openLegal;
})();

/* top-level class/const bindings are not properties of window — export them explicitly */
try{ window.ForgeBoard = ForgeBoard; }catch(e){}
try{ window.BotState = BotState; }catch(e){}
try{ window.ChessSFX = ChessSFX; }catch(e){}
try{ window.Cosmetics = Cosmetics; }catch(e){}
try{ syncCosmeticAffordances(); }catch(e){}

/* ═══════════════════════════════════════════════════════════════════════════
   GameSetup — pre-game panel, in-game bar, turn indicator.

   The play screen shipped with no way to start a game: the redesign hid
   .gm-mode-cards and .gm-toolbar (the only New Game button and colour picker),
   so the command palette was the sole entry point. Whose turn it was could not
   be read either, because #bot-status is display:none on this page. This module
   owns that surface — start, resign, flip, new game, and turn state.
   ═══════════════════════════════════════════════════════════════════════════ */
const GameSetup = (function(){
  const $ = (id)=>document.getElementById(id);
  let side = 'random', mode = 'coached';   // random unless they choose otherwise

  function showSetup(on){
    const p = $('gm-setup');   if(p) p.classList.toggle('hidden', !on);
    const b = $('gm-gamebar'); if(b) b.classList.toggle('hidden', on);
  }

  function setTurn(text, state){
    const t = $('gm-turn-text'); if(t) t.textContent = text;
    const w = $('gm-turn');
    if(w){ w.classList.remove('waiting','over'); if(state) w.classList.add(state); }
  }

  // Single place that decides what the bar should say, so it can be called from
  // anywhere in the move cycle without duplicating the branching.
  function refresh(){
    if(!window.BotState) return;
    if(!BotState.gameActive){ setTurn('Game over', 'over'); return; }
    if(BotState.boardLocked){ setTurn('Answer the coach to continue', 'waiting'); return; }
    if(BotState.thinking){ setTurn('GM Forge is thinking…', 'waiting'); return; }
    if(window.Premove && Premove.pending){
      setTurn('Premove queued — ' + Premove.pending.from + '→' + Premove.pending.to, 'waiting'); return;
    }
    if(BotState.game && BotState.game.turn() !== BotState.playerColor[0]){
      setTurn('GM Forge is thinking…', 'waiting'); return;
    }
    setTurn(BotState.game && BotState.game.in_check() ? 'Your move — you are in check' : 'Your move', null);
  }

  function segment(wrapId, attr, onPick){
    const wrap = $(wrapId); if(!wrap) return;
    wrap.addEventListener('click', (e)=>{
      const btn = e.target.closest('.gm-seg-btn'); if(!btn) return;
      wrap.querySelectorAll('.gm-seg-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      onPick(btn.dataset[attr]);
    });
  }

  function start(){
    // Keep the preference, including 'random', on the select — startBotGame()
    // rolls it, so every way of starting a game gets the same treatment.
    const sel = $('bot-color'); if(sel) sel.value = side;
    if(typeof setBotMode === 'function') setBotMode(mode);
    showSetup(false);
    if(typeof startBotGame === 'function') startBotGame();
    refresh();
  }

  function resign(){
    if(!window.BotState || !BotState.gameActive) return;
    BotState.gameActive = false;
    if(window.Premove) Premove.clear();
    if(window.CoachMoment) CoachMoment.stop();
    if(typeof setBotStatus === 'function') setBotStatus('You resigned.');
    if(window.Coach && Coach.speak) Coach.speak('Resigned. Start another when you are ready — the mistakes from this one are already in your drills.');
    setTurn('You resigned', 'over');
    showSetup(true);
    const go = $('setup-go'); if(go) go.textContent = 'Play again';
  }

  function flip(){
    if(!window.BotState || !BotState.board) return;
    BotState.board.orientation = BotState.board.orientation === 'white' ? 'black' : 'white';
    BotState.board.flip(BotState.board.orientation);
    if(BotState.game) BotState.board.setPosition(BotState.game.fen(), {animate:false});
  }

  function newGame(){
    if(window.CoachMoment) CoachMoment.stop();
    if(window.Premove) Premove.clear();
    showSetup(true);
    const go = $('setup-go'); if(go) go.textContent = 'Start game';
  }

  function init(){
    if(!$('gm-setup')) return;
    segment('setup-mode','mode', v=>{ mode = v; });
    segment('setup-side','side', v=>{ side = v; });
    const go = $('setup-go'); if(go) go.addEventListener('click', start);
    const n = $('act-new');    if(n) n.addEventListener('click', newGame);
    const r = $('act-resign'); if(r) r.addEventListener('click', resign);
    const f = $('act-flip');   if(f) f.addEventListener('click', flip);
    // F flips the board, but never while the user is typing into something.
    document.addEventListener('keydown', (e)=>{
      if(e.key !== 'f' && e.key !== 'F') return;
      if(e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const coach = document.getElementById('page-coach');
      if(!coach || !coach.classList.contains('active')) return;
      if(!BotState || !BotState.gameActive) return;
      flip();
    });
    showSetup(!(window.BotState && BotState.gameActive));
    refresh();
    // The move cycle is spread across several call sites; polling keeps the bar
    // honest without threading a callback through every one of them.
    setInterval(refresh, 400);
  }

  return {init, refresh, showSetup, resign, flip, newGame, start};
})();
window.GameSetup = GameSetup;

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', GameSetup.init);
else GameSetup.init();

/* ═══════════════════════════════════════════════════════════════════════════
   SolveHelp — teach the method, not the move.

   The Hint button used to print "Best move: Nxe5", which teaches nothing: the
   puzzle is solved and the player learned no way to find the next one. This
   replaces that with a per-pattern method (what to scan, in what order) and a
   four-rung ladder that narrows the search before it ever names a move.
   ═══════════════════════════════════════════════════════════════════════════ */
const SolveHelp = (function(){

  // One entry per pattern the analyser can tag. `what` defines the idea, `steps`
  // is the scan procedure, `tell` is the giveaway to look for on the board.
  const METHOD = {
    'Hanging piece':{
      what:'A hanging piece is one that has more attackers than defenders — it can simply be taken for free.',
      tell:'Look for pieces standing alone, with no friendly piece covering the square they sit on.',
      steps:[
        'Count the pieces your opponent left undefended. Go one by one — do not skim.',
        'For each of your pieces, ask: if it were captured right now, do I recapture?',
        'Check the piece that just moved. A piece that moves often abandons what it was defending.',
        'Take the free material before starting any plan of your own.'
      ]
    },
    'Missed tactic':{
      what:'A tactic is a short forcing sequence that wins material or mates. Forcing means checks, captures and threats — moves the opponent cannot ignore.',
      tell:'Two enemy pieces on one line, an undefended piece near their king, or a king with no escape squares.',
      steps:[
        'List every check you have. Every single one, even the silly-looking ones.',
        'List every capture you have.',
        'List every move that makes a serious threat.',
        'Only those three lists can contain a tactic — calculate them before anything quiet.'
      ]
    },
    'King safety issue':{
      what:'King safety problems come from open lines pointing at the king, missing defenders, or a king still stuck in the centre.',
      tell:'An open file or diagonal aimed at the king, or heavy pieces that can swing across in one move.',
      steps:[
        'Find the king. Count how many of your pieces can reach squares next to it.',
        'Look for open files and diagonals leading to it — those are the roads in.',
        'Ask which defender is doing the most work, then look for a way to remove or distract it.',
        'If the king cannot run, a check may be mate rather than just a check.'
      ]
    },
    'Opening mistake':{
      what:'Opening play is about development, the centre and king safety — not about winning material early.',
      tell:'A piece still on its starting square, a king still in the centre, or the same piece moved twice.',
      steps:[
        'Count your developed pieces against your opponent’s. Who has more in the game?',
        'Ask which of your pieces is doing the least — that is usually the one to move.',
        'Check whether castling is available and whether anything concrete stops you.',
        'Prefer the move that develops with a threat, so you gain time as well as a piece.'
      ]
    },
    'Endgame mistake':{
      what:'Endgames are decided by king activity and passed pawns, not by keeping material even.',
      tell:'A passed pawn, a king closer to the action than its counterpart, or a pawn race.',
      steps:[
        'Bring the king forward — in an endgame it is a strong piece, not a liability.',
        'Find every passed pawn on the board, yours and theirs. They decide the game.',
        'Count the race: if both sides push, who queens first? Count it exactly, not roughly.',
        'Push the passed pawn only once your king supports it, unless the race is already won.'
      ]
    },
    'Early queen development':{
      what:'A queen brought out early gets chased by smaller pieces, and every attack on her develops your opponent for free.',
      tell:'Your queen off her home square while knights and bishops are still at home.',
      steps:[
        'Ask what your opponent gains by attacking the queen — usually a free developing move.',
        'Develop knights and bishops first, then castle, then bring the queen out.',
        'If the queen is already out and being chased, retreat her to a safe square early rather than late.'
      ]
    }
  };

  const FALLBACK = {
    what:'Find the strongest move in the position.',
    tell:'Undefended pieces, exposed kings and pieces lined up with each other.',
    steps:[
      'Ask what your opponent threatens. Answer that before anything else.',
      'List your checks, captures and threats — the answer is nearly always among them.',
      'Ask which of your pieces is doing the least work.',
      'Before committing, ask what your opponent plays in reply.'
    ]
  };

  function forPattern(p){ return METHOD[p] || FALLBACK; }

  const PIECE_WORD = {K:'king', Q:'queen', R:'rook', B:'bishop', N:'knight'};

  // Read the moving piece and destination straight out of the SAN, so hints
  // narrow the search without ever hardcoding per-puzzle text.
  function parseSan(san){
    if(!san) return null;
    const s = String(san).replace(/[+#!?]/g,'');
    if(/^O-O-O/.test(s)) return {piece:'king', dest:null, castle:'queenside'};
    if(/^O-O/.test(s))   return {piece:'king', dest:null, castle:'kingside'};
    const m = s.match(/^([KQRBN])?[a-h]?[1-8]?x?([a-h][1-8])/);
    if(!m) return null;
    return {piece: m[1] ? PIECE_WORD[m[1]] : 'pawn', dest: m[2], castle:null};
  }

  function region(sq){
    if(!sq) return null;
    const f = sq[0];
    if(f <= 'c') return 'the queenside';
    if(f >= 'f') return 'the kingside';
    return 'the centre';
  }

  /* Four rungs. Each one narrows the search; only the last names the move. */
  function ladder(pattern, san, extra){
    const m = forPattern(pattern);
    const p = parseSan(san);
    const rungs = [];

    rungs.push({
      label:'What am I looking for?',
      body: m.what + ' ' + m.tell
    });

    rungs.push({
      label:'How do I search?',
      body: m.steps.map((s,i)=>(i+1)+'. '+s).join('  ')
    });

    if(p){
      let narrow;
      if(p.castle) narrow = 'The move is castling ' + p.castle + '. Ask yourself why king safety is the priority here.';
      else if(p.piece === 'pawn') narrow = 'A pawn move solves this, landing on ' + region(p.dest) + '. Which pawn changes the most?';
      else narrow = 'Your ' + p.piece + ' is the piece that does it, and it lands on ' + region(p.dest) + '. Work out which square makes the biggest threat.';
      rungs.push({label:'Narrow it down', body: narrow});
    }

    rungs.push({
      label:'Show me the move',
      body:'The move is ' + (san || 'unavailable') + '.' + (extra ? ' ' + extra : ''),
      isAnswer:true
    });

    return rungs;
  }

  /* Renders the always-visible method card. Not hidden behind a click: the
     point is that the procedure is available while the player is still looking. */
  function methodHTML(pattern){
    const m = forPattern(pattern);
    return '<div class="sh-method">'
      + '<div class="sh-method-head"><span class="sh-method-label">How to solve this</span>'
      + '<span class="sh-method-pat">' + esc(pattern || 'Best move') + '</span></div>'
      + '<p class="sh-what">' + esc(m.what) + '</p>'
      + '<ol class="sh-steps">' + m.steps.map(s=>'<li>' + esc(s) + '</li>').join('') + '</ol>'
      + '<p class="sh-tell"><b>Giveaway:</b> ' + esc(m.tell) + '</p>'
      + '</div>';
  }

  return {forPattern, ladder, methodHTML, parseSan, METHOD};
})();
window.SolveHelp = SolveHelp;

/* The ⌘K control lives in the top bar now. It used to be a floating card that
   could be dragged anywhere, which was one more thing on screen to look at and
   one more thing that could end up somewhere awkward. Clicking it opens the
   palette; the shortcut itself is handled by CommandPalette.init(). */
(function(){
  function init(){
    const btn = document.getElementById('cmdk-hint');
    if(!btn) return;
    btn.addEventListener('click', ()=>{
      if(window.CommandPalette && CommandPalette.toggle) CommandPalette.toggle();
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ═══════════════════════════════════════════════════════════════════════════
   AskForge — context-aware chat about the position under review.

   The user never says which move they mean: the panel sends the FEN, move
   number, played move and move list with every question, so "why was this a
   blunder" always refers to what is on screen. Conversation history goes with
   each request so follow-ups ("why didn't I see that?") stay coherent.
   ═══════════════════════════════════════════════════════════════════════════ */
const AskForge = (function(){
  const $ = (id)=>document.getElementById(id);
  let history = [];      // [{role, content}] for this game review only
  let lastAnswer = null;
  let busy = false;

  function ctx(){
    const g = window.BotState && BotState.game;
    return {
      fen: g ? g.fen() : null,
      moves: g ? g.history() : [],
      move_number: g ? Math.ceil(g.history().length / 2) : null,
      san_played: (g && g.history().length) ? g.history()[g.history().length-1] : null,
      player_color: (window.BotState && BotState.playerColor) || 'white',
    };
  }

  function bubble(cls, text){
    const d = document.createElement('div');
    d.className = 'askf-msg ' + cls;
    d.textContent = text;
    $('askf-thread').appendChild(d);
    return d;
  }

  // The engine facts are shown even when the coaching voice is off, so the
  // panel is never an empty promise.
  function facts(d){
    const e = d.engine || {};
    const bits = [];
    if(e.mate) bits.push('<b>Eval</b> ' + esc(e.mate));
    else if(typeof e.eval === 'number') bits.push('<b>Eval</b> ' + (e.eval>0?'+':'') + e.eval.toFixed(2));
    if(e.best_san) bits.push('<b>Best</b> ' + esc(e.best_san));
    if(e.pv_san && e.pv_san.length) bits.push('<b>Line</b> ' + esc(e.pv_san.join(' ')));
    (d.what_if||[]).forEach(w=>{
      bits.push('<b>' + esc(w.move) + '</b> → ' + (w.eval_after>0?'+':'') + w.eval_after.toFixed(2)
                + (w.opponent_best ? ', they reply ' + esc(w.opponent_best) : ''));
    });
    if(!bits.length) return null;
    const el = document.createElement('div');
    el.className = 'askf-facts';
    el.innerHTML = bits.join('<br>');
    return el;
  }

  function chips(list){
    const wrap = $('askf-chips'); if(!wrap) return;
    wrap.innerHTML = '';
    (list||[]).forEach(t=>{
      const b = document.createElement('button');
      b.type='button'; b.className='askf-chip'; b.textContent = t;
      b.addEventListener('click', ()=>ask(t));
      wrap.appendChild(b);
    });
    if(lastAnswer){
      const c = document.createElement('button');
      c.type='button'; c.className='askf-chip confused'; c.textContent = "I'm still confused";
      c.addEventListener('click', ()=>ask("I still don't understand — explain it a different way.", true));
      wrap.appendChild(c);
    }
  }

  async function ask(question, stillConfused){
    if(busy || !question) return;
    busy = true;
    const send = $('askf-send'); if(send) send.disabled = true;
    const input = $('askf-input'); if(input) input.value = '';
    bubble('you', question);
    const thinking = bubble('note', 'GM Forge is looking at the position…');
    $('askf-thread').scrollTop = $('askf-thread').scrollHeight;

    try{
      const body = Object.assign(ctx(), {
        question,
        history,
        level: ($('askf-level')||{}).value || 'coach',
        still_confused: !!stillConfused,
      });
      const r = await fetch('/ask-forge', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body), credentials:'include'
      });
      const d = await r.json();
      thinking.remove();

      if(r.status === 402){
        bubble('note', d.message || 'Ask GM Forge is part of Pro.');
        chips([]); return;
      }
      if(d.answer){
        const b = bubble('forge', d.answer);
        const f = facts(d); if(f) b.appendChild(f);
        lastAnswer = d.answer;
        history.push({role:'user', content:question});
        history.push({role:'assistant', content:d.answer});
        if(history.length > 16) history = history.slice(-16);
      } else {
        const b = bubble('note', d.message || d.error || 'No answer available.');
        const f = facts(d); if(f) b.appendChild(f);
      }
      chips(d.suggested);
    }catch(e){
      thinking.remove();
      bubble('note', 'Could not reach GM Forge. Check your connection and try again.');
    }finally{
      busy = false;
      const s2 = $('askf-send'); if(s2) s2.disabled = false;
      const t = $('askf-thread'); if(t) t.scrollTop = t.scrollHeight;
    }
  }

  function open(){
    const p = $('askf'); if(!p) return;
    p.classList.remove('hidden');
    if(!history.length && !$('askf-thread').children.length){
      bubble('note', 'Ask me anything about this position — why a move failed, what you missed, '
                   + 'or what would have happened if you had played something else.');
      chips(['Why was that a mistake?', 'What was I missing?', 'What was my opponent threatening?']);
    }
  }
  function reset(){ history = []; lastAnswer = null;
    const t = $('askf-thread'); if(t) t.innerHTML = '';
    const c = $('askf-chips'); if(c) c.innerHTML = ''; }

  function init(){
    const f = $('askf-form');
    if(f) f.addEventListener('submit', (e)=>{ e.preventDefault(); ask(($('askf-input')||{}).value); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {ask, open, reset, init};
})();
window.AskForge = AskForge;

/* ═══════════════════════════════════════════════════════════════════════════
   Candidates — the moves you were weighing, captured with zero extra effort.

   Rather than inventing a marking gesture, this reads the right-click arrows
   players already draw while calculating. Draw an arrow, it becomes a candidate;
   when your move lands, GM Forge compares what you played, what you considered,
   and what the engine wanted — then folds that into a long-term thinking profile.
   ═══════════════════════════════════════════════════════════════════════════ */
const Candidates = (function(){
  const $ = (id)=>document.getElementById(id);

  function marked(){
    const b = window.BotState && BotState.board;
    if(!b || !b.userArrows) return [];
    return b.userArrows.map(a=>({from:a.from, to:a.to})).slice(0,6);
  }

  // Render the strip live as arrows are drawn, so the player sees it working.
  function paint(){
    const wrap = $('cand'), list = $('cand-list');
    if(!wrap || !list) return;
    const g = window.BotState && BotState.game;
    const arr = marked();
    if(!arr.length || !BotState.gameActive){ wrap.classList.add('hidden'); list.innerHTML=''; return; }
    list.innerHTML = arr.map(a=>{
      let label = a.from + '→' + a.to;
      try{                                  // show real SAN when it is legal
        const t = new Chess(g.fen());
        const mv = t.move({from:a.from, to:a.to, promotion:'q'});
        if(mv) label = mv.san;
      }catch(e){}
      return '<span class="cand-pill">' + esc(label) + '</span>';
    }).join('');
    wrap.classList.remove('hidden');
  }

  function clearVerdict(){ const v=$('cand-verdict'); if(v){ v.classList.add('hidden'); v.innerHTML=''; } }

  /* Called with the position BEFORE the move, and the move actually played. */
  async function review(fenBefore, playedSan, arrows){
    if(!arrows || !arrows.length) return;          // nothing marked, nothing to coach
    try{
      const r = await fetch('/candidates/review', {
        method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
        body: JSON.stringify({fen: fenBefore, played: playedSan, candidates: arrows})
      });
      const d = await r.json();
      if(!d.headline) return;
      const v = $('cand-verdict'); if(!v) return;
      v.innerHTML = '<b>' + esc(d.headline) + '</b>' + esc(d.detail || '')
        + (d.tags||[]).map(t=>'<span class="cand-tag">' + esc(t) + '</span>').join('');
      v.classList.remove('hidden');
    }catch(e){}
  }

  function reset(){ clearVerdict(); const w=$('cand'); if(w){w.classList.add('hidden');} const l=$('cand-list'); if(l) l.innerHTML=''; }

  // Poll rather than patching every arrow call site — cheap and always accurate.
  function init(){ setInterval(paint, 500); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {marked, paint, review, reset, clearVerdict};
})();
window.Candidates = Candidates;

/* ── Thinking Profile (Progress page) ─────────────────────────────────────── */
async function renderThinkingProfile(){
  const rows = document.getElementById('think-rows'); if(!rows) return;
  rows.innerHTML = '<div class="think-empty">Loading…</div>';
  try{
    const r = await fetch('/thinking-profile', {credentials:'include'});
    const d = await r.json();
    // The description lives behind the "?" and is static; the running numbers
    // get their own line so the two do not overwrite each other.
    const stats = document.getElementById('think-stats');
    if(stats){
      stats.textContent = d.samples
        ? ('Built from ' + d.samples + ' decision' + (d.samples===1?'':'s')
           + ' · ' + d.confidence + '% confidence'
           + (d.headline ? ' · biggest leak: ' + d.headline : ''))
        : '';
      stats.classList.toggle('hidden', !d.samples);
    }
    if(!d.dimensions || !d.dimensions.length){
      rows.innerHTML = '<div class="think-empty">Nothing to read yet. Play a coached game — '
        + 'every move you make, every game you finish and every question you ask GM Forge '
        + 'feeds this. Marking candidate moves with an arrow adds to it too.</div>';
      return;
    }
    rows.innerHTML = d.dimensions.map(x=>
      '<div class="think-row"><span class="think-name">' + esc(x.label) + '</span>'
      + '<span class="think-obs">' + x.rate + '%</span>'
      + '<span class="think-band ' + esc(x.band.toLowerCase().replace(' ','-')) + '">'
      + esc(x.band) + '</span></div>').join('');
  }catch(e){
    rows.innerHTML = '<div class="think-empty">Could not load your profile.</div>';
  }
}
window.renderThinkingProfile = renderThinkingProfile;

/* ═══════════════════════════════════════════════════════════════════════════
   CoachRail — the gutter left of the board, doing actual coaching work.

   Questions are generated from THIS position (what is genuinely hanging, what
   he is genuinely threatening, which piece is genuinely doing the least), so
   they stop being the same generic hint every move. And when you have arrows on
   the board, "Play them out" runs each candidate through the engine and shows
   you his reply on the board — you compare, rather than being told what to play.
   ═══════════════════════════════════════════════════════════════════════════ */
const CoachRail = (function(){
  const $ = (id)=>document.getElementById(id);
  let lastFen = null, busy = false, previews = [];

  async function refresh(){
    const g = window.BotState && BotState.game;
    const rail = $('crail');
    if(!rail || !g || !BotState.gameActive){ if(rail) rail.style.visibility='hidden'; return; }
    if(g.turn() !== BotState.playerColor[0]) return;      // only coach on your turn
    const fen = g.fen();
    if(fen === lastFen || busy) return;
    lastFen = fen; busy = true;
    rail.style.visibility = 'visible';
    try{
      const r = await fetch('/coach-rail', {method:'POST', headers:{'Content-Type':'application/json'},
        credentials:'include', body: JSON.stringify({fen})});
      const d = await r.json();
      const box = $('crail-items'); if(!box) return;
      box.innerHTML = (d.items||[]).map(it =>
        '<div class="crail-q" data-sq="' + esc((it.squares||[]).join(',')) + '">'
        + '<b>' + esc(it.q) + '</b><span>' + esc(it.detail||'') + '</span></div>').join('');
      // Tapping a question expands it and lights the squares it refers to.
      // Put the first question on the board itself so the player never has to
      // look away from the position to read it.
      const top = (d.items||[])[0];
      const strip = $('coachstrip'), sq = $('cs-q');
      if(strip && sq){
        if(top){
          sq.textContent = top.q;
          strip.dataset.detail = top.detail || '';
          strip.dataset.sq = (top.squares||[]).join(',');
          strip.classList.remove('hidden');
        } else { strip.classList.add('hidden'); }
      }
      box.querySelectorAll('.crail-q').forEach(el=>{
        el.addEventListener('click', ()=>{
          el.classList.toggle('open');
          const sqs = (el.dataset.sq||'').split(',').filter(Boolean);
          if(BotState.board && BotState.board.clearMarks){
            BotState.board.clearMarks();
            sqs.forEach(s=>BotState.board.highlight(s, '#5B6CFF'));
          }
        });
      });
    }catch(e){}finally{ busy = false; }
  }

  // Mirror the arrows you have drawn, so the candidate list is always live.
  function syncCandidates(){
    const wrap = $('crail-cands'), list = $('crail-cand-list');
    if(!wrap || !list) return;
    const arr = (window.Candidates ? Candidates.marked() : []);
    if(arr.length < 1 || !(window.BotState && BotState.gameActive)){
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    if(previews.length) return;                            // already played out
    list.innerHTML = arr.map(a=>{
      let label = a.from + '→' + a.to;
      try{ const t = new Chess(BotState.game.fen());
           const m = t.move({from:a.from, to:a.to, promotion:'q'}); if(m) label = m.san; }catch(e){}
      return '<div class="crail-cand"><span class="cc-move">' + esc(label) + '</span>'
           + '<span class="cc-reply">not played out yet</span></div>';
    }).join('');
  }

  async function playOut(){
    const arr = (window.Candidates ? Candidates.marked() : []);
    if(!arr.length) return;
    const btn = $('crail-play'); if(btn){ btn.disabled = true; btn.textContent = 'Playing them out…'; }
    try{
      const r = await fetch('/candidates/preview', {method:'POST', headers:{'Content-Type':'application/json'},
        credentials:'include', body: JSON.stringify({fen: BotState.game.fen(), candidates: arr})});
      const d = await r.json();
      previews = d.candidates || [];
      const list = $('crail-cand-list'); if(!list) return;
      list.innerHTML = previews.map((c,i)=>{
        const cls = c.gap === 0 ? 'best' : (c.gap < 0.6 ? 'mid' : 'bad');
        return '<div class="crail-cand" data-i="' + i + '">'
             + '<span class="cc-move">' + esc(c.move) + '</span>'
             + '<span class="cc-reply">he plays ' + esc(c.reply||'?') + '</span>'
             + '<span class="cc-gap ' + cls + '">' + (c.gap===0?'best of yours':('-'+c.gap)) + '</span></div>';
      }).join('');
      list.querySelectorAll('.crail-cand').forEach(el=>{
        el.addEventListener('click', ()=>walk(+el.dataset.i));
      });
      // Start walking immediately. This used to jump straight to "which was
      // better?", which then bailed out because nothing had been watched yet --
      // so pressing "Play them out" produced a list and nothing else, and the
      // walk-through only ran if you happened to click a row.
      seen = {};
      if(previews.length) walk(0);
    }catch(e){}finally{
      if(btn){ btn.disabled = false; btn.textContent = 'Play them out'; }
    }
  }

  /* ── Walk-through: play the candidate out ON the board, one move at a
     time, with a line of coaching for each — then let the player judge. ── */
  let walkIdx = -1, stepIdx = 0, seen = {};

  // The narration lives in the coach panel, not the thin strip above the board.
  // It is the same card shape as the think-it-through ladder, because it is the
  // same idea: watch the thing happen, then decide for yourself.
  function say(text, controls, title, step){
    const card = $('cwalk');
    if(!card){                                   // fall back to the strip
      const st = $('coachstrip'), q = $('cs-q');
      if(st && q){ st.classList.remove('hidden'); q.textContent = text; }
      return;
    }
    card.classList.remove('hidden');
    const t = $('cwalk-title'), s = $('cwalk-say'), n = $('cwalk-step'), o = $('cwalk-opts');
    if(n) n.textContent = step || '';
    if(t) t.textContent = title || 'Playing it out';
    if(s) s.textContent = text || '';
    if(o){
      o.innerHTML = controls || '';
      o.querySelectorAll('[data-act]').forEach(b=>{
        b.addEventListener('click', (e)=>{ e.stopPropagation(); onAct(b.dataset.act, b.dataset.val); });
      });
    }
  }
  function hideSay(){
    const card = $('cwalk'); if(card) card.classList.add('hidden');
  }

  function walk(i){
    const c = previews[i]; if(!c || !c.steps || !c.steps.length) return;
    walkIdx = i; stepIdx = 0; seen[c.move] = true;
    showStep();
  }
  function showStep(){
    const c = previews[walkIdx]; if(!c) return;
    const st = c.steps[stepIdx]; if(!st) return;
    // This is the point of the whole feature: the line is played out on the
    // real board, one move at a time, with a sentence for each.
    if(BotState.board) BotState.board.setPosition(st.fen, {animate:true});
    const last = stepIdx >= c.steps.length - 1;
    const which = (walkIdx + 1) + ' of ' + previews.length;
    say(st.say,
        (stepIdx > 0 ? '<button class="lopt half" data-act="prev">Back</button>' : '')
      + '<button class="lopt half" data-act="next">' + (last ? 'Done' : 'Next move') + '</button>'
      + '<button class="lopt ghost" data-act="stop">Back to the game</button>',
        'If you play ' + c.move,
        'Candidate ' + which + ' · move ' + (stepIdx + 1) + ' of ' + c.steps.length);
  }
  function onAct(act, val){
    if(act === 'next'){
      const c = previews[walkIdx];
      if(c && stepIdx < c.steps.length - 1){ stepIdx++; showStep(); }
      else stopWalk(true);
    } else if(act === 'prev'){
      if(stepIdx > 0){ stepIdx--; showStep(); }
    } else if(act === 'stop'){ stopWalk(false); }
    else if(act === 'go'){ walk(+val); }
    else if(act === 'pick'){ judge(val); }
    else if(act === 'unsure'){ notSure(); }
  }
  function stopWalk(finished){
    // Always put the real position back before doing anything else.
    if(BotState.board) BotState.board.setPosition(BotState.game.fen(), {animate:false});
    walkIdx = -1;
    if(!finished){ hideSay(); return; }          // they chose to leave
    // Roll straight into the next candidate they have not watched, so the
    // comparison happens without them having to drive it.
    const next = previews.findIndex(c=>!seen[c.move]);
    if(next >= 0){
      say('That is what ' + previews[next===0?0:next].move + ' would have to deal with. '
        + 'Now watch the other one, then you can compare them properly.',
        '<button class="lopt" data-act="go" data-val="' + next + '">Play out '
        + esc(previews[next].move) + '</button>'
        + '<button class="lopt ghost" data-act="stop">Back to the game</button>',
        'One down', 'Candidate ' + (next+1) + ' of ' + previews.length + ' left');
      return;
    }
    if(previews.length > 1) askWhichBest();
    else hideSay();
  }

  // How many times they have said "not sure". The answer is only ever revealed
  // on the second one, and only after a fuller explanation has been offered.
  let unsure = 0;

  function askWhichBest(){
    if(Object.keys(seen).length < previews.length) return;   // walk them all first
    unsure = 0;
    say('You have watched both lines play out on the board. Which one would you rather have?',
        options('<button class="lopt ghost" data-act="unsure">I am not sure</button>'),
        'So which was better?', 'Your call');
  }

  function options(extra){
    return previews.map(c=>'<button class="lopt" data-act="pick" data-val="'
                    + esc(c.move) + '">' + esc(c.move) + '</button>').join('') + (extra||'');
  }

  // Said "not sure": explain harder, then reveal — never straight to the answer.
  function notSure(){
    unsure++;
    const best = previews.reduce((a,b)=> b.eval > a.eval ? b : a);
    if(unsure === 1){
      const other = previews.find(c=>c.move !== best.move);
      let t = 'Then compare them on one thing only: after each move, what does he get to do? ';
      if(other && other.reply) t += 'Against ' + other.move + ' he plays ' + other.reply + '. ';
      if(best.reply)          t += 'Against ' + best.move + ' he plays ' + best.reply + '. ';
      t += 'Which of those two positions would you rather be in?';
      say(t, options('<button class="lopt ghost" data-act="unsure">Still not sure</button>'),
          'Compare them on one thing', 'Narrowing it down');
      return;
    }
    // Second time: give it, and say why, once more and concretely.
    const diff = Math.abs((best.eval||0) - Math.min(...previews.map(c=>c.eval||0)));
    let t = best.move + ' was the better move.';
    if(best.reply) t += ' He has to answer ' + best.reply + ', and that leaves you comfortable.';
    if(diff >= 0.5) t += ' The gap between the two is about ' + diff.toFixed(1) + ' pawns.';
    t += ' The habit worth keeping: pick the move whose worst reply you are happiest to face.';
    say(t, '<button class="lopt ghost" data-act="stop">Back to the game</button>',
        best.move + ' was the move', 'Here is why');
  }

  function judge(move){
    const best = previews.reduce((a,b)=> b.eval > a.eval ? b : a);
    const chosen = previews.find(c=>c.move === move);
    if(!chosen) return;
    if(chosen.move === best.move){
      say('You watched both lines and picked the one that holds up. That is exactly the habit '
        + 'worth building — judge a move by the position it leaves you in.',
        '<button class="lopt ghost" data-act="stop">Back to the game</button>',
        'Right — ' + chosen.move, 'Well judged');
      return;
    }
    // Wrong: send them back to the evidence. The old version put the correct
    // move inside the "Rethink" button, so clicking it handed over the answer.
    unsure++;
    if(unsure >= 2){ notSure(); return; }
    say('Not quite. Look again at what he answered ' + chosen.move + ' with — '
      + (chosen.reply || 'his reply') + '. Play it forward one more move in your head: '
      + 'what has he gained by then?',
      options('<button class="lopt ghost" data-act="unsure">I am still not sure</button>'),
      'Not quite — look again', 'Try once more');
  }

  function reset(){ previews = []; lastFen = null; walkIdx = -1; stepIdx = 0; seen = {}; unsure = 0;
    try{ hideSay(); }catch(e){}
    const l=$('crail-cand-list'); if(l) l.innerHTML='';
    const c=$('crail-cands'); if(c) c.classList.add('hidden');
    const it=$('crail-items'); if(it) it.innerHTML='';
    const st=$('coachstrip'); if(st){ st.classList.add('hidden'); st.classList.remove('open'); } }

  function init(){
    const b = $('crail-play'); if(b) b.addEventListener('click', playOut);
    // "?" expands the detail in place and lights the squares it refers to —
    // the board stays in view the whole time.
    const more = $('cs-more');
    if(more) more.addEventListener('click', ()=>{
      const strip = $('coachstrip'); if(!strip) return;
      strip.classList.toggle('open');
      let d = strip.querySelector('.cs-detail');
      if(strip.classList.contains('open')){
        if(!d){ d = document.createElement('span'); d.className = 'cs-detail'; strip.appendChild(d); }
        d.textContent = strip.dataset.detail || '';
        const sqs = (strip.dataset.sq||'').split(',').filter(Boolean);
        if(BotState.board && BotState.board.clearMarks){
          BotState.board.clearMarks();
          sqs.forEach(x=>BotState.board.highlight(x, '#5B6CFF'));
        }
      } else if(d){ d.remove(); if(BotState.board && BotState.board.clearMarks) BotState.board.clearMarks(); }
    });
    setInterval(()=>{ try{ refresh(); syncCandidates(); }catch(e){} }, 700);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  return {refresh, reset, playOut};
})();
window.CoachRail = CoachRail;

/* ═══════════════════════════════════════════════════════════════════════════
   Progress — the honest read on how you are actually playing.

   Solo games (no coach) drive the rating estimate and the blunder rate, because
   nobody is nudging you in those. Coached games still count toward totals but
   are kept out of the rating so it stays truthful.
   ═══════════════════════════════════════════════════════════════════════════ */
async function renderProgressReport(){
  const el = (id)=>document.getElementById(id);
  if(!el('pg-elo')) return;
  try{
    const r = await fetch('/progress/report', {credentials:'include'});
    const d = await r.json();
    if(d.error) return;

    el('pg-elo').textContent = d.est_elo || '—';
    el('pg-conf').textContent = d.est_elo
      ? (d.confidence + '% confident · ' + d.solo_games + ' solo game' + (d.solo_games===1?'':'s'))
      : 'Play a game without the coach and I can read your level.';

    // Confidence ring: 327 is the circumference at r=52.
    const ring = el('pg-ring');
    if(ring) ring.style.strokeDashoffset = String(327 - (327 * (d.confidence||0) / 100));
    const rn = el('pg-ringnum'); if(rn) rn.textContent = (d.confidence||0) + '%';

    const nu = el('pg-nudge'); if(nu) nu.textContent = d.nudge || '';

    // The trajectory, and the change it represents stated in words next to it.
    let traj = null;
    try{ traj = Traj.render(d.history || []); }catch(e){ console.error('Traj failed:', e); }
    const dl = el('pg-delta');
    if(dl){
      if(traj && traj.n >= 2){
        const dv = Math.round(traj.last - traj.first);
        dl.textContent = (dv > 0 ? '+' : '') + dv + (traj.rating ? '' : ' pts accuracy')
                       + ' over ' + traj.n + ' game' + (traj.n === 1 ? '' : 's');
        dl.className = 'traj-delta ' + (dv > 0 ? 'up' : dv < 0 ? 'down' : 'flat');
        dl.classList.remove('hidden');
      } else { dl.textContent = ''; dl.className = 'traj-delta hidden'; }
    }

    // The three numbers. Each carries its own direction, and the arrow is
    // labelled with the change so the colour is never doing the work alone.
    function kpi(vid, did, value, delta, better, suffix, invert){
      const v = el(vid); if(v) v.textContent = value;
      const dd = el(did); if(!dd) return;
      if(delta === null || delta === undefined || delta === 0){
        dd.textContent = ''; dd.className = 'kpi-d hidden'; return;
      }
      const good = (better === null || better === undefined)
        ? (invert ? delta < 0 : delta > 0) : better;
      const arrow = delta > 0 ? '▲' : '▼';
      dd.textContent = arrow + ' ' + Math.abs(delta) + (suffix || '');
      dd.className = 'kpi-d ' + (good ? 'good' : 'bad');
    }

    const a = d.accuracy || {};
    kpi('pg-accuracy', 'pg-accuracy-d',
        a.value == null ? '—' : a.value + '%', a.delta, a.better, ' pts');

    kpi('pg-blunder', 'pg-blunder-d',
        d.solo_games ? d.blunder_rate + '%' : '—',
        d.trend == null ? null : -d.trend, d.trend == null ? null : d.trend > 0, '');

    const hp = d.help || {};
    kpi('pg-help', 'pg-help-d',
        hp.value == null ? '—' : hp.value, hp.delta, hp.better, '');

    // Recent games: newest first.
    // This was a row of bars whose height was average centipawn loss, so taller
    // meant WORSE — the opposite of the chart directly above it — with red
    // meaning "more than one blunder" and nothing anywhere saying so. Colour
    // alone carrying meaning, on an axis pointing the wrong way. It is a short
    // list, so it is a list: each game says what it was in words.
    const sp = el('pg-spark');
    if(sp){
      const h = (d.history || []).slice().reverse();      // newest first
      if(!h.length){
        sp.innerHTML = '<span class="spark-empty">No games recorded yet.</span>';
      } else {
        const outcome = (r)=>{
          const t = String(r || '').toLowerCase();
          if(t.startsWith('you won')) return {k:'win',  s:'W', label:'Won'};
          if(t.includes('draw') || t.includes('stalemate') || t.includes('½'))
            return {k:'draw', s:'D', label:'Drew'};
          if(t) return {k:'loss', s:'L', label:'Lost'};
          return {k:'none', s:'·', label:'Unfinished'};
        };
        const accOf = a => Math.max(0, Math.min(100, Math.round(100 - (+a || 0) / 1.6)));
        sp.innerHTML = h.map(x=>{
          const o = outcome(x.result);
          const acc = accOf(x.acpl);
          const bl = +x.blunders || 0;
          return '<div class="gamerow">'
            + '<span class="gr-res ' + o.k + '" title="' + o.label + '">' + o.s + '</span>'
            + '<span class="gr-acc"><b>' + acc + '%</b><i>accuracy</i></span>'
            + '<span class="gr-bl' + (bl ? ' has' : '') + '"><b>' + bl + '</b><i>blunder'
            + (bl === 1 ? '' : 's') + '</i></span>'
            + '<span class="gr-mode">' + esc(x.mode || '') + '</span>'
            + '<span class="gr-date">' + esc(x.d || '') + '</span>'
            + '</div>';
        }).join('');
      }
    }

    const pp = el('pg-pats');
    if(pp){
      const P = d.patterns || [];
      if(!P.length) pp.innerHTML = '<span class="spark-empty">Nothing repeating yet — play a few games and I will find it.</span>';
      else {
        const top = Math.max(...P.map(x=>x.count), 1);
        pp.innerHTML = P.map(x=>'<div class="ppat"><span class="ppat-n">' + esc(x.name) + '</span>'
          + '<span class="ppat-bar"><i style="width:' + Math.round(x.count/top*100) + '%"></i></span>'
          + '<span class="ppat-c">' + x.count + '</span></div>').join('');
      }
    }
  }catch(e){}
}
window.renderProgressReport = renderProgressReport;

/* One line on the Play screen: what to work on today. */
async function loadDailyNudge(){
  const box = document.getElementById('crail-daily'); if(!box) return;
  try{
    const r = await fetch('/daily-nudge', {credentials:'include'});
    const d = await r.json();
    if(d.error || !d.message){ box.classList.add('hidden'); return; }
    box.textContent = d.message + (d.streak ? '  ·  ' + d.streak + ' day streak' : '');
    box.classList.remove('hidden');
  }catch(e){ box.classList.add('hidden'); }
}
window.loadDailyNudge = loadDailyNudge;
