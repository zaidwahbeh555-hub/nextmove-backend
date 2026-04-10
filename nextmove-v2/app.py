"""
NextMove — Production Backend
Flask API for chess game analysis, pattern detection, and personalised training.
"""

import os, io, json, random, hashlib, hmac, time, secrets
import chess, chess.pgn, chess.engine
from flask import Flask, request, jsonify, render_template, session
from collections import defaultdict
from functools import wraps

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# ── Stockfish ──────────────────────────────────────────────────────────────────
STOCKFISH_CANDIDATES = [
    os.environ.get("STOCKFISH_PATH", ""),
    "/usr/local/bin/stockfish",
    "/usr/games/stockfish",
    "/usr/bin/stockfish",
    "/opt/homebrew/bin/stockfish",
    "/opt/homebrew/opt/stockfish/bin/stockfish",
]

def find_stockfish():
    for p in STOCKFISH_CANDIDATES:
        if p and os.path.isfile(p):
            return p
    return None

# ── Config ─────────────────────────────────────────────────────────────────────
ANALYSIS_DEPTH   = int(os.environ.get("DEPTH", 16))
BLUNDER_CP       = 200
MISTAKE_CP       = 100
INACCURACY_CP    = 50
MAX_GAMES        = 5

# ── Database — PostgreSQL (production) with JSON fallback (local) ──────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "")

def get_pg_conn():
    if not DATABASE_URL:
        return None
    try:
        import psycopg2
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        return conn
    except Exception:
        return None

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
        except Exception:
            return {}
        finally:
            conn.close()
    DB_FILE = os.path.join(os.path.dirname(__file__), "users.json")
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE) as f: return json.load(f)
        except Exception:
            return {}
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
        except Exception as e:
            print(f"DB save error: {e}")
        finally:
            conn.close()
    DB_FILE = os.path.join(os.path.dirname(__file__), "users.json")
    with open(DB_FILE, "w") as f:
        json.dump(db, f, indent=2)

def get_user(username):
    conn = get_pg_conn()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("SELECT data FROM users WHERE username = %s", (username,))
            row = cur.fetchone()
            return row[0] if row else None
        except Exception:
            return None
        finally:
            conn.close()
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
        except Exception as e:
            print(f"save_user error: {e}")
        finally:
            conn.close()
    db = load_db(); db[username] = data
    DB_FILE = os.path.join(os.path.dirname(__file__), "users.json")
    with open(DB_FILE, "w") as f:
        json.dump(db, f, indent=2)

def hash_password(password: str) -> str:
    """Secure password hashing with salt using PBKDF2."""
    salt = secrets.token_hex(16)
    key  = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return f"{salt}:{key.hex()}"

def verify_password(password: str, stored: str) -> bool:
    """Constant-time password verification."""
    try:
        salt, key_hex = stored.split(":", 1)
        key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
        return hmac.compare_digest(key.hex(), key_hex)
    except Exception:
        return False

def current_user():
    return session.get("username")

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user():
            return jsonify({"error": "Not logged in"}), 401
        return f(*args, **kwargs)
    return decorated

# ── Plan limits ────────────────────────────────────────────────────────────────
FREE_DAILY_LIMIT = 1   # games per day on free plan
STRIPE_SECRET    = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK   = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRO_PRICE = os.environ.get("STRIPE_PRICE_ID", "")

def empty_progress():
    return {
        "games_analysed":    0,
        "blunders_found":    0,
        "puzzles_solved":    0,
        "lessons_completed": [],
        "challenge_solved":  [],
    }

def is_pro(user: dict) -> bool:
    """Check if user has an active pro subscription."""
    return user.get("plan") == "pro"

def games_today(user: dict) -> int:
    """Count how many games the user has analysed today."""
    today = time.strftime("%Y-%m-%d")
    return user.get("daily_counts", {}).get(today, 0)

def increment_game_count(user: dict):
    """Increment today's game count."""
    today = time.strftime("%Y-%m-%d")
    if "daily_counts" not in user:
        user["daily_counts"] = {}
    # Reset old days to save space
    user["daily_counts"] = {today: user["daily_counts"].get(today, 0) + 1}

# ── Chess helpers ──────────────────────────────────────────────────────────────
def get_phase(move_number: int) -> str:
    if move_number <= 10: return "opening"
    if move_number <= 30: return "middlegame"
    return "endgame"

def classify_severity(drop_cp: float) -> str | None:
    if drop_cp >= BLUNDER_CP:    return "blunder"
    if drop_cp >= MISTAKE_CP:    return "mistake"
    if drop_cp >= INACCURACY_CP: return "inaccuracy"
    return None

def detect_pattern(board: chess.Board, move: chess.Move, drop_cp: float, phase: str) -> str:
    piece = board.piece_at(move.from_square)
    if not piece:
        return "Positional mistake"

    pt = piece.piece_type

    # Early queen development
    if pt == chess.QUEEN and phase == "opening":
        return "Early queen development"

    # King moving in opening/middlegame (not castling)
    if pt == chess.KING and phase in ("opening", "middlegame") and not board.is_castling(move):
        return "King safety issue"

    # Hanging piece — moved piece is immediately capturable
    b2 = board.copy()
    b2.push(move)
    if b2.is_attacked_by(not piece.color, move.to_square):
        attackers = b2.attackers(not piece.color, move.to_square)
        if attackers:
            # Only a hanging piece if attacker is worth less (or we left it for free)
            min_attacker_value = min(
                {chess.PAWN:1, chess.KNIGHT:3, chess.BISHOP:3,
                 chess.ROOK:5, chess.QUEEN:9, chess.KING:99}
                .get(b2.piece_at(sq).piece_type, 1)
                for sq in attackers if b2.piece_at(sq)
            )
            piece_value = {chess.PAWN:1, chess.KNIGHT:3, chess.BISHOP:3,
                           chess.ROOK:5, chess.QUEEN:9, chess.KING:99
                          }.get(pt, 1)
            if min_attacker_value <= piece_value:
                return "Hanging piece"

    # Missed tactic (big eval drop in middlegame)
    if drop_cp >= BLUNDER_CP and phase == "middlegame":
        return "Missed tactic"

    # Endgame mistakes
    if phase == "endgame":
        return "Endgame mistake"

    return {
        "opening":    "Opening mistake",
        "middlegame": "Middlegame mistake",
        "endgame":    "Endgame mistake",
    }.get(phase, "Positional mistake")

def extract_players_from_pgn(pgn_text: str) -> dict:
    """
    Parse PGN headers and return both player names.
    Returns {"white": "...", "black": "..."} or empty strings if not found.
    """
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if not game:
        return {"white": "", "black": ""}
    return {
        "white": game.headers.get("White", "").strip(),
        "black": game.headers.get("Black", "").strip(),
        "event": game.headers.get("Event", ""),
        "date":  game.headers.get("Date", ""),
        "site":  game.headers.get("Site", ""),
    }

def analyse_game(pgn_text: str, engine, player_color: str | None) -> dict | None:
    """
    Analyse a single game.
    player_color: "white", "black", or None (analyse both sides)
    """
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if not game:
        return None

    board      = game.board()
    moves_data = []
    mistakes   = []
    moves_list = list(game.mainline_moves())

    for ply, move in enumerate(moves_list):
        move_number = ply // 2 + 1
        side        = "white" if ply % 2 == 0 else "black"
        phase       = get_phase(move_number)
        fen_before  = board.fen()

        # Evaluate position BEFORE move
        info_before  = engine.analyse(board, chess.engine.Limit(depth=ANALYSIS_DEPTH))
        score_before = info_before["score"].white().score(mate_score=10000)
        best_move_obj = info_before.get("pv", [None])[0]
        best_move_san = (
            board.san(best_move_obj)
            if best_move_obj and best_move_obj in board.legal_moves
            else None
        )

        san        = board.san(move)
        board_snap = board.copy()
        board.push(move)
        fen_after = board.fen()

        # Evaluate position AFTER move
        info_after  = engine.analyse(board, chess.engine.Limit(depth=ANALYSIS_DEPTH))
        score_after = info_after["score"].white().score(mate_score=10000)

        # Eval drop from the mover's perspective
        drop_cp = 0.0
        if score_before is not None and score_after is not None:
            drop_cp = (
                float(score_before - score_after) if side == "white"
                else float(score_after - score_before)
            )
            drop_cp = max(drop_cp, 0.0)  # negative means the move was good

        sev     = classify_severity(drop_cp)
        pattern = detect_pattern(board_snap, move, drop_cp, phase) if sev in ("blunder", "mistake") else None

        entry = {
            "ply":          ply,
            "move_number":  move_number,
            "side":         side,
            "san":          san,
            "fen_before":   fen_before,
            "fen_after":    fen_after,
            "score_before": score_before,
            "score_after":  score_after,
            "eval_before":  round(score_before / 100, 2) if score_before is not None else None,
            "eval_after":   round(score_after  / 100, 2) if score_after  is not None else None,
            "drop_cp":      int(drop_cp),
            "severity":     sev,
            "pattern":      pattern,
            "phase":        phase,
            "best_move":    best_move_san,
        }
        moves_data.append(entry)

        # Only count as a mistake if it's the analysed player's move
        is_analysed_side = (player_color is None) or (side == player_color)
        if sev and is_analysed_side:
            mistakes.append(entry)

    meta = {
        "white":        game.headers.get("White",  "?"),
        "black":        game.headers.get("Black",  "?"),
        "result":       game.headers.get("Result", "?"),
        "date":         game.headers.get("Date",   "?"),
        "event":        game.headers.get("Event",  "?"),
        "site":         game.headers.get("Site",   "?"),
        "total_moves":  len(moves_list) // 2,
        "player_color": player_color,
    }
    return {"meta": meta, "moves": moves_data, "mistakes": mistakes}


def aggregate(all_results: list) -> dict:
    pattern_counts  = defaultdict(int)
    phase_counts    = defaultdict(int)
    severity_counts = defaultdict(int)
    all_mistakes    = []

    for r in all_results:
        for m in r["mistakes"]:
            if m["pattern"]:
                pattern_counts[m["pattern"]]   += 1
            phase_counts[m["phase"]]           += 1
            severity_counts[m["severity"]]     += 1
            all_mistakes.append(m)

    top3     = sorted(pattern_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    profile  = build_profile(pattern_counts, phase_counts, severity_counts)
    training = build_training(top3, phase_counts)
    lessons  = build_lesson_order(pattern_counts, phase_counts, severity_counts)
    puzzles  = build_puzzles(all_mistakes)

    return {
        "pattern_counts":  dict(pattern_counts),
        "phase_counts":    dict(phase_counts),
        "severity_counts": dict(severity_counts),
        "top_weaknesses":  top3,
        "profile":         profile,
        "training":        training,
        "lessons":         lessons,
        "puzzles":         puzzles,
        "total_mistakes":  len(all_mistakes),
        "games_analysed":  len(all_results),
        "game_metas":      [r["meta"] for r in all_results],
        "games_moves":     [r["moves"] for r in all_results],
    }


def build_profile(pc: dict, phase: dict, sev: dict) -> dict:
    b     = sev.get("blunder", 0)
    m     = sev.get("mistake", 0)
    i     = sev.get("inaccuracy", 0)
    total = b + m + i or 1
    tac   = pc.get("Missed tactic", 0) + pc.get("Hanging piece", 0)
    op    = pc.get("Opening mistake", 0) + pc.get("Early queen development", 0)
    eg    = pc.get("Endgame mistake", 0)
    ks    = pc.get("King safety issue", 0)

    if b / total > 0.4:
        style, desc = "Reckless Gambler", "You take big risks and frequently overlook immediate threats. Slowing down before each move will dramatically cut your losses."
    elif tac > op and tac > eg:
        style, desc = "Tactical Dreamer", "You have a feel for the game but consistently miss short-term tactics. Daily puzzle training will sharpen your pattern recognition fast."
    elif op > tac:
        style, desc = "Opening Adventurer", "You love to experiment in the opening but often ignore basic development principles. A solid opening repertoire will give you better positions."
    elif eg > tac:
        style, desc = "Middlegame Fighter", "You excel in complex middlegame battles but struggle to convert winning endgames. Focused endgame study will close out far more wins."
    elif ks > 0:
        style, desc = "Daring Attacker", "You play aggressively but leave your king exposed too often. Learning to balance attack and defence will make you much harder to beat."
    elif i / total > 0.6:
        style, desc = "Solid but Passive", "You rarely blunder but tend to drift into passive positions. Work on creating imbalances and seizing the initiative."
    else:
        style, desc = "Balanced Player", "Your mistakes are spread evenly across all phases. Consistent study across tactics, strategy, and endgames will yield the fastest improvement."

    return {"style": style, "description": desc}


def build_training(top3: list, phase: dict) -> list:
    mapping = {
        "Early queen development": (
            "Opening Principles",
            "Avoid moving your queen before minor pieces are developed. Build a solid foundation first.",
            ["Play 10 games focusing on developing knights and bishops before the queen",
             "Study the Italian Game or London System openings"],
            "High"
        ),
        "Hanging piece": (
            "Piece Safety",
            "Before every move, scan your entire board and ask: 'Does anything I own become undefended?'",
            ["Complete 20 Hanging Piece puzzles on Lichess",
             "Practice the LPDO principle: Loose Pieces Drop Off"],
            "High"
        ),
        "King safety issue": (
            "King Safety",
            "Castle within the first 10 moves in every game. Keep the pawns in front of your king intact.",
            ["Solve 15 King Safety puzzles",
             "Study games by Mikhail Tal to understand what dangerous king positions look like"],
            "High"
        ),
        "Missed tactic": (
            "Tactical Training",
            "Consistent daily puzzle solving builds the pattern library you need to spot tactics instantly.",
            ["Solve 10 puzzles per day (forks, pins, skewers, discovered attacks)",
             "Work through Chess Tactics for Beginners on Chessable"],
            "High"
        ),
        "Endgame mistake": (
            "Endgame Fundamentals",
            "Master king and pawn endgames, the opposition concept, and basic rook endgames.",
            ["Practice King + Pawn vs King until you can win it automatically",
             "Study the Lucena and Philidor rook endgame positions"],
            "Medium"
        ),
        "Opening mistake": (
            "Opening Study",
            "Focus on understanding opening principles rather than memorising moves.",
            ["Pick one opening for White and one for Black and study the first 8 moves deeply",
             "Use Lichess Opening Explorer to review your most common positions"],
            "Medium"
        ),
        "Middlegame mistake": (
            "Strategic Play",
            "Work on identifying weak squares, pawn structures, and piece coordination.",
            ["Annotate 3 of your own games without an engine first, then compare",
             "Study Jeremy Silman's How to Reassess Your Chess"],
            "Medium"
        ),
    }
    plan = []
    for name, count in top3:
        if name in mapping:
            t, d, drills, pri = mapping[name]
        else:
            t, d, drills, pri = (
                "Pattern Improvement",
                f"Focus on reducing '{name}' mistakes across your games.",
                ["Review all your games with this pattern", "Ask a stronger player to analyse these positions with you"],
                "Medium"
            )
        plan.append({"title": t, "description": d, "drills": drills, "priority": pri, "pattern": name, "count": count})

    if phase.get("opening", 0) > phase.get("middlegame", 0) and not any(p["pattern"] in ("Opening mistake","Early queen development") for p in plan):
        plan.append({
            "title": "Opening Repertoire",
            "description": "Your opening phase generates the most mistakes. Build a reliable repertoire.",
            "drills": ["Pick one opening and study the first 8 moves", "Use Lichess Opening Explorer"],
            "priority": "Medium", "pattern": "opening", "count": phase.get("opening", 0)
        })

    if not plan:
        plan.append({
            "title": "General Improvement",
            "description": "Keep playing and reviewing your games consistently.",
            "drills": ["Play 3 longer time-control games per week", "Review each game with the engine after"],
            "priority": "Low", "pattern": "general", "count": 0
        })
    return plan


def build_lesson_order(pc: dict, phase: dict, sev: dict) -> list:
    scores = {
        "blunders":   sev.get("blunder", 0) * 3,
        "tactics":    pc.get("Missed tactic", 0) * 2 + pc.get("Hanging piece", 0) * 2,
        "kingsafety": pc.get("King safety issue", 0) * 2,
        "openings":   pc.get("Early queen development", 0) + pc.get("Opening mistake", 0),
        "capitalize": sev.get("mistake", 0),
        "pieces":     pc.get("Middlegame mistake", 0) + pc.get("Positional mistake", 0),
        "endgame":    pc.get("Endgame mistake", 0),
    }
    return sorted(scores.keys(), key=lambda k: scores[k], reverse=True)


def build_puzzles(all_mistakes: list) -> list:
    blunders = [m for m in all_mistakes if m["severity"] == "blunder" and m["best_move"]]
    random.shuffle(blunders)
    return [
        {
            "fen":        b["fen_before"],
            "solution":   b["best_move"],
            "move_played": b["san"],
            "phase":      b["phase"],
            "pattern":    b["pattern"] or "Mistake",
            "drop_cp":    b["drop_cp"],
            "side":       b["side"],
        }
        for b in blunders[:8]
    ]


DAILY_CHALLENGES = [
    {"id":1,"title":"Fork Master","desc":"Find the knight fork winning material.","fen":"r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4","solution":"Ng5","hint":"Your knight can attack two pieces simultaneously.","xp":50},
    {"id":2,"title":"Pin to Win","desc":"Find the pin that wins material.","fen":"rnbqk2r/ppp2ppp/3p1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 6","solution":"Bg4","hint":"Pin a piece against the queen.","xp":60},
    {"id":3,"title":"Back Rank Mate","desc":"Deliver checkmate on the back rank.","fen":"6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1","solution":"Rd8#","hint":"The king has no escape squares.","xp":75},
    {"id":4,"title":"Skewer Attack","desc":"Win material with a skewer.","fen":"4k3/8/8/8/8/8/8/R3K3 w Q - 0 1","solution":"Ra8+","hint":"Attack through a valuable piece to win what's behind.","xp":65},
    {"id":5,"title":"Endgame King","desc":"Activate your king to win the endgame.","fen":"8/8/8/3k4/8/3K4/3P4/8 w - - 0 1","solution":"Ke3","hint":"The king must escort the pawn to queen.","xp":55},
]

OPENINGS = [
    {"name":"Italian Game","moves":["e4","e5","Nf3","Nc6","Bc4"],"tip":"Control the center and aim to push d4 later. One of the oldest and most principled openings.","color":"white"},
    {"name":"Sicilian Defence","moves":["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3"],"tip":"Black fights for the center from the flank. Leads to sharp, unbalanced positions.","color":"black"},
    {"name":"London System","moves":["d4","d5","Nf3","Nf6","Bf4","e6","e3"],"tip":"Solid and reliable. Set up the same structure every game and learn it deeply.","color":"white"},
    {"name":"French Defence","moves":["e4","e6","d4","d5","Nc3","Nf6"],"tip":"Solid but slightly passive. Counter with c5 to break White's center.","color":"black"},
    {"name":"King's Indian Defence","moves":["d4","Nf6","c4","g6","Nc3","Bg7","e4","d6","Nf3","O-O"],"tip":"Dynamic counterplay against 1.d4. Black allows White a big center then attacks it.","color":"black"},
    {"name":"Queen's Gambit","moves":["d4","d5","c4","e6","Nc3","Nf6","Bg5"],"tip":"One of the most classical openings. White offers a pawn to gain central control.","color":"white"},
]

# ── Init DB on startup ───────────────────────────────────────────────────────
init_db()

# ── Auth Routes ────────────────────────────────────────────────────────────────
@app.route("/auth/register", methods=["POST"])
def register():
    data     = request.get_json(silent=True) or {}
    username = data.get("username", "").strip().lower()
    password = data.get("password", "").strip()
    email    = data.get("email", "").strip().lower()

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400
    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400
    if len(username) > 30:
        return jsonify({"error": "Username must be 30 characters or less."}), 400
    if not username.replace("_","").replace("-","").isalnum():
        return jsonify({"error": "Username can only contain letters, numbers, hyphens and underscores."}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400

    # Check if username taken
    if get_user(username):
        return jsonify({"error": "That username is already taken."}), 400
    # Check email uniqueness
    if email:
        db = load_db()
        if any(u.get("email","").lower() == email for u in db.values()):
            return jsonify({"error": "An account with that email already exists."}), 400

    new_user = {
        "password":     hash_password(password),
        "email":        email,
        "created":      int(time.time()),
        "xp":           0,
        "plan":         "free",
        "plan_expires": None,
        "daily_counts": {},
        "games":        [],
        "progress":     empty_progress(),
    }
    save_user(username, new_user)
    session["username"] = username
    session.permanent  = True
    return jsonify({"ok": True, "username": username, "xp": 0, "progress": empty_progress()})


@app.route("/auth/login", methods=["POST"])
def login():
    data     = request.get_json(silent=True) or {}
    username = data.get("username", "").strip().lower()
    password = data.get("password", "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    user = get_user(username)
    if not user or not verify_password(password, user["password"]):
        # Constant-time rejection to prevent timing attacks
        time.sleep(0.3)
        return jsonify({"error": "Incorrect username or password."}), 401

    session["username"] = username
    session.permanent  = True
    return jsonify({
        "ok":       True,
        "username": username,
        "xp":       user.get("xp", 0),
        "plan":     user.get("plan", "free"),
        "progress": user.get("progress", empty_progress()),
        "games":    user.get("games", []),
    })


@app.route("/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/auth/me")
def me():
    u = current_user()
    if not u:
        return jsonify({"loggedIn": False})
    user = get_user(u)
    if not user:
        session.clear()
        return jsonify({"loggedIn": False})
    return jsonify({
        "loggedIn": True,
        "username": u,
        "xp":       user.get("xp", 0),
        "plan":     user.get("plan", "free"),
        "progress": user.get("progress", empty_progress()),
        "games":    user.get("games", []),
    })


@app.route("/auth/save-game", methods=["POST"])
@login_required
def save_game():
    u    = current_user()
    data = request.get_json(silent=True) or {}
    pgn  = data.get("pgn", "").strip()
    if not pgn:
        return jsonify({"error": "No PGN provided."}), 400
    label = data.get("label", "Game")[:100]
    user = get_user(u)
    if not user:
        return jsonify({"error": "User not found"}), 404
    user["games"] = user.get("games", [])
    user["games"].append({"pgn": pgn, "label": label, "saved": int(time.time())})
    user["games"] = user["games"][-50:]
    save_user(u, user)
    return jsonify({"ok": True, "total": len(db[u]["games"])})


@app.route("/auth/add-xp", methods=["POST"])
@login_required
def add_xp():
    u    = current_user()
    data = request.get_json(silent=True) or {}
    amount = max(0, min(int(data.get("amount", 0)), 500))  # cap at 500 per call
    xp_type = data.get("type", "")
    lesson_id = data.get("lesson_id", "")

    user = get_user(u)
    if not user:
        return jsonify({"error": "User not found"}), 404
    user["xp"] = user.get("xp", 0) + amount
    prog = user.get("progress", empty_progress())

    if xp_type == "puzzle":
        prog["puzzles_solved"] = prog.get("puzzles_solved", 0) + 1
    if xp_type == "analysis":
        prog["games_analysed"] = prog.get("games_analysed", 0) + 1
    if xp_type == "lesson" and lesson_id:
        completed = prog.get("lessons_completed", [])
        if lesson_id not in completed:
            completed.append(lesson_id)
        prog["lessons_completed"] = completed
    if xp_type == "challenge" and lesson_id:
        solved = prog.get("challenge_solved", [])
        if lesson_id not in solved:
            solved.append(lesson_id)
        prog["challenge_solved"] = solved

    user["progress"] = prog
    save_user(u, user)
    return jsonify({"ok": True, "xp": user["xp"], "progress": prog})


# ── Core Routes ────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/parse-pgn", methods=["POST"])
def parse_pgn():
    """
    Step 1: Parse PGN headers without running Stockfish.
    Returns the player names so the frontend can show a selection button.
    """
    pgn_text = ""
    if "pgn_file" in request.files and request.files["pgn_file"].filename:
        pgn_text = request.files["pgn_file"].read().decode("utf-8", errors="replace")
    elif request.form.get("pgn_text"):
        pgn_text = request.form["pgn_text"].strip()
    elif request.is_json:
        pgn_text = (request.json or {}).get("pgn_text", "")

    if not pgn_text:
        return jsonify({"error": "No PGN provided."}), 400

    players = extract_players_from_pgn(pgn_text)
    return jsonify({
        "ok":     True,
        "white":  players["white"],
        "black":  players["black"],
        "event":  players.get("event", ""),
        "date":   players.get("date", ""),
        "site":   players.get("site", ""),
    })


@app.route("/analyse", methods=["POST"])
def analyse():
    """
    Step 2: Run full Stockfish analysis.
    Requires player_color ("white" or "black") to be sent by the frontend
    after the user clicks their name button.
    """
    pgn_text = ""
    if "pgn_file" in request.files and request.files["pgn_file"].filename:
        pgn_text = request.files["pgn_file"].read().decode("utf-8", errors="replace")
    elif request.form.get("pgn_text"):
        pgn_text = request.form["pgn_text"].strip()

    # player_color must be "white" or "black" — set by frontend button click
    player_color = request.form.get("player_color", "").strip().lower()
    if player_color not in ("white", "black", ""):
        return jsonify({"error": "Invalid player_color. Must be 'white' or 'black'."}), 400
    if not player_color:
        player_color = None  # analyse both sides

    if not pgn_text:
        return jsonify({"error": "No PGN provided."}), 400

    # ── Plan enforcement ───────────────────────────────────────────────────────
    u = current_user()
    if u:
        user = get_user(u) or {}
        if not is_pro(user):
            count = games_today(user)
            if count >= FREE_DAILY_LIMIT:
                return jsonify({
                    "error":    "free_limit_reached",
                    "message":  f"Free plan allows {FREE_DAILY_LIMIT} game analysis per day. Upgrade to Grandmaster for unlimited analysis.",
                    "upgrade":  True,
                    "limit":    FREE_DAILY_LIMIT,
                    "used":     count,
                }), 403
    # ── End plan enforcement ───────────────────────────────────────────────────

    sf = find_stockfish()
    if not sf:
        return jsonify({"error": "Stockfish engine not found on this server."}), 500

    # Split multiple games
    games_raw, buf = [], []
    for line in pgn_text.splitlines():
        buf.append(line)
        if line.strip() == "" and any(l.startswith("1.") for l in buf):
            games_raw.append("\n".join(buf))
            buf = []
    if buf:
        games_raw.append("\n".join(buf))
    games_raw = [g for g in games_raw if g.strip()][:MAX_GAMES]

    if not games_raw:
        return jsonify({"error": "Could not parse any valid games from the PGN."}), 400

    try:
        with chess.engine.SimpleEngine.popen_uci(sf) as engine:
            engine.configure({"Threads": 2, "Hash": 64})
            results = [
                r for r in (analyse_game(g, engine, player_color) for g in games_raw)
                if r is not None
            ]
    except chess.engine.EngineTerminatedError:
        return jsonify({"error": "Stockfish engine crashed. Please try again."}), 500
    except Exception as e:
        return jsonify({"error": f"Analysis error: {str(e)}"}), 500

    if not results:
        return jsonify({"error": "Could not analyse any games. Check the PGN format."}), 400

    data = aggregate(results)
    data["player_color"] = player_color

    # Update progress if logged in
    u = current_user()
    if u:
        user = get_user(u)
        if user:
            prog = user.get("progress", empty_progress())
            prog["games_analysed"]  = prog.get("games_analysed", 0)  + len(results)
            prog["blunders_found"]  = prog.get("blunders_found", 0)  + data["severity_counts"].get("blunder", 0)
            user["progress"] = prog
            user["xp"] = user.get("xp", 0) + 100
            increment_game_count(user)
            save_user(u, user)
            data["xp"] = user["xp"]
            data["plan"] = user.get("plan", "free")
            data["games_today"] = games_today(user)
            data["daily_limit"] = FREE_DAILY_LIMIT

    return jsonify(data)


@app.route("/daily-challenges")
def daily_challenges():
    return jsonify(DAILY_CHALLENGES)


@app.route("/opening-trainer")
def opening_trainer():
    return jsonify(OPENINGS)


# ── CORS headers (needed when Replit frontend calls Railway backend) ───────────
@app.after_request
def add_cors_headers(response):
    allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")
    response.headers["Access-Control-Allow-Origin"]  = allowed_origins
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


@app.route("/auth/upgrade", methods=["POST"])
@login_required
def upgrade():
    """Manually upgrade a user to pro (for testing or manual upgrades)."""
    u    = current_user()
    data = request.get_json(silent=True) or {}
    key  = data.get("admin_key","")
    # Simple admin key check — set ADMIN_KEY env var in Railway
    if key != os.environ.get("ADMIN_KEY",""):
        return jsonify({"error":"Unauthorized"}), 403
    user = get_user(u)
    if not user:
        return jsonify({"error":"User not found"}), 404
    user["plan"] = "pro"
    save_user(u, user)
    return jsonify({"ok":True,"plan":"pro"})


@app.route("/stripe/webhook", methods=["POST"])
def stripe_webhook():
    """
    Stripe sends payment events here.
    When someone pays, we upgrade their account to pro automatically.
    Set up in Stripe Dashboard → Webhooks → Add endpoint.
    """
    import hmac as _hmac
    payload    = request.get_data()
    sig_header = request.headers.get("Stripe-Signature","")
    secret     = STRIPE_WEBHOOK

    # Verify webhook signature
    if secret:
        try:
            parts     = {p.split("=")[0]: p.split("=")[1] for p in sig_header.split(",")}
            timestamp = parts.get("t","")
            signature = parts.get("v1","")
            signed    = f"{timestamp}.{payload.decode()}"
            expected  = _hmac.new(secret.encode(), signed.encode(), "sha256").hexdigest()
            if not _hmac.compare_digest(expected, signature):
                return jsonify({"error":"Invalid signature"}), 400
        except Exception:
            return jsonify({"error":"Webhook error"}), 400

    event = request.get_json(silent=True) or {}
    etype = event.get("type","")

    # Payment succeeded — upgrade to pro
    if etype in ("checkout.session.completed", "invoice.payment_succeeded"):
        obj      = event.get("data",{}).get("object",{})
        email    = obj.get("customer_email") or obj.get("customer_details",{}).get("email","")
        if email:
            db = load_db()
            for uname, user in db.items():
                if user.get("email","").lower() == email.lower():
                    user["plan"] = "pro"
                    user["plan_started"] = int(time.time())
                    break
            save_db(db)

    # Subscription cancelled — downgrade to free
    if etype == "customer.subscription.deleted":
        obj   = event.get("data",{}).get("object",{})
        email = obj.get("customer_email","")
        if email:
            db = load_db()
            for uname, user in db.items():
                if user.get("email","").lower() == email.lower():
                    user["plan"] = "free"
                    break
            save_db(db)

    return jsonify({"ok": True})


@app.route("/plan/status")
@login_required
def plan_status():
    """Return current user plan status and usage."""
    u    = current_user()
    user = get_user(u) or {}
    return jsonify({
        "plan":        user.get("plan","free"),
        "is_pro":      is_pro(user),
        "games_today": games_today(user),
        "daily_limit": FREE_DAILY_LIMIT,
        "can_analyse": is_pro(user) or games_today(user) < FREE_DAILY_LIMIT,
    })


@app.route("/health")
def health():
    sf = find_stockfish()
    return jsonify({
        "status":    "ok",
        "stockfish": sf or "not found",
        "depth":     ANALYSIS_DEPTH,
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)
