/* ChessForge Pro v6 — Complete JS */
const PIECE_THEME = 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png';

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
  State.onboarding=d.onboarding||null;
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
  // Games auto-save now
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
    if(name==='coach'||name==='bot')initCoachPage();
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
const _sgb=document.getElementById('save-game-btn'); if(_sgb) _sgb.addEventListener('click',async()=>{
  if(!State.loggedIn){showAuthModal();return;}
  if(!State.lastPGN){const b=document.getElementById('save-game-btn')||{textContent:'',textContent:''};if(!document.getElementById('save-game-btn'))return;b.textContent='⚠ Analyse a game first!';setTimeout(()=>b.textContent='💾 Save Game',2000);return;}
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
      dot.style.cssText = 'position:absolute;inset:0;border:4px solid rgba(0,212,255,.7);border-radius:50%;pointer-events:none;z-index:100;box-sizing:border-box';
    } else {
      // Move dot
      dot.style.cssText = 'position:absolute;width:34%;height:34%;background:rgba(0,212,255,.5);border-radius:50%;top:33%;left:33%;pointer-events:none;z-index:100';
    }
    el.style.position = 'relative';
    el.appendChild(dot);
  });
}

function initPuzzleBoard(){
  if(State.boardsReady.puzzle&&State.puzzleBoard){if(State.puzzles.length)loadPuzzle(State.puzzleIdx);return;}
  if(State.puzzleBoard){try{State.puzzleBoard.destroy();}catch(e){}}
  State.puzzleGame=new Chess();
  State.puzzleBoard=Chessboard('puzzle-board',{
    position:'start',
    draggable:true,
    pieceTheme:PIECE_THEME,
    onDrop:handlePuzzleDrop,
    onSnapEnd:()=>{if(State.puzzleGame)State.puzzleBoard.position(State.puzzleGame.fen());},
    onSquareClick:handlePuzzleSquareClick,
    onMouseoverSquare: onMouseoverPuzzleSquare,
    onMouseoutSquare: onMouseoutPuzzleSquare,
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
  highlightSquare(square, 'rgba(0,212,255,.25)', 'puzzle-board');
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
      State.puzzleBoard.position(State.puzzleGame.fen(), false);
      checkPuzzleMove(mv, src, square);
    } else {
      // Not a valid move — maybe user clicked another own piece
      if(piece && piece.color === turn){
        State.selectedSquare = square;
        highlightSquare(square, 'rgba(0,212,255,.4)', 'puzzle-board');
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
    highlightSquare(square, 'rgba(0,212,255,.4)', 'puzzle-board');
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
    status.textContent = '✅ Correct! Well done!';
    status.style.color = 'var(--green)';
    State.puzzleCorrect++;
    awardXP(50,'puzzle');
  } else {
    status.textContent = `❌ Not quite (${mv.san}) — try again!`;
    status.style.color = 'var(--red)';
    State.puzzleWrong++;
    State.puzzleGame.undo();
    State.puzzleBoard.position(State.puzzleGame.fen(), false);
  }
  document.getElementById('p-correct').textContent = State.puzzleCorrect;
  document.getElementById('p-wrong').textContent = State.puzzleWrong;
}

function clearHighlights(){ clearAllHighlights('puzzle-board'); }

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
  if(!State.puzzleGame) return 'snapback';
  clearAllHighlights('puzzle-board');
  const mv = State.puzzleGame.move({from:src, to:tgt, promotion:'q'});
  if(!mv) return 'snapback';
  checkPuzzleMove(mv, src, tgt);
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
    item.innerHTML=`<div class="lesson-nav-title">${L.icon} ${L.title}</div><div class="lesson-nav-tag">${i===0&&State.lessonOrder.length?'⭐ Priority':('Lesson '+(i+1))}</div>`;
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
  BotState.playerColor = document.getElementById('bot-color').value;
  BotState.game = new Chess();
  BotState.moveHistory = [];
  BotState.gameActive = true;
  BotState.thinking = false;
  BotState.lastBotSan = '';
  BotState.lastPlayerMove = null;
  BotState.lastBotMove = null;
  BotState.board.orientation(BotState.playerColor);
  BotState.board.position('start', false);
  document.getElementById('bot-move-history').innerHTML = '';
  document.getElementById('bot-review-card').classList.add('hidden');
  BoardOverlay.setOrientation(BotState.playerColor);
  setTimeout(()=>BoardOverlay.syncSize(), 80);
  BoardOverlay.clear();
  Coach.reset();
  const estElo = getEloFromAnalysis();
  const eloStr = estElo ? ` · ~${estElo} ELO` : '';
  setBotStatus('Game on' + eloStr + (BotState.playerColor==='white' ? ' — you play White, make your move!' : ' — you play Black, bot is moving…'));
  enableCoachButtons(true);
  if(State.coachMode==='coached'){
    Coach.setStatus('Watching the board');
    Coach.renderQuestions(['Game on. Take your time before every move — I\'ll be asking questions and pointing things out.']);
    // If player to move first (white), kick off coach question immediately
    if(BotState.playerColor === 'white'){
      setTimeout(()=>Coach.afterBotMove(''), 350);
    }
  }
  if(BotState.playerColor === 'black'){
    setTimeout(makeBotMove, 800);
  }
}

function handleBotSquareClick(square){
  if(!BotState.gameActive || BotState.thinking) return;
  if(BotState.boardLocked){ ChessSFX.playWrong(); return; }
  if(BotState.game.turn() !== BotState.playerColor[0]) return;
  const piece = BotState.game.get(square);
  // Same square clicked → deselect
  if(BotState.selectedSquare === square){
    BotState.selectedSquare = null;
    clearBotHighlights(); paintLastMove();
    return;
  }
  // We have a selection and clicked a target
  if(BotState.selectedSquare){
    const src = BotState.selectedSquare;
    const mv = BotState.game.move({from:src, to:square, promotion:'q'});
    if(mv){
      BotState.selectedSquare = null;
      const fenBefore = (function(){ const t=new Chess(); t.load(BotState.game.fen()); t.undo(); return t.fen(); })();
      ChessSFX.playMove(mv);
      BotState.board.position(BotState.game.fen());
      BotState.lastPlayerMove = {from: src, to: square};
      clearBotHighlights(); paintLastMove();
      addBotMove(mv.san, src+square);
      BoardOverlay.clear();
      if(State.coachMode==='coached') Coach.afterPlayerMove(fenBefore, mv.san);
      checkBotGameOver();
      if(!BotState.game.game_over()) setTimeout(makeBotMove, State.coachMode==='coached' ? 1200 : 600);
      return;
    }
    // Not a legal move — if clicked own piece, switch selection
    if(piece && piece.color === BotState.playerColor[0]){
      BotState.selectedSquare = square;
      clearBotHighlights(); paintLastMove();
      highlightBotMoves(square);
      ChessSFX.playSelect();
      return;
    }
    // Clicked empty/enemy square that's not a legal target → just deselect
    BotState.selectedSquare = null;
    clearBotHighlights(); paintLastMove();
    return;
  }
  // No prior selection — select if it's our piece
  if(piece && piece.color === BotState.playerColor[0]){
    BotState.selectedSquare = square;
    clearBotHighlights(); paintLastMove();
    highlightBotMoves(square);
    ChessSFX.playSelect();
  }
}

function highlightBotMoves(square){
  const moves = BotState.game.moves({square, verbose:true});
  // Selected square ring
  document.querySelectorAll(`#bot-board [data-square="${square}"]`).forEach(el=>el.classList.add('cf-selected'));
  moves.forEach(m=>{
    document.querySelectorAll(`#bot-board [data-square="${m.to}"]`).forEach(el=>{
      const isCapture = !!BotState.game.get(m.to) || m.flags.includes('e');
      const mark = document.createElement('div');
      mark.className = isCapture ? 'cf-move-ring' : 'cf-move-dot';
      el.appendChild(mark);
    });
  });
}

function clearBotHighlights(){
  document.querySelectorAll('#bot-board .cf-selected').forEach(el=>el.classList.remove('cf-selected'));
  document.querySelectorAll('#bot-board .cf-check').forEach(el=>el.classList.remove('cf-check'));
  document.querySelectorAll('#bot-board .cf-move-dot, #bot-board .cf-move-ring').forEach(el=>el.remove());
  // also clear any stale inline boxShadow from older code
  document.querySelectorAll('#bot-board [data-square]').forEach(el=>{ if(el.style.boxShadow) el.style.boxShadow=''; });
}

function paintLastMove(){
  document.querySelectorAll('#bot-board .cf-last-move').forEach(el=>el.classList.remove('cf-last-move'));
  const m = BotState.lastPlayerMove || BotState.lastBotMove;
  if(!m) return;
  document.querySelectorAll(`#bot-board [data-square="${m.from}"], #bot-board [data-square="${m.to}"]`).forEach(el=>el.classList.add('cf-last-move'));
  // King-in-check glow
  if(BotState.game && BotState.game.in_check()){
    const turn = BotState.game.turn();
    // Find king square of side to move
    for(const f of 'abcdefgh'){
      for(let r=1;r<=8;r++){
        const sq = f+r;
        const p = BotState.game.get(sq);
        if(p && p.type==='k' && p.color===turn){
          document.querySelectorAll(`#bot-board [data-square="${sq}"]`).forEach(el=>el.classList.add('cf-check'));
        }
      }
    }
  }
}

function handleBotDrop(src, tgt){
  if(!BotState.gameActive || BotState.thinking) return 'snapback';
  if(BotState.boardLocked){ ChessSFX.playWrong(); return 'snapback'; }
  if(BotState.game.turn() !== BotState.playerColor[0]) return 'snapback';
  const fenBefore = BotState.game.fen();
  const mv = BotState.game.move({from:src, to:tgt, promotion:'q'});
  if(!mv) return 'snapback';
  ChessSFX.playMove(mv);
  BotState.selectedSquare = null;
  BotState.lastPlayerMove = {from: src, to: tgt};
  clearBotHighlights(); paintLastMove();
  BoardOverlay.clear();
  addBotMove(mv.san, src+tgt);
  if(State.coachMode==='coached'){
    Coach.afterPlayerMove(fenBefore, mv.san);
  }
  checkBotGameOver();
  if(!BotState.game.game_over()){
    setTimeout(makeBotMove, State.coachMode==='coached' ? 1200 : 700);
  }
}

async function makeBotMove(){
  if(!BotState.gameActive || BotState.game.game_over()) return;
  BotState.thinking = true;
  setBotStatus('🤖 Bot is thinking…');
  try{
    const estElo = getEloFromAnalysis() || 1200;
    const r = await fetch('/bot-move', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({fen: BotState.game.fen(), weaknesses: BotState.weaknesses, elo: estElo}),
      credentials:'include'
    });
    const d = await r.json();
    if(d.error || !d.move){ setBotStatus('Bot error — your turn!'); BotState.thinking=false; return; }
    const mv = BotState.game.move({from:d.move.slice(0,2), to:d.move.slice(2,4), promotion:'q'});
    if(mv){
      BotState.board.position(BotState.game.fen(), true);
      ChessSFX.playMove(mv);
      addBotMove(mv.san, d.move, true);
      BotState.lastBotSan = mv.san;
      BotState.lastBotMove = {from: d.move.slice(0,2), to: d.move.slice(2,4)};
      BotState.lastPlayerMove = null; // bot move takes precedence visually
      setTimeout(()=>paintLastMove(), 220);
      if(d.in_check){
        setBotStatus('♟ Bot played ' + mv.san + ' — You are in CHECK!');
      } else {
        setBotStatus('♟ Bot played ' + mv.san + ' — Your turn.');
      }
      if(State.coachMode==='coached' && !BotState.game.game_over()){
        setTimeout(()=>Coach.afterBotMove(mv.san), 350);
      }
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
  enableCoachButtons(false);
  BoardOverlay.clear();
  let result = '';
  if(BotState.game.in_checkmate()){
    const winner = BotState.game.turn() === 'w' ? 'Black' : 'White';
    const playerWon = (winner === 'White' && BotState.playerColor === 'white') || (winner === 'Black' && BotState.playerColor === 'black');
    result = playerWon ? '🎉 You won by checkmate!' : '😔 Bot won by checkmate.';
  } else if(BotState.game.in_stalemate()){ result = '½ Stalemate — draw!'; }
  else if(BotState.game.in_draw()){ result = '½ Draw!'; }
  setBotStatus(result);
  Coach.setStatus('Game over');
  Coach.renderQuestions(['Game over. Click "Train These Positions" when the review finishes — those puzzles come from THIS game.']);
  showBotReview();
  // Auto-launch post-game review
  if(State.coachMode==='coached'){
    setTimeout(()=>runPostgameReview(), 600);
  }
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
      btn.textContent = '✅ Copied to clipboard!';
      btn.style.color = 'var(--green)';
      btn.style.borderColor = 'var(--green)';
      setTimeout(()=>{btn.textContent='📋 Copy PGN';btn.style.color='';btn.style.borderColor='';}, 2500);
    }
  } catch(e) {
    // Try clipboard API as fallback
    if(navigator.clipboard){
      navigator.clipboard.writeText(pgn).then(()=>{
        if(btn){btn.textContent='✅ Copied!';setTimeout(()=>btn.textContent='📋 Copy PGN',2500);}
      });
    }
  }
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
// Onboarding is driven by server state (State.onboarding). New users are guided
// through the calibration flow; existing users are marked complete server-side.
function checkOnboarding(){
  if(!State.loggedIn) return;
  const ob = State.onboarding;
  if(ob && ob.new_user && !ob.complete){
    Onboarding.start();
  }
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
        <div class="locked-lesson-icon">⭐</div>
        <h3>Personal Game Lessons</h3>
        <p>Upgrade to Pro to unlock interactive lessons built directly from YOUR games — with multiple choice questions, personalised theory, and coaching from your actual mistakes.</p>
        <button class="btn-cyan" onclick="goToPro()" style="width:auto;margin:0 auto">Upgrade to Pro →</button>
      </div>`;
    container.insertBefore(premDiv, container.firstChild);
    return;
  }

  if(!hasData){
    premDiv.innerHTML = `
      <div class="locked-lesson">
        <div class="locked-lesson-icon">📊</div>
        <h3>Personal Game Lessons</h3>
        <p>Analyse a game first — ChessForge will build an interactive lesson from your specific mistakes.</p>
        <button class="btn-outline" onclick="showPage('analyze')">Analyse a Game →</button>
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

  const stepsHTML = content.steps.map((s,i)=>`<div style="display:flex;gap:.7rem;align-items:flex-start;margin-bottom:.5rem;font-size:.85rem;color:var(--muted)"><span style="background:var(--cyan);color:#000;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;flex-shrink:0">${i+1}</span>${s}</div>`).join('');

  premDiv.innerHTML = `
    <div class="premium-lesson-card">
      <div class="premium-lesson-badge">⭐ Your Personal Lesson — Based on ${gamesAnalysed} Game${gamesAnalysed!==1?'s':''}</div>
      <div class="premium-lesson-title">${content.title}</div>
      <div style="background:var(--bg3);border-radius:8px;padding:1rem;margin:1rem 0;font-size:.87rem;color:var(--muted);line-height:1.7">${content.theory}</div>
      <div class="card-label" style="margin-bottom:.6rem">The 3-Step Fix</div>
      ${stepsHTML}
      <div style="background:var(--cyan-dim);border-left:2px solid var(--cyan);padding:.7rem 1rem;border-radius:0 8px 8px 0;margin:1rem 0;font-size:.85rem;color:var(--cyan)">
        💡 <strong>Key lesson:</strong> ${content.keyLesson}
      </div>
      <div class="card-label" style="margin-top:1.2rem;padding-top:1.2rem;border-top:1px solid var(--border)">🧠 Test Your Understanding</div>
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
    area.innerHTML = `<div style="color:var(--green);font-size:.95rem;font-weight:600;padding:1rem 0">🎉 Quiz complete! Score: ${window._premiumMCQScore}/${mcq?mcq.length:0}. Great work!</div>`;
    return;
  }
  const q = mcq[idx];
  const optsHTML = q.opts.map((o,i)=>`
    <button onclick="answerPremiumMCQ(${i})" style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text);font-family:Inter,sans-serif;font-size:.85rem;padding:.6rem 1rem;border-radius:8px;cursor:pointer;text-align:left;margin-bottom:.4rem;transition:all .2s" onmouseover="this.style.borderColor='var(--cyan)'" onmouseout="this.style.borderColor='var(--border)'">${o}</button>
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
  feedback.innerHTML = chosen===correct ? '✅ Correct! ' : `❌ The correct answer is: <strong>${q.opts[correct]}</strong>. `;
  area.appendChild(feedback);
  const nextBtn = document.createElement('button');
  nextBtn.textContent = idx+1 < mcq.length ? 'Next Question →' : 'Finish Quiz';
  nextBtn.style.cssText = 'margin-top:.6rem;background:var(--cyan);color:#000;border:none;border-radius:8px;padding:.5rem 1.2rem;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;';
  nextBtn.onclick = ()=>{ window._premiumMCQIdx++; showPremiumMCQ(window._premiumMCQIdx); };
  area.appendChild(nextBtn);
}

function showPremiumStep(idx){
  const steps = window._premiumLessonSteps;
  if(!steps || idx >= steps.length) return;
  document.getElementById('prem-lesson-text').textContent = steps[idx].text;
  document.querySelectorAll('.premium-lesson-step').forEach((el,i)=>{
    el.classList.toggle('active', i===idx);
  });
}



/* ── Coach Page ───────────────────────────────────────────────────────────── */
function setBotMode(mode){
  State.coachMode = mode;
  document.getElementById('mode-coached').classList.toggle('active', mode==='coached');
  document.getElementById('mode-free').classList.toggle('active', mode==='free');
  const panel = document.getElementById('coach-panel');
  if(panel) panel.style.opacity = mode==='coached' ? '1' : '0.55';
  Coach.renderQuestions([
    mode==='coached'
      ? 'Coached mode active. I\'ll ask questions and point at the board on every move.'
      : 'Free play mode — no hints. Just play your best chess.'
  ]);
}

function initCoachPage(){
  if(!document.getElementById('bot-board')) return;
  if(BotState.board) return;
  BotState.board = Chessboard('bot-board', {
    position: 'start',
    draggable: true,
    pieceTheme: PIECE_THEME,
    moveSpeed: 180,
    snapSpeed: 80,
    snapbackSpeed: 140,
    appearSpeed: 140,
    onDragStart: (src, piece)=>{
      if(!BotState.gameActive || BotState.thinking) return false;
      if(BotState.boardLocked){ ChessSFX.playWrong(); return false; }
      if(BotState.game.turn() !== BotState.playerColor[0]) return false;
      if(piece[0] !== BotState.playerColor[0]) return false;
      BotState.selectedSquare = src;
      clearBotHighlights(); paintLastMove();
      highlightBotMoves(src);
    },
    onDrop: handleBotDrop,
    onSnapEnd: ()=>{ if(BotState.game) BotState.board.position(BotState.game.fen()); paintLastMove(); },
    onSquareClick: handleBotSquareClick,
    onMouseoverSquare: sq=>{
      if(BotState.selectedSquare || !BotState.gameActive) return;
      if(BotState.game.turn() !== BotState.playerColor[0]) return;
      const p = BotState.game.get(sq);
      if(p && p.color === BotState.playerColor[0]){
        document.querySelectorAll(`#bot-board [data-square="${sq}"]`).forEach(el=>el.classList.add('cf-hover-piece'));
      }
    },
    onMouseoutSquare: sq=>{
      document.querySelectorAll(`#bot-board [data-square="${sq}"]`).forEach(el=>el.classList.remove('cf-hover-piece'));
    }
  });
  if(State.analysisData){
    BotState.weaknesses = (State.analysisData.top_weaknesses||[]).map(([n])=>n);
  }
  BoardOverlay.init('bot-board','gm-overlay');
  window.addEventListener('resize', ()=>{ BoardOverlay.repaint(); if(BotState.board) BotState.board.resize(); });
}

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

function enableCoachButtons(on){
  ['hint-btn-coach','explain-btn-coach','quiz-btn-coach'].forEach(id=>{
    const btn = document.getElementById(id);
    if(btn) btn.disabled = !on;
  });
}

/* ── Board Overlay (arrows + highlights) ──────────────────────────────────── */
const BoardOverlay = (function(){
  let boardEl=null, svgEl=null, arrowsG=null, highlightsG=null;
  let flipped=false;
  const fileToX = (f,size)=> (flipped ? 7-f : f) * (size/8) + (size/16);
  const rankToY = (r,size)=> (flipped ? r : 7-r) * (size/8) + (size/16);
  const squareToXY = (sq, size)=>{
    const f = sq.charCodeAt(0) - 97;
    const r = parseInt(sq[1],10) - 1;
    return [fileToX(f,size), rankToY(r,size)];
  };
  function init(boardId, overlayId){
    boardEl = document.getElementById(boardId);
    svgEl   = document.getElementById(overlayId);
    if(!svgEl) return;
    arrowsG = document.getElementById('overlay-arrows');
    highlightsG = document.getElementById('overlay-highlights');
    syncSize();
  }
  function syncSize(){
    if(!boardEl||!svgEl) return;
    const board = boardEl.querySelector('.board-b72b1') || boardEl.querySelector('table') || boardEl;
    if(!board) return;
    const rect = board.getBoundingClientRect();
    const wrap = boardEl.parentElement;
    if(!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    svgEl.style.left = (rect.left - wrapRect.left) + 'px';
    svgEl.style.top  = (rect.top - wrapRect.top) + 'px';
    svgEl.style.width  = rect.width + 'px';
    svgEl.style.height = rect.height + 'px';
    svgEl.setAttribute('viewBox','0 0 800 800');
  }
  function setOrientation(color){ flipped = (color === 'black'); repaint(); }
  let lastArrows=[], lastHighlights=[];
  function drawArrows(arrows){
    lastArrows = arrows || [];
    if(!arrowsG) return;
    arrowsG.innerHTML = '';
    const size = 800;
    (arrows||[]).forEach(a=>{
      if(!a||!a.from||!a.to) return;
      const [x1,y1] = squareToXY(a.from,size);
      const [x2,y2] = squareToXY(a.to,size);
      // Trim end so arrowhead doesn't cover the target square
      const dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy);
      const tx = x2 - (dx/len)*22, ty = y2 - (dy/len)*22;
      const ns='http://www.w3.org/2000/svg';
      const line = document.createElementNS(ns,'line');
      line.setAttribute('x1',x1); line.setAttribute('y1',y1);
      line.setAttribute('x2',tx); line.setAttribute('y2',ty);
      line.setAttribute('class','overlay-arrow');
      line.setAttribute('stroke',a.color||'#ff7043');
      line.setAttribute('marker-end','url(#arrow-head)');
      line.style.color = a.color || '#ff7043';
      arrowsG.appendChild(line);
    });
  }
  function drawHighlights(highlights){
    lastHighlights = highlights || [];
    if(!highlightsG) return;
    highlightsG.innerHTML = '';
    const size = 800, sq = size/8;
    (highlights||[]).forEach(h=>{
      if(!h||!h.square) return;
      const [cx,cy] = squareToXY(h.square,size);
      const ns='http://www.w3.org/2000/svg';
      const circle = document.createElementNS(ns,'circle');
      circle.setAttribute('cx',cx); circle.setAttribute('cy',cy);
      circle.setAttribute('r', sq*0.42);
      circle.setAttribute('class','overlay-highlight');
      circle.setAttribute('stroke', h.color||'#26d07c');
      circle.style.color = h.color||'#26d07c';
      circle.setAttribute('fill','transparent');
      highlightsG.appendChild(circle);
      // Pointing hand pseudo-pointer above square
      if(h.label === 'target' || h.label === 'vulnerable'){
        const txt = document.createElementNS(ns,'text');
        txt.setAttribute('x', cx);
        txt.setAttribute('y', cy - sq*0.55);
        txt.setAttribute('text-anchor','middle');
        txt.setAttribute('class','overlay-hand');
        txt.textContent = '👉';
        highlightsG.appendChild(txt);
      }
    });
  }
  function clear(){ drawArrows([]); drawHighlights([]); }
  function repaint(){ syncSize(); drawArrows(lastArrows); drawHighlights(lastHighlights); }
  return {init,drawArrows,drawHighlights,clear,setOrientation,repaint,syncSize};
})();

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
  function renderPositionBadge(type){
    const el = document.getElementById('coach-position-badge');
    if(!el) return;
    if(!type){ el.classList.add('hidden'); return; }
    const labels = {
      opening:'📖 Opening',
      tactical:'⚡ Tactical Moment',
      positional:'♟ Strategic Decision',
      endgame:'🏁 Endgame',
      critical_decision:'🔥 Critical Moment',
    };
    el.textContent = labels[type] || type;
    el.className = 'gm-position-badge ' + type;
  }
  function renderTheory(theory){
    const el = document.getElementById('coach-theory');
    if(!el) return;
    if(!theory || !theory.length){ el.classList.add('hidden'); el.innerHTML=''; return; }
    el.innerHTML = theory.map(t=>{
      const icon = t.type==='opening' ? '📖' : '🎯';
      return `<span class="gm-chip ${esc(t.type)}"><span class="gm-chip-icon">${icon}</span>${esc(t.label)}</span>`;
    }).join('');
    el.classList.remove('hidden');
  }
  function reset(){
    renderQuestions(['Watching the board…']);
    renderFeedback('', '');
    renderPositionBadge(null);
    renderTheory([]);
    BoardOverlay.clear();
    setThinking(false);
    BotState.boardLocked = false;
    showBoardLock(false);
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
    BoardOverlay.setOrientation(BotState.playerColor);
    try{
      const r = await fetch('/coach-question', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          fen: BotState.game.fen(),
          weaknesses: BotState.weaknesses,
          last_bot_san: lastBotSan||'',
          played_moves: getPlayedSAN(),
        }),
        credentials:'include'
      });
      const d = await r.json();
      renderQuestions(d.questions || []);
      renderFeedback('', '');
      renderPositionBadge(d.position_type || null);
      renderTheory(d.theory || []);
      BoardOverlay.drawArrows(d.arrows||[]);
      BoardOverlay.drawHighlights(d.highlights||[]);
      updateEvalBar(d.eval||0);
      setStatus('Your turn — what\'s the plan?');
      if(d.mcq && d.mcq.force){
        // Force engagement: lock board, force MCQ answer before play continues
        MCQ.open(d.mcq, null, /*force*/true);
      }
    }catch(e){
      renderQuestions(['Take your time. What does the position need?']);
    }
    setThinking(false);
  }
  async function afterPlayerMove(fenBefore, sanPlayed){
    if(State.coachMode !== 'coached') return;
    setStatus('Reviewing your move');
    setThinking(true);
    try{
      const r = await fetch('/coach-move-feedback', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          fen_before: fenBefore,
          san_played: sanPlayed,
          weaknesses: BotState.weaknesses,
          played_moves: getPlayedSAN().slice(0,-1),  // exclude the just-played move
        }),
        credentials:'include'
      });
      const d = await r.json();
      // Silent mode — coach stays quiet on routine moves
      if(d.silent){
        renderFeedback('', '');
        BoardOverlay.clear();
        if(typeof d.eval_after === 'number') updateEvalBar(d.eval_after);
        setStatus(d.severity==='best' ? 'Top move ✓' : 'Solid move');
        setThinking(false);
        return;
      }
      renderFeedback(d.commentary || '', d.severity || '');
      BoardOverlay.drawArrows(d.arrows||[]);
      BoardOverlay.drawHighlights(d.highlights||[]);
      if(typeof d.eval_after === 'number') updateEvalBar(d.eval_after);
      if(d.severity === 'blunder' || d.severity === 'mistake'){
        setStatus(d.severity==='blunder'?'Blunder spotted':'Mistake — let\'s learn');
        if(d.mcq && d.mcq.force) setTimeout(()=>MCQ.open(d.mcq, sanPlayed, true), 500);
      } else if(d.severity === 'inaccuracy') setStatus('Slight inaccuracy');
      else setStatus('Watching the board');
    }catch(e){
      // Fail-safe: never soft-lock the user
      renderFeedback('', '');
      BotState.boardLocked = false;
      showBoardLock(false);
    }
    setThinking(false);
  }
  async function ask(type){
    if(!BotState.gameActive) return;
    setThinking(true);
    if(type === 'quiz'){
      try{
        const r = await fetch('/coach-question', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            fen: BotState.game.fen(),
            weaknesses: BotState.weaknesses,
            last_bot_san: BotState.lastBotSan||'',
            played_moves: getPlayedSAN(),
          }),
          credentials:'include'
        });
        const d = await r.json();
        if(d.mcq){ MCQ.open(d.mcq, null, true); }
        else renderFeedback('No clear quiz move here — position is balanced. Look for the long-term plan.','ok');
      }catch(e){}
      setThinking(false);
      return;
    }
    try{
      const r = await fetch('/coach-position', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({fen: BotState.game.fen(), weaknesses: BotState.weaknesses, type}),
        credentials:'include'
      });
      const d = await r.json();
      renderFeedback(d.message || '', type==='hint'?'inaccuracy':'ok');
      updateEvalBar(d.eval||0);
    }catch(e){}
    setThinking(false);
  }
  return {afterBotMove, afterPlayerMove, ask, reset, renderQuestions, renderFeedback, setStatus, setThinking, renderPositionBadge, renderTheory};
})();

/* Board lock — force engagement when an MCQ is open */
function showBoardLock(on){
  const el = document.getElementById('board-lock');
  if(!el) return;
  el.classList.toggle('hidden', !on);
}

function askCoach(type){ Coach.ask(type); }

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
  const pgn = getBotPGN();
  try{
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
      <div class="pg-detail"><span class="played">${esc(m.san)}</span> → engine: <span class="best">${esc(m.best_move||'?')}</span></div>
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
const FB_PIECES = {
  p:'<circle cx="22.5" cy="14" r="6"/><path d="M18.5 24 L26.5 24 L29 40 L16 40 Z"/><rect x="13.5" y="38" width="18" height="4.5" rx="1.5"/>',
  r:'<path d="M15 20 L30 20 L28.5 39 L16.5 39 Z"/><rect x="13.5" y="16" width="18" height="5"/><rect x="14" y="9" width="4.5" height="5"/><rect x="20.25" y="9" width="4.5" height="5"/><rect x="26.5" y="9" width="4.5" height="5"/><rect x="12" y="38" width="21" height="4.5" rx="1.5"/>',
  n:'<path d="M12 41 L33 41 C33 32 32 27 28 23 C31 21 31 16 28 13 L29 8 L24.5 11 C22 9 18 9 15 12 C12.5 14.5 11 17 9 18 C7.5 19 7 21 8.5 22 C10 23 12 22 13 21 C13 24 12 27 12.5 31 C12.5 35 12 38 12 41 Z"/><rect x="11" y="38" width="23" height="4.5" rx="1.5"/>',
  b:'<circle cx="22.5" cy="7.5" r="2.2"/><path d="M22.5 10 C27 14 27.5 20 22.5 25 C17.5 20 18 14 22.5 10 Z"/><path d="M17.5 25 L27.5 25 L29 39 L16 39 Z"/><rect x="13.5" y="38" width="18" height="4.5" rx="1.5"/>',
  q:'<circle cx="12" cy="15" r="2.4"/><circle cx="22.5" cy="12" r="2.4"/><circle cx="33" cy="15" r="2.4"/><path d="M12 16 L15.5 25 L29.5 25 L33 16 L27.5 21 L22.5 13.5 L17.5 21 Z"/><path d="M15.5 25 L29.5 25 L28 39 L17 39 Z"/><rect x="12" y="38" width="21" height="4.5" rx="1.5"/>',
  k:'<rect x="21" y="4" width="3" height="9"/><rect x="18" y="7" width="9" height="3"/><path d="M22.5 13 C18 13 15.5 17 17 21 L28 21 C29.5 17 27 13 22.5 13 Z"/><path d="M16.5 22 L28.5 22 L27 39 L18 39 Z"/><rect x="12" y="38" width="21" height="4.5" rx="1.5"/>'
};
function fbPieceSVG(type, color){
  return '<svg class="fb-piece '+color+'" viewBox="0 0 45 45">'+FB_PIECES[type.toLowerCase()]+'</svg>';
}

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
  }
  _build(){
    this.el.classList.add('fb-board');
    this.el.innerHTML = '';
    this.overlay = document.createElement('div');
    this.overlay.className = 'fb-overlay';
    this.overlay.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><g class="fb-hls"></g><g class="fb-arrows"></g></svg><div class="fb-hands"></div>';
    this.el.appendChild(this.overlay);   // attach overlay first so square inserts have a valid anchor
    this._renderSquares();
    this._bindDrag();
  }
  _order(){
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['8','7','6','5','4','3','2','1'];
    const rows = this.orientation==='white' ? ranks : ranks.slice().reverse();
    const cols = this.orientation==='white' ? files : files.slice().reverse();
    return {rows, cols};
  }
  _renderSquares(){
    // remove existing squares (keep overlay)
    this.el.querySelectorAll('.fb-sq').forEach(s=>s.remove());
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
        const pc = this.pos[sq];
        if(pc) cell.innerHTML = fbPieceSVG(pc.type, pc.color);
        // coordinate ticks on edges
        if(ri===7) cell.insertAdjacentHTML('beforeend','<span class="fb-coord file">'+file+'</span>');
        if(ci===0) cell.insertAdjacentHTML('beforeend','<span class="fb-coord rank">'+rank+'</span>');
        frag.appendChild(cell);
      });
    });
    if(this.overlay && this.overlay.parentNode === this.el) this.el.insertBefore(frag, this.overlay);
    else this.el.appendChild(frag);
  }
  setPosition(fen, opts={}){
    this.pos = {};
    const placement = (fen||'').split(' ')[0];
    if(placement){
      const ranks = placement.split('/');
      for(let r=0; r<8; r++){
        const rankNum = 8 - r;
        let f = 0;
        for(const ch of ranks[r]){
          if(/\d/.test(ch)){ f += parseInt(ch,10); }
          else {
            const color = ch===ch.toUpperCase() ? 'w' : 'b';
            const sq = 'abcdefgh'[f] + rankNum;
            this.pos[sq] = {type: ch.toLowerCase(), color};
            f++;
          }
        }
      }
    }
    if(opts.lastMove) this.lastMove = opts.lastMove;
    if('checkSquare' in opts) this.checkSquare = opts.checkSquare;
    this.selected = null;
    this._renderSquares();
  }
  flip(color){ this.orientation = color; this._renderSquares(); }
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
      if(!this.interactive) return;
      const pt = e.touches ? e.touches[0] : e;
      const sq = squareAt(pt.clientX, pt.clientY);
      if(!sq) return;
      startSq = sq; moved=false; sx=pt.clientX; sy=pt.clientY;
      // pre-select to show dots on press
      const t = this.getTargets(sq);
      if(t && !(this.selected && (this.getTargets(this.selected)||[]).indexOf(sq)!==-1)){
        this._select(sq);
      }
    };
    const move = (e)=>{
      if(!startSq) return;
      const pt = e.touches ? e.touches[0] : e;
      if(!moved){
        if(Math.abs(pt.clientX-sx)+Math.abs(pt.clientY-sy) < THRESH) return;
        moved = true;
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
        const to = squareAt(pt.clientX, pt.clientY);
        const targets = this.getTargets(startSq) || [];
        if(to && targets.indexOf(to)!==-1){ this._tryMove(startSq, to); }
        else { this._deselect(); }
      } else {
        this._handleClick(startSq);
      }
      startSq=null; moved=false;
    };
    this.el.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move, {passive:false});
    window.addEventListener('mouseup', up);
    this.el.addEventListener('touchstart', down, {passive:false});
    window.addEventListener('touchmove', move, {passive:false});
    window.addEventListener('touchend', up);
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
    hand.className='fb-hand';hand.textContent='👆';
    hand.style.left=c.x+'%';hand.style.top=c.y+'%';
    hands.appendChild(hand);
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   Onboarding — guided first-run flow (Phase 1: Step 1 calibration game)
   ═══════════════════════════════════════════════════════════════════════════ */
const Onboarding = {
  active:false, board:null, game:null, playerColor:'white',
  perf:[], moveData:[], movesMade:0, thinking:false, estElo:1100,

  start(){
    if(this.active) return;
    if(document.getElementById('onb-overlay')) return;
    this.active = true;
    document.body.style.overflow='hidden';
    const ov = document.createElement('div');
    ov.id='onb-overlay'; ov.className='onb-overlay';
    ov.innerHTML = `
      <div class="onb-topbar">
        <div class="onb-brand"><span class="logo-icon">⬡</span> Chess<strong>Forge</strong></div>
        <div class="onb-rail" id="onb-rail"></div>
        <div class="onb-skip-hint">Step 1 of 3</div>
      </div>
      <div class="onb-body">
        <div class="onb-board-col">
          <div id="onb-board"></div>
          <div style="display:flex;gap:.7rem;margin-top:1rem;flex-wrap:wrap;align-items:center">
            <button class="onb-btn ghost" id="onb-finish" disabled onclick="Onboarding.finish()">I'm done — read my level</button>
            <span id="onb-move-hint" style="font-size:.82rem;color:var(--muted2)">Play at least a few moves so we can read your level.</span>
          </div>
        </div>
        <div class="onb-side" id="onb-side">
          <div class="onb-eyebrow">Step 1 · Calibration</div>
          <h1 class="onb-title">First, just <em>play.</em></h1>
          <p class="onb-desc">No coaching yet — this game is how ChessForge learns <em>your</em> style: the mistakes you repeat, the moments you rush. Play naturally against the bot. It'll quietly tune to your level as you go.</p>
          <div class="onb-status"><span class="onb-pulse"></span><span id="onb-status-text">Reading your moves…</span></div>
          <div class="onb-elo-wrap">
            <div class="onb-elo-label">Estimated level</div>
            <div class="onb-elo-bar"><div class="onb-elo-fill" id="onb-elo-fill"></div></div>
            <div class="onb-elo-num" id="onb-elo-num">~1100</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    this.renderRail('calibration');
    this.startCalibration();
  },

  renderRail(step){
    const steps = [['calibration','Play'],['review','Review'],['coached','Coached game']];
    const order = {calibration:0, review:1, coached:2, done:3};
    const cur = order[step] ?? 0;
    const rail = document.getElementById('onb-rail');
    if(!rail) return;
    rail.innerHTML = steps.map((s,i)=>{
      const cls = i<cur ? 'done' : (i===cur ? 'active':'');
      const dot = i<cur ? '✓' : (i+1);
      const line = i<steps.length-1 ? '<span class="onb-rail-line"></span>' : '';
      return `<span class="onb-rail-step ${cls}"><span class="onb-rail-dot">${dot}</span><span class="onb-rail-label">${s[1]}</span></span>${line}`;
    }).join('');
  },

  startCalibration(){
    this.game = new Chess();
    this.playerColor = 'white';
    this.perf = []; this.moveData = []; this.movesMade = 0; this.thinking=false; this.estElo=1100;
    this.board = new ForgeBoard('onb-board', {
      orientation:'white',
      getTargets:(sq)=>{
        if(this.thinking) return null;
        if(this.game.turn() !== this.playerColor[0]) return null;
        const p = this.game.get(sq);
        if(!p || p.color !== this.playerColor[0]) return null;
        return this.game.moves({square:sq, verbose:true}).map(m=>m.to);
      },
      onMove:(from,to)=>this.onPlayerMove(from,to),
    });
    this.board.setPosition(this.game.fen());
    this.setStatus('Your move — you play White.');
  },

  setStatus(t){ const e=document.getElementById('onb-status-text'); if(e) e.textContent=t; },

  onPlayerMove(from,to){
    if(this.thinking) return false;
    if(this.game.turn() !== this.playerColor[0]) return false;
    const fenBefore = this.game.fen();
    const mv = this.game.move({from,to,promotion:'q'});
    if(!mv) return false;
    this.board.setPosition(this.game.fen(), {lastMove:{from,to}, checkSquare:this.kingInCheck()});
    this.movesMade++;
    if(this.movesMade>=4){
      const fb=document.getElementById('onb-finish'); if(fb) fb.disabled=false;
      const mh=document.getElementById('onb-move-hint'); if(mh) mh.textContent='Keep going, or click "read my level" when ready.';
    }
    if(this.game.game_over()){ this.gatherPerf(fenBefore, mv.san); this.end('The game ended — let me read your level.'); return true; }
    this.thinking = true;
    this.setStatus('Bot is replying…');
    setTimeout(()=>this.botMove(), 350);
    // Gather perf in the background AFTER the bot request is queued, so the
    // reply isn't stuck behind the heavier analysis on a single worker.
    setTimeout(()=>this.gatherPerf(fenBefore, mv.san), 1600);
    return true;
  },

  kingInCheck(){
    if(!this.game.in_check()) return null;
    const turn = this.game.turn();
    for(const f of 'abcdefgh'){ for(let r=1;r<=8;r++){ const sq=f+r; const p=this.game.get(sq); if(p&&p.type==='k'&&p.color===turn) return sq; } }
    return null;
  },

  async gatherPerf(fenBefore, san){
    try{
      const r = await fetch('/coach-move-feedback', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({fen_before:fenBefore, san_played:san, weaknesses:[]}),
        credentials:'include'
      });
      const d = await r.json();
      this.perf.push(typeof d.drop_cp==='number' ? d.drop_cp : 0);
      this.moveData.push({fen_before:fenBefore, san, severity:d.severity, drop_cp:d.drop_cp, best_move:d.best_move_san, best_pv:d.best_pv});
    }catch(e){ this.perf.push(0); }
  },

  async botMove(){
    if(!this.game || this.game.game_over()){ this.thinking=false; return; }
    try{
      const r = await fetch('/bot-move', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({fen:this.game.fen(), perf:this.perf}),
        credentials:'include'
      });
      const d = await r.json();
      if(d.error || !d.move){ this.thinking=false; this.setStatus('Your move.'); return; }
      const mv = this.game.move({from:d.move.slice(0,2), to:d.move.slice(2,4), promotion:'q'});
      if(mv){
        this.board.setPosition(this.game.fen(), {lastMove:{from:d.move.slice(0,2),to:d.move.slice(2,4)}, checkSquare:this.kingInCheck()});
        if(typeof d.est_elo==='number') this.updateElo(d.est_elo);
      }
      this.thinking=false;
      if(this.game.game_over()){ this.end('Checkmate — game over. Reading your level…'); return; }
      this.setStatus(mv && this.game.in_check() ? 'You are in check — your move.' : 'Your move.');
    }catch(e){ this.thinking=false; this.setStatus('Your move.'); }
  },

  updateElo(elo){
    this.estElo = elo;
    const pct = Math.max(5, Math.min(95, (elo-500)/1500*100));
    const fill=document.getElementById('onb-elo-fill'); if(fill) fill.style.width=pct+'%';
    const num=document.getElementById('onb-elo-num'); if(num) num.textContent='~'+elo;
  },

  finish(){ this.end('Reading your level…'); },

  async end(msg){
    if(this._ending) return; this._ending = true;
    this.setStatus(msg||'Reading your level…');
    // Persist calibration game + advance onboarding. Phase 1 completes here;
    // the narrated review + coached game arrive in the next update.
    const pgn = this.game ? this.game.pgn() : '';
    try{
      const r = await fetch('/onboarding/advance', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({step:'done', complete:true, calibration_game:{pgn, move_data:this.moveData, est_elo:this.estElo}}),
        credentials:'include'
      });
      const d = await r.json();
      if(d.onboarding) State.onboarding = d.onboarding;
    }catch(e){}
    this.showComplete();
  },

  showComplete(){
    const side = document.getElementById('onb-side');
    const mistakes = this.moveData.filter(m=>m.severity==='blunder'||m.severity==='mistake').length;
    if(side){
      side.innerHTML = `
        <div class="onb-eyebrow">Calibration complete</div>
        <h1 class="onb-title">Got it. You play at <em>~${this.estElo}.</em></h1>
        <p class="onb-desc">I watched ${this.movesMade} of your moves${mistakes?` and spotted ${mistakes} costly one${mistakes>1?'s':''}`:''}. Your full <em>Thinking Fingerprint</em> and a live-coached game are landing in the next update — for now, jump in and explore.</p>
        <button class="onb-btn" onclick="Onboarding.enterApp()">Enter ChessForge →</button>`;
    }
    this.renderRail('done');
    const fb=document.getElementById('onb-finish'); if(fb) fb.style.display='none';
    const mh=document.getElementById('onb-move-hint'); if(mh) mh.style.display='none';
  },

  enterApp(){
    this.close();
    showPage('coach');
  },

  close(){
    this.active=false; this._ending=false;
    document.body.style.overflow='';
    const ov=document.getElementById('onb-overlay'); if(ov) ov.remove();
  }
};
window.Onboarding = Onboarding;
