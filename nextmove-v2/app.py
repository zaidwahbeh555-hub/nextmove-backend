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

def default_onboarding(new=True):
    """Onboarding state machine. New signups start at 'calibration'; existing users are complete."""
    return {
        "new_user": bool(new),
        "complete": (not new),
        "step": "calibration" if new else "done",   # calibration -> review -> coached -> done
        "calibration_game": None,                     # {pgn, move_data} saved after game 1
        "coached_game": None,
    }

def get_onboarding(user):
    """Return onboarding state, defaulting pre-existing accounts to 'complete' so they're never forced through it."""
    ob = user.get("onboarding")
    if not ob:
        return {"new_user": False, "complete": True, "step": "done", "calibration_game": None, "coached_game": None}
    return ob

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
              "xp":0,"plan":"free","plan_expires":None,"daily_counts":{},"games":[],
              "progress":empty_progress(),"onboarding":default_onboarding(new=True)}
    save_user(username,new_user)
    session["username"]=username; session.permanent=True
    # Notify admin
    send_admin_email("New ChessForge signup!",f"New user: {username}\nEmail: {email}\nTime: {time.strftime('%Y-%m-%d %H:%M')}")
    return jsonify({"ok":True,"username":username,"xp":0,"plan":"free","progress":empty_progress(),
                    "onboarding":new_user["onboarding"]})

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
                    "progress":user.get("progress",empty_progress()),"games":user.get("games",[]),
                    "onboarding":get_onboarding(user)})

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
                    "progress":user.get("progress",empty_progress()),"games":user.get("games",[]),
                    "onboarding":get_onboarding(user)})

@app.route("/onboarding/state")
@login_required
def onboarding_state():
    u=current_user(); user=get_user(u) or {}
    return jsonify({"onboarding":get_onboarding(user)})

@app.route("/onboarding/advance", methods=["POST"])
@login_required
def onboarding_advance():
    u=current_user(); user=get_user(u)
    if not user: return jsonify({"error":"User not found"}),404
    data=request.get_json(silent=True) or {}
    ob=get_onboarding(user)
    step=data.get("step")
    if step in ("calibration","review","coached","done"):
        ob["step"]=step
    if data.get("complete"): ob["complete"]=True
    if ob.get("step")=="done": ob["complete"]=True
    # Persist the calibration or coached game payload for later review
    if data.get("calibration_game") is not None:
        ob["calibration_game"]=data.get("calibration_game")
    if data.get("coached_game") is not None:
        ob["coached_game"]=data.get("coached_game")
    ob["new_user"]=ob.get("new_user",True)
    user["onboarding"]=ob
    save_user(u,user)
    return jsonify({"ok":True,"onboarding":ob})

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

def estimate_player_elo(perf):
    """Estimate player strength from a list of per-move eval drops (centipawns).
    perf: list of ints (0 = perfect move, higher = bigger mistake). Returns an ELO estimate.
    Starts moderate and converges as more samples arrive."""
    if not perf:
        return 1100  # moderate default before we know anything
    samples = perf[-20:]  # only the recent window matters
    avg = sum(samples) / len(samples)
    # Blunder/mistake rate weighting
    blunders = sum(1 for d in samples if d >= 300)
    mistakes = sum(1 for d in samples if 150 <= d < 300)
    rate = (blunders * 1.0 + mistakes * 0.5) / len(samples)
    # Map average centipawn loss -> elo (lower loss = higher elo)
    #   ~10cp avg  -> ~1900,  ~40cp -> ~1500,  ~90cp -> ~1100,  ~180cp -> ~700
    base = 2000 - (avg * 7.5)
    base -= rate * 250
    # Confidence: pull toward 1100 when few samples
    conf = min(len(samples) / 15.0, 1.0)
    est = 1100 * (1 - conf) + base * conf
    return int(max(500, min(2000, est)))

def configure_bot_strength(engine, elo):
    """Calibrate Stockfish to a target ELO. Uses UCI_LimitStrength/UCI_Elo where supported (>=1320),
    else Skill Level for weaker play. Returns the search Limit to use."""
    try:
        if elo >= 1320:
            engine.configure({"UCI_LimitStrength": True, "UCI_Elo": int(max(1320, min(2850, elo)))})
            return chess.engine.Limit(time=0.25)
        else:
            # Below Stockfish's UCI_Elo floor — use Skill Level 0..20 + shallow search
            # elo 500->skill 0, 1320->skill ~8
            skill = int(max(0, min(20, (elo - 500) / 100)))
            engine.configure({"Skill Level": skill})
            depth = 2 if elo < 800 else (4 if elo < 1100 else 6)
            return chess.engine.Limit(depth=depth)
    except Exception:
        # Engine doesn't support these options — fall back to depth mapping
        depth = 3 if elo < 1000 else (6 if elo < 1400 else 10)
        return chess.engine.Limit(depth=depth)

@app.route("/bot-move", methods=["POST"])
def bot_move():
    """Adaptive bot move. Calibrates strength live from the player's per-move eval drops (perf)."""
    data = request.get_json(silent=True) or {}
    fen  = data.get("fen", "")
    weaknesses = data.get("weaknesses", [])
    perf = data.get("perf", [])            # list of player eval drops so far
    elo_override = data.get("elo")          # optional fixed elo

    sf = find_stockfish()
    if not sf or not fen:
        return jsonify({"error": "Engine not available"}), 500
    try:
        board = chess.Board(fen)
    except Exception:
        return jsonify({"error": "Invalid FEN"}), 400

    # Live calibration — start moderate, hone toward the player's real level
    est_elo = int(elo_override) if elo_override else estimate_player_elo(perf)
    # Bot plays slightly around the player's estimated level so games stay competitive
    target_elo = int(max(500, min(2200, est_elo + random.randint(-60, 40))))

    try:
        with chess.engine.SimpleEngine.popen_uci(sf) as engine:
            limit = configure_bot_strength(engine, target_elo)
            result = engine.play(board, limit)
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
                    "est_elo": est_elo,          # player's estimated level (for UI)
                    "bot_elo": target_elo,       # strength the bot just played at
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
    """Two-phase coaching: classify the moment, then ask -> (player engages) -> reveal.
    Silent by default; only speaks on real teaching moments. Every move it names is
    Stockfish's actual top move, so it's never wrong."""
    data = request.get_json(silent=True) or {}
    fen          = data.get("fen", "")
    weaknesses   = data.get("weaknesses", [])
    played_moves = data.get("played_moves", []) or []
    request_type = data.get("type", "position")  # position | hint | explain

    sf = find_stockfish()
    if not sf or not fen:
        return jsonify({"silent": True})
    try:
        board = chess.Board(fen)
    except Exception:
        return jsonify({"silent": True})

    try:
        with chess.engine.SimpleEngine.popen_uci(sf) as engine:
            engine.configure({"Threads": 1, "Hash": 32})
            top_lines = analyse_pv(engine, board, depth=12, multipv=3)
        if not top_lines:
            return jsonify({"silent": True})
        eval_pawns = round((top_lines[0].get("score_cp") or 0) / 100, 1)
        best_uci = top_lines[0]["move"]
        try: best_san = board.san(best_uci)
        except Exception: best_san = None
        player = board.turn

        # ── Hint / Explain buttons: a single direct answer (still from the engine) ──
        if request_type in ("hint", "explain"):
            my_loose = find_loose_pieces(board, player)
            if request_type == "hint":
                if my_loose:
                    sq, pc = my_loose[0]
                    text = f"{gm_phrase(VOICE_BAD)} First — your {PIECE_NAMES.get(pc.piece_type,'piece')} on {chess.square_name(sq)} is hanging. Deal with that. The engine plays {best_san}."
                else:
                    bf = chess.square_name(best_uci.from_square)
                    bpc = board.piece_at(best_uci.from_square)
                    text = f"{gm_phrase(VOICE_OPEN)} Look at your {PIECE_NAMES.get(bpc.piece_type,'piece')} on {bf} — that's where the strongest move is ({best_san})."
            else:
                good = (eval_pawns > 0) == (player == chess.WHITE)
                adv = abs(eval_pawns)
                state = ("dead level" if adv < 0.3 else "slightly better" if adv < 0.8 else "clearly better" if adv < 1.6 else "much better" if adv < 3 else "winning")
                text = f"📊 {'You are' if good else 'They are'} {state} ({'+' if eval_pawns>=0 else ''}{eval_pawns}). Engine's move: {best_san}."
            return jsonify({
                "silent": False, "scenario": request_type, "reaction": "neutral",
                "dialogue": [{"phase": "reveal", "text": text, "wait": False}],
                "arrows": [build_arrow(best_uci, "#26d07c")], "highlights": [],
                "eval": eval_pawns, "best_move_san": best_san,
            })

        # ── Default: classify the moment and build a two-phase question -> reveal ──
        scenario, ctx = classify_moment(board, top_lines, played_moves)
        if scenario == "quiet":
            return jsonify({"silent": True, "eval": eval_pawns, "best_move_san": best_san})
        built = build_coach_dialogue(scenario, ctx, board, top_lines)
        if not built:
            return jsonify({"silent": True, "eval": eval_pawns, "best_move_san": best_san})
        mcq = maybe_build_mcq(board, top_lines, position_type="tactical" if scenario == "tactical_opportunity" else "positional", force=False)
        return jsonify({
            "silent": False,
            "scenario": scenario,
            "reaction": ctx.get("reaction", "neutral"),
            "dialogue": built["dialogue"],
            "arrows": built["arrows"],
            "highlights": built["highlights"],
            "eval": eval_pawns,
            "best_move_san": best_san,
            "mcq": mcq,
        })
    except Exception:
        return jsonify({"silent": True})

# ── GM Coach helpers (v2 — Grandmaster mode) ──────────────────────────────────
PIECE_NAMES = {chess.PAWN:"pawn",chess.KNIGHT:"knight",chess.BISHOP:"bishop",chess.ROOK:"rook",chess.QUEEN:"queen",chess.KING:"king"}
PIECE_VALS  = {chess.PAWN:1,chess.KNIGHT:3,chess.BISHOP:3,chess.ROOK:5,chess.QUEEN:9,chess.KING:99}

# Hardcoded opening book — match by longest move-sequence prefix.
OPENING_BOOK = [
    (["e4"], "King's Pawn Opening", "Claiming the center with the most direct pawn. Opens lines for the queen and bishop — classical and aggressive."),
    (["e4","e5"], "Open Game", "Both sides claim the center. Expect sharp tactical play — knights come out first."),
    (["e4","e5","Nf3"], "King's Knight Opening", "Develop the knight, attack the e5 pawn, prepare castling. Classical opening principles in action."),
    (["e4","e5","Nf3","Nc6"], "Open Game (Knights)", "Both knights to their best squares. Now choose: Italian (Bc4), Spanish (Bb5), or Scotch (d4)?"),
    (["e4","e5","Nf3","Nc6","Bc4"], "Italian Game", "The Italian — your bishop eyes f7, the weakest square in Black's camp. Sharp attacking ideas lurk. Greco was analysing this in 1620."),
    (["e4","e5","Nf3","Nc6","Bb5"], "Ruy Lopez", "The Spanish — the bishop pressures the knight defending e5. Carlsen and Kasparov built careers on this. Deep, strategic, long-term."),
    (["e4","e5","Nf3","Nc6","d4"], "Scotch Game", "Aggressive central push — opens lines immediately for active piece play. Kasparov revived it in the 90s."),
    (["e4","e5","Nf3","Nc6","Nc3"], "Three Knights", "Symmetric development. Solid but a bit quiet. Black often goes ...Nf6 for the Four Knights."),
    (["e4","e5","Nf3","Nf6"], "Petroff Defence", "Counter-attack instead of defend. The hallmark of modern elite play — Karpov and Caruana love it. Solid as a rock."),
    (["e4","c5"], "Sicilian Defence", "The most popular reply to 1.e4. Black fights for the center asymmetrically — expect imbalance, complexity, counter-punches. Don't try to be tidy."),
    (["e4","c5","Nf3"], "Open Sicilian", "White prepares d4 to blow open the position. This is sharpest Sicilian territory."),
    (["e4","c5","Nf3","d6"], "Sicilian (Najdorf/Dragon zone)", "Najdorf or Dragon waits in the wings — both Fischer's favourite. Razor-sharp opening prep matters here."),
    (["e4","e6"], "French Defence", "Solid but somewhat passive. Black builds a pawn chain and waits to break with ...c5 or ...f6. Watch out — the light-squared bishop is often the problem piece."),
    (["e4","c6"], "Caro-Kann Defence", "Classical and rock-solid. Black prepares ...d5 without blocking the bishop like the French does. Karpov's weapon of choice."),
    (["e4","d5"], "Scandinavian Defence", "Direct — challenges e4 immediately. Loses a tempo recovering the queen but simplifies White's options."),
    (["e4","Nf6"], "Alekhine's Defence", "Provoke pawns forward, then attack them. Hypermodern in concept."),
    (["e4","g6"], "Modern Defence", "Hypermodern fianchetto setup. Let White build the center, then strike at it."),
    (["d4"], "Queen's Pawn Opening", "The strategic, slower-burn alternative to 1.e4. Often leads to closed positions and long-term planning."),
    (["d4","d5"], "Closed Game", "Symmetric d-pawns. White will look for c4 to challenge the center."),
    (["d4","d5","c4"], "Queen's Gambit", "White offers the c-pawn for central control. Almost always declined — accepting it loses time and a tempo."),
    (["d4","d5","c4","e6"], "Queen's Gambit Declined", "Solid, classical. Black builds a fortress and waits for the right break."),
    (["d4","d5","c4","c6"], "Slav Defence", "Defend d5 without blocking the c8-bishop. Solid and flexible — favoured by many world champions."),
    (["d4","Nf6"], "Indian Defence", "Delay ...d5 and develop pieces first. Hypermodern philosophy — let the center come to you."),
    (["d4","Nf6","c4","g6"], "King's Indian Defence", "Black's fianchetto. Let White build the big center, then strike with ...e5 or ...c5 and storm the king. Kasparov's weapon."),
    (["d4","Nf6","c4","e6"], "Indian Setup (Nimzo/Queen's Indian zone)", "Pure strategy — Nimzo or Queen's Indian. Pin the knight, control e4, win without firework."),
    (["d4","Nf6","c4","e6","Nc3","Bb4"], "Nimzo-Indian Defence", "Pin the knight, threaten to double White's c-pawns. Aron Nimzowitsch's signature — strategy in its purest form."),
    (["d4","f5"], "Dutch Defence", "Aggressive — fight for e4 immediately. Risky but ambitious. Creates kingside attacking chances at the cost of king safety."),
    (["c4"], "English Opening", "Flank attack on the center. Flexible — transposes into many systems. Botvinnik's favourite."),
    (["Nf3"], "Réti Opening", "Hypermodern: develop first, choose structure later. Loads of transpositions possible."),
]
# Sort by sequence length DESCENDING so longest match wins
OPENING_BOOK.sort(key=lambda x: -len(x[0]))

def detect_opening(san_moves):
    """Return (name, theme) for the longest matching prefix in OPENING_BOOK, or (None, None)."""
    if not san_moves: return None, None
    for seq, name, theme in OPENING_BOOK:
        if len(seq) > len(san_moves): continue
        if list(san_moves[:len(seq)]) == seq:
            return name, theme
    return None, None

# Coach voice — modeled on how a hype GM coaches a beginner: casual, emotional,
# Socratic, principle-naming. Big varied pools so it never repeats itself.
VOICE_OPEN = ["Yo, hold up.","Okay okay, look.","Wait wait wait.","Bro, look at this.","Ooh, pay attention here.","Alright, eyes up.","Hmm, one sec.","Check this out.","Okay, real quick —","Notice something?","Hold on, dude.","Right, look.","Ayy, see it?","Stop — look at the board.","Okay, this is important.","Peep this."]
VOICE_GOOD = ["Boom! That's it.","Yes! Nice.","Monster move.","Ohhh, beautiful.","That's the one, baby.","Sheesh, clean.","Big brain, dude.","That's nasty — I love it.","Yep, that's the engine move.","You saw that? Sick.","Textbook. Chef's kiss.","There it is!","That's a coach's move right there.","Sharp. Real sharp.","Okay okay, you cooked.","That's what I'm talking about."]
VOICE_BAD  = ["Oh no, wait.","Ohhh dude, no.","Yikes.","Wait wait wait wait.","Uh oh.","Ooh, that one hurts.","Bro. Bro. Look.","Nooo, not that.","Ahh, that's rough.","Oof, careful.","Hmm, I don't love that.","Hold up — that's a problem.","Ehh, that stings.","Come on now, look.","That's a slip, dude.","Mmm, we gotta talk about this one."]
VOICE_TACTIC = ["There's a shot here, I can feel it.","Somebody's hanging, dude — find it.","Tactic on the board. Calculate.","Ooh, this is sharp. Checks first.","Free stuff is floating around — grab it.","There's a punch here. Throw it.","Fork, pin, skewer — one of 'em is live.","Loose pieces, dude. LPDO — loose pieces drop off.","This position is BEGGING for a combo.","Count it out — there's material to win.","Don't play safe, there's a hit.","Eyes on every check and capture, bro.","This is a calculate spot, not a vibe spot.","Somebody left a piece — go get it.","Slow down and find the tactic.","There's a tell here — spot the weak piece."]
VOICE_POS  = ["Quiet spot — improve your worst piece.","No fireworks, dude. Just good chess.","Slow position. Think plans.","Where's your saddest piece? Fix it.","Nothing forcing — build up.","This is a maneuvering moment, bro.","Small edges. Stack 'em.","Trade your bad piece for their good one.","Space, structure, squares. That's the game now.","Patience — it's not ready to blow up.","Ask what the position wants, dude.","Long game here. Don't rush.","Reposition, then strike.","Keep the tension — don't rush the trade.","Get a knight to an outpost if you can.","Boring is fine. Boring wins."]
VOICE_CRIT = ["Okay — THIS is the moment.","Bro, the whole game turns here.","Don't rush this one, dude.","Critical. Slow way down.","Everything hinges on this move.","This is a games-won-or-lost spot.","Take your time. Big one.","Deep breath. This matters.","The plan lives or dies right here.","Make it count, baby.","This is a thinking move, not a reflex.","Get this right and you're winning.","Fork in the road — choose well.","No autopilot here, dude.","Remember this position.","Precision now. Lock in."]
VOICE_THREAT = ["See what they just did? That's a threat.","That move wasn't random, bro — they want something.","They just set a trap. Spot it.","Don't ignore their last move — it's got teeth.","They're coming for a piece. Which one?","You're being threatened. Defend or counter first.","Their move attacks — what exactly?","Careful, dude, that had a point.","They've got an idea. What is it?","Uh oh — they're threatening something real."]
SOCRATIC = ["What's their move threatening?","What's your worst piece right now?","Any checks, captures, or threats for YOU?","If you do nothing, what happens?","Which of your pieces is hanging?","Which file just opened up?","Is that a principled move, though?","Can you improve a piece for free?","Is your king safe enough to attack?","What did their last move give up?","Where's the weakest square in their camp?","Trade, push, or wait — which, and why?"]

def piece_label(piece):
    if not piece: return "piece"
    return PIECE_NAMES.get(piece.piece_type,"piece")

def total_non_king_material(board):
    total = 0
    for sq in chess.SQUARES:
        p = board.piece_at(sq)
        if p and p.piece_type != chess.KING:
            total += PIECE_VALS.get(p.piece_type, 0)
    return total

def classify_position_type(board, eval_pawns, fullmove):
    """Return 'opening' | 'tactical' | 'positional' | 'endgame' | 'critical_decision'."""
    if fullmove <= 10: return "opening"
    mat = total_non_king_material(board)
    if mat <= 24: return "endgame"
    if abs(eval_pawns) >= 2.5: return "critical_decision"
    return "positional"

def detect_themes(board, player_color):
    """Detect a few simple strategic themes. Returns list of short strings."""
    themes = []
    # Opposite-side castling — kings on opposite wings
    wk_sq = board.king(chess.WHITE); bk_sq = board.king(chess.BLACK)
    if wk_sq is not None and bk_sq is not None:
        wf = chess.square_file(wk_sq); bf = chess.square_file(bk_sq)
        if (wf >= 5 and bf <= 2) or (wf <= 2 and bf >= 5):
            themes.append("Opposite-side castling — race to attack.")
    # Open file (no pawns on any rank)
    open_files = []
    for f in range(8):
        has_pawn = False
        for r in range(8):
            sq = chess.square(f, r)
            p = board.piece_at(sq)
            if p and p.piece_type == chess.PAWN:
                has_pawn = True; break
        if not has_pawn:
            open_files.append("abcdefgh"[f])
    if open_files:
        themes.append(f"Open {'file' if len(open_files)==1 else 'files'}: {', '.join(open_files)} — rook territory.")
    # Bishop pair imbalance
    w_bishops = len(board.pieces(chess.BISHOP, chess.WHITE))
    b_bishops = len(board.pieces(chess.BISHOP, chess.BLACK))
    if w_bishops == 2 and b_bishops < 2:
        themes.append("White has the bishop pair.")
    elif b_bishops == 2 and w_bishops < 2:
        themes.append("Black has the bishop pair.")
    # Passed pawn — for the player to move
    for color in (chess.WHITE, chess.BLACK):
        for sq in board.pieces(chess.PAWN, color):
            f = chess.square_file(sq); r = chess.square_rank(sq)
            blocked = False
            for nf in (f-1, f, f+1):
                if nf < 0 or nf > 7: continue
                rng = range(r+1, 8) if color == chess.WHITE else range(0, r)
                for nr in rng:
                    p = board.piece_at(chess.square(nf, nr))
                    if p and p.piece_type == chess.PAWN and p.color != color:
                        blocked = True; break
                if blocked: break
            if not blocked:
                side = "White" if color == chess.WHITE else "Black"
                themes.append(f"{side} has a passed {chess.square_name(sq)[0]}-pawn — push it.")
                break  # one passed pawn callout per side
    return themes[:3]

def gm_phrase(pool):
    return random.choice(pool) if pool else ""

def opening_lesson(board_before, move, san, fullmove):
    """Gotham-style principle nudge for a non-blunder opening move (or praise for castling).
    Lets the coach teach principles proactively, not just react to eval drops."""
    if san.startswith("O-O"):
        return random.choice([
            "Yes! Castle. King's safe now — exactly right. Get those rooks into the game next.",
            "Castling, baby. King tucked away, rook activated. Textbook.",
            "Good — king safety first. NOW you can start thinking about attacking.",
        ])
    if fullmove > 12:
        return None
    pc = board_before.piece_at(move.from_square)
    if not pc:
        return None
    ff = chess.square_file(move.from_square)
    if pc.piece_type == chess.PAWN and ff == 5 and move.from_square in (chess.F2, chess.F7):
        return random.choice([
            "Ooh, careful with that f-pawn, bro. That pawn is your king's bodyguard — it's literally why scholar's mate targets f7. Try not to move it early.",
            "Mmm, the f-pawn — I wanna break this habit. It guards your king. Get your knights and bishops out instead.",
            "That f-pawn opens up your king, dude. Keep it home — develop and castle instead.",
        ])
    if pc.piece_type == chess.QUEEN and fullmove <= 6:
        return random.choice([
            f"Queen out early with {san}? They'll just develop and hit it with tempo — free time for them. Knights and bishops first, bro.",
            "Careful — early queen. Every time they attack it, they develop for free. Minor pieces first.",
            "The queen comes out AFTER the knights and bishops. Otherwise you're handing them targets.",
        ])
    return None

# ══════════════════════════════════════════════════════════════════════════════
# Two-phase coaching dialogue (ask -> wait -> reveal), Gotham-style.
# {piece}/{sq} = your threatened piece; {tpiece}/{tsq} = a loose enemy piece;
# {best} = Stockfish's actual top move (so the reveal is NEVER wrong).
# ══════════════════════════════════════════════════════════════════════════════
DIALOGUE = {
  "opponent_threat": {
    "q": [
      "Wait — see what they just did? What's under attack right now?",
      "Hold up. Your {piece} on {sq} — you sure it's safe?",
      "Ooh, careful. What are they threatening this move?",
      "They didn't move that for fun, dude. What's the threat?",
      "Uh oh. Count the attackers on {sq}. Safe, or not?",
      "Do you see it? Something of yours is loose.",
      "Their last move had a point. What is it?",
      "Look at your {piece}. Defended enough, you think?",
      "That move attacks something. Can you spot what?",
      "Danger, bro. Which piece is hanging?",
      "Before you touch anything — is your {piece} on {sq} okay?",
      "Pause. If you ignore their move, what happens?",
      "See the threat? {sq} is in trouble.",
      "Bro, look at {sq}. You feel good about that?",
    ],
    "r": [
      "Yeah — your {piece} on {sq} is hanging. {best} is the clean way out. Defend, move, or hit back harder — that's always the choice.",
      "Exactly. They're winning that {piece} unless you act. {best} solves it. Loose pieces drop off — that's LPDO.",
      "Right — {sq} is the problem. {best} fixes it. Never leave a piece hanging when it's your move.",
      "That's the threat. {best} deals with it and keeps you solid.",
      "You got it. {best} handles it. Rule: address the threat, or make a bigger one.",
      "See? {best} saves the piece. A move you don't defend against is a move that beats you.",
      "Bingo. {best} is the move — it takes the sting out of their threat.",
    ],
  },
  "tactical_opportunity": {
    "q": [
      "Ooh — I smell something. What can you win here?",
      "Their {tpiece} on {tsq} looks loose. Can you punish it?",
      "There's a shot on the board. Do you see it?",
      "Checks, captures, threats — run the list. What jumps out?",
      "They left something. What are you taking?",
      "This is a calculate spot, not a vibe spot. What wins?",
      "Free stuff alert. Which piece can you grab?",
      "Something's hanging for THEM. Find it.",
      "You've got a tactic here, bro. Where?",
      "What's the most forcing move you have right now?",
      "Their {tsq} — how many of your pieces see it?",
      "Don't play safe. There's a punch here — throw it.",
    ],
    "r": [
      "There it is — {best}. That's the shot. When they hang a piece, you take the piece.",
      "Boom. {best} wins material. Nine times out of ten, spotting free stuff is the whole game at this level.",
      "Yes! {best}. Forcing and strong — that's how you punish a loose piece.",
      "{best} is the one. Checks and captures first, always — that's how you find these.",
      "Monster. {best} grabs it. That's a one-mover: you make a move, you get the reward.",
      "Exactly — {best}. Piece coordination: your pieces were already aiming there.",
      "{best}. Take it, dude. Don't overthink free material.",
    ],
  },
  "pre_castling": {
    "q": [
      "Quick one — by which move should you usually castle?",
      "Your king's still in the middle. Feel safe about that?",
      "It's past move 8 and no castle yet. What should you prioritize?",
      "Where does your king want to be right now?",
      "Center's getting spicy and your king's still home. Thoughts?",
      "What's the one thing you haven't done that a coach would nag about?",
      "King safety check — are you happy where your king is?",
    ],
    "r": [
      "Castle, dude — {best}. The whole point of castling is a safe king AND a rook in the game. Aim to castle by move 8.",
      "Yeah — get the king tucked away. {best}. A king in the center is a king in danger.",
      "Right, {best}. Safety first, then you attack. Don't get caught with your king in the middle.",
      "{best}. Castle now while it's quiet — you won't get to later.",
      "Exactly — {best}. King safe, rook activated. That's principled chess.",
    ],
  },
  "critical_decision": {
    "q": [
      "Okay — THIS is the moment. What's the plan?",
      "Big decision here. Attack, trade, or improve a piece?",
      "You're much better — what's the cleanest way to convert?",
      "The game turns on this move. What are you going for?",
      "Don't rush. What does the position actually want?",
      "You're worse — where's your counterplay?",
      "What's your worst piece, and can you fix it right now?",
      "If you could make any move, what would win it?",
    ],
    "r": [
      "The engine's plan is {best}. When you're winning, simplify and keep it clean — don't give it back.",
      "{best} is the move. Improve your worst piece, trade when ahead, complicate when behind.",
      "Go with {best}. Convert like a sport — if they don't get a chance, they can't come back.",
      "{best}. Slow, precise chess here. This is where games are won.",
      "Yeah — {best}. Ask what the position wants, then give it that.",
    ],
  },
  "endgame_technique": {
    "q": [
      "Endgame now. What's the fastest way to win this?",
      "Few pieces left — where does your king belong?",
      "You're up material. Trades or no trades?",
      "What's the plan — push a pawn, activate the king, or trade down?",
      "How do you turn this edge into a queen?",
      "Endgame rule time — what's priority one here?",
    ],
    "r": [
      "{best}. In the endgame the king is a fighter — march it up. And when you're ahead, trade pieces, not pawns.",
      "Go {best}. Up material? Trade down and push a passer. Queen resurrecting is the fastest win.",
      "{best}. Activate, then advance. Passed pawns must be pushed.",
      "Yeah — {best}. Simplify when ahead; every trade makes your extra material bigger.",
      "{best}. King and pawns win endgames — get the king in the fight.",
    ],
  },
}

def _fmt(t, ctx):
    for k, v in ctx.items():
        t = t.replace("{"+k+"}", str(v))
    return t

def classify_moment(board, top_lines, played_moves):
    """Return (scenario, ctx). scenario='quiet' means stay silent."""
    if not top_lines:
        return "quiet", {}
    player = board.turn
    sign = 1 if player == chess.WHITE else -1
    eval_cp = top_lines[0].get("score_cp") or 0
    my_eval = eval_cp * sign
    gap = 0
    if len(top_lines) >= 2:
        gap = ((top_lines[0].get("score_cp") or 0) - (top_lines[1].get("score_cp") or 0)) * sign
    my_loose = find_loose_pieces(board, player)
    opp_loose = find_loose_pieces(board, not player)
    fullmove = board.fullmove_number
    mat = total_non_king_material(board)
    best_uci = top_lines[0]["move"]
    best_from = chess.square_name(best_uci.from_square)
    ctx = {"best_from": best_from, "reaction": "neutral"}

    # 1) opponent just threatens one of your pieces
    if my_loose:
        sq, pc = my_loose[0]
        ctx.update({"sq": chess.square_name(sq), "piece": PIECE_NAMES.get(pc.piece_type, "piece"),
                    "reaction": "concerned"})
        return "opponent_threat", ctx
    # 2) you can win material (clear best move, or a loose enemy piece to grab)
    if opp_loose and gap >= 120:
        sq, pc = opp_loose[0]
        ctx.update({"tsq": chess.square_name(sq), "tpiece": PIECE_NAMES.get(pc.piece_type, "piece"),
                    "reaction": "excited"})
        return "tactical_opportunity", ctx
    if gap >= 200:
        ctx["reaction"] = "excited"
        return "tactical_opportunity", ctx
    # 3) haven't castled and it's getting late
    king_sq = board.king(player)
    home = chess.E1 if player == chess.WHITE else chess.E8
    if board.has_castling_rights(player) and fullmove > 8 and king_sq == home:
        ctx["reaction"] = "curious"
        return "pre_castling", ctx
    # 4) endgame with something to convert
    if mat <= 20 and abs(my_eval) >= 150:
        ctx["reaction"] = "neutral"
        return "endgame_technique", ctx
    # 5) decisive middlegame moment
    if abs(my_eval) >= 250 and mat > 20:
        ctx["reaction"] = "curious"
        return "critical_decision", ctx
    return "quiet", ctx

def build_coach_dialogue(scenario, ctx, board, top_lines):
    """Two-phase dialogue + synced arrows/highlights, using the REAL engine move."""
    best_uci = top_lines[0]["move"]
    try: best_san = board.san(best_uci)
    except Exception: best_san = None
    ctx = dict(ctx); ctx["best"] = best_san or "the best move"
    bank = DIALOGUE.get(scenario)
    if not bank or not best_san:
        return None
    question = _fmt(gm_phrase(bank["q"]), ctx)
    reveal   = _fmt(gm_phrase(bank["r"]), ctx)
    highlights, arrows = [], []
    # question phase: point at the danger (red) or the target (green)
    if scenario == "opponent_threat" and ctx.get("sq"):
        highlights = [{"square": ctx["sq"], "color": "#ff4d4d", "label": "vulnerable"}]
    elif scenario == "tactical_opportunity" and ctx.get("tsq"):
        highlights = [{"square": ctx["tsq"], "color": "#26d07c", "label": "target"}]
    # reveal phase: green arrow for the engine's move
    arrows = [build_arrow(best_uci, "#26d07c")]
    return {
        "dialogue": [
            {"phase": "question", "text": question, "wait": True},
            {"phase": "reveal", "text": reveal, "wait": False},
        ],
        "highlights": highlights,
        "arrows": arrows,
    }

def piece_label(piece):
    if not piece: return "piece"
    return PIECE_NAMES.get(piece.piece_type,"piece")

def find_loose_pieces(board, color):
    """Pieces of `color` where attackers > defenders, or the cheapest attacker is worth less than the piece."""
    out = []
    for sq in chess.SQUARES:
        p = board.piece_at(sq)
        if not p or p.color != color or p.piece_type == chess.KING: continue
        attackers = list(board.attackers(not color, sq))
        if not attackers: continue
        defenders = list(board.attackers(color, sq))
        if len(attackers) > len(defenders):
            out.append((sq, p)); continue
        min_att_vals = [PIECE_VALS.get(board.piece_at(a).piece_type, 9) for a in attackers if board.piece_at(a)]
        if min_att_vals and min(min_att_vals) < PIECE_VALS.get(p.piece_type, 9):
            out.append((sq, p))
    return out

def classify_move_severity(drop_cp):
    if drop_cp >= 300: return "blunder"
    if drop_cp >= 150: return "mistake"
    if drop_cp >= 60:  return "inaccuracy"
    if drop_cp >= 20:  return "ok"
    return "best"

def build_arrow(move, color="#ff7043"):
    if not move: return None
    u = move.uci()
    return {"from": u[:2], "to": u[2:4], "color": color}

def square_highlight(sq, color, label=""):
    return {"square": chess.square_name(sq), "color": color, "label": label}

def analyse_pv(engine, board, depth=12, multipv=3):
    """Return list of dicts: [{move, san, score_cp, pv_san}] best first."""
    try:
        info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=multipv)
    except Exception:
        return []
    items = info if isinstance(info, list) else [info]
    out = []
    for i in items:
        pv = i.get("pv", [])
        if not pv: continue
        mv = pv[0]
        try: san = board.san(mv)
        except Exception: san = mv.uci()
        cp = None
        sc = i.get("score")
        if sc is not None:
            cp = sc.white().score(mate_score=10000)
        try:
            tmp = board.copy(); sans=[]
            for m in pv[:4]:
                if m in tmp.legal_moves: sans.append(tmp.san(m)); tmp.push(m)
            pv_san = " ".join(sans)
        except Exception:
            pv_san = san
        out.append({"move": mv, "san": san, "score_cp": cp, "pv_san": pv_san})
    return out

def build_socratic_question(board, weaknesses, last_bot_san, top_lines, played_moves=None, opening_name=None, opening_theme=None, position_type="positional", themes=None):
    """GM-style coaching: conversational, theory-aware, deep. Returns dict with questions, arrows, highlights."""
    player_turn = board.turn
    nudges, arrows, highlights = [], [], []
    themes = themes or []

    # 1) Opening teaching (only in opening phase)
    if position_type == "opening" and opening_name:
        nudges.append(f"📖 We're in the {opening_name}. {opening_theme}")
        nudges.append("Opening rule: develop knights before bishops, castle by move 8, don't move the same piece twice. Which piece is your worst-developed right now?")

    # 2) Opponent's last move — Socratic challenge
    if last_bot_san:
        nudges.append(f"{gm_phrase(VOICE_OPEN)} Opponent played {last_bot_san}. Ask yourself three things — what does it attack now, what did it leave undefended, and is it a threat or a setup?")

    # 3) Check — top priority
    if board.is_check():
        nudges.append("⚠️ You're in check. King to safety FIRST. List your legal options — block, capture, move — then pick the safest.")

    # 4) My loose pieces (defensive scan)
    my_loose = find_loose_pieces(board, player_turn)
    if my_loose:
        sq, p = my_loose[0]
        nudges.append(f"⚠️ Your {piece_label(p)} on {chess.square_name(sq)} looks vulnerable. Count attackers vs defenders. If attackers outnumber, you must move, defend, or trade — NOW.")
        highlights.append(square_highlight(sq, "#ff4d4d", "vulnerable"))

    # 5) Opponent's loose pieces (offensive scan)
    opp_loose = find_loose_pieces(board, not player_turn)
    if opp_loose and not my_loose:
        sq, p = opp_loose[0]
        nudges.append(f"👀 Their {piece_label(p)} on {chess.square_name(sq)} is loose. Can you win it — or use the threat of taking it to do something even bigger?")
        highlights.append(square_highlight(sq, "#26d07c", "target"))

    # 6) Tactical / concrete move available
    if top_lines:
        best = top_lines[0]
        cp = best.get("score_cp") or 0
        sign = 1 if player_turn == chess.WHITE else -1
        my_cp = cp * sign
        if len(top_lines) >= 2:
            second_cp = (top_lines[1].get("score_cp") or 0) * sign
            gap = my_cp - second_cp
            if gap >= 150:
                nudges.append(f"💡 {gm_phrase(VOICE_TACTIC)} One move stands clearly above the rest. Scan: checks first, then captures, then threats. Find it before moving.")
                arrows.append(build_arrow(best["move"], "#26d07c"))
            elif gap >= 60 and position_type == "critical_decision":
                nudges.append(f"{gm_phrase(VOICE_CRIT)} The engine has a slight preference — but the real lesson is the plan. Why does this move work?")

    # 7) Position-type framing
    if position_type == "endgame":
        nudges.append("🏁 Endgame. Activate the king — it's a fighting piece now, not a target. Push passed pawns. Trade pieces (not pawns) if ahead.")
    elif position_type == "critical_decision" and not my_loose and not board.is_check():
        nudges.append(f"{gm_phrase(VOICE_CRIT)} Eval is decisive — converting matters more than finding fireworks. Simplify when ahead, complicate when behind.")
    elif position_type == "positional" and not opp_loose and not my_loose:
        nudges.append(f"{gm_phrase(VOICE_POS)} Three questions — which is your worst piece, where does it want to be, how do you get it there?")

    # 8) Theme callouts (open files, bishop pair, etc.)
    for th in themes:
        nudges.append(f"🎯 {th}")

    # 9) King safety reminders
    if board.has_castling_rights(player_turn) and board.fullmove_number > 8 and not my_loose:
        nudges.append("You're past move 8 and still uncastled. Is there a concrete reason? If not — castle this move.")

    # 10) Weakness-specific personalised lines
    if "Hanging piece" in weaknesses and not my_loose and board.fullmove_number > 5:
        nudges.append("Your pattern: hanging pieces. LPDO — Loose Pieces Drop Off. Point at each of your pieces, confirm it's defended.")
    if "Missed tactic" in weaknesses and not opp_loose:
        nudges.append("Your pattern: missed tactics. Every move, scan checks → captures → threats. In that order.")
    if "Early queen development" in weaknesses and board.fullmove_number < 10:
        for sq in chess.SQUARES:
            p = board.piece_at(sq)
            if p and p.color == player_turn and p.piece_type == chess.QUEEN and sq not in (chess.D1, chess.D8):
                nudges.append("Your queen is out early — every defence costs you a tempo while opponent develops for free.")
                break

    if not nudges:
        nudges.append(f"{gm_phrase(VOICE_POS)} Position is calm. What does the position WANT? Improve your worst piece.")

    # Cap to 4 questions — too many is noise
    return {"questions": nudges[:4], "arrows": arrows, "highlights": highlights}

def generate_distractors(board, best_move, top_lines):
    distractors = []
    for ln in top_lines[1:]:
        if ln["move"] != best_move and ln["san"] not in distractors:
            distractors.append(ln["san"])
        if len(distractors) >= 2: break
    legal = list(board.legal_moves); random.shuffle(legal)
    for m in legal:
        if m == best_move: continue
        try: san = board.san(m)
        except Exception: continue
        if san in distractors: continue
        if board.is_capture(m) or board.gives_check(m):
            distractors.append(san)
        if len(distractors) >= 3: break
    for m in legal:
        if m == best_move: continue
        try: san = board.san(m)
        except Exception: continue
        if san not in distractors:
            distractors.append(san)
        if len(distractors) >= 3: break
    return distractors[:3]

def maybe_build_mcq(board, top_lines, position_type="positional", force=False):
    """Build a forced-engagement MCQ. With force=True, always returns one (used on blunders).
    Otherwise requires a meaningful gap (150cp) to avoid spamming."""
    if len(top_lines) < 2: return None
    best, second = top_lines[0], top_lines[1]
    cp1 = best.get("score_cp") or 0
    cp2 = second.get("score_cp") or 0
    sign = 1 if board.turn == chess.WHITE else -1
    gap = (cp1 - cp2) * sign
    if not force and gap < 150: return None
    distractors = generate_distractors(board, best["move"], top_lines)
    options = [best["san"]] + distractors
    random.shuffle(options)
    correct_index = options.index(best["san"])
    # Choose question framing based on position type
    qmap = {
        "tactical": "There's a tactic here. Which move wins?",
        "critical_decision": "Critical moment — which move keeps you in control?",
        "endgame": "Endgame technique — what's the precise move?",
        "opening": "Opening principles — which move is correct here?",
        "positional": "Quiet position — which move improves the most?",
    }
    return {
        "question": qmap.get(position_type, "Which move is best in this position?"),
        "options": options,
        "correct_index": correct_index,
        "explanation": f"Best is {best['san']} — engine line: {best['pv_san']}.",
        "force": True,  # frontend uses this to lock the board
    }

@app.route("/coach-question", methods=["POST"])
def coach_question():
    """GM-style coaching prompt with theory, themes, position-typing, and forced-engagement MCQ on critical positions."""
    data = request.get_json(silent=True) or {}
    fen = data.get("fen","")
    weaknesses = data.get("weaknesses", [])
    last_bot_san = data.get("last_bot_san", "")
    played_moves = data.get("played_moves", []) or []  # list of SAN strings
    sf = find_stockfish()
    fallback = {"questions":["Take your time."],"arrows":[],"highlights":[],"eval":0,"mcq":None,"position_type":"positional","opening":None,"themes":[],"theory":[]}
    if not sf or not fen:
        return jsonify(fallback)
    try: board = chess.Board(fen)
    except Exception:
        return jsonify(fallback)
    try:
        with chess.engine.SimpleEngine.popen_uci(sf) as engine:
            engine.configure({"Threads":1,"Hash":32})
            top_lines = analyse_pv(engine, board, depth=11, multipv=3)
        sc = (top_lines[0].get("score_cp") if top_lines else 0) or 0
        eval_pawns = round(sc/100, 1)
        opening_name, opening_theme = detect_opening(played_moves)
        position_type = classify_position_type(board, eval_pawns, board.fullmove_number)
        themes = detect_themes(board, board.turn)
        socratic = build_socratic_question(
            board, weaknesses, last_bot_san, top_lines,
            played_moves=played_moves, opening_name=opening_name, opening_theme=opening_theme,
            position_type=position_type, themes=themes,
        )
        # Build theory chips
        theory = []
        if opening_name:
            theory.append({"type":"opening","label":opening_name,"note":opening_theme or ""})
        for th in themes:
            theory.append({"type":"theme","label":th,"note":""})
        # Decide if we force an MCQ — yes on critical/tactical with clear best move
        force_mcq = position_type in ("tactical","critical_decision") and len(top_lines) >= 2
        mcq = maybe_build_mcq(board, top_lines, position_type=position_type, force=False)
        # Don't fire MCQ if no clear best move (gap < 150) — let player move freely
        return jsonify({
            "questions": socratic["questions"],
            "arrows": socratic["arrows"],
            "highlights": socratic["highlights"],
            "eval": eval_pawns,
            "best_move_san": top_lines[0]["san"] if top_lines else None,
            "mcq": mcq,
            "position_type": position_type,
            "opening": {"name": opening_name, "theme": opening_theme} if opening_name else None,
            "themes": themes,
            "theory": theory,
            "turn": "white" if board.turn == chess.WHITE else "black",
        })
    except Exception as e:
        return jsonify(fallback)

@app.route("/coach-move-feedback", methods=["POST"])
def coach_move_feedback():
    """Analyse the move the player just played. Silent on routine moves; speaks (with forced MCQ) on blunders & mistakes."""
    data = request.get_json(silent=True) or {}
    fen_before = data.get("fen_before","")
    san_played = data.get("san_played","")
    weaknesses = data.get("weaknesses", [])
    played_moves = data.get("played_moves", []) or []
    sf = find_stockfish()
    if not sf or not fen_before or not san_played:
        return jsonify({"severity":"ok","commentary":"","arrows":[],"highlights":[],"silent":True})
    try:
        board = chess.Board(fen_before)
        move = board.parse_san(san_played)
    except Exception:
        return jsonify({"severity":"ok","commentary":"","arrows":[],"highlights":[],"silent":True})
    player_color = board.turn
    fullmove = board.fullmove_number
    try:
        with chess.engine.SimpleEngine.popen_uci(sf) as engine:
            engine.configure({"Threads":1,"Hash":32})
            top_before = analyse_pv(engine, board, depth=12, multipv=2)
            score_before = (top_before[0].get("score_cp") if top_before else 0) or 0
            best_move = top_before[0]["move"] if top_before else None
            best_san = top_before[0]["san"] if top_before else None
            best_pv = top_before[0]["pv_san"] if top_before else ""
            board2 = board.copy(); board2.push(move)
            info_after = engine.analyse(board2, chess.engine.Limit(depth=12))
            score_after = info_after["score"].white().score(mate_score=10000) or 0
            opp_san = None
            try:
                opp_pv = info_after.get("pv",[])
                opp_best = opp_pv[0] if opp_pv else None
                if opp_best and opp_best in board2.legal_moves:
                    opp_san = board2.san(opp_best)
            except Exception: pass

        drop = max((score_before - score_after) if player_color == chess.WHITE else (score_after - score_before), 0)
        severity = classify_move_severity(drop)

        # Opening teaching: if we just entered the book or transitioned
        opening_name, opening_theme = detect_opening(played_moves + [san_played])
        opening_was, _ = detect_opening(played_moves)
        new_opening = opening_name and (opening_name != opening_was)

        # ── Decide whether to SPEAK (good timing = the whole game) ──
        # Speak only when there's real content: a meaningful eval drop (>=75cp),
        # or opening theory worth naming. Silent on tiny slips and routine moves —
        # a coach who talks every move is noise.
        # A principle worth teaching even when the move isn't a blunder (f-pawn, early queen, castling)
        lesson = opening_lesson(board, move, san_played, fullmove)

        should_speak = drop >= 75 or bool(lesson)
        if new_opening and severity in ("best", "ok") and fullmove <= 10:
            should_speak = True

        arrows, highlights, parts = [], [], []

        if not should_speak:
            return jsonify({
                "severity": severity,
                "drop_cp": int(drop),
                "eval_after": round(score_after/100, 1),
                "best_move_san": best_san,
                "best_pv": best_pv,
                "commentary": "",
                "arrows": [], "highlights": [],
                "mcq": None,
                "silent": True,
                "opening": {"name": opening_name, "theme": opening_theme} if opening_name else None,
            })

        # Voice — a teachable principle takes the mic when the move wasn't a real error
        if lesson and severity in ("best", "ok", "inaccuracy"):
            parts.append(lesson)
        elif severity == "best":
            parts.append(f"✅ {gm_phrase(VOICE_GOOD)} {san_played} was the top move.")
            if new_opening: parts.append(f"📖 We've entered the {opening_name}. {opening_theme}")
            if best_pv: parts.append(f"Continuation: {best_pv}.")
        elif severity == "ok":
            if new_opening:
                parts.append(f"📖 {gm_phrase(VOICE_GOOD)} {san_played} keeps us in the {opening_name}. {opening_theme}")
            else:
                parts.append(f"👍 {san_played} is playable.")
            if best_san and best_san != san_played:
                parts.append(f"Engine's slight preference: {best_san}.")
        elif severity == "inaccuracy":
            parts.append(f"🟡 {gm_phrase(VOICE_BAD)} {san_played} gives back a small edge.")
            if best_san:
                parts.append(f"Cleaner: {best_san} ({best_pv}). Look at the line — see why it's stronger?")
                arrows.append(build_arrow(best_move, "#f4c542"))
        elif severity == "mistake":
            parts.append(f"❌ {gm_phrase(VOICE_BAD)} {san_played} costs about {drop//100}.{(drop%100)//10} pawns.")
            if best_san:
                parts.append(f"The position needed {best_san}. Engine line: {best_pv}.")
                arrows.append(build_arrow(best_move, "#ff9800"))
            if opp_san:
                parts.append(f"Now your opponent gets {opp_san} — that's exactly the punishment you missed.")
        elif severity == "blunder":
            parts.append(f"🛑 {gm_phrase(VOICE_BAD)} {san_played} is a blunder — drops {drop//100}+ pawns.")
            if best_san:
                parts.append(f"You needed {best_san} ({best_pv}).")
                arrows.append(build_arrow(best_move, "#ff4444"))
            if opp_san:
                parts.append(f"Watch — opponent will punish with {opp_san}.")
            if "Hanging piece" in weaknesses:
                parts.append("This is your pattern. LPDO — was every piece defended before you moved?")
            elif "Missed tactic" in weaknesses:
                parts.append("This is your pattern. Checks → captures → threats. In that order. Every move.")

        # Forced MCQ on every blunder + mistake
        mcq = None
        if severity in ("blunder","mistake") and top_before and best_san:
            distractors = generate_distractors(board, best_move, top_before)
            options = [best_san] + distractors
            random.shuffle(options)
            correct_index = options.index(best_san)
            mcq = {
                "question": f"You played {san_played}. What was the right move?",
                "options": options,
                "correct_index": correct_index,
                "explanation": f"Best was {best_san}. Engine line: {best_pv}." + (f" Your opponent's threat: {opp_san}." if opp_san else ""),
                "force": True,
            }

        return jsonify({
            "severity": severity,
            "drop_cp": int(drop),
            "eval_after": round(score_after/100, 1),
            "best_move_san": best_san,
            "best_pv": best_pv,
            "commentary": " ".join(parts),
            "arrows": arrows,
            "highlights": highlights,
            "mcq": mcq,
            "silent": False,
            "opp_best_san": opp_san,
            "opening": {"name": opening_name, "theme": opening_theme} if opening_name else None,
        })
    except Exception:
        return jsonify({"severity":"ok","commentary":"","arrows":[],"highlights":[],"silent":True})

@app.route("/analyze-bot-game", methods=["POST"])
def analyze_bot_game():
    """Quick post-game review of a bot game. Returns mistakes + auto-generated puzzles from THIS game."""
    data = request.get_json(silent=True) or {}
    pgn = data.get("pgn","").strip()
    player_color = (data.get("player_color","") or "").strip().lower()
    if player_color not in ("white","black"):
        return jsonify({"error":"player_color must be white or black"}), 400
    if not pgn: return jsonify({"error":"PGN required"}), 400
    sf = find_stockfish()
    if not sf: return jsonify({"error":"Engine unavailable"}), 500
    try:
        game = chess.pgn.read_game(io.StringIO(pgn))
        if not game: return jsonify({"error":"Could not parse PGN"}), 400
    except Exception:
        return jsonify({"error":"Bad PGN"}), 400

    board = game.board()
    player_mistakes, move_reviews = [], []
    POST_DEPTH = 10
    try:
        with chess.engine.SimpleEngine.popen_uci(sf) as engine:
            engine.configure({"Threads":2,"Hash":64})
            for ply, move in enumerate(game.mainline_moves()):
                side = "white" if board.turn == chess.WHITE else "black"
                fen_before = board.fen()
                is_player = (side == player_color)
                if is_player:
                    info_b = engine.analyse(board, chess.engine.Limit(depth=POST_DEPTH))
                    sb = info_b["score"].white().score(mate_score=10000) or 0
                    pv = info_b.get("pv",[])
                    best_san, best_pv = None, ""
                    if pv and pv[0] in board.legal_moves:
                        best_san = board.san(pv[0])
                        try:
                            tmp = board.copy(); sans=[]
                            for m in pv[:4]:
                                if m in tmp.legal_moves: sans.append(tmp.san(m)); tmp.push(m)
                            best_pv = " ".join(sans)
                        except Exception: best_pv = best_san
                    san_played = board.san(move)
                    board.push(move)
                    info_a = engine.analyse(board, chess.engine.Limit(depth=POST_DEPTH))
                    sa = info_a["score"].white().score(mate_score=10000) or 0
                    drop = (sb - sa) if side=="white" else (sa - sb)
                    drop = max(int(drop), 0)
                    sev = classify_move_severity(drop)
                    move_reviews.append({
                        "ply": ply, "move_number": ply//2+1, "side": side,
                        "san": san_played, "severity": sev, "drop_cp": drop,
                        "best_move": best_san, "best_pv": best_pv,
                        "fen_before": fen_before,
                    })
                    if sev in ("blunder","mistake","inaccuracy"):
                        player_mistakes.append({
                            "ply": ply, "move_number": ply//2+1,
                            "san": san_played, "severity": sev, "drop_cp": drop,
                            "best_move": best_san, "best_pv": best_pv,
                            "fen_before": fen_before, "side": side,
                        })
                else:
                    board.push(move)
    except Exception as e:
        return jsonify({"error":f"Engine error: {e}"}), 500

    sorted_m = sorted(player_mistakes, key=lambda m: -m["drop_cp"])
    puzzles = []
    for m in sorted_m[:8]:
        if not m["best_move"]: continue
        puzzles.append({
            "fen": m["fen_before"],
            "solution": m["best_move"],
            "move_played": m["san"],
            "phase": get_phase(m["move_number"]),
            "pattern": "From your game",
            "drop_cp": m["drop_cp"],
            "side": m["side"],
            "threat_desc": f"In your game you played {m['san']}. Engine wanted {m['best_move']} ({m['best_pv']}).",
            "from_bot_game": True,
        })

    counts = {"blunder":0,"mistake":0,"inaccuracy":0,"ok":0,"best":0}
    for r in move_reviews: counts[r["severity"]] = counts.get(r["severity"],0)+1

    return jsonify({
        "ok": True,
        "move_reviews": move_reviews,
        "mistakes": sorted_m,
        "puzzles": puzzles,
        "counts": counts,
        "total_player_moves": len(move_reviews),
    })

# ══════════════════════════════════════════════════════════════════════════════
# TRAINING — spaced-repetition "muscle memory" drilling of the player's weaknesses
# ══════════════════════════════════════════════════════════════════════════════
TRAIN_INTERVALS = [1, 3, 7, 14, 30]   # days between reviews as a pattern is mastered
TRAIN_TYPES = [
    ("Hanging piece",     "Loose pieces you leave undefended (LPDO)."),
    ("Missed tactic",     "Forks, pins and shots you walk past."),
    ("King safety issue", "Castling late, weak king, back-rank danger."),
    ("Endgame mistake",   "Converting won endings, king activity, passers."),
    ("Opening mistake",   "Development, the centre, not rushing the queen."),
]
TRAIN_POOLS = {
    "Hanging piece": [
        {"fen":"r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4","solution":"Ng5","side":"white","hint":"Two attackers on f7 — pile up."},
        {"fen":"rnbq1rk1/ppp2ppp/3p1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQ - 0 7","solution":"Bxf7+","side":"white","hint":"Something's hanging on f7."},
        {"fen":"r1bqkb1r/ppp2ppp/2np1n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5","solution":"Ng5","side":"white","hint":"Attack two things at once."},
    ],
    "Missed tactic": [
        {"fen":"r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 8","solution":"Nd5","side":"white","hint":"A knight fork wins material."},
        {"fen":"r2qkb1r/ppp2ppp/2np1n2/4p1B1/2B1P3/3P1N2/PPP2PPP/RN1QK2R b KQkq - 0 6","solution":"Nxe4","side":"black","hint":"Win a pawn tactically."},
    ],
    "King safety issue": [
        {"fen":"r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4","solution":"O-O","side":"black","hint":"Castle to safety NOW."},
        {"fen":"rnbqkb1r/ppp2ppp/3p1n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4","solution":"O-O","side":"white","hint":"Get the king tucked away."},
    ],
    "Endgame mistake": [
        {"fen":"8/8/8/3k4/8/3K4/3P4/8 w - - 0 1","solution":"Ke3","side":"white","hint":"Escort the pawn — king leads."},
        {"fen":"8/8/8/8/8/4K3/4P3/4k3 w - - 0 1","solution":"Kd3","side":"white","hint":"Gain the opposition."},
        {"fen":"8/8/1k6/8/8/1K6/1P6/8 w - - 0 1","solution":"Kc4","side":"white","hint":"King in front of the pawn."},
    ],
    "Opening mistake": [
        {"fen":"r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3","solution":"Bc4","side":"white","hint":"Develop toward the centre."},
        {"fen":"rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2","solution":"Nf3","side":"white","hint":"Knight hits the centre."},
    ],
}
def default_training():
    return {"patterns": {}, "streak": {"count": 0, "last_day": ""}, "history": []}
def get_training(user):
    return user.get("training") or default_training()
def ensure_patterns(tr, seed_from=None):
    now = int(time.time())
    names = set(tr["patterns"].keys())
    # seed from the player's actual game mistakes if provided, else the common types
    wanted = list(seed_from) if seed_from else [t[0] for t in TRAIN_TYPES]
    for name in wanted:
        if name not in names and name in TRAIN_POOLS:
            tr["patterns"][name] = {"strength": 12, "seen": 0, "correct": 0, "due": now, "interval_days": 1}
    return tr
def drill_positions(name, count=8):
    pool = TRAIN_POOLS.get(name) or TRAIN_POOLS["Missed tactic"]
    out = []
    while len(out) < count:
        out.extend(random.sample(pool, min(len(pool), count - len(out))))
    for p in out[:count]:
        p = dict(p); p["pattern"] = name
    return [dict(p, pattern=name) for p in out[:count]]
def _is_yesterday(dstr):
    try:
        y = time.strftime("%Y-%m-%d", time.localtime(time.time() - 86400))
        return dstr == y
    except Exception:
        return False
def strength_band(s):
    if s < 20: return "Vulnerable"
    if s < 50: return "Learning"
    if s < 80: return "Building"
    return "Automatic"

@app.route("/training/weaknesses")
@login_required
def training_weaknesses():
    u = current_user(); user = get_user(u) or {}
    tr = ensure_patterns(get_training(user))
    user["training"] = tr; save_user(u, user)
    now = int(time.time())
    notes = {t[0]: t[1] for t in TRAIN_TYPES}
    out = []
    for name, p in tr["patterns"].items():
        out.append({"pattern": name, "note": notes.get(name, ""), "strength": p.get("strength", 0),
                    "band": strength_band(p.get("strength", 0)), "seen": p.get("seen", 0),
                    "correct": p.get("correct", 0), "due": p.get("due", 0), "due_now": p.get("due", 0) <= now})
    out.sort(key=lambda x: x["strength"])
    mastered = sum(1 for x in out if x["strength"] >= 80)
    return jsonify({"weaknesses": out, "streak": tr["streak"], "mastered": mastered, "due_count": sum(1 for x in out if x["due_now"])})

@app.route("/training/next", methods=["POST", "GET"])
@login_required
def training_next():
    u = current_user(); user = get_user(u) or {}
    tr = ensure_patterns(get_training(user))
    data = request.get_json(silent=True) or {}
    forced = data.get("pattern")
    now = int(time.time())
    if forced and forced in tr["patterns"]:
        name = forced
    else:
        items = list(tr["patterns"].items())
        due = [x for x in items if x[1].get("due", 0) <= now] or items
        due.sort(key=lambda x: x[1].get("strength", 0))   # weakest / most-due first
        name = due[0][0]
    user["training"] = tr; save_user(u, user)
    return jsonify({"pattern": name, "band": strength_band(tr["patterns"][name].get("strength", 0)),
                    "positions": drill_positions(name, int(data.get("count", 8)))})

@app.route("/training/submit", methods=["POST"])
@login_required
def training_submit():
    u = current_user(); user = get_user(u)
    if not user: return jsonify({"error": "User not found"}), 404
    data = request.get_json(silent=True) or {}
    name = data.get("pattern", ""); correct = int(data.get("correct", 0)); total = max(1, int(data.get("total", 1)))
    tr = ensure_patterns(get_training(user))
    p = tr["patterns"].get(name)
    if not p: return jsonify({"error": "Unknown pattern"}), 400
    ratio = correct / total
    passed = ratio >= 0.7
    p["seen"] += total; p["correct"] += correct
    if passed:
        p["strength"] = min(100, p["strength"] + 15)
        idx = TRAIN_INTERVALS.index(p["interval_days"]) if p["interval_days"] in TRAIN_INTERVALS else 0
        p["interval_days"] = TRAIN_INTERVALS[min(idx + 1, len(TRAIN_INTERVALS) - 1)]
    else:
        p["strength"] = max(0, p["strength"] - 10)
        p["interval_days"] = 1
    p["due"] = int(time.time()) + p["interval_days"] * 86400
    # streak
    today = time.strftime("%Y-%m-%d"); st = tr["streak"]
    if st.get("last_day") != today:
        st["count"] = (st.get("count", 0) + 1) if _is_yesterday(st.get("last_day", "")) else 1
        st["last_day"] = today
    tr.setdefault("history", []).append({"day": today, "correct": correct, "total": total})
    tr["history"] = tr["history"][-90:]
    user["training"] = tr; save_user(u, user)
    return jsonify({"ok": True, "pattern": name, "strength": p["strength"], "band": strength_band(p["strength"]),
                    "passed": passed, "mastered": passed and p["strength"] >= 80, "streak": st["count"],
                    "next_review_days": p["interval_days"]})

@app.route("/training/streak")
@login_required
def training_streak():
    user = get_user(current_user()) or {}
    return jsonify(get_training(user)["streak"])

@app.route("/training/progress")
@login_required
def training_progress():
    user = get_user(current_user()) or {}
    tr = ensure_patterns(get_training(user))
    hist = tr.get("history", [])
    by_day = {}
    for h in hist:
        d = by_day.setdefault(h["day"], {"correct": 0, "total": 0})
        d["correct"] += h["correct"]; d["total"] += h["total"]
    weekly = [{"day": d, "correct": v["correct"], "total": v["total"]} for d, v in sorted(by_day.items())][-7:]
    mastered = [n for n, p in tr["patterns"].items() if p.get("strength", 0) >= 80]
    return jsonify({"weekly": weekly, "mastered": mastered, "streak": tr["streak"],
                    "patterns": {n: p.get("strength", 0) for n, p in tr["patterns"].items()}})

@app.route("/health")
def health():
    sf=find_stockfish()
    return jsonify({"status":"ok","stockfish":sf or "not found","depth":ANALYSIS_DEPTH})

if __name__ == "__main__":
    port=int(os.environ.get("PORT",5000))
    app.run(debug=False,host="0.0.0.0",port=port)
