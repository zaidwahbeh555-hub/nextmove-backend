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
            send_admin_email("New ChessForge Pro subscriber! ",f"User: {username or email}\nPlan: Pro ($9/mo)\nTime: {time.strftime('%Y-%m-%d %H:%M')}\nEst revenue: ${(sum(1 for u in db.values() if u.get('plan')=='pro'))*9}/mo")
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
                text = f"{'You are' if good else 'They are'} {state} ({'+' if eval_pawns>=0 else ''}{eval_pawns}). Engine's move: {best_san}."
            return jsonify({
                "silent": False, "scenario": request_type, "reaction": "neutral",
                "dialogue": [{"phase": "reveal", "text": text, "wait": False}],
                "arrows": [build_arrow(best_uci, "#26d07c")], "highlights": [],
                "eval": eval_pawns, "best_move_san": best_san,
            })

        # ── Default: classify the moment and build a two-phase question -> reveal ──
        scenario, ctx = classify_moment(board, top_lines, played_moves)
        level = engagement_for(scenario)
        recent = _recent_store()

        # context describing the opponent's last move, for routine/notable lines
        last_san = played_moves[-1] if played_moves else None
        opp_to = None
        if last_san:
            sqs = re.findall(r"[a-h][1-8]", str(last_san))
            opp_to = sqs[-1] if sqs else None
        opp_piece = "piece"
        if opp_to:
            try:
                pc = board.piece_at(chess.parse_square(opp_to))
                if pc: opp_piece = PIECE_NAMES.get(pc.piece_type, "piece")
            except Exception:
                pass
        light = dict(ctx)
        light.update({"opp_san": last_san or "that move", "opp_to": opp_to or "that square",
                      "opp_piece": opp_piece, "best": best_san or "the engine move"})

        # ROUTINE — he always says something, but it never blocks the game
        if level == "routine" or scenario == "quiet":
            mem = build_game_memory(played_moves)
            mctx = memory_ctx(mem)
            if mctx and len(played_moves) > 12 and random.random() < 0.25:
                text = pick_line(MEMORY_LINES, dict(light, **mctx), recent)   # refer back
            else:
                text = factual_line(board, "routine", light, played_moves)
            try: session["recent_lines"] = recent
            except Exception: pass
            return jsonify({
                "silent": False, "engagement": "routine", "scenario": scenario,
                "reaction": "neutral", "blocking": False,
                "dialogue": [{"phase": "reveal", "text": text, "wait": False}],
                "arrows": [], "highlights": [],
                "eval": eval_pawns, "best_move_san": best_san,
            })

        # NOTABLE — one short question, still non-blocking
        if level == "notable":
            text = factual_line(board, "notable", light, played_moves)
            try: session["recent_lines"] = recent
            except Exception: pass
            hl = []
            if ctx.get("sq"):
                hl = [{"square": ctx["sq"], "color": "#22E5FF", "label": "look here"}]
            return jsonify({
                "silent": False, "engagement": "notable", "scenario": scenario,
                "reaction": ctx.get("reaction", "curious"), "blocking": False,
                "dialogue": [{"phase": "question", "text": text, "wait": False}],
                "arrows": [], "highlights": hl,
                "eval": eval_pawns, "best_move_san": best_san,
            })

        # CRITICAL — full stop: point, ask, lock the board
        built = build_coach_dialogue(scenario, ctx, board, top_lines)
        if not built:
            text = pick_line(ROUTINE, light, recent)
            return jsonify({"silent": False, "engagement": "routine", "scenario": scenario,
                            "reaction": "neutral", "blocking": False,
                            "dialogue": [{"phase": "reveal", "text": text, "wait": False}],
                            "arrows": [], "highlights": [],
                            "eval": eval_pawns, "best_move_san": best_san})
        mcq = maybe_build_mcq(board, top_lines, position_type="tactical" if scenario == "tactical_opportunity" else "positional", force=False)
        return jsonify({
            "silent": False,
            "engagement": "critical",
            "blocking": True,
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
VOICE_OPEN = [
    "Wait — count the attackers on that square first.",
    "Hold on. Look at what his last move touched.",
    "Stop. Every piece of yours needs a job here.",
    "Eyes up — his last move carries a threat.",
    "Before you move, scan the checks and captures.",
    "Pause. Something on the board just changed.",
    "Look again at the square he just left.",
    "One second — check what he uncovered.",
    "Careful here. The tension just went up.",
    "Hm. His last move had a point.",
    "Slow down — this is a calculating position.",
    "Notice which line just opened.",
    "Check the diagonals before you commit.",
    "Look at your loose pieces first.",
    "Hold up — count material before you decide.",
    "There it is. His plan just showed itself.",
]
VOICE_GOOD = [
    "That is the engine's top choice.",
    "Correct — that keeps your initiative.",
    "That move wins material cleanly.",
    "Strong. You improved your worst piece.",
    "That is the move a titled player finds.",
    "Exactly right — tempo gained.",
    "That defends and threatens at once.",
    "Sharp calculation. That refutes his idea.",
    "You found the only move that holds.",
    "That is prophylaxis — you stopped his plan.",
    "Precise. The structure stays healthy.",
    "That seizes the outpost.",
    "You saw the zwischenzug. Well done.",
    "That trade favours your endgame.",
    "Textbook technique in this structure.",
    "That is the move the position demanded.",
]
VOICE_BAD = [
    "That drops material on that square.",
    "That move loses a tempo you needed.",
    "That walks into his tactic.",
    "That leaves the piece loose — LPDO.",
    "That weakens the square in front of your king.",
    "That gives up the initiative for nothing.",
    "That move blocks your own bishop's diagonal.",
    "That allows the fork you were avoiding.",
    "That concedes the outpost permanently.",
    "That trade helps his structure, not yours.",
    "That ignores the threat he just made.",
    "That puts the piece on its worst square.",
    "That creates a hole he will occupy.",
    "That loses the exchange after his recapture.",
    "That leaves the back rank undefended.",
    "That hands him a free developing move.",
]
VOICE_TACTIC = [
    "There is a shot here — run the captures.",
    "Something of his is loose. Find it.",
    "Fork, pin or skewer is live in this position.",
    "Loose pieces drop off — LPDO. Look.",
    "Count every check before you move.",
    "There is material to win here. Calculate.",
    "A forcing sequence exists. Find the first move.",
    "His king's cover has a gap. Exploit it.",
    "This is a calculating position, not an intuition one.",
    "One of his pieces is overloaded. Use it.",
    "There is a desperado resource here.",
    "A zwischenzug wins more than the recapture.",
    "His back rank is weak. Check it.",
    "Two of his pieces share a line. Skewer them.",
    "The pinned piece cannot defend. Pile on.",
    "A discovered attack is available. Spot it.",
]
VOICE_POS = [
    "This is a manoeuvring position — improve your worst piece.",
    "Nobody is winning material. Fix your structure.",
    "The outpost is the prize in this position.",
    "Trade your bad bishop, keep the good one.",
    "Whoever takes the open file first stands better.",
    "Space advantage means you avoid trades.",
    "His weak colour complex is the long-term target.",
    "A minority attack fits this pawn structure.",
    "Prophylaxis first — stop his plan, then start yours.",
    "Rooks belong on the open file here.",
    "Your knight needs a safe advanced square.",
    "Fix his pawn on its colour, then attack it.",
    "Make luft before the back rank matters.",
    "Improve your king's position while it is quiet.",
    "Doubled pawns give you the half-open file.",
    "Restrain his passer before you push yours.",
]
VOICE_CRIT = [
    "This is the critical moment of the game.",
    "The evaluation swings on this single move.",
    "Take your time — this move decides the plan.",
    "Precision required. Calculate two moves deep.",
    "This is a fork in the road for your position.",
    "Get this right and the initiative is yours.",
    "Both plans are playable. Pick the one your structure supports.",
    "This move commits you. Choose carefully.",
    "One inaccuracy here and the advantage flips.",
    "The whole middlegame plan starts with this move.",
    "This is where the game is won or lost.",
    "No autopilot — the position is sharp.",
    "Candidate moves first, then calculate.",
    "Remember this position. It repeats.",
    "The tempo you spend here matters later.",
    "Lock in. This move carries the game.",
]
VOICE_THREAT = [
    "His last move created a real threat.",
    "That move was not random — it attacks something.",
    "He is threatening to win material next move.",
    "Do not ignore his last move — it has teeth.",
    "He is coming for one of your pieces.",
    "You are being threatened. Defend or counter-attack.",
    "His piece just gained a dangerous square.",
    "That move sets a trap. Spot it.",
    "He has an idea. Work out what it is.",
    "He threatens to break through on that square.",
]
SOCRATIC = [
    "What is his last move threatening?",
    "Which of your pieces is worst placed right now?",
    "Any checks, captures or threats for you?",
    "If you pass, what does he play next?",
    "Which of your pieces is currently loose?",
    "Which file or diagonal just opened?",
    "Can you improve a piece without losing tempo?",
    "Is your king safe enough to start an attack?",
    "What square did his last move give up?",
    "Where is the weakest square in his camp?",
    "Trade, push or wait — which does the structure want?",
    "Which of his pieces is overloaded?",
]

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
  "opponent_fork": {
    "q": [
      "Wait — stop. That {fpiece} on {fsq} just forked you. What two pieces is it hitting?",
      "Uh oh. Classic fork. {f1} and {f2} are both hanging off that {fpiece}. You can't save both — so which loss hurts less?",
      "See it? One {fpiece}, two targets. That's a fork. What's your plan?",
      "Hold on. Before you move — that {fpiece} hits {f1} AND {f2}. This isn't about saving both. It's about choosing.",
      "Ooh, nasty. He forked you. Count it: {f1}, {f2}. Which one do you keep?",
      "That {fpiece} landed on {fsq} and hits two things at once. You know the word for that?",
      "Danger. It's a fork — {f1} and {f2}. Can you save the bigger one, or hit back harder?",
      "Pause. A fork means you lose material unless you get creative. Any check or counter-threat here?",
      "He didn't drop that {fpiece} there by accident. It forks {f1} and {f2}. What's the least-bad outcome?",
      "This is the moment. Forked. Save a piece, or make a bigger threat and ignore his?",
      "Both {f1} and {f2} attacked by one {fpiece}. Which matters more right now?",
      "Fork alert. Sometimes the answer isn't retreat — it's an in-between move. See any checks first?",
      "Okay, deep breath. It's a fork. Run every forcing reply — checks, captures, threats.",
      "That {fpiece} is doing a lot of work. Two of your pieces in its sights. What's the priority?",
      "He's trying to win material with that fork. Prove the forked piece can bite back with tempo.",
      "Two targets, one attacker — the definition of a fork. Which piece leaves with tempo?",
    ],
    "r": [
      "Yeah — it's a fork. {best} is the move: it saves what matters and keeps you in the game. You don't beat a fork by panicking, you beat it by choosing well.",
      "Right. {best}. When you're forked, give up the smaller thing or create a bigger threat — never freeze.",
      "Exactly. {best} keeps your most valuable piece and lets the other go on your terms. Damage control done right.",
      "That's it — {best}. It moves with a threat, so he gets no free tempo. Forks punish loose coordination; remember the pattern.",
      "Good. {best} is cleanest. Losing the exchange here is fine — your position stays healthy.",
      "See? {best}. The trick with forks: look for a check or counter-attack BEFORE you accept the loss.",
      "Yep — {best}. He wins a little, but you keep the initiative. A trade worth making.",
      "{best}. File it away: knights fork, so watch any square a knight can hit two of your pieces from.",
      "Correct — {best}. You save the queen and let the exchange go. Material is not everything; activity and king safety count.",
      "{best} is the answer. A fork you see coming is half-defused. Next time, spot the radius early.",
    ],
  },
  "opponent_pin": {
    "q": [
      "Careful — your {pinned} on {pinsq} is pinned. If it moves, something worse falls. Feel the tension?",
      "That's a pin on {pinsq}. The piece is stuck. Break it, defend it, or challenge the pinner?",
      "Pinned piece on {pinsq}. Rule of thumb: pile up on it or kick the pinner. Which do you fancy?",
      "See how your {pinned} can't move? That's a pin. What breaks it?",
      "He pinned you. A pinned piece is only as safe as the square it's stuck on. How do you unpin?",
      "Tension check: {pinned} on {pinsq} is pinned to your king. What's the plan?",
      "Pins win games — right now YOU'RE pinned. Add a defender, or evict the pinner?",
      "That piece on {pinsq} is frozen. Options: block, trade the pinner, make luft. Pick one.",
      "A pin restricts you. Don't just live with it — can you challenge that pinning piece?",
      "He's pinning your {pinned}. Sometimes the fix is a simple pawn kicking the attacker. See it?",
      "Pinned. The danger is he piles on {pinsq}. Defend it now, or lose it later?",
      "Notice the pin. Is anything relying on your {pinned} right now? Because it can't help.",
      "That's a pin to the king — absolute. The piece literally can't move. How do you relieve it?",
      "Feel the pressure on {pinsq}? Break the pin before he adds a second attacker.",
      "He pinned you to win that piece. Beat him to it — what's the move?",
    ],
    "r": [
      "Yeah — {best} deals with the pin: it defends {pinsq}, evicts the pinner, or covers the piece behind. Pins reward patience.",
      "Right, {best}. Never leave a pinned piece under-defended — attackers stack up fast.",
      "{best} breaks the pin. Your piece is free and working again.",
      "Exactly. {best}. When pinned, challenge the pinner — trading it off ends the problem instantly.",
      "Good — {best}. Pinned pieces are targets; you just took yours off the hit list.",
      "That's it, {best}. A pin is a relationship — break the link and the pressure's gone.",
      "{best}. Defused. Watch for pins along the same line as your king and queen.",
      "Yep, {best}. Add a defender or kick the pinner — you chose well.",
    ],
  },
  "opponent_threat_single_piece": {
    "q": [
      "Hold up — see what he just did? Your {piece} on {sq}. Actually safe?",
      "That move hits your {piece} on {sq}. Defend it, move it, or hit back — which?",
      "Ooh, your {piece} on {sq} is loose. Count attackers and defenders. Even?",
      "He's eyeing your {piece} on {sq}. LPDO — loose pieces drop off. What do you do?",
      "Before you touch anything — is your {piece} on {sq} defended enough?",
      "His last move had a point: it hits {sq}. Do you see the threat?",
      "Your {piece} on {sq} — safe or not? Be honest with the count.",
      "Danger on {sq}. Move it, guard it, or make a bigger threat. Pick your medicine.",
      "That {piece} on {sq} hangs if you ignore it. What saves it with tempo?",
      "He wants your {piece} on {sq}. Can you defend AND improve at once?",
      "Look at {sq}. If you pass, what happens next move?",
      "Simplest question in chess: can he take {sq} for free?",
      "That's a threat, not a bluff. {sq} needs attention. What's best?",
      "Your {piece} is under fire on {sq}. Retreat, defend, or counter-punch?",
      "He just attacked {sq}. Don't autopilot — deal with the threat first.",
    ],
    "r": [
      "Yeah — {best}. Your {piece} on {sq} was hanging; that saves it cleanly. Always meet a threat, or make a bigger one.",
      "Right, {best}. Loose pieces drop off — you kept yours on the board.",
      "{best} handles it. Defend or out-threat him; you did it the calm way.",
      "Exactly — {best}. See how it covers {sq} and keeps you coordinated?",
      "Good. {best}. A move you don't answer is a move that beats you — you answered.",
      "{best} is the fix. Simple, solid, no drama. Good defense.",
      "Yep — {best}. The piece on {sq} is safe and your position's intact.",
      "That's it, {best}. Threats first, plans second — right order.",
    ],
  },
  "player_can_win_material": {
    "q": [
      "Ooh — I smell something. His {tpiece} on {tsq} looks loose. Can you punish it?",
      "Wait, is that free? Look hard at {tsq}. What can you win?",
      "Checks, captures, threats — run the list. Something's hanging for HIM. Where?",
      "He left the {tpiece} on {tsq} undefended. Are you taking it?",
      "Calculate spot, not a vibe spot. What wins material here?",
      "Free-stuff alert on {tsq}. Grab it — or is it a trap? Check first.",
      "You've got a tactic. His {tpiece} on {tsq} is the clue. Find the move.",
      "What's your most forcing move right now? Material's on the table.",
      "His {tpiece} is loose. Before you take — any in-between move that wins more?",
      "Opportunity knocks on {tsq}. Win it cleanly, or does he have a trick?",
      "He blundered. The {tpiece} on {tsq} is hanging. Prove you see it.",
      "Don't be polite — that {tpiece} on {tsq} is asking to be taken. Right?",
      "Material's there. Cleanest way to bag the {tpiece}?",
      "Sharpen up — his {tpiece} on {tsq} has no defender. What do you play?",
      "You can win material. Target is {tsq}. Make sure it's safe, then strike.",
    ],
    "r": [
      "Yes! {best}. Wins the {tpiece} clean — you spotted the loose piece and pounced. Greedy is good when it's safe.",
      "Boom — {best}. Free material. Always scan for undefended enemy pieces first.",
      "That's it, {best}. You cash in on {tsq}. LPDO in your favor this time.",
      "{best}! Clean win — and you checked it wasn't a trap first. That's the discipline.",
      "Exactly — {best} wins the {tpiece}. Punishing loose pieces is how rating points are made.",
      "Yep, {best}. Material in the bank. Now convert — trade pieces when you're up.",
      "There it is — {best}. He left the {tpiece} loose and you punished it.",
      "{best}. Winning material is step one; simplifying toward the endgame is step two.",
    ],
  },
  "player_about_to_blunder": {
    "q": [
      "Wait — WAIT. Before the natural move, look again. Your {piece} on {sq} is about to fall. See it?",
      "Stop. The obvious move loses your {piece} on {sq}. There's a better path. Find it.",
      "Careful — the tempting move hangs {sq}. Slow down. What's the safe square?",
      "Hold on. I can feel you wanting to move fast. {sq} is a trap for you. Look deeper.",
      "Danger to YOU. The move you want drops the {piece} on {sq}. Cleaner option?",
      "This is a losing-your-{piece} moment if you're careless. Where's the accurate move?",
      "Don't autopilot. {sq} is the problem square. What did he actually threaten?",
      "Breathe. The instinctive move loses on {sq}. What's the precise reply?",
      "One wrong step and your {piece} on {sq} is gone. Calculate before you commit.",
      "He set a little trap. Play the natural move and {sq} falls. Sidestep it?",
      "This is where games are lost — a careless move on {sq}. Be accurate.",
      "Tempting, right? But it hangs {sq}. What's the disciplined choice?",
    ],
    "r": [
      "Yeah — {best}. The natural move dropped your {piece}; this keeps it all together. Good players slow down right here.",
      "Right, {best}. You dodged the blunder. That pause you took? That's the whole skill.",
      "{best} is safe. The tempting move lost {sq}; this doesn't. Calculation over instinct.",
      "Exactly — {best}. Crisis averted. The move that FEELS right isn't always right.",
      "Good. {best}. You just saved half a point by not rushing. Remember the feeling.",
      "{best}. The accurate one. Blunders come from autopilot — you switched it off.",
      "Yep — {best}. Your {piece} lives, your position holds. Disciplined.",
    ],
  },
  "critical_castling_decision": {
    "q": [
      "Your king's still in the middle at move {fullmove}. Time to castle? Or something sharper first?",
      "Gut check: is your king safe? You haven't castled. What's the priority?",
      "The center's about to open and your king's home. Nervous? What should you do?",
      "King safety, dude. You can still castle. Now, or is there a bigger move?",
      "Uncastled king this late is a liability. Tuck it away now?",
      "He's building toward your king. Castle before the position cracks open — agree?",
      "Development's fine, but the king's exposed. What's the responsible move?",
      "You've delayed castling. Sometimes fine — but is it fine HERE? Judge it.",
      "Open lines toward an uncastled king spell trouble. What do you play?",
      "Before you attack, is your OWN house in order? King home, move {fullmove}.",
      "Prophylaxis time — sort your king safety before he forces it. Castle?",
      "That king in the center makes me nervous. What removes the risk?",
    ],
    "r": [
      "Yeah — {best}. Get the king safe and connect the rooks. You can't attack on a burning deck.",
      "Right, {best}. Castled kings win more games than clever ones.",
      "{best}. King tucked away, rook joins the game. Textbook.",
      "Exactly — {best}. King safety is never wasted when the center's tense.",
      "Good. {best}. He hoped you'd delay; you didn't. Solid.",
      "{best}. Rooks connected, king safe — now you can be ambitious.",
      "Yep — {best}. Castle first, questions later, when lines are opening.",
    ],
  },
  "opening_deviation": {
    "q": [
      "Early days — move {fullmove}. Develop, control the center, castle. Which are you neglecting?",
      "Which of your pieces is worst-developed right now? Fix that one.",
      "Are you moving a piece twice while others sit home? Be honest.",
      "Center, development, king safety — rank them for THIS position. Move one?",
      "Don't chase pawns — get your pieces out. What develops with tempo?",
      "Which minor piece hasn't moved yet? That's your clue.",
      "Don't bring the queen out early — she'll get chased. Calmer developing move?",
      "Knights before bishops, castle by move eight — how's the scorecard?",
      "Every opening move should do a job. What does your candidate accomplish?",
      "Fight for the center. Which move stakes a claim on the middle?",
      "Tempo matters early. A developing move that also makes a threat?",
      "Opening discipline: skip the pawn grab if it costs development. What's principled?",
    ],
    "r": [
      "Yeah — {best}. Develops a piece and fights for the center. Activity beats greed in the opening.",
      "Right, {best}. Every piece off the back rank is a step toward a real game.",
      "{best}. Develop, castle, THEN attack — right order.",
      "Exactly — {best}. Brings a piece in with purpose. Opening theory in one move.",
      "Good. {best}. You resisted the flashy grab and developed. Maturity.",
      "{best}. Minor pieces out, king getting safe — the position's healthy.",
      "Yep — {best}. Principled play. Boring wins games.",
    ],
  },
  "endgame_technique_moment": {
    "q": [
      "Endgame now — every tempo counts. Push the passer, activate the king, or improve the rook?",
      "Few pieces left. Your king's a fighter here. Where does it belong?",
      "This is technique. Do you have the opposition? Should you take it?",
      "Passed pawns must be pushed — or blockaded. Which side are you on?",
      "Endgames reward activity. Your most passive piece — how do you fix it?",
      "King-and-pawn stuff is precise. Count the tempi. What's the winning square?",
      "Simplify when ahead, complicate when behind — what does your material count say?",
      "The rook belongs behind the passed pawn. Where's your rook going?",
      "Don't rush. Improve your worst piece first. Which is it?",
      "Opposition, zugzwang, triangulation — one decides this. Which?",
      "Activate the king — strongest piece with queens off. Which way?",
      "Precise now. One loose move and the result flips. What's accurate?",
    ],
    "r": [
      "Yeah — {best}. Endgames are precision, not power. A small improvement, and small things decide endgames.",
      "Right, {best}. Activate, push, convert. Patient work.",
      "{best}. King in front of the pawn, rook behind — technique on display.",
      "Exactly — {best}. Small edges converted carefully. That's mastery.",
      "Good. {best}. No rush, no risk, steady improvement. That's how you win won games.",
      "{best}. You grabbed the opposition — zugzwang does the rest.",
      "Yep — {best}. The endgame's a math problem; you just solved a line.",
    ],
  },
  "player_found_brilliancy": {
    "q": [
      "OH. Did you calculate that line, or feel it? Either way the tactic lands.",
      "Wait — that is a strong move. Do you know which weakness it exploits?",
      "Tell me the point of that move — which piece does it improve?",
      "That is a coach's move. Which tactic did you spot there?",
      "Before I gush — do you see the follow-up threat that makes it work?",
      "Calculation or intuition? Either way that move wins material.",
      "That is the engine's top pick. Which candidate moves did you compare?",
      "Ohhh, nasty. Do you see the threat you just created?",
    ],
    "r": [
      "That's the move the computer wants — {best}-level stuff. You're seeing the board like a player now. Hold onto that.",
      "Exactly why it's strong. Moves like that win games quietly. Remember the pattern.",
      "Yeah — brilliant. A threat AND a better piece, one move. Two jobs at once.",
      "That is mastery — you did not just react, you improved your worst piece.",
      "Top move. When you find these, calculate the follow-up tactic before you commit.",
      "Not guessing anymore — you saw the threat before it landed. That is prophylaxis.",
    ],
  },
}

def _fmt(t, ctx):
    for k, v in ctx.items():
        t = t.replace("{"+k+"}", str(v))
    return t

def undeveloped_count(board, color):
    n = 0
    back = 0 if color == chess.WHITE else 7
    for f in range(8):
        p = board.piece_at(chess.square(f, back))
        if p and p.color == color and p.piece_type in (chess.KNIGHT, chess.BISHOP):
            n += 1
    return n

def detect_fork(board, victim_color):
    """An enemy piece attacking >=2 valuable pieces of victim_color (or piece+king)."""
    for ef in chess.SQUARES:
        ap = board.piece_at(ef)
        if not ap or ap.color == victim_color:
            continue
        if board.attackers(victim_color, ef) and not board.attackers(not victim_color, ef):
            continue  # forker hangs for free, not a real threat
        victims = []
        for tsq in board.attacks(ef):
            tp = board.piece_at(tsq)
            if tp and tp.color == victim_color and (tp.piece_type == chess.KING or PIECE_VALS.get(tp.piece_type, 0) >= 3):
                val = 99 if tp.piece_type == chess.KING else PIECE_VALS.get(tp.piece_type, 0)
                victims.append((tsq, tp, val))
        if len(victims) >= 2:
            victims.sort(key=lambda v: -v[2])
            fval = PIECE_VALS.get(ap.piece_type, 9)
            if victims[0][2] > fval or any(v[1].piece_type == chess.KING for v in victims):
                return {"fsq": chess.square_name(ef), "fpiece": PIECE_NAMES.get(ap.piece_type, "piece"),
                        "v1": victims[0], "v2": victims[1]}
    return None

def detect_pin(board, victim_color):
    """An absolute pin (to the king) on one of victim_color's pieces."""
    for sq in chess.SQUARES:
        p = board.piece_at(sq)
        if not p or p.color != victim_color or p.piece_type == chess.KING:
            continue
        try:
            if board.is_pinned(victim_color, sq):
                return {"pinsq": chess.square_name(sq), "pinned": PIECE_NAMES.get(p.piece_type, "piece")}
        except Exception:
            continue
    return None

ROUTINE = [
    "{opp_san} is standard here. Development continues.",
    "Recapture on {opp_to} is forced — nothing else holds.",
    "His {opp_piece} takes {opp_to}. Noted.",
    "{opp_san} — a book move in this structure.",
    "That develops toward the centre. Fine.",
    "His {opp_piece} on {opp_to} is doing little yet.",
    "Quiet move. Your worst piece still needs a square.",
    "{opp_san} keeps the tension without committing.",
    "No threat yet. {opp_to} is covered.",
    "He is improving a piece, not attacking.",
    "That trade simplifies toward the endgame.",
    "{opp_san} concedes the tempo. Use it.",
    "Structure unchanged. Keep improving pieces.",
    "His {opp_piece} guards {opp_to} now.",
    "Nothing forcing. Your plan continues.",
    "{opp_san} is a waiting move. Do not rush.",
    "He blocked the file with {opp_san}.",
    "That pawn move fixes his structure on {opp_to}.",
    "His king's cover is intact after {opp_san}.",
    "{opp_san} — the knight heads for a better square.",
    "That guards the back rank. Sensible.",
    "He took the open file with {opp_san}.",
    "{opp_san} prepares to castle. Expect it next.",
    "His {opp_piece} eyes {opp_to} but nothing lands.",
    "Even material, even chances. Keep going.",
    "{opp_san} is the theory move in this line.",
    "That defends the pawn a second time.",
    "No tactic available. Improve a piece.",
    "He connected his rooks with {opp_san}.",
    "{opp_san} — solid, no weaknesses created.",
    "Your structure is fine. Watch {opp_to}.",
    "He gained space with {opp_san}.",
    "That knight retreat gives up the outpost.",
    "{opp_san} unpins the piece. Tension gone.",
    "He is playing prophylaxis with {opp_san}.",
    "That bishop is bad behind his own pawns.",
    "{opp_san} keeps the position closed.",
    "Nothing hanging on either side right now.",
    "His passer is restrained for now.",
    "{opp_san} — the rook takes the seventh next.",
    "That pawn push creates a hole on {opp_to}.",
    "He is trading to reach the endgame.",
    "Tempo move. Your initiative survives.",
    "{opp_san} threatens nothing immediate.",
    "The centre stays locked after {opp_san}.",
    "His queen is safe on {opp_to} for now.",
    "That covers the entry square. Careful.",
    "{opp_san} is a repetition attempt.",
    "The half-open file is still yours.",
    "He is defending accurately here.",
]
NOTABLE = [
    "His {opp_piece} on {opp_to} eyes your kingside — see the plan?",
    "{opp_san} opens a file. Whose rook gets there first?",
    "Your {piece} on {sq} has no retreat square. Does that worry you?",
    "He just took the outpost on {opp_to}. Can you challenge it?",
    "That pawn push left a hole. Which piece occupies it?",
    "His {opp_piece} is overloaded — it guards two things. Exploit it?",
    "You still have not castled. Is the centre safe enough?",
    "{opp_san} prepares a pawn break. Do you stop it or allow it?",
    "Your bishop is behind its own pawns. Trade it or free it?",
    "He controls the open file. Contest it or find another plan?",
    "His king has no luft. Is a back-rank idea available?",
    "That trade would leave you a bad bishop. Take it anyway?",
    "He is building toward a minority attack. Prophylaxis or counterplay?",
    "Your knight on {sq} has no advanced square. Reroute it?",
    "{opp_san} gains space. Do you strike at the centre now?",
    "His passer needs restraining. Blockade or attack it?",
    "You can win a tempo on his queen. Worth it?",
    "That pin is uncomfortable. Break it now or later?",
    "The seventh rank is available to a rook. Whose?",
    "His weak colour complex is showing. Target it?",
    "You have doubled pawns but a half-open file. Fair trade?",
    "He offers a repetition. Accept or play on?",
    "Your rook is passive on {sq}. Activate it?",
    "The endgame favours your structure. Trade down?",
]
MEMORY_LINES = [
    "Remember pushing that pawn on move {mem_move}? His {opp_piece} just used the hole it left.",
    "Your king has sat on its home square since move {mem_move}. The centre is opening now.",
    "You retreated a piece on move {mem_move} — it is still passive on {mem_sq}.",
    "That pawn move on move {mem_move} weakened {mem_sq}. He is aiming at it now.",
    "You had a tactic on move {mem_move} and passed it. The same idea is back.",
    "Since move {mem_move} your rook has not moved. Time to activate it.",
    "The structure you chose on move {mem_move} wanted a minority attack. Still does.",
    "You traded your good bishop on move {mem_move}. That colour complex is weak now.",
    "His knight has been eyeing {mem_sq} since move {mem_move}.",
    "You spent tempo on move {mem_move} chasing his queen. He used it to develop.",
    "That hole on {mem_sq} from move {mem_move} is now his outpost.",
    "You have not made luft since move {mem_move}. The back rank matters here.",
]

BANNED_PHRASES = ["good move","nice","keep developing","watch your king safety","think carefully",
                  "consider your options","that's interesting","that is interesting","try to control the center"]

def line_is_concrete(text):
    """A line must name a square/piece/move, use real chess vocabulary, or predict a consequence."""
    t = (text or "").lower()
    if re.search(r"[a-h][1-8]\b", t): return True                      # square or SAN move (e4, Nf3, exd5)
    if re.search(r"\bo-o(?:-o)?\b", t): return True                    # castling
    VOCAB = (r"fork|pin|skewer|lpdo|initiative|tempo|luft|outpost|prophylaxis|back rank|opposition|"
             r"minority attack|colour complex|color complex|overload|zwischenzug|desperado|passer|"
             r"structure|file|diagonal|centre|center|castle|castling|endgame|middlegame|opening|"
             r"material|attacker|defender|discovered attack|blockade|repetition|seventh|check|capture|"
             r"threat|threaten|defend|attack|develop|development|trade|hole|weak|passive|active|loose|"
             r"hanging|recapture|promote|force|sacrifice|counterplay|breakthrough|plan|candidate|tactic|"
             r"combination|square|rank|piece|pawn|knight|bishop|rook|queen|king|mate|exchange|blunder")
    if re.search(r"\b(?:" + VOCAB + r")(?:s|es|ed|ing|ness|ly)?\b", t): return True
    CONSEQ = r"if you|then he|next move|he plays|allow|lose|drop|concede|gain|win|cost|punish|refute"
    if re.search(r"\b(?:" + CONSEQ + r")(?:s|es|ed|ing)?\b", t): return True
    return False

def line_is_clean(text):
    t = (text or "").lower()
    return not any(b in t for b in BANNED_PHRASES)

def pick_line(pool, ctx=None, recent=None):
    """Randomised, non-repeating (last 20) selection with placeholder fill."""
    if not pool: return ""
    recent = recent if recent is not None else []
    cands = [l for l in pool if l not in recent] or list(pool)
    raw = random.choice(cands)
    recent.append(raw)
    while len(recent) > 20: recent.pop(0)
    return _fmt(raw, ctx or {})

def _recent_store():
    try:
        r = session.get("recent_lines")
        if not isinstance(r, list): r = []
        return r
    except Exception:
        return []

def engagement_for(scenario):
    """Critical stops the game; notable asks briefly; routine just reacts."""
    if scenario in ("opponent_fork","opponent_pin","player_about_to_blunder",
                    "player_can_win_material","player_found_brilliancy"): return "critical"
    if scenario in ("opponent_threat_single_piece","critical_castling_decision",
                    "opening_deviation","endgame_technique_moment"): return "notable"
    return "routine"

def build_game_memory(played_moves):
    """Track what happened earlier so GM Forge can refer back to it."""
    mem = {"pawn_pushes": [], "uncastled_since": None, "retreats": [], "last_pawn_move": None}
    for i, san in enumerate(played_moves or []):
        n = i // 2 + 1
        s = str(san)
        if s and s[0] in "abcdefgh" and "x" not in s and len(s) <= 3:
            mem["pawn_pushes"].append((n, s))
            mem["last_pawn_move"] = (n, s)
        if s in ("O-O", "O-O-O"): mem["uncastled_since"] = None
    if mem["uncastled_since"] is None and len(played_moves or []) > 16:
        mem["uncastled_since"] = 8
    return mem

def memory_ctx(mem):
    lp = mem.get("last_pawn_move")
    if not lp: return None
    n, san = lp
    sq = re.sub(r"[^a-h1-8]", "", san)[-2:] if len(re.sub(r"[^a-h1-8]", "", san)) >= 2 else "that square"
    return {"mem_move": n, "mem_sq": sq}

def validate_move_in_pv(san, top_lines, board):
    """Every move GM Forge names must come from the engine's own lines for THIS position."""
    if not san: return False
    legal_pv = set()
    for ln in (top_lines or []):
        mv = ln.get("move")
        if mv is None: continue
        try:
            if mv in board.legal_moves: legal_pv.add(board.san(mv))
        except Exception:
            pass
    return san in legal_pv


def _open_files(board):
    out = []
    for f in range(8):
        if not any((board.piece_at(chess.square(f, r)) or None) and
                   board.piece_at(chess.square(f, r)).piece_type == chess.PAWN for r in range(8)):
            out.append("abcdefgh"[f])
    return out

def _doubled_files(board, color):
    out = []
    for f in range(8):
        n = sum(1 for r in range(8)
                for pc in [board.piece_at(chess.square(f, r))]
                if pc and pc.piece_type == chess.PAWN and pc.color == color)
        if n > 1: out.append("abcdefgh"[f])
    return out

def _knight_outposts(board, color):
    """Knights on the 4th-6th rank defended by a own pawn and not challengeable by an enemy pawn."""
    out = []
    for sq in chess.SQUARES:
        pc = board.piece_at(sq)
        if not pc or pc.piece_type != chess.KNIGHT or pc.color != color: continue
        r = chess.square_rank(sq)
        adv = r >= 3 if color == chess.WHITE else r <= 4
        if not adv: continue
        pawn_guard = any(board.piece_at(a) and board.piece_at(a).piece_type == chess.PAWN and
                         board.piece_at(a).color == color for a in board.attackers(color, sq))
        if pawn_guard: out.append(chess.square_name(sq))
    return out

def factual_line(board, level, ctx, played_moves):
    """Build a line that is actually TRUE of this position — never generic filler."""
    me = board.turn
    them = not me
    n = board.fullmove_number
    opp_san = ctx.get("opp_san") or "that move"
    opp_to = ctx.get("opp_to")
    opp_piece = ctx.get("opp_piece") or "piece"
    facts = []

    king_sq = board.king(me)
    home = chess.E1 if me == chess.WHITE else chess.E8
    if board.has_castling_rights(me) and king_sq == home and n >= 6:
        facts.append(f"Your king is still on {chess.square_name(home)} at move {n}. "
                     f"Castle now, or is the centre closed enough to wait?")
    ofs = _open_files(board)
    if ofs:
        facts.append(f"The {ofs[0]}-file is open. Whose rook takes it first?")
    outs = _knight_outposts(board, them)
    if outs:
        facts.append(f"His knight sits on {outs[0]}, defended by a pawn — a real outpost. "
                     f"Can you challenge it or trade it off?")
    mine_out = _knight_outposts(board, me)
    if mine_out:
        facts.append(f"Your knight on {mine_out[0]} is a genuine outpost. Keep it there — "
                     f"what would you trade to hold that square?")
    dbl = _doubled_files(board, me)
    if dbl:
        facts.append(f"You have doubled pawns on the {dbl[0]}-file. That gives you the half-open file — "
                     f"is that worth the weakness?")
    if board.is_check():
        facts.append(f"You are in check from {opp_san}. Block, capture or move — which keeps most of your position?")
    if opp_to:
        try:
            tsq = chess.parse_square(opp_to)
            hit = [chess.square_name(s) for s in board.attacks(tsq)
                   if board.piece_at(s) and board.piece_at(s).color == me]
            if hit:
                facts.append(f"His {opp_piece} on {opp_to} now eyes {hit[0]}. Does that change your plan?")
        except Exception:
            pass
    mat = total_non_king_material(board)
    if mat <= 14:
        facts.append(f"Only {mat} points of material left. Endgame rules now — where does your king belong?")
    if n <= 8 and undeveloped_count(board, me) >= 2:
        facts.append(f"You still have {undeveloped_count(board, me)} minor pieces at home on move {n}. "
                     f"Which one develops with tempo?")

    if facts:
        random.shuffle(facts)
        return facts[0]
    if level == "notable":
        return f"{opp_san} — nothing forcing yet. Which of your pieces is worst placed right now?"
    return f"{opp_san}. Nothing hanging on either side. Improve your worst piece."

def classify_moment(board, top_lines, played_moves):
    """Return (scenario, ctx). scenario='quiet' means stay silent. 9 teaching moments."""
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
    ctx = {"best_from": chess.square_name(best_uci.from_square), "reaction": "neutral", "fullmove": fullmove}

    fk = detect_fork(board, player)
    if fk:
        v1, v2 = fk["v1"], fk["v2"]
        ctx.update({"reaction": "concerned", "fsq": fk["fsq"], "fpiece": fk["fpiece"],
                    "sq": chess.square_name(v1[0]), "sq2": chess.square_name(v2[0]),
                    "piece": PIECE_NAMES.get(v1[1].piece_type, "piece"),
                    "f1": "your " + PIECE_NAMES.get(v1[1].piece_type, "piece") + " on " + chess.square_name(v1[0]),
                    "f2": "your " + PIECE_NAMES.get(v2[1].piece_type, "piece") + " on " + chess.square_name(v2[0])})
        return "opponent_fork", ctx

    pin = detect_pin(board, player)
    if pin and fullmove >= 4:
        ctx.update({"reaction": "concerned"}); ctx.update(pin)
        return "opponent_pin", ctx

    if my_loose:
        sq, pc = my_loose[0]
        ctx.update({"sq": chess.square_name(sq), "piece": PIECE_NAMES.get(pc.piece_type, "piece"), "reaction": "concerned"})
        if gap >= 150:
            return "player_about_to_blunder", ctx
        return "opponent_threat_single_piece", ctx

    if opp_loose and gap >= 120:
        sq, pc = opp_loose[0]
        ctx.update({"tsq": chess.square_name(sq), "tpiece": PIECE_NAMES.get(pc.piece_type, "piece"), "reaction": "excited"})
        return "player_can_win_material", ctx
    if gap >= 220:
        ctx.update({"reaction": "excited", "tsq": chess.square_name(best_uci.to_square), "tpiece": "piece"})
        return "player_can_win_material", ctx

    king_sq = board.king(player)
    home = chess.E1 if player == chess.WHITE else chess.E8
    if board.has_castling_rights(player) and fullmove > 8 and king_sq == home:
        ctx["reaction"] = "curious"
        return "critical_castling_decision", ctx

    if fullmove <= 9 and undeveloped_count(board, player) >= 2:
        ctx["reaction"] = "curious"
        return "opening_deviation", ctx

    if mat <= 20 and abs(my_eval) >= 120:
        ctx["reaction"] = "neutral"
        return "endgame_technique_moment", ctx

    return "quiet", ctx

def build_coach_dialogue(scenario, ctx, board, top_lines):
    """Two-phase dialogue + synced arrows/highlights, using the REAL engine move."""
    best_uci = top_lines[0]["move"]
    try:
        best_san = board.san(best_uci)
    except Exception:
        best_san = None
    bank = DIALOGUE.get(scenario)
    if not bank or not best_san:
        return None
    ctx = dict(ctx); ctx["best"] = best_san
    defaults = {"sq": "that square", "sq2": "that square", "piece": "piece", "tsq": "that square",
                "tpiece": "piece", "fpiece": "piece", "fsq": "that square", "f1": "one piece",
                "f2": "the other", "pinned": "piece", "pinsq": "that square", "fullmove": ""}
    for k, v in defaults.items():
        ctx.setdefault(k, v)
    question = _fmt(gm_phrase(bank["q"]), ctx)
    reveal = _fmt(gm_phrase(bank["r"]), ctx)
    red, green = "#ff4d4d", "#26d07c"
    highlights, arrows = [], []
    if scenario == "opponent_fork":
        highlights = [{"square": ctx.get("sq"), "color": red, "label": "forked"},
                      {"square": ctx.get("sq2"), "color": red, "label": "forked"}]
        if ctx.get("fsq"):
            arrows.append({"from": ctx["fsq"], "to": ctx.get("sq"), "color": red})
    elif scenario == "opponent_pin":
        highlights = [{"square": ctx.get("pinsq"), "color": red, "label": "pinned"}]
    elif scenario in ("opponent_threat_single_piece", "player_about_to_blunder"):
        highlights = [{"square": ctx.get("sq"), "color": red, "label": "vulnerable"}]
    elif scenario == "player_can_win_material":
        highlights = [{"square": ctx.get("tsq"), "color": green, "label": "target"}]
    arrows.append(build_arrow(best_uci, green))
    return {
        "dialogue": [
            {"phase": "question", "text": question, "wait": True},
            {"phase": "reveal", "text": reveal, "wait": False},
        ],
        "highlights": [h for h in highlights if h.get("square") and h.get("square") != "that square"],
        "arrows": [a for a in arrows if a],
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
        nudges.append(f"We're in the {opening_name}. {opening_theme}")
        nudges.append("Opening rule: develop knights before bishops, castle by move 8, don't move the same piece twice. Which piece is your worst-developed right now?")

    # 2) Opponent's last move — Socratic challenge
    if last_bot_san:
        nudges.append(f"{gm_phrase(VOICE_OPEN)} Opponent played {last_bot_san}. Ask yourself three things — what does it attack now, what did it leave undefended, and is it a threat or a setup?")

    # 3) Check — top priority
    if board.is_check():
        nudges.append("You're in check. King to safety FIRST. List your legal options — block, capture, move — then pick the safest.")

    # 4) My loose pieces (defensive scan)
    my_loose = find_loose_pieces(board, player_turn)
    if my_loose:
        sq, p = my_loose[0]
        nudges.append(f"Your {piece_label(p)} on {chess.square_name(sq)} looks vulnerable. Count attackers vs defenders. If attackers outnumber, you must move, defend, or trade — NOW.")
        highlights.append(square_highlight(sq, "#ff4d4d", "vulnerable"))

    # 5) Opponent's loose pieces (offensive scan)
    opp_loose = find_loose_pieces(board, not player_turn)
    if opp_loose and not my_loose:
        sq, p = opp_loose[0]
        nudges.append(f"Their {piece_label(p)} on {chess.square_name(sq)} is loose. Can you win it — or use the threat of taking it to do something even bigger?")
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
                nudges.append(f"{gm_phrase(VOICE_TACTIC)} One move stands clearly above the rest. Scan: checks first, then captures, then threats. Find it before moving.")
                arrows.append(build_arrow(best["move"], "#26d07c"))
            elif gap >= 60 and position_type == "critical_decision":
                nudges.append(f"{gm_phrase(VOICE_CRIT)} The engine has a slight preference — but the real lesson is the plan. Why does this move work?")

    # 7) Position-type framing
    if position_type == "endgame":
        nudges.append("Endgame. Activate the king — it's a fighting piece now, not a target. Push passed pawns. Trade pieces (not pawns) if ahead.")
    elif position_type == "critical_decision" and not my_loose and not board.is_check():
        nudges.append(f"{gm_phrase(VOICE_CRIT)} Eval is decisive — converting matters more than finding fireworks. Simplify when ahead, complicate when behind.")
    elif position_type == "positional" and not opp_loose and not my_loose:
        nudges.append(f"{gm_phrase(VOICE_POS)} Three questions — which is your worst piece, where does it want to be, how do you get it there?")

    # 8) Theme callouts (open files, bishop pair, etc.)
    for th in themes:
        nudges.append(f"{th}")

    # 9) King safety reminders
    if board.has_castling_rights(player_turn) and board.fullmove_number > 8 and not my_loose:
        nudges.append("You're past move 8 and still uncastled. Is there a concrete reason? If not — castle this move.")

    # 10) Weakness-specific personalised lines
    if "Hanging piece" in weaknesses and not my_loose and board.fullmove_number > 5:
        nudges.append("Your pattern: hanging pieces. LPDO — Loose Pieces Drop Off. Point at each of your pieces, confirm it's defended.")
    if "Missed tactic" in weaknesses and not opp_loose:
        nudges.append("Your pattern: missed tactics. Every move, scan checks captures threats. In that order.")
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
            parts.append(f"{gm_phrase(VOICE_GOOD)} {san_played} was the top move.")
            if new_opening: parts.append(f"We've entered the {opening_name}. {opening_theme}")
            if best_pv: parts.append(f"Continuation: {best_pv}.")
        elif severity == "ok":
            if new_opening:
                parts.append(f"{gm_phrase(VOICE_GOOD)} {san_played} keeps us in the {opening_name}. {opening_theme}")
            else:
                parts.append(f"{san_played} is playable.")
            if best_san and best_san != san_played:
                parts.append(f"Engine's slight preference: {best_san}.")
        elif severity == "inaccuracy":
            parts.append(f"{gm_phrase(VOICE_BAD)} {san_played} gives back a small edge.")
            if best_san:
                parts.append(f"Cleaner: {best_san} ({best_pv}). Look at the line — see why it's stronger?")
                arrows.append(build_arrow(best_move, "#f4c542"))
        elif severity == "mistake":
            parts.append(f"{gm_phrase(VOICE_BAD)} {san_played} costs about {drop//100}.{(drop%100)//10} pawns.")
            if best_san:
                parts.append(f"The position needed {best_san}. Engine line: {best_pv}.")
                arrows.append(build_arrow(best_move, "#ff9800"))
            if opp_san:
                parts.append(f"Now your opponent gets {opp_san} — that's exactly the punishment you missed.")
        elif severity == "blunder":
            parts.append(f"{gm_phrase(VOICE_BAD)} {san_played} is a blunder — drops {drop//100}+ pawns.")
            if best_san:
                parts.append(f"You needed {best_san} ({best_pv}).")
                arrows.append(build_arrow(best_move, "#ff4444"))
            if opp_san:
                parts.append(f"Watch — opponent will punish with {opp_san}.")
            if "Hanging piece" in weaknesses:
                parts.append("This is your pattern. LPDO — was every piece defended before you moved?")
            elif "Missed tactic" in weaknesses:
                parts.append("This is your pattern. Checks captures threats. In that order. Every move.")

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
        {"fen":"rnbqkb1r/1p1pp2p/2p2np1/p4p2/2PP3N/4P3/PPQ2PPP/RNB1KB1R b KQkq - 1 6","solution":"Bg7","side":"black","hint":"Count the attackers and defenders on that square."},
        {"fen":"rnbqk2r/3p2bp/2p3pn/pP2pp2/3P3N/4P2P/PP3PP1/RNBQKB1R w KQkq - 0 11","solution":"g3","side":"white","hint":"Count the attackers and defenders on that square."},
        {"fen":"rnbqk2r/3p2bp/2p3pn/pP2pp2/3P4/4PN1P/PP3PP1/RNBQKB1R b KQkq - 1 11","solution":"e4","side":"black","hint":"Count the attackers and defenders on that square."},
        {"fen":"rn2k2r/2q2n1p/2ppb1p1/pP1P1p2/P6P/R1P1PN2/4BPP1/2BQK2R w Kkq - 3 22","solution":"b6","side":"white","hint":"Count the attackers and defenders on that square."},
        {"fen":"1n2k1r1/r1P4p/2p1P1pn/p2p1p2/P1P4P/RQ2PN2/4BPP1/2B1K2R b K - 0 26","solution":"Na6","side":"black","hint":"Count the attackers and defenders on that square."},
        {"fen":"4k1r1/r1Pn3p/2p1P1pn/p2p1p2/P1P4P/RQ2PN2/4BPP1/2B1K2R w K - 1 27","solution":"Qb8+","side":"white","hint":"Count the attackers and defenders on that square."},
        {"fen":"4k1r1/r1P4p/1np1P1pn/p2p1p2/P1P4P/R1Q1PN2/4BPP1/2B1K2R w K - 3 28","solution":"cxd5","side":"white","hint":"Count the attackers and defenders on that square."},
        {"fen":"4k1r1/r1P4p/1np1P1pn/p1Pp1p2/P6P/R1Q1PN2/4BPP1/2B1K2R b K - 0 28","solution":"Nc8","side":"black","hint":"Count the attackers and defenders on that square."},
        {"fen":"6r1/r1P1k2p/1np1P1pn/p1Pp1p2/P6P/R1Q1PN2/4BPP1/2B1K2R w K - 1 29","solution":"cxb6","side":"white","hint":"Count the attackers and defenders on that square."},
        {"fen":"6r1/r1P1k2p/1Pp1P1pn/p2p1p2/P6P/R1Q1PN2/4BPP1/2B1K2R b K - 0 29","solution":"Rga8","side":"black","hint":"Count the attackers and defenders on that square."},
        {"fen":"r5r1/2P1k2p/1Pp1P1pn/p2p1p2/P6P/R1Q1PN2/4BPP1/2B1K2R w K - 1 30","solution":"Qc5+","side":"white","hint":"Count the attackers and defenders on that square."},
        {"fen":"r5r1/2P1k2p/1Pp1P1pn/p1Qp1p2/P6P/R3PN2/4BPP1/2B1K2R b K - 2 30","solution":"Kf6","side":"black","hint":"Count the attackers and defenders on that square."},
    ],
    "Missed tactic": [
        {"fen":"rnbqkb1r/3p3p/2p3pn/pP2pp2/3P4/4PN1P/PP3PP1/RNBQKB1R w KQkq - 2 12","solution":"Nxe5","side":"white","hint":"Run the forcing moves: checks, then captures, then threats."},
        {"fen":"rnbqk2r/3p2bp/2p3pn/pP2Np2/3P4/4P2P/PP3PP1/RNBQKB1R w KQkq - 1 13","solution":"Bd2","side":"white","hint":"Run the forcing moves: checks, then captures, then threats."},
        {"fen":"rn2k2r/3b1n1p/1qpp2p1/pP1P1p2/P6P/R1b1PN2/1P3PP1/2BQKB1R w Kkq - 0 20","solution":"bxc3","side":"white","hint":"Run the forcing moves: checks, then captures, then threats."},
        {"fen":"rn2k2r/2q2n1p/2ppb1p1/pP1P1p2/P6P/R1P1PN2/4BPP1/2BQK2R w Kkq - 3 22","solution":"dxe6","side":"white","hint":"Run the forcing moves: checks, then captures, then threats."},
        {"fen":"rn2k2r/2q2n1p/2p1P1p1/pP1p1p2/P6P/R1P1PN2/4BPP1/2BQK2R w Kkq - 0 23","solution":"b6","side":"white","hint":"Run the forcing moves: checks, then captures, then threats."},
        {"fen":"1n2k2r/r1q4p/2p1P1pn/pP1p1p2/P1P4P/RQ2PN2/4BPP1/2B1K2R w Kk - 1 25","solution":"b6","side":"white","hint":"Run the forcing moves: checks, then captures, then threats."},
        {"fen":"1n2k1r1/r1q4p/1Pp1P1pn/p2p1p2/P1P4P/RQ2PN2/4BPP1/2B1K2R w K - 1 26","solution":"bxc7","side":"white","hint":"Run the forcing moves: checks, then captures, then threats."},
        {"fen":"1n2k1r1/r1P4p/2p1P1pn/p2p1p2/P1P4P/RQ2PN2/4BPP1/2B1K2R b K - 0 26","solution":"Ke7","side":"black","hint":"Run the forcing moves: checks, then captures, then threats."},
        {"fen":"4k1r1/r1Pn3p/2p1P1pn/p2p1p2/P1P4P/RQ2PN2/4BPP1/2B1K2R w K - 1 27","solution":"Qb8+","side":"white","hint":"Run the forcing moves: checks, then captures, then threats."},
        {"fen":"4k1r1/r1Pn3p/2p1P1pn/p2p1p2/P1P4P/R1Q1PN2/4BPP1/2B1K2R b K - 2 27","solution":"Rxc7","side":"black","hint":"Run the forcing moves: checks, then captures, then threats."},
        {"fen":"4k1r1/r1P4p/1np1P1pn/p1Pp1p2/P6P/R1Q1PN2/4BPP1/2B1K2R b K - 0 28","solution":"Nc8","side":"black","hint":"Run the forcing moves: checks, then captures, then threats."},
        {"fen":"6r1/r1P1k2p/1np1P1pn/p1Pp1p2/P6P/R1Q1PN2/4BPP1/2B1K2R w K - 1 29","solution":"cxb6","side":"white","hint":"Run the forcing moves: checks, then captures, then threats."},
    ],
    "King safety issue": [
        {"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","solution":"e3","side":"white","hint":"King safety first — castle or make luft."},
        {"fen":"rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1","solution":"d5","side":"black","hint":"King safety first — castle or make luft."},
        {"fen":"rnbqkbnr/ppppp1pp/8/5p2/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2","solution":"c4","side":"white","hint":"King safety first — castle or make luft."},
        {"fen":"rnbqkbnr/ppppp1pp/8/5p2/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2","solution":"Nf6","side":"black","hint":"King safety first — castle or make luft."},
        {"fen":"rnbqkbnr/ppppp2p/6p1/5p2/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3","solution":"h4","side":"white","hint":"King safety first — castle or make luft."},
        {"fen":"rnbqkbnr/ppppp2p/6p1/5p2/2PP4/5N2/PP2PPPP/RNBQKB1R b KQkq - 1 3","solution":"Nf6","side":"black","hint":"King safety first — castle or make luft."},
        {"fen":"rnbqkb1r/ppppp2p/5np1/5p2/2PP4/5N2/PP2PPPP/RNBQKB1R w KQkq - 2 4","solution":"Nc3","side":"white","hint":"King safety first — castle or make luft."},
        {"fen":"rnbqkb1r/ppppp2p/5np1/5p2/2PP4/5N2/PPQ1PPPP/RNB1KB1R b KQkq - 3 4","solution":"c6","side":"black","hint":"King safety first — castle or make luft."},
        {"fen":"rnbqkb1r/pp1pp2p/2p2np1/5p2/2PP4/5N2/PPQ1PPPP/RNB1KB1R w KQkq - 0 5","solution":"e3","side":"white","hint":"King safety first — castle or make luft."},
        {"fen":"rnbqkb1r/pp1pp2p/2p2np1/5p2/2PP4/4PN2/PPQ2PPP/RNB1KB1R b KQkq - 0 5","solution":"Na6","side":"black","hint":"King safety first — castle or make luft."},
        {"fen":"rnbqkb1r/1p1pp2p/2p2np1/p4p2/2PP4/4PN2/PPQ2PPP/RNB1KB1R w KQkq - 0 6","solution":"Nc3","side":"white","hint":"King safety first — castle or make luft."},
        {"fen":"rnbqkb1r/1p1pp2p/2p2np1/p4p2/2PP3N/4P3/PPQ2PPP/RNB1KB1R b KQkq - 1 6","solution":"Bg7","side":"black","hint":"King safety first — castle or make luft."},
    ],
    "Endgame mistake": [
        {"fen":"8/2k5/8/8/8/3K4/1R6/6N1 w - - 0 1","solution":"Kd2","side":"white","hint":"King leads. Take the opposition before you push."},
        {"fen":"8/5P1k/8/8/8/8/3K4/8 w - - 0 1","solution":"f8=Q","side":"white","hint":"King leads. Take the opposition before you push."},
        {"fen":"8/2r3K1/8/8/4P3/8/7P/7k w - - 0 1","solution":"Kf6","side":"white","hint":"King leads. Take the opposition before you push."},
        {"fen":"3r4/6K1/k7/8/8/8/8/8 w - - 0 1","solution":"Kf6","side":"white","hint":"King leads. Take the opposition before you push."},
        {"fen":"8/5p2/3B4/8/8/5P2/1K5k/8 b - - 0 1","solution":"Kg2","side":"black","hint":"King leads. Take the opposition before you push."},
        {"fen":"7k/8/4K3/8/8/8/P7/8 w - - 0 1","solution":"Kf7","side":"white","hint":"King leads. Take the opposition before you push."},
        {"fen":"1k6/1R6/4N3/4p2K/8/8/8/8 b - - 0 1","solution":"Kxb7","side":"black","hint":"King leads. Take the opposition before you push."},
        {"fen":"7K/8/8/8/8/5p2/2k5/8 b - - 0 1","solution":"Kd3","side":"black","hint":"King leads. Take the opposition before you push."},
        {"fen":"8/8/8/1k2p3/8/7K/8/n7 b - - 0 1","solution":"Kc4","side":"black","hint":"King leads. Take the opposition before you push."},
        {"fen":"2k5/2p5/8/8/8/8/8/6K1 b - - 0 1","solution":"Kb7","side":"black","hint":"King leads. Take the opposition before you push."},
        {"fen":"8/8/3P4/8/8/4K3/6k1/6N1 w - - 0 1","solution":"d7","side":"white","hint":"King leads. Take the opposition before you push."},
        {"fen":"8/r7/8/8/2p5/8/1k6/3K4 b - - 0 1","solution":"Re7","side":"black","hint":"King leads. Take the opposition before you push."},
    ],
    "Opening mistake": [
        {"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","solution":"e4","side":"white","hint":"Develop, fight for the centre, get the king safe."},
        {"fen":"rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1","solution":"Nf6","side":"black","hint":"Develop, fight for the centre, get the king safe."},
        {"fen":"rnbqkbnr/ppppp1pp/8/5p2/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2","solution":"c4","side":"white","hint":"Develop, fight for the centre, get the king safe."},
        {"fen":"rnbqkbnr/ppppp1pp/8/5p2/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2","solution":"d6","side":"black","hint":"Develop, fight for the centre, get the king safe."},
        {"fen":"rnbqkbnr/ppppp2p/6p1/5p2/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3","solution":"h4","side":"white","hint":"Develop, fight for the centre, get the king safe."},
        {"fen":"rnbqkbnr/ppppp2p/6p1/5p2/2PP4/5N2/PP2PPPP/RNBQKB1R b KQkq - 1 3","solution":"Bg7","side":"black","hint":"Develop, fight for the centre, get the king safe."},
        {"fen":"rnbqkb1r/ppppp2p/5np1/5p2/2PP4/5N2/PP2PPPP/RNBQKB1R w KQkq - 2 4","solution":"g3","side":"white","hint":"Develop, fight for the centre, get the king safe."},
        {"fen":"rnbqkb1r/ppppp2p/5np1/5p2/2PP4/5N2/PPQ1PPPP/RNB1KB1R b KQkq - 3 4","solution":"Nc6","side":"black","hint":"Develop, fight for the centre, get the king safe."},
        {"fen":"rnbqkb1r/pp1pp2p/2p2np1/5p2/2PP4/5N2/PPQ1PPPP/RNB1KB1R w KQkq - 0 5","solution":"Nc3","side":"white","hint":"Develop, fight for the centre, get the king safe."},
        {"fen":"rnbqkb1r/pp1pp2p/2p2np1/5p2/2PP4/4PN2/PPQ2PPP/RNB1KB1R b KQkq - 0 5","solution":"Bg7","side":"black","hint":"Develop, fight for the centre, get the king safe."},
        {"fen":"rnbqkb1r/1p1pp2p/2p2np1/p4p2/2PP4/4PN2/PPQ2PPP/RNB1KB1R w KQkq - 0 6","solution":"Nc3","side":"white","hint":"Develop, fight for the centre, get the king safe."},
        {"fen":"rnbqkb1r/1p1pp2p/2p2np1/p4p2/2PP3N/4P3/PPQ2PPP/RNB1KB1R b KQkq - 1 6","solution":"d6","side":"black","hint":"Develop, fight for the centre, get the king safe."},
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

def _attacked_loose(board, color):
    for sq in chess.SQUARES:
        pc = board.piece_at(sq)
        if not pc or pc.color != color or pc.piece_type == chess.KING: continue
        att = board.attackers(not color, sq); dfn = board.attackers(color, sq)
        if att and len(att) > len(dfn): return True
    return False

def _wins_material_available(board):
    me = board.turn
    for mv in board.legal_moves:
        if board.is_capture(mv):
            tgt = board.piece_at(mv.to_square)
            if tgt and not board.attackers(not me, mv.to_square): return True
            if tgt and PIECE_VALS.get(tgt.piece_type,0) > PIECE_VALS.get(board.piece_at(mv.from_square).piece_type,0):
                return True
        b2 = board.copy(); b2.push(mv)
        if detect_fork(b2, not me): return True
    return False

def _back_rank_soft(board, color):
    k = board.king(color)
    if k is None: return False
    home = 0 if color == chess.WHITE else 7
    if chess.square_rank(k) != home: return False
    for df in (-1, 0, 1):
        f = chess.square_file(k) + df
        if not 0 <= f <= 7: continue
        fwd = chess.square(f, home + (1 if color == chess.WHITE else -1))
        pc = board.piece_at(fwd)
        if not pc or pc.piece_type != chess.PAWN or pc.color != color: return False
    return True

def position_has_pattern(board, pattern):
    """Server-side gate — a drill position must actually contain the pattern being drilled."""
    me = board.turn
    if pattern == "Hanging piece":     return _attacked_loose(board, me)
    if pattern == "Missed tactic":     return _wins_material_available(board) or detect_fork(board, not me) is not None
    if pattern == "King safety issue":
        home = chess.E1 if me == chess.WHITE else chess.E8
        return _back_rank_soft(board, me) or (board.has_castling_rights(me) and board.king(me) == home)
    if pattern == "Endgame mistake":   return total_non_king_material(board) <= 12
    if pattern == "Opening mistake":   return board.fullmove_number <= 12 and undeveloped_count(board, me) >= 2
    return True

def validated_pool(name):
    out = []
    for pos in TRAIN_POOLS.get(name, []):
        try:
            b = chess.Board(pos["fen"])
        except Exception:
            continue
        if not position_has_pattern(b, name):   # discarded, never served
            continue
        try:
            if pos.get("solution") and b.parse_san(pos["solution"]) not in b.legal_moves: continue
        except Exception:
            continue
        out.append(pos)
    return out

def interleave_partners(training, name, k=2):
    """Once a pattern reaches 60% strength, mix in other patterns so the user must discriminate."""
    pats = (training or {}).get("patterns", {})
    me = pats.get(name, {})
    if (me.get("strength") or 0) < 60: return []
    others = [n for n, v in pats.items() if n != name and (v.get("strength") or 0) < 80]
    random.shuffle(others)
    return others[:k]

def drill_positions(name, count=8):
    pool = validated_pool(name) or validated_pool("Missed tactic")
    if not pool: return []
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


TRAIN_LESSONS = {
 "Hanging piece": {
   "title":"Loose pieces drop off",
   "body":["A piece is hanging when more enemy pieces attack it than yours defend it. It costs nothing to check, and it is the single most common way rating points leak away.",
           "The habit that prevents it: after every opponent move, name the squares that move now attacks. Then name your own pieces sitting on those squares.",
           "Do it before you look for your own plan. Threats first, plans second."],
   "habit":"After his move, list what it attacks. Then list what of yours is undefended.",
   "vocab":"LPDO — loose pieces drop off."},
 "Missed tactic": {
   "title":"Checks, captures, threats",
   "body":["A tactic is a short forcing sequence that wins material or mates. It exists because a piece is loose, overloaded, pinned, or on the same line as something valuable.",
           "The habit: every single move, scan the forcing moves in order — checks first, then captures, then threats. Most missed tactics were simply never looked for.",
           "Forcing moves limit his replies, which makes them fast to calculate."],
   "habit":"Scan checks, then captures, then threats — every move, in that order.",
   "vocab":"Fork, pin, skewer, discovered attack, overloaded piece."},
 "King safety issue": {
   "title":"The king comes first",
   "body":["A king in the centre with open lines nearby is a permanent liability. Castling connects your rooks and removes the king from the files that open first.",
           "Back-rank danger is the quiet version of the same problem: a castled king with three unmoved pawns has no escape square.",
           "The habit: castle by move eight unless there is a concrete reason not to, and make luft before your rooks leave the back rank."],
   "habit":"Castle early. Make luft before the back rank matters.",
   "vocab":"Luft — the escape square a pawn move gives your king."},
 "Endgame mistake": {
   "title":"Endgames are precision",
   "body":["With few pieces left, small things decide the result: the opposition, whether your king is in front of the pawn, and which side moves first.",
           "The habit: activate the king, put the rook behind the passed pawn, and improve your worst piece before pushing anything.",
           "Do not rush. In an endgame a single careless tempo flips the result."],
   "habit":"King first, rook behind the passer, improve the worst piece.",
   "vocab":"Opposition, zugzwang, passer, triangulation."},
 "Opening mistake": {
   "title":"Develop, centre, castle",
   "body":["The opening has three jobs: develop your pieces, fight for the centre, and get the king safe. Every move should do at least one of them.",
           "The habit: before you move, name your worst-placed piece and ask whether this move improves it. Avoid moving the same piece twice or bringing the queen out early.",
           "A pawn grab that costs three tempi of development is not a pawn grab."],
   "habit":"Every opening move develops, fights for the centre, or helps you castle.",
   "vocab":"Tempo, development, the centre."},
}
TRAIN_DISTRACTORS = {
 "Hanging piece":   ["a6","h6","Rb1","Qe2"],
 "Missed tactic":   ["Qd2","h3","Rfe1","a4"],
 "King safety issue":["Qe2","a3","Rg1","b4"],
 "Endgame mistake": ["Kd2","a4","Kf2","h4"],
 "Opening mistake": ["h3","a3","Qh5","Rg1"],
}
TRAIN_FEEDBACK = {
 "Hanging piece":   ("You were most likely looking for your own plan and treated his move as noise.",
                     "It is not noise: his last move added an attacker, so the piece now has more attackers than defenders and simply drops.",
                     "Threats first, plans second. Every move, name what his move attacks."),
 "Missed tactic":   ("You probably played the natural developing move without scanning the forcing options.",
                     "A forcing move was available that wins material outright, and forcing moves must be checked before quiet ones.",
                     "Checks, captures, threats — in that order, every single move."),
 "King safety issue":("You likely judged the position as quiet and postponed castling for one more developing move.",
                     "The centre opens faster than you can finish developing, and the king is then stuck on the file that opens.",
                     "Castle by move eight unless you can name a concrete reason not to."),
 "Endgame mistake": ("You probably pushed the pawn first because it looks like progress.",
                     "Pushing before the king escorts it loses the opposition, and the defending king then holds the draw.",
                     "King leads, pawn follows. Take the opposition before you push."),
 "Opening mistake": ("You most likely chased material or made a move that felt active.",
                     "It costs tempo while pieces stay at home, and development is the currency of the opening.",
                     "Every opening move develops, fights for the centre, or helps you castle."),
}

@app.route("/training/lesson", methods=["POST"])
@login_required
def training_lesson():
    data = request.get_json(force=True) or {}
    name = data.get("pattern") or TRAIN_TYPES[0][0]
    lesson = TRAIN_LESSONS.get(name) or list(TRAIN_LESSONS.values())[0]
    pool = validated_pool(name)
    guided = pool[0] if pool else None
    want, thinking = None, None
    fb = TRAIN_FEEDBACK.get(name)
    distract = [d for d in TRAIN_DISTRACTORS.get(name, [])]
    mcq = None
    if guided:
        try:
            b = chess.Board(guided["fen"])
            legal_distract = []
            for d in distract:
                try:
                    if b.parse_san(d) in b.legal_moves and d != guided["solution"]:
                        legal_distract.append(d)
                except Exception:
                    continue
            if len(legal_distract) < 2:      # top up from real legal moves so there are always 3 options
                for mv in b.legal_moves:
                    s = b.san(mv)
                    if s != guided["solution"] and s not in legal_distract:
                        legal_distract.append(s)
                    if len(legal_distract) >= 2: break
            opts = [guided["solution"]] + legal_distract[:2]
            random.shuffle(opts)
            mcq = {"fen": guided["fen"], "options": opts, "answer": guided["solution"],
                   "side": guided.get("side", "white")}
        except Exception:
            mcq = None
    return jsonify({
        "pattern": name,
        "lesson": {"title": lesson["title"], "body": lesson["body"],
                   "habit": lesson["habit"], "vocab": lesson["vocab"]},
        "guided": guided,
        "mcq": mcq,
        "feedback": {"thinking": fb[0], "breaks": fb[1], "rule": fb[2]} if fb else None,
        "interleave": False,
    })

@app.route("/health")
def health():
    sf=find_stockfish()
    return jsonify({"status":"ok","stockfish":sf or "not found","depth":ANALYSIS_DEPTH})

if __name__ == "__main__":
    port=int(os.environ.get("PORT",5000))
    app.run(debug=False,host="0.0.0.0",port=port)
