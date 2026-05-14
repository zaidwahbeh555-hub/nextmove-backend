"""
ChessForge — Production Backend v6
"""
import os, io, json, random, hashlib, hmac, time, secrets, urllib.request, urllib.parse, smtplib, re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import chess, chess.pgn, chess.engine
from flask import Flask, request, jsonify, render_template, session
from collections import defaultdict
from functools import wraps

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

STOCKFISH_CANDIDATES = [
    os.environ.get("STOCKFISH_PATH", ""),
    "/usr/local/bin/stockfish",
    "/usr/games/stockfish",
    "/usr/bin/stockfish",
    "/opt/homebrew/bin/stockfish",
]

def find_stockfish():
    for p in STOCKFISH_CANDIDATES:
        if p and os.path.isfile(p):
            return p
    return None

ANALYSIS_DEPTH = int(os.environ.get("DEPTH", 16))
BLUNDER_CP     = 200
MISTAKE_CP     = 100
INACCURACY_CP  = 50
MAX_GAMES      = 5
FREE_DAILY_LIMIT = 1
STRIPE_SECRET  = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRO_PRICE = os.environ.get("STRIPE_PRICE_ID", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "chessforge-admin-2024")
ADMIN_EMAIL    = "zaidwahbeh555@gmail.com"
SENDGRID_KEY   = os.environ.get("SENDGRID_API_KEY", "")

BAD_WORDS = [
    "nigger","nigga","faggot","fag","kike","spic","chink","gook","wetback",
    "retard","cunt","whore","slut","bitch","dick","cock","pussy",
    "fuck","shit","bastard","asshole","motherfucker","fucker",
    "nazi","rape","rapist","pedo","pedophile","tranny","dyke",
    "cracker","beaner","towelhead","raghead","admin","administrator","root","system"
]

def is_username_clean(username: str) -> bool:
    low = username.lower()
    for w in BAD_WORDS:
        if w in low:
            return False
    return True

def build_cognitive_fingerprint(all_results: list, pattern_counts: dict, phase_counts: dict, sev_counts: dict) -> dict:
    """Analyse HOW and WHY the player makes mistakes — cognitive patterns."""
    blunders = sev_counts.get("blunder", 0)
    mistakes  = sev_counts.get("mistake", 0)
    total     = blunders + mistakes + sev_counts.get("inaccuracy", 0) or 1

    # Collect all mistakes with context
    all_mistakes = []
    for r in all_results:
        all_mistakes.extend(r.get("mistakes", []))

    # Pattern 1: Phase concentration
    op  = phase_counts.get("opening", 0)
    mid = phase_counts.get("middlegame", 0)
    eg  = phase_counts.get("endgame", 0)
    max_phase = max(op, mid, eg, 1)

    # Pattern 2: Piece-specific blindspots
    hanging  = pattern_counts.get("Hanging piece", 0)
    ks       = pattern_counts.get("King safety issue", 0)
    tactic   = pattern_counts.get("Missed tactic", 0)
    early_q  = pattern_counts.get("Early queen development", 0)

    # Pattern 3: Severity ratio
    blunder_rate = blunders / total

    # Build fingerprint
    patterns = []

    if blunder_rate > 0.35:
        patterns.append({
            "name": "Impulsive Mover",
            "description": "More than 1 in 3 of your mistakes are full blunders — the most severe type. This suggests you're often moving without a final check before committing.",
            "trigger": "You tend to blunder in positions where you feel comfortable or winning.",
            "fix": "Before every move: ask 'Can my opponent take anything for free after this?' Take 5 seconds. Just 5.",
            "severity": "critical"
        })

    if hanging > 2:
        patterns.append({
            "name": "Tunnel Vision",
            "description": f"You've left pieces hanging {hanging} times. This is the #1 most common mistake at your level — your focus on your own plan makes you forget to scan your pieces.",
            "trigger": "Hanging pieces happen when you're focused on attacking or building your own plan.",
            "fix": "LPDO — Loose Pieces Drop Off. Before every move, point at each of your pieces and confirm it's defended.",
            "severity": "high"
        })

    if op > mid and op > eg:
        patterns.append({
            "name": "Opening Stumbler",
            "description": f"Most of your mistakes happen in the first 10 moves ({op} opening mistakes vs {mid} middlegame). You're starting games on the wrong foot.",
            "trigger": "You likely don't have a consistent opening system, leading to improvisation early.",
            "fix": "Pick ONE opening as White and ONE as Black. Learn the first 8 moves deeply. Stop improvising.",
            "severity": "high"
        })

    if eg > mid and eg > op:
        patterns.append({
            "name": "Endgame Avoider",
            "description": f"You make {eg} endgame mistakes — more than any other phase. Won positions are being lost because you don't know endgame technique.",
            "trigger": "When pieces come off the board, your plan disappears with them.",
            "fix": "Study king and pawn endgames for 2 weeks. Start with the opposition concept.",
            "severity": "high"
        })

    if ks > 1:
        patterns.append({
            "name": "Careless King",
            "description": f"You've had {ks} king safety issues. Your king keeps ending up in dangerous situations.",
            "trigger": "You prioritise attacking or developing rather than ensuring your king is safe.",
            "fix": "Make a rule: castle before move 10 in every game unless there's a concrete tactical reason not to.",
            "severity": "high"
        })

    if tactic > 2:
        patterns.append({
            "name": "Tactical Blind Spot",
            "description": f"You've missed {tactic} tactical opportunities. You're generating good positions but not converting them.",
            "trigger": "After building a good position, you relax instead of staying sharp.",
            "fix": "After every opponent move, ask: 'What did this move allow? Is there something I can win right now?'",
            "severity": "medium"
        })

    if early_q > 0:
        patterns.append({
            "name": "Queen Rusher",
            "description": f"You moved your queen early {early_q} time(s). This gives away free development to your opponent.",
            "trigger": "The queen feels powerful so it feels right to play it. It isn't.",
            "fix": "The queen comes out AFTER knights and bishops are developed. No exceptions in the opening.",
            "severity": "medium"
        })

    if not patterns:
        patterns.append({
            "name": "Consistent Player",
            "description": "Your mistakes don't show a single dominant pattern — which means you're relatively balanced. Focus on general improvement: more puzzles, more game review.",
            "trigger": "Mistakes are spread across all phases and types.",
            "fix": "Analyse 3+ games per week. The more data ChessForge has, the more precise your fingerprint becomes.",
            "severity": "low"
        })

    # Pre-move checklist personalised to their patterns
    checklist = ["What is my opponent threatening?", "Is anything I own undefended?"]
    if hanging > 1: checklist.append("LPDO check: are all my pieces safe?")
    if ks > 0: checklist.append("Is my king safe? Should I castle?")
    if tactic > 1: checklist.append("Can I win material or force checkmate right now?")
    if early_q > 0: checklist.append("Am I developing my queen too early?")
    checklist.append("If I play this move, what does my opponent do next?")

    return {
        "patterns": patterns,
        "premove_checklist": checklist,
        "dominant_pattern": patterns[0]["name"] if patterns else "Balanced",
        "games_needed": max(0, 5 - len(all_results)),
        "confidence": min(100, len(all_results) * 20),
    }

# ── Database ───────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "")

def get_pg_conn():
    if not DATABASE_URL: return None
    try:
        import psycopg2
        return psycopg2.connect(DATABASE_URL, sslmode="require")
    except: return None

def init_db():
    conn = get_pg_conn()
    if not conn: return
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username   TEXT PRIMARY KEY,
                data       JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """)
        conn.commit()
    except Exception as e:
        print(f"DB init error: {e}")
    finally:
        conn.close()

def load_db():
    conn = get_pg_conn()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("SELECT username, data FROM users")
            return {row[0]: row[1] for row in cur.fetchall()}
        except: return {}
        finally: conn.close()
    DB_FILE = os.path.join(os.path.dirname(__file__), "users.json")
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE) as f: return json.load(f)
        except: return {}
    return {}

def save_db(db):
    conn = get_pg_conn()
    if conn:
        try:
            cur = conn.cursor()
            for username, data in db.items():
                cur.execute("""
                    INSERT INTO users (username, data, updated_at)
                    VALUES (%s, %s, NOW())
                    ON CONFLICT (username) DO UPDATE
                    SET data = EXCLUDED.data, updated_at = NOW()
                """, (username, json.dumps(data)))
            conn.commit()
            return
        except Exception as e: print(f"DB save error: {e}")
        finally: conn.close()
    DB_FILE = os.path.join(os.path.dirname(__file__), "users.json")
    with open(DB_FILE, "w") as f: json.dump(db, f, indent=2)

def get_user(username):
    conn = get_pg_conn()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("SELECT data FROM users WHERE username = %s", (username,))
            row = cur.fetchone()
            return row[0] if row else None
        except: return None
        finally: conn.close()
    return load_db().get(username)

def save_user(username, data):
    conn = get_pg_conn()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO users (username, data, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (username) DO UPDATE
                SET data = EXCLUDED.data, updated_at = NOW()
            """, (username, json.dumps(data)))
            conn.commit()
            return
        except Exception as e: print(f"save_user error: {e}")
        finally: conn.close()
    db = load_db(); db[username] = data
    DB_FILE = os.path.join(os.path.dirname(__file__), "users.json")
    with open(DB_FILE, "w") as f: json.dump(db, f, indent=2)

# ── Auth helpers ───────────────────────────────────────────────────────────────
def hash_password(pw):
    salt = secrets.token_hex(16)
    key  = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 260000)
    return f"{salt}:{key.hex()}"

def verify_password(pw, stored):
    try:
        salt, key_hex = stored.split(":", 1)
        key = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 260000)
        return hmac.compare_digest(key.hex(), key_hex)
    except: return False

def current_user(): return session.get("username")

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user():
            return jsonify({"error": "Not logged in"}), 401
        return f(*args, **kwargs)
    return decorated

def empty_progress():
    return {"games_analysed":0,"blunders_found":0,"puzzles_solved":0,"lessons_completed":[],"challenge_solved":[]}

def is_pro(user): return user.get("plan") == "pro"

def games_today(user):
    today = time.strftime("%Y-%m-%d")
    return user.get("daily_counts", {}).get(today, 0)

def increment_game_count(user):
    today = time.strftime("%Y-%m-%d")
    if "daily_counts" not in user: user["daily_counts"] = {}
    user["daily_counts"] = {today: user["daily_counts"].get(today, 0) + 1}

# ── Email ──────────────────────────────────────────────────────────────────────
def send_admin_email(subject, body):
    """Send email to admin via SendGrid API or skip if not configured."""
    if not SENDGRID_KEY: return
    try:
        payload = json.dumps({
            "personalizations": [{"to": [{"email": ADMIN_EMAIL}]}],
            "from": {"email": "noreply@chessforge.org", "name": "ChessForge"},
            "subject": subject,
            "content": [{"type": "text/plain", "value": body}]
        }).encode()
        req = urllib.request.Request(
            "https://api.sendgrid.com/v3/mail/send",
            data=payload,
            headers={"Authorization": f"Bearer {SENDGRID_KEY}", "Content-Type": "application/json"}
        )
        urllib.request.urlopen(req)
    except Exception as e:
        print(f"Email error: {e}")

# ── Chess helpers ──────────────────────────────────────────────────────────────
def get_phase(n):
    if n <= 10: return "opening"
    if n <= 30: return "middlegame"
    return "endgame"

def classify_severity(drop):
    if drop >= BLUNDER_CP:    return "blunder"
    if drop >= MISTAKE_CP:    return "mistake"
    if drop >= INACCURACY_CP: return "inaccuracy"
    return None

def detect_pattern(board, move, drop, phase):
    piece = board.piece_at(move.from_square)
    if not piece: return "Positional mistake"
    pt = piece.piece_type
    if pt == chess.QUEEN and phase == "opening": return "Early queen development"
    if pt == chess.KING and phase in ("opening","middlegame") and not board.is_castling(move): return "King safety issue"
    b2 = board.copy(); b2.push(move)
    if b2.is_attacked_by(not piece.color, move.to_square):
        attackers = b2.attackers(not piece.color, move.to_square)
        if attackers:
            vals = {chess.PAWN:1,chess.KNIGHT:3,chess.BISHOP:3,chess.ROOK:5,chess.QUEEN:9,chess.KING:99}
            min_att = min(vals.get(b2.piece_at(sq).piece_type,1) for sq in attackers if b2.piece_at(sq))
            if min_att <= vals.get(pt,1): return "Hanging piece"
    if drop >= BLUNDER_CP and phase == "middlegame": return "Missed tactic"
    if phase == "endgame": return "Endgame mistake"
    return {"opening":"Opening mistake","middlegame":"Middlegame mistake","endgame":"Endgame mistake"}.get(phase,"Positional mistake")

def extract_players_from_pgn(pgn_text):
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if not game: return {"white":"","black":""}
    return {"white":game.headers.get("White","").strip(),"black":game.headers.get("Black","").strip(),
            "event":game.headers.get("Event",""),"date":game.headers.get("Date",""),"site":game.headers.get("Site","")}

def analyse_game(pgn_text, engine, player_color=None):
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if not game: return None
    board = game.board()
    moves_data, mistakes = [], []
    for ply, move in enumerate(game.mainline_moves()):
        move_number = ply // 2 + 1
        side  = "white" if ply % 2 == 0 else "black"
        phase = get_phase(move_number)
        fen_before = board.fen()
        info_before  = engine.analyse(board, chess.engine.Limit(depth=ANALYSIS_DEPTH))
        score_before = info_before["score"].white().score(mate_score=10000)
        best_obj     = info_before.get("pv",[None])[0]
        best_san     = board.san(best_obj) if best_obj and best_obj in board.legal_moves else None
        san = board.san(move)
        snap = board.copy()
        board.push(move)
        fen_after = board.fen()
        info_after  = engine.analyse(board, chess.engine.Limit(depth=ANALYSIS_DEPTH))
        score_after = info_after["score"].white().score(mate_score=10000)
        drop = 0.0
        if score_before is not None and score_after is not None:
            drop = max(float(score_before-score_after) if side=="white" else float(score_after-score_before), 0.0)
        sev     = classify_severity(drop)
        pattern = detect_pattern(snap, move, drop, phase) if sev in ("blunder","mistake") else None
        # Threat description for critical moments
        threat_desc = ""
        if sev == "blunder" and best_san:
            threat_desc = f"You played {san} but the position required {best_san}. Before moving, you should have asked: what is my opponent threatening? Is any of my pieces hanging?"
        entry = dict(ply=ply,move_number=move_number,side=side,san=san,
                     fen_before=fen_before,fen_after=fen_after,
                     score_before=score_before,score_after=score_after,
                     eval_before=round(score_before/100,2) if score_before else None,
                     eval_after=round(score_after/100,2) if score_after else None,
                     drop_cp=int(drop),severity=sev,pattern=pattern,
                     phase=phase,best_move=best_san,threat_desc=threat_desc)
        moves_data.append(entry)
        is_analysed = (player_color is None) or (side == player_color)
        if sev and is_analysed: mistakes.append(entry)
    meta = dict(white=game.headers.get("White","?"),black=game.headers.get("Black","?"),
                result=game.headers.get("Result","?"),date=game.headers.get("Date","?"),
                event=game.headers.get("Event","?"),site=game.headers.get("Site","?"),
                total_moves=len(list(game.mainline_moves()))//2,player_color=player_color)
    return {"meta":meta,"moves":moves_data,"mistakes":mistakes}

def aggregate(all_results):
    pc,phase_c,sev_c,all_m = defaultdict(int),defaultdict(int),defaultdict(int),[]
    for r in all_results:
        for m in r["mistakes"]:
            if m["pattern"]: pc[m["pattern"]] += 1
            phase_c[m["phase"]] += 1; sev_c[m["severity"]] += 1; all_m.append(m)
    top3     = sorted(pc.items(),key=lambda x:x[1],reverse=True)[:3]
    profile  = build_profile(pc,phase_c,sev_c)
    training = build_training(top3,phase_c)
    lessons  = build_lesson_order(pc,phase_c,sev_c)
    puzzles  = build_puzzles(all_m)
    return dict(pattern_counts=dict(pc),phase_counts=dict(phase_c),severity_counts=dict(sev_c),
                top_weaknesses=top3,profile=profile,training=training,lessons=lessons,
                puzzles=puzzles,total_mistakes=len(all_m),games_analysed=len(all_results),
                game_metas=[r["meta"] for r in all_results],games_moves=[r["moves"] for r in all_results])

def build_profile(pc,phase,sev):
    b=sev.get("blunder",0);m=sev.get("mistake",0);i=sev.get("inaccuracy",0);total=b+m+i or 1
    tac=pc.get("Missed tactic",0)+pc.get("Hanging piece",0)
    op=pc.get("Opening mistake",0)+pc.get("Early queen development",0)
    eg=pc.get("Endgame mistake",0);ks=pc.get("King safety issue",0)
    if b/total>0.4: style,desc="Reckless Gambler","You take big risks and frequently overlook immediate threats. Slow down before each move."
    elif tac>op and tac>eg: style,desc="Tactical Dreamer","Great vision but you miss short-term tactics. Daily puzzles will fix this fast."
    elif op>tac: style,desc="Opening Adventurer","You love to experiment but ignore basic development principles."
    elif eg>tac: style,desc="Middlegame Fighter","Strong in complexity but struggle to convert winning endgames."
    elif ks>0: style,desc="Daring Attacker","Aggressive but leave your king exposed too often."
    elif i/total>0.6: style,desc="Solid but Passive","Rarely blunder but drift into passive positions."
    else: style,desc="Balanced Player","Mistakes spread evenly. Broad study will yield fastest improvement."
    return {"style":style,"description":desc}

def build_training(top3,phase):
    mapping={
        "Early queen development":("Opening Principles","Avoid moving your queen before minor pieces are developed.",["Play 10 games developing knights and bishops first","Study the Italian Game or London System"],"High"),
        "Hanging piece":("Piece Safety","Before every move, ask: does anything I own become undefended?",["Complete 20 Hanging Piece puzzles","Practice LPDO: Loose Pieces Drop Off"],"High"),
        "King safety issue":("King Safety","Castle within the first 10 moves. Keep pawns in front of your king intact.",["Solve 15 King Safety puzzles","Study Mikhail Tal's attacking games"],"High"),
        "Missed tactic":("Tactical Training","Consistent daily puzzle solving builds the pattern library you need.",["Solve 10 puzzles per day","Work through Chess Tactics for Beginners"],"High"),
        "Endgame mistake":("Endgame Fundamentals","Master king and pawn endgames and basic rook endgames.",["Practice K+P vs K until automatic","Study Lucena and Philidor positions"],"Medium"),
        "Opening mistake":("Opening Study","Focus on understanding principles rather than memorising moves.",["Pick one opening and study first 8 moves deeply","Use Lichess Opening Explorer"],"Medium"),
        "Middlegame mistake":("Strategic Play","Work on weak squares, pawn structures, and piece coordination.",["Annotate 3 games without engine first","Study Jeremy Silman's How to Reassess Your Chess"],"Medium"),
    }
    plan=[]
    for name,count in top3:
        if name in mapping:
            t,d,drills,pri=mapping[name]
            plan.append({"title":t,"description":d,"drills":drills,"priority":pri,"pattern":name,"count":count})
        else:
            plan.append({"title":"Pattern Improvement","description":f"Focus on reducing '{name}' mistakes.","drills":["Review all games with this pattern"],"priority":"Medium","pattern":name,"count":count})
    if not plan:
        plan.append({"title":"General Improvement","description":"Keep playing and reviewing games.","drills":["Play 3 longer games per week","Review each game after"],"priority":"Low","pattern":"general","count":0})
    return plan

def build_lesson_order(pc,phase,sev):
    scores={"blunders":sev.get("blunder",0)*3,"tactics":pc.get("Missed tactic",0)*2+pc.get("Hanging piece",0)*2,
            "kingsafety":pc.get("King safety issue",0)*2,"openings":pc.get("Early queen development",0)+pc.get("Opening mistake",0),
            "capitalize":sev.get("mistake",0),"pieces":pc.get("Middlegame mistake",0)+pc.get("Positional mistake",0),"endgame":pc.get("Endgame mistake",0),
            "calculation":"calculation","threats":"threats","pawnstructure":"pawnstructure","coordinates":"coordinates",
            "exchanges":"exchanges","initiative":"initiative","defense":"defense","planning":"planning"}
    sortable={k:v for k,v in scores.items() if isinstance(v,int)}
    return sorted(sortable.keys(),key=lambda k:sortable[k],reverse=True)

def build_puzzles(all_m):
    blunders=[m for m in all_m if m["severity"]=="blunder" and m["best_move"]]
    random.shuffle(blunders)
    return [{"fen":b["fen_before"],"solution":b["best_move"],"move_played":b["san"],
             "phase":b["phase"],"pattern":b["pattern"]or"Mistake","drop_cp":b["drop_cp"],
             "side":b["side"],"threat_desc":b.get("threat_desc","")} for b in blunders[:8]]

# ── Init DB ────────────────────────────────────────────────────────────────────
init_db()

# ── Auth Routes ────────────────────────────────────────────────────────────────
@app.route("/auth/register", methods=["POST"])
def register():
    data=request.get_json(silent=True) or {}
    username=data.get("username","").strip().lower()
    password=data.get("password","").strip()
    email=data.get("email","").strip().lower()
    if not username or not password: return jsonify({"error":"Username and password required."}),400
    if not email or "@" not in email: return jsonify({"error":"A valid email is required."}),400
    if len(username)<3: return jsonify({"error":"Username must be at least 3 characters."}),400
    if not is_username_clean(username): return jsonify({"error":"That username is not allowed. Please choose a different one."}),400
    if len(username)>30: return jsonify({"error":"Username must be 30 characters or less."}),400
    if not username.replace("_","").replace("-","").isalnum(): return jsonify({"error":"Username can only contain letters, numbers, hyphens and underscores."}),400
    if len(password)<8: return jsonify({"error":"Password must be at least 8 characters."}),400
    if get_user(username): return jsonify({"error":"That username is already taken."}),400
    if email:
        db=load_db()
        if any(u.get("email","").lower()==email for u in db.values()): return jsonify({"error":"An account with that email already exists."}),400
    new_user={"password":hash_password(password),"email":email,"created":int(time.time()),
              "xp":0,"plan":"free","plan_expires":None,"daily_counts":{},"games":[],"progress":empty_progress()}
    save_user(username,new_user)
    session["username"]=username; session.permanent=True
    # Notify admin
    send_admin_email("New ChessForge signup!",f"New user: {username}\nEmail: {email}\nTime: {time.strftime('%Y-%m-%d %H:%M')}")
    return jsonify({"ok":True,"username":username,"xp":0,"plan":"free","progress":empty_progress()})

@app.route("/auth/login", methods=["POST"])
def login():
    data=request.get_json(silent=True) or {}
    username=data.get("username","").strip().lower()
    password=data.get("password","").strip()
    if not username or not password: return jsonify({"error":"Username and password required."}),400
    user=get_user(username)
    if not user or not verify_password(password,user["password"]): time.sleep(0.3); return jsonify({"error":"Incorrect username or password."}),401
    session["username"]=username; session.permanent=True
    return jsonify({"ok":True,"username":username,"xp":user.get("xp",0),"plan":user.get("plan","free"),
                    "progress":user.get("progress",empty_progress()),"games":user.get("games",[])})

@app.route("/auth/logout", methods=["POST"])
def logout():
    session.clear(); return jsonify({"ok":True})

@app.route("/auth/me")
def me():
    u=current_user()
    if not u: return jsonify({"loggedIn":False})
    user=get_user(u)
    if not user: session.clear(); return jsonify({"loggedIn":False})
    return jsonify({"loggedIn":True,"username":u,"xp":user.get("xp",0),"plan":user.get("plan","free"),
                    "progress":user.get("progress",empty_progress()),"games":user.get("games",[])})

@app.route("/auth/save-game", methods=["POST"])
@login_required
def save_game():
    u=current_user(); data=request.get_json(silent=True) or {}
    pgn=data.get("pgn","").strip()
    if not pgn: return jsonify({"error":"No PGN"}),400
    label=data.get("label","Game")[:100]
    user=get_user(u)
    if not user: return jsonify({"error":"User not found"}),404
    user["games"]=user.get("games",[])
    user["games"].append({"pgn":pgn,"label":label,"saved":int(time.time())})
    user["games"]=user["games"][-50:]
    save_user(u,user)
    return jsonify({"ok":True,"total":len(user["games"]),"games":user["games"]})

@app.route("/auth/add-xp", methods=["POST"])
@login_required
def add_xp():
    u=current_user(); data=request.get_json(silent=True) or {}
    amount=max(0,min(int(data.get("amount",0)),500))
    xp_type=data.get("type",""); lesson_id=data.get("lesson_id","")
    user=get_user(u)
    if not user: return jsonify({"error":"User not found"}),404
    user["xp"]=user.get("xp",0)+amount
    prog=user.get("progress",empty_progress())
    if xp_type=="puzzle": prog["puzzles_solved"]=prog.get("puzzles_solved",0)+1
    if xp_type=="analysis": prog["games_analysed"]=prog.get("games_analysed",0)+1
    if xp_type=="lesson" and lesson_id:
        completed=prog.get("lessons_completed",[])
        if lesson_id not in completed: completed.append(lesson_id)
        prog["lessons_completed"]=completed
    user["progress"]=prog
    save_user(u,user)
    return jsonify({"ok":True,"xp":user["xp"],"progress":prog})

@app.route("/auth/upgrade", methods=["POST"])
@login_required
def upgrade():
    u=current_user(); data=request.get_json(silent=True) or {}
    key=data.get("admin_key","")
    if key!=os.environ.get("ADMIN_KEY",""): return jsonify({"error":"Unauthorized"}),403
    user=get_user(u)
    if not user: return jsonify({"error":"User not found"}),404
    user["plan"]="pro"; save_user(u,user)
    return jsonify({"ok":True,"plan":"pro"})

# ── Admin Routes ───────────────────────────────────────────────────────────────
@app.route("/admin")
def admin_page():
    return render_template("admin.html")

@app.route("/admin/login", methods=["POST"])
def admin_login():
    data=request.get_json(silent=True) or {}
    if data.get("password")==ADMIN_PASSWORD:
        session["is_admin"]=True
        return jsonify({"ok":True})
    return jsonify({"error":"Wrong password"}),401

@app.route("/admin/users")
def admin_users():
    if not session.get("is_admin"): return jsonify({"error":"Unauthorized"}),401
    db=load_db()
    users=[]
    for username,user in db.items():
        users.append({"username":username,"email":user.get("email",""),"plan":user.get("plan","free"),
                      "xp":user.get("xp",0),"games_count":len(user.get("games",[])),"created":user.get("created",0),
                      "games_analysed":user.get("progress",{}).get("games_analysed",0)})
    users.sort(key=lambda x:x["created"],reverse=True)
    total=len(users); pro=sum(1 for u in users if u["plan"]=="pro")
    return jsonify({"users":users,"total":total,"pro":pro,"free":total-pro})

@app.route("/admin/set-plan", methods=["POST"])
def admin_set_plan():
    if not session.get("is_admin"): return jsonify({"error":"Unauthorized"}),401
    data=request.get_json(silent=True) or {}
    username=data.get("username",""); plan=data.get("plan","free")
    user=get_user(username)
    if not user: return jsonify({"error":"User not found"}),404
    user["plan"]=plan; save_user(username,user)
    return jsonify({"ok":True})

@app.route("/admin/delete-user", methods=["POST"])
def admin_delete_user():
    if not session.get("is_admin"): return jsonify({"error":"Unauthorized"}),401
    data=request.get_json(silent=True) or {}
    username=data.get("username","")
    conn=get_pg_conn()
    if conn:
        try:
            cur=conn.cursor()
            cur.execute("DELETE FROM users WHERE username = %s",(username,))
            conn.commit()
        finally: conn.close()
    else:
        db=load_db()
        if username in db: del db[username]; save_db(db)
    return jsonify({"ok":True})

@app.route("/admin/send-report", methods=["POST"])
def admin_send_report():
    if not session.get("is_admin"): return jsonify({"error":"Unauthorized"}),401
    db=load_db()
    total=len(db); pro=sum(1 for u in db.values() if u.get("plan")=="pro")
    today=time.strftime("%Y-%m-%d")
    new_today=sum(1 for u in db.values() if time.strftime("%Y-%m-%d",time.localtime(u.get("created",0)))==today)
    body=f"""ChessForge Daily Report — {today}

Total Users: {total}
Pro Users: {pro}
Free Users: {total-pro}
New Today: {new_today}
Est. Monthly Revenue: ${pro*9}/mo

Recent Users:
"""
    users=sorted(db.items(),key=lambda x:x[1].get("created",0),reverse=True)[:10]
    for uname,u in users:
        body+=f"  {uname} ({u.get('email','')}) — {u.get('plan','free')} — {time.strftime('%Y-%m-%d',time.localtime(u.get('created',0)))}\n"
    send_admin_email(f"ChessForge Report — {today}",body)
    return jsonify({"ok":True,"report":body})

# ── Core routes ────────────────────────────────────────────────────────────────
@app.route("/")
def index(): return render_template("index.html")

@app.route("/parse-pgn", methods=["POST"])
def parse_pgn():
    pgn_text=""
    if "pgn_file" in request.files and request.files["pgn_file"].filename:
        pgn_text=request.files["pgn_file"].read().decode("utf-8",errors="replace")
    elif request.form.get("pgn_text"): pgn_text=request.form["pgn_text"].strip()
    elif request.is_json: pgn_text=(request.json or {}).get("pgn_text","")
    if not pgn_text: return jsonify({"error":"No PGN provided."}),400
    players=extract_players_from_pgn(pgn_text)
    return jsonify({"ok":True,"white":players["white"],"black":players["black"],"event":players.get("event",""),"date":players.get("date",""),"site":players.get("site","")})

@app.route("/analyse", methods=["POST"])
def analyse():
    pgn_text=""
    if "pgn_file" in request.files and request.files["pgn_file"].filename:
        pgn_text=request.files["pgn_file"].read().decode("utf-8",errors="replace")
    elif request.form.get("pgn_text"): pgn_text=request.form["pgn_text"].strip()
    player_color=request.form.get("player_color","").strip().lower()
    if player_color not in ("white","black",""): return jsonify({"error":"Invalid player_color."}),400
    if not player_color: player_color=None
    if not pgn_text: return jsonify({"error":"No PGN provided."}),400
    # Plan check
    u=current_user()
    if u:
        user=get_user(u) or {}
        if not is_pro(user):
            count=games_today(user)
            if count>=FREE_DAILY_LIMIT:
                return jsonify({"error":"free_limit_reached","message":f"Free plan allows {FREE_DAILY_LIMIT} game analysis per day. Upgrade to Pro for unlimited analysis.","upgrade":True,"limit":FREE_DAILY_LIMIT,"used":count}),403
    sf=find_stockfish()
    if not sf: return jsonify({"error":"Stockfish not found."}),500
    games_raw,buf=[],[]
    for line in pgn_text.splitlines():
        buf.append(line)
        if line.strip()=="" and any(l.startswith("1.") for l in buf): games_raw.append("\n".join(buf)); buf=[]
    if buf: games_raw.append("\n".join(buf))
    games_raw=[g for g in games_raw if g.strip()][:MAX_GAMES]
    if not games_raw: return jsonify({"error":"Could not parse any games."}),400
    try:
        with chess.engine.SimpleEngine.popen_uci(sf) as engine:
            engine.configure({"Threads":2,"Hash":64})
            results=[r for r in (analyse_game(g,engine,player_color) for g in games_raw) if r]
    except Exception as e: return jsonify({"error":f"Analysis error: {e}"}),500
    if not results: return jsonify({"error":"Could not analyse any games."}),400
    data=aggregate(results); data["player_color"]=player_color
    if u:
        user=get_user(u)
        if user:
            prog=user.get("progress",empty_progress())
            prog["games_analysed"]=prog.get("games_analysed",0)+len(results)
            prog["blunders_found"]=prog.get("blunders_found",0)+data["severity_counts"].get("blunder",0)
            user["progress"]=prog; user["xp"]=user.get("xp",0)+100
            increment_game_count(user); save_user(u,user)
            data["xp"]=user["xp"]; data["plan"]=user.get("plan","free")
            data["games_today"]=games_today(user); data["daily_limit"]=FREE_DAILY_LIMIT
    # Cognitive fingerprint
    data["cognitive_fingerprint"] = build_cognitive_fingerprint(
        results, data["pattern_counts"], data["phase_counts"], data["severity_counts"]
    )
    return jsonify(data)

@app.route("/create-checkout-session", methods=["POST"])
@login_required
def create_checkout_session():
    u=current_user(); user=get_user(u)
    if not user: return jsonify({"error":"User not found"}),404
    if is_pro(user): return jsonify({"error":"Already Pro!"}),400
    email=user.get("email",""); price_id=STRIPE_PRO_PRICE; secret_key=STRIPE_SECRET
    app_url=os.environ.get("APP_URL","https://app.chessforge.org")
    if not price_id or not secret_key: return jsonify({"error":"Stripe not configured."}),500
    payload=urllib.parse.urlencode({"mode":"subscription","line_items[0][price]":price_id,"line_items[0][quantity]":"1",
        "customer_email":email,"success_url":f"{app_url}?payment=success","cancel_url":f"{app_url}?payment=cancelled",
        "metadata[username]":u}).encode()
    req=urllib.request.Request("https://api.stripe.com/v1/checkout/sessions",data=payload,
        headers={"Authorization":f"Bearer {secret_key}","Content-Type":"application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req) as resp:
            sess=json.loads(resp.read()); return jsonify({"url":sess["url"]})
    except urllib.error.HTTPError as e:
        err=json.loads(e.read()); return jsonify({"error":err.get("error",{}).get("message","Stripe error")}),500

@app.route("/stripe/webhook", methods=["POST"])
def stripe_webhook():
    import hmac as _hmac
    payload=request.get_data(); sig_header=request.headers.get("Stripe-Signature",""); secret=STRIPE_WEBHOOK
    if secret:
        try:
            parts={p.split("=")[0]:p.split("=")[1] for p in sig_header.split(",")}
            timestamp=parts.get("t",""); signature=parts.get("v1","")
            signed=f"{timestamp}.{payload.decode()}"
            expected=_hmac.new(secret.encode(),signed.encode(),"sha256").hexdigest()
            if not _hmac.compare_digest(expected,signature): return jsonify({"error":"Invalid signature"}),400
        except: return jsonify({"error":"Webhook error"}),400
    event=request.get_json(silent=True) or {}; etype=event.get("type","")
    if etype in ("checkout.session.completed","invoice.payment_succeeded"):
        obj=event.get("data",{}).get("object",{}); email=obj.get("customer_email") or obj.get("customer_details",{}).get("email","")
        username=obj.get("metadata",{}).get("username","")
        db=load_db(); upgraded=False
        if username and username in db:
            db[username]["plan"]="pro"; db[username]["plan_started"]=int(time.time()); upgraded=True
        elif email:
            for uname,user in db.items():
                if user.get("email","").lower()==email.lower():
                    user["plan"]="pro"; user["plan_started"]=int(time.time()); upgraded=True; break
        if upgraded:
            save_db(db)
            send_admin_email("New ChessForge Pro subscriber! 💰",f"User: {username or email}\nPlan: Pro ($9/mo)\nTime: {time.strftime('%Y-%m-%d %H:%M')}\nEst revenue: ${(sum(1 for u in db.values() if u.get('plan')=='pro'))*9}/mo")
    if etype=="customer.subscription.deleted":
        obj=event.get("data",{}).get("object",{}); email=obj.get("customer_email","")
        if email:
            db=load_db()
            for uname,user in db.items():
                if user.get("email","").lower()==email.lower(): user["plan"]="free"; break
            save_db(db)
    return jsonify({"ok":True})

@app.route("/plan/status")
@login_required
def plan_status():
    u=current_user(); user=get_user(u) or {}
    return jsonify({"plan":user.get("plan","free"),"is_pro":is_pro(user),"games_today":games_today(user),"daily_limit":FREE_DAILY_LIMIT,"can_analyse":is_pro(user) or games_today(user)<FREE_DAILY_LIMIT})

@app.after_request
def add_cors_headers(response):
    origin=request.headers.get("Origin",""); allowed=os.environ.get("ALLOWED_ORIGINS","*")
    response.headers["Access-Control-Allow-Origin"]=origin if origin else allowed
    response.headers["Access-Control-Allow-Headers"]="Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"]="GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Credentials"]="true"
    return response

@app.route("/auth/<path:path>", methods=["OPTIONS"])
@app.route("/analyse", methods=["OPTIONS"])
@app.route("/parse-pgn", methods=["OPTIONS"])
def handle_options(path=""):
    response=jsonify({"ok":True}); origin=request.headers.get("Origin","")
    if origin: response.headers["Access-Control-Allow-Origin"]=origin
    response.headers["Access-Control-Allow-Headers"]="Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"]="GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Credentials"]="true"
    return response

@app.route("/bot-move", methods=["POST"])
def bot_move():
    """Get a bot move based on user weakness profile."""
    data = request.get_json(silent=True) or {}
    fen  = data.get("fen", "")
    weaknesses = data.get("weaknesses", [])
    elo  = int(data.get("elo", 1200))

    sf = find_stockfish()
    if not sf or not fen:
        return jsonify({"error": "Engine not available"}), 500

    try:
        board = chess.Board(fen)
    except Exception:
        return jsonify({"error": "Invalid FEN"}), 400

    # Map ELO to depth — lower ELO = shallower search = more mistakes
    if elo < 800:   depth = 2
    elif elo < 1000: depth = 3
    elif elo < 1200: depth = 5
    elif elo < 1400: depth = 7
    elif elo < 1600: depth = 9
    else:            depth = 12

    # Occasionally play a "weakness-targeting" move instead of best move
    # This makes the bot play positions that expose the user's weak patterns
    targeting = random.random() < 0.4  # 40% chance of targeting

    try:
        with chess.engine.SimpleEngine.popen_uci(sf) as engine:
            if targeting and weaknesses:
                # Get multiple candidate moves and pick the one most likely to expose weakness
                info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=5)
                candidates = []
                if isinstance(info, list):
                    for i in info:
                        pv = i.get("pv", [])
                        if pv: candidates.append(pv[0])
                else:
                    pv = info.get("pv", [])
                    if pv: candidates.append(pv[0])

                # Pick a move that creates tactical complexity if user hangs pieces
                move = candidates[0] if candidates else None
                if not move:
                    result = engine.play(board, chess.engine.Limit(depth=depth))
                    move = result.move
            else:
                result = engine.play(board, chess.engine.Limit(depth=depth))
                move = result.move

            if move and move in board.legal_moves:
                san = board.san(move)
                board.push(move)
                return jsonify({
                    "move": move.uci(),
                    "san": san,
                    "fen": board.fen(),
                    "game_over": board.is_game_over(),
                    "result": board.result() if board.is_game_over() else None,
                    "in_check": board.is_check(),
                })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({"error": "Could not compute move"}), 500


@app.route("/generate-puzzles", methods=["POST"])
@login_required
def generate_puzzles():
    """Generate infinite puzzles based on user's weakness patterns."""
    u = current_user()
    user = get_user(u) or {}
    data = request.get_json(silent=True) or {}
    weakness = data.get("weakness", "tactics")
    count = min(int(data.get("count", 5)), 10)

    # Curated puzzle positions by weakness type
    PUZZLE_POOLS = {
        "Hanging piece": [
            {"fen":"r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4","solution":"Ng5","pattern":"Hanging piece","side":"white","hint":"Your opponent left a piece undefended"},
            {"fen":"rnbq1rk1/ppp2ppp/3p1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQ - 0 7","solution":"Bxf7+","pattern":"Hanging piece","side":"white","hint":"Find the piece hanging on f7"},
            {"fen":"r1bqkb1r/ppp2ppp/2np1n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5","solution":"Ng5","pattern":"Hanging piece","side":"white","hint":"Attack two things at once"},
        ],
        "Missed tactic": [
            {"fen":"r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 8","solution":"Nd5","pattern":"Missed tactic","side":"white","hint":"A knight fork wins material"},
            {"fen":"r2qkb1r/ppp2ppp/2np1n2/4p1B1/2B1P3/3P1N2/PPP2PPP/RN1QK2R b KQkq - 0 6","solution":"Nxe4","pattern":"Missed tactic","side":"black","hint":"Win a pawn tactically"},
            {"fen":"r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5","solution":"Bxf2+","pattern":"Missed tactic","side":"black","hint":"A sacrifice wins material"},
        ],
        "King safety issue": [
            {"fen":"r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4","solution":"O-O","pattern":"King safety","side":"black","hint":"Castle to safety immediately"},
            {"fen":"rnbqkb1r/ppp2ppp/3p1n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4","solution":"O-O","pattern":"King safety","side":"white","hint":"Get your king to safety"},
        ],
        "Endgame mistake": [
            {"fen":"8/8/8/3k4/8/3K4/3P4/8 w - - 0 1","solution":"Ke3","pattern":"Endgame","side":"white","hint":"Escort the pawn to queen"},
            {"fen":"8/8/8/8/8/4K3/4P3/4k3 w - - 0 1","solution":"Kd3","pattern":"Endgame","side":"white","hint":"Gain the opposition"},
            {"fen":"8/8/1k6/8/8/1K6/1P6/8 w - - 0 1","solution":"Kc4","pattern":"Endgame","side":"white","hint":"King in front of the pawn"},
        ],
        "tactics": [
            {"fen":"r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4","solution":"Ng5","pattern":"Fork","side":"white","hint":"Attack two pieces at once"},
            {"fen":"r2qkb1r/ppp2ppp/2np4/4p1B1/2BnP3/2N5/PPP2PPP/R2QK2R w KQkq - 0 8","solution":"Bxd4","pattern":"Capture","side":"white","hint":"Win the knight"},
            {"fen":"6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1","solution":"Rd8+","pattern":"Back rank","side":"white","hint":"Back rank mate!"},
            {"fen":"r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4","solution":"Nd4","pattern":"Counter","side":"black","hint":"Attack the queen"},
            {"fen":"r1b1kb1r/pppp1ppp/2n2n2/4p1q1/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 6 5","solution":"Nxe5","pattern":"Fork","side":"white","hint":"Win material"},
        ],
        "Opening mistake": [
            {"fen":"r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3","solution":"Bc4","pattern":"Development","side":"white","hint":"Develop toward the center"},
            {"fen":"rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2","solution":"Nf3","pattern":"Development","side":"white","hint":"Develop a knight attacking the center"},
        ],
    }

    pool = PUZZLE_POOLS.get(weakness, PUZZLE_POOLS["tactics"])
    # Random sample, looping if needed
    selected = []
    while len(selected) < count:
        selected.extend(random.sample(pool, min(len(pool), count - len(selected))))
    selected = selected[:count]

    for p in selected:
        p["drop_cp"] = random.randint(150, 400)
        if "threat_desc" not in p:
            p["threat_desc"] = f"This position tests your {p['pattern'].lower()} awareness."

    return jsonify({"puzzles": selected})


@app.route("/cancel-subscription", methods=["POST"])
@login_required
def cancel_subscription():
    """Create a Stripe customer portal session for the user to manage/cancel their subscription."""
    u    = current_user()
    user = get_user(u)
    if not user: return jsonify({"error": "User not found"}), 404
    if not is_pro(user): return jsonify({"error": "You are not on a Pro plan"}), 400

    secret_key = STRIPE_SECRET
    app_url    = os.environ.get("APP_URL", "https://app.chessforge.org")
    email      = user.get("email", "")

    if not secret_key:
        return jsonify({"error": "Stripe not configured"}), 500

    # First find the customer by email
    try:
        req = urllib.request.Request(
            f"https://api.stripe.com/v1/customers?email={urllib.parse.quote(email)}&limit=1",
            headers={"Authorization": f"Bearer {secret_key}"}
        )
        with urllib.request.urlopen(req) as resp:
            customers = json.loads(resp.read())
            data_list = customers.get("data", [])
            if not data_list:
                return jsonify({"error": "No Stripe customer found for this account"}), 404
            customer_id = data_list[0]["id"]

        # Create portal session
        payload = urllib.parse.urlencode({
            "customer": customer_id,
            "return_url": app_url,
        }).encode()
        req2 = urllib.request.Request(
            "https://api.stripe.com/v1/billing_portal/sessions",
            data=payload,
            headers={"Authorization": f"Bearer {secret_key}", "Content-Type": "application/x-www-form-urlencoded"}
        )
        with urllib.request.urlopen(req2) as resp2:
            portal = json.loads(resp2.read())
            return jsonify({"url": portal["url"]})
    except Exception as e:
        return jsonify({"error": f"Could not create portal: {e}"}), 500



@app.route("/coach-position", methods=["POST"])
def coach_position():
    """Real-time coaching for a position during a bot game."""
    data = request.get_json(silent=True) or {}
    fen        = data.get("fen", "")
    weaknesses = data.get("weaknesses", [])
    request_type = data.get("type", "nudge")  # nudge | hint | explain

    sf = find_stockfish()
    if not sf or not fen:
        return jsonify({"message": "Play on!", "eval": 0})

    try:
        board = chess.Board(fen)
    except Exception:
        return jsonify({"message": "Play on!", "eval": 0})

    try:
        with chess.engine.SimpleEngine.popen_uci(sf) as engine:
            info = engine.analyse(board, chess.engine.Limit(depth=12))
            score = info["score"].white().score(mate_score=10000) or 0
            best_pv = info.get("pv", [])
            best_move = board.san(best_pv[0]) if best_pv and best_pv[0] in board.legal_moves else None

            eval_pawns = round(score / 100, 1)
            turn = "White" if board.turn == chess.WHITE else "Black"
            player_turn = board.turn

            # Build personalised coaching message
            message = ""
            warning = ""

            # Check for hanging pieces
            for sq in chess.SQUARES:
                piece = board.piece_at(sq)
                if piece and piece.color == player_turn:
                    if board.is_attacked_by(not player_turn, sq):
                        attackers = board.attackers(not player_turn, sq)
                        defenders = board.attackers(player_turn, sq)
                        if len(list(attackers)) > len(list(defenders)):
                            warning = f"⚠️ Your {piece.piece_type.name.lower() if hasattr(piece.piece_type, 'name') else 'piece'} on {chess.square_name(sq)} looks vulnerable!"
                            break

            # Personalised nudge based on weaknesses
            nudges = []
            if "Hanging piece" in weaknesses:
                nudges.append("Scan: are all your pieces safe?")
            if "King safety issue" in weaknesses and not board.has_castling_rights(player_turn):
                nudges.append("Is your king safe?")
            if "Missed tactic" in weaknesses:
                nudges.append("Any checks, captures or threats available?")

            if request_type == "nudge":
                if warning:
                    message = warning
                elif nudges:
                    message = f"💭 {nudges[0]}"
                else:
                    adv = abs(eval_pawns)
                    if eval_pawns > 1.5: message = "✅ You're winning — keep it clean, don't give it away."
                    elif eval_pawns < -1.5: message = "💪 You're behind — look for counterplay and complications."
                    else: message = "⚖️ Position is balanced — every move counts here."

            elif request_type == "hint":
                if warning:
                    message = warning + " Fix this first."
                elif best_move:
                    # Give a directional hint, not the exact move
                    piece = board.piece_at(chess.parse_square(best_pv[0].uci()[:2])) if best_pv else None
                    if piece:
                        message = f"💡 Consider moving your {chess.piece_name(piece.piece_type)} — it can do something useful here."
                    else:
                        message = "💡 Look for a forcing move — check, capture, or threat."
                else:
                    message = "💡 Improve your worst-placed piece."

            elif request_type == "explain":
                adv = abs(eval_pawns)
                who = "White" if eval_pawns > 0 else "Black"
                message = f"📊 Eval: {'+' if eval_pawns >= 0 else ''}{eval_pawns} ({who} is {'slightly ' if adv < 1 else ''}{'better' if adv < 2 else 'much better' if adv < 4 else 'winning'}). "
                if warning:
                    message += warning
                elif nudges:
                    message += " | ".join(nudges)
                elif best_move:
                    message += f"Engine likes {best_move} here."

            return jsonify({
                "message": message,
                "eval": eval_pawns,
                "warning": bool(warning),
                "best_move": best_move if request_type == "explain" else None,
            })

    except Exception as e:
        return jsonify({"message": "Think carefully before moving.", "eval": 0})

@app.route("/health")
def health():
    sf=find_stockfish()
    return jsonify({"status":"ok","stockfish":sf or "not found","depth":ANALYSIS_DEPTH})

if __name__ == "__main__":
    port=int(os.environ.get("PORT",5000))
    app.run(debug=False,host="0.0.0.0",port=port)
