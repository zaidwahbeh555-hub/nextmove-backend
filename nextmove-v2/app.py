"""
ChessForge — Production Backend v6
"""
import os, io, json, random, hashlib, hmac, time, secrets, urllib.request, urllib.parse, smtplib, re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import chess, chess.pgn, chess.engine
from flask import Flask, request, jsonify, render_template, session, make_response
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

# ── Plans ────────────────────────────────────────────────────────────────────
# The paid tier is called Grandmaster everywhere a human can see it. The stored
# value stays "pro": it is what the Stripe webhook writes, what is already in
# every existing account, and what is_pro() reads. Renaming the stored value
# would silently revoke access for every current subscriber, so only the label
# moves.
PLAN_NAME      = "Grandmaster"
FREE_PLAN_NAME = "Free"

# What the free plan gets per day. Everything else is Grandmaster.
FREE_COACHED_GAMES   = 1    # coached games per day
FREE_PUZZLES         = 5    # puzzles per day
FREE_LESSON_DRILLS   = 1    # exercises per lesson theme
FREE_ANALYSIS        = 1    # deep analyses per day

def _today(): return time.strftime("%Y-%m-%d")

def usage(user, key):
    """How many times `key` has been used today."""
    u = user.get("usage") or {}
    if u.get("day") != _today():
        return 0
    return int(u.get(key, 0))

def bump_usage(user, key, n=1):
    u = user.get("usage") or {}
    if u.get("day") != _today():
        u = {"day": _today()}
    u[key] = int(u.get(key, 0)) + n
    user["usage"] = u
    return u[key]

def quota_left(user, key, cap):
    if is_pro(user):
        return None                      # None means unlimited
    return max(0, cap - usage(user, key))

def quota_blocked(user, key, cap, what):
    """Return an error payload if the free plan is out of `key` for today."""
    if is_pro(user):
        return None
    used = usage(user, key)
    if used < cap:
        return None
    return {
        "error": "free_limit_reached",
        "locked": key,
        "message": "Free gives you %d %s a day, and you have used %s. %s is unlimited."
                   % (cap, what, used, PLAN_NAME),
        "upgrade": True, "limit": cap, "used": used, "plan": PLAN_NAME,
    }
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

# Pro access and paid-for Pro are not the same thing. Comped accounts -- granted
# from the admin page or /auth/upgrade -- get every Pro feature but must never
# show up as revenue. Only an account Stripe actually billed counts.
def is_paying(user):
    return user.get("plan") == "pro" and user.get("billing") == "stripe"

def mark_billing(user, source):
    """Record how an account got Pro: 'stripe' (paid) or 'comp' (granted)."""
    user["billing"] = source
    if source == "stripe":
        user.setdefault("plan_started", int(time.time()))
    return user

def monthly_revenue(db):
    return sum(1 for u in db.values() if is_paying(u)) * PRO_PRICE

PRO_PRICE = 19.99          # CAD. The amount Stripe actually charges is set by
PRO_CURRENCY = "CAD"       # STRIPE_PRICE_ID, not here -- keep the two in step.

# Last activity. /auth/me fires once per page load, so this is a good enough
# heartbeat without writing to the database on every request.
SEEN_THROTTLE = 300     # don't rewrite last_seen more than this often
SESSION_GAP   = 1800    # 30 min of silence ends a visit

def roll_session(user, now):
    """Close the previous visit if the player has been away, and open a new one.

    A "session" is a run of activity with no gap longer than SESSION_GAP. When
    one closes we bank the XP earned during it, which is what the admin page
    reports as XP last session.
    """
    last = int(user.get("last_seen") or 0)
    xp = int(user.get("xp") or 0)
    if "session_start_xp" not in user:
        user["session_start_xp"] = xp
        user["session_started"] = now
        return
    if last and now - last > SESSION_GAP:
        user["last_session_xp"] = max(0, xp - int(user.get("session_start_xp") or 0))
        user["last_session_end"] = last
        user["session_start_xp"] = xp
        user["session_started"] = now

def touch_seen(username, user, force=False):
    now = int(time.time())
    if not force and now - int(user.get("last_seen") or 0) < SEEN_THROTTLE:
        return False
    roll_session(user, now)
    user["last_seen"] = now
    save_user(username, user)
    return True

def session_xp_now(user):
    """XP earned during the visit currently in progress."""
    return max(0, int(user.get("xp") or 0) - int(user.get("session_start_xp") or 0))

# ══ XP ECONOMY ═══════════════════════════════════════════════════════════════
# XP is currency now, so the client no longer says how much it earned -- it says
# what happened, and the server prices it. Each rule is awarded from inside the
# endpoint that already verified the event (a drill really passed, a game really
# finished), which is why there is no way to mint XP from the console.
XP_RULES = {
    "puzzle_solved":        20,
    "drill_passed":         25,
    "pattern_mastered":     60,
    "lesson_done":          30,
    "game_coached":         25,
    "game_solo":            35,
    "clean_game":           50,   # finished a game with zero blunders
    "candidates_reviewed":  15,   # actually weighed more than one move
    "found_best":           20,   # a candidate matched the engine's choice
    "streak_day":           25,
}

# Daily award caps, so grinding one cheap action cannot outpace playing.
XP_DAILY_CAP = {
    "puzzle_solved":       15,
    "drill_passed":        20,
    "lesson_done":          5,
    "game_coached":        10,
    "game_solo":           10,
    "clean_game":           5,
    "candidates_reviewed": 20,
    "found_best":          20,
    "streak_day":           1,
}

def get_wallet(user):
    """Lifetime XP earned, XP spent, and today's per-event award counts."""
    w = user.get("wallet")
    if not isinstance(w, dict):
        # Pre-existing accounts keep the XP they already have as lifetime earned.
        w = {"spent": 0, "day": "", "counts": {}}
    w.setdefault("spent", 0)
    w.setdefault("day", "")
    w.setdefault("counts", {})
    return w

def xp_balance(user):
    """Spendable XP. `xp` stays the lifetime total so the level bar never drops."""
    return max(0, user.get("xp", 0) - get_wallet(user).get("spent", 0))

def streak_bonus(streak):
    """Extra XP for keeping a streak. Day one pays the base; it climbs to double
    by day sixteen and stops there, so a long streak is worth protecting without
    becoming the only thing that matters."""
    return min(max(int(streak or 1) - 1, 0), 15) * 5

def grant_streak_xp(user, streak):
    """Base streak award plus the bonus for how long it has run."""
    base = grant_xp(user, "streak_day")
    if not base:
        return 0                       # already claimed today
    bonus = streak_bonus(streak)
    if bonus:
        user["xp"] = user.get("xp", 0) + bonus
    return base + bonus

def grant_xp(user, event, times=1):
    """Award XP for a verified event. Returns the amount actually granted.

    Mutates `user` but does not save -- the caller is already saving.
    """
    base = XP_RULES.get(event, 0)
    if base <= 0 or times <= 0:
        return 0
    w = get_wallet(user)
    today = time.strftime("%Y-%m-%d")
    if w.get("day") != today:
        w["day"] = today
        w["counts"] = {}
    cap = XP_DAILY_CAP.get(event)
    if cap is not None:
        used = int(w["counts"].get(event, 0))
        times = min(times, max(0, cap - used))
        if times <= 0:
            user["wallet"] = w
            return 0
        w["counts"][event] = used + times
    amount = base * times
    user["xp"] = user.get("xp", 0) + amount
    user["wallet"] = w
    return amount

# ══ COSMETICS ════════════════════════════════════════════════════════════════
# A board theme is nothing but two CSS custom properties, and a piece set is
# nothing but a directory of the same SVG geometry in different colours. Neither
# touches layout, which is deliberate -- board layout is where this app has
# broken before.
#
# Every light-square value below was solved so the default piece set's black
# outline (#7E8598) clears a 3:1 contrast ratio; see tests/test_cosmetics.py,
# which re-checks all 70 piece-set x theme x square combinations.
# Dark squares avoid the mid-tone dead band (roughly 0.045-0.153 luminance),
# where neither a dark piece body nor a light piece outline separates from the
# square. See tools/gen_piece_sets.py; tests/test_cosmetics.py enforces it.
# `tex` is an optional CSS background-image layered over the flat colour.
_GRAIN = ("repeating-linear-gradient(97deg, rgba(0,0,0,.055) 0 1px, "
          "rgba(0,0,0,0) 1px 5px), repeating-linear-gradient(94deg, "
          "rgba(255,255,255,.05) 0 1px, rgba(255,255,255,0) 1px 9px)")
_VEIN = ("radial-gradient(120% 90% at 18% 12%, rgba(255,255,255,.20), rgba(255,255,255,0) 55%), "
         "radial-gradient(90% 70% at 82% 78%, rgba(0,0,0,.12), rgba(0,0,0,0) 60%), "
         "repeating-linear-gradient(123deg, rgba(0,0,0,.05) 0 1px, rgba(0,0,0,0) 1px 14px)")

BOARD_THEMES = [
    # ── restrained ──
    {"id": "midnight", "name": "Midnight",  "price": 0,    "light": "#2E3446", "dark": "#1E2231",
     "blurb": "The original. Cool indigo-grey, stays out of the way."},
    {"id": "obsidian", "name": "Obsidian",  "price": 500,  "light": "#2B2B32", "dark": "#1A1A1F",
     "blurb": "Near-neutral graphite. The quietest board here."},
    # ── vivid ──
    {"id": "emerald",  "name": "Emerald",   "price": 800,  "light": "#E9F3DC", "dark": "#4E9A5A",
     "blurb": "Bright tournament green. The most readable board in the shop."},
    {"id": "lagoon",   "name": "Lagoon",    "price": 900,  "light": "#D8EFF5", "dark": "#3893AE",
     "blurb": "Clear teal water. Cool and wide awake."},
    {"id": "azure",    "name": "Azure",     "price": 900,  "light": "#DEE9F8", "dark": "#4477C4",
     "blurb": "Strong cobalt blue against pale sky."},
    {"id": "coral",    "name": "Coral",     "price": 1100, "light": "#FCE4DC", "dark": "#D46A57",
     "blurb": "Warm coral red. Nothing else here looks like it."},
    {"id": "sunset",   "name": "Sunset",    "price": 1100, "light": "#FCEBCF", "dark": "#D89344",
     "blurb": "Amber and cream. The brightest board of the lot."},
    {"id": "amethyst", "name": "Amethyst",  "price": 1300, "light": "#E9E1F8", "dark": "#8E6FD4",
     "blurb": "Vivid violet. Loud, and knows it."},
    # ── textured ──
    {"id": "walnut",   "name": "Walnut",    "price": 1600, "light": "#E4CBA5", "dark": "#A5754C",
     "blurb": "Real wood grain running across every square.",
     "tex_light": _GRAIN, "tex_dark": _GRAIN},
    {"id": "marble",   "name": "Marble",    "price": 1900, "light": "#EFEFEA", "dark": "#9AA3AD",
     "blurb": "Polished stone with veining and a lit corner on each square.",
     "tex_light": _VEIN, "tex_dark": _VEIN},
    # ── dark showpieces ──
    {"id": "royal",    "name": "Royal",     "price": 1500, "light": "#3A3154", "dark": "#251E38",
     "blurb": "Deep violet. Matches the accent without shouting."},
    {"id": "blackice", "name": "Black Ice", "price": 2200, "light": "#28323F", "dark": "#12171E",
     "blurb": "Glossy near-black with a cold blue cast. The darkest board here."},
]

PIECE_SETS = [
    {"id": "classic", "name": "Classic", "price": 0,    "dir": "",
     "blurb": "The house set. Warm ivory against slate."},
    {"id": "mono",    "name": "Mono",    "price": 800,  "dir": "mono/",
     "blurb": "Maximum contrast, zero colour. The most legible set."},
    {"id": "frost",   "name": "Frost",   "price": 1100, "dir": "frost/",
     "blurb": "Cool blue-white. Pairs with Ice and Slate."},
    {"id": "jade",    "name": "Jade",    "price": 1100, "dir": "jade/",
     "blurb": "Soft green-tinted ivory. Pairs with Forest."},
    {"id": "ember",   "name": "Ember",   "price": 1400, "dir": "ember/",
     "blurb": "Warm copper detailing. Pairs with Ember board."},
    {"id": "blackice","name": "Black Ice","price": 2200, "dir": "blackice/",
     "blurb": "Near-black bodies with ice-blue edge light. Pairs with the Black Ice board."},
    {"id": "marble",  "name": "Marble",  "price": 2400, "dir": "marble/",
     "blurb": "Carved stone: a polished gradient with speckle and veining in the surface."},
]

# ── GM Forge cosmetics ───────────────────────────────────────────────────────
# Three independent slots layered onto the coach's inline SVG. The art itself
# lives in main.js (FORGE_ART) keyed by these ids; the server only records what
# is owned and worn, so adding a new item never needs a migration.
FORGE_TOPPERS = [
    {"id": "none",     "name": "Nothing",       "price": 0,    "blurb": "Just the hair he was born with."},
    {"id": "beanie",   "name": "Beanie",        "price": 400,  "blurb": "Bobble on top. Wildly unserious."},
    {"id": "cap",      "name": "Backwards Cap", "price": 500,  "blurb": "He is down with the youth now."},
    {"id": "party",    "name": "Party Hat",     "price": 600,  "blurb": "Worn at all times. Never explained."},
    {"id": "cowboy",   "name": "Cowboy Hat",    "price": 900,  "blurb": "This town has room for one grandmaster."},
    {"id": "tophat",   "name": "Top Hat",       "price": 1200, "blurb": "Absurdly formal for a knight fork."},
    {"id": "crown",    "name": "Crown",         "price": 1800, "blurb": "He has awarded it to himself."},
]

FORGE_FACE = [
    {"id": "none",       "name": "Clean Shaven", "price": 0,    "blurb": "The face as issued."},
    {"id": "moustache",  "name": "Handlebar",    "price": 500,  "blurb": "Enormous. Waxed. Curls at both ends."},
    {"id": "beard",      "name": "Full Beard",   "price": 800,  "blurb": "Instantly adds 400 rating points."},
    {"id": "shades",     "name": "Shades",       "price": 900,  "blurb": "He saw the fork three moves ago."},
    {"id": "monocle",    "name": "Monocle",      "price": 1300, "blurb": "For positions of unusual refinement."},
]

FORGE_OUTFITS = [
    {"id": "none",      "name": "Coach Shirt",  "price": 0,    "blurb": "Navy shirt and tie. The classic."},
    {"id": "hoodie",    "name": "Hoodie",       "price": 600,  "blurb": "Off-duty Forge. Still judging you."},
    {"id": "muscle",    "name": "Muscle Shirt", "price": 1000, "blurb": "Sleeves removed. Arms deployed."},
    {"id": "tuxedo",    "name": "Tuxedo",       "price": 1500, "blurb": "Dressed for the world championship."},
    {"id": "ripped",    "name": "Shirtless",    "price": 2000, "blurb": "He is absolutely shredded. No one asked."},
]

COSMETIC_KINDS = {"board": BOARD_THEMES, "pieces": PIECE_SETS,
                  "topper": FORGE_TOPPERS, "face": FORGE_FACE, "outfit": FORGE_OUTFITS}

# Themes withdrawn from the catalog, with what they cost. get_cosmetics() drops
# anything not in the catalog, so without this a player who had bought one would
# lose both the item and the XP they paid for it.
RETIRED_PRICES = {
    ("board", "slate"): 900, ("board", "ice"): 900,
    ("board", "forest"): 1200, ("board", "ember"): 1200,
}

def reconcile_retired(username, user):
    """Refund anything the player owns that no longer exists. Returns XP given back."""
    raw = user.get("cosmetics")
    if not isinstance(raw, dict):
        return 0
    owned = raw.get("owned") if isinstance(raw.get("owned"), dict) else {}
    refund = 0
    for kind, ids in owned.items():
        valid = {i["id"] for i in COSMETIC_KINDS.get(kind, [])}
        for item_id in (ids or []):
            if item_id not in valid:
                refund += RETIRED_PRICES.get((kind, item_id), 0)
    if refund:
        w = get_wallet(user)
        w["spent"] = max(0, w.get("spent", 0) - refund)
        user["wallet"] = w
        user["cosmetics"] = get_cosmetics(user)   # prune the dead ids
        save_user(username, user)
    return refund

def cosmetic_payload(user):
    """What the equipped cosmetics actually resolve to.

    Returns the concrete values (square colours, piece directory) rather than
    just ids, so the frontend can paint on first load without another request.
    """
    cos = get_cosmetics(user)
    board = cosmetic_item("board", cos["equipped"]["board"]) or BOARD_THEMES[0]
    pieces = cosmetic_item("pieces", cos["equipped"]["pieces"]) or PIECE_SETS[0]
    return {"board": board["id"], "pieces": pieces["id"],
            "light": board["light"], "dark": board["dark"], "dir": pieces["dir"],
            "tex_light": board.get("tex_light") or "", "tex_dark": board.get("tex_dark") or "",
            "topper": cos["equipped"].get("topper") or "none",
            "face":   cos["equipped"].get("face")   or "none",
            "outfit": cos["equipped"].get("outfit") or "none",
            "owned": cos["owned"]}

def cosmetic_item(kind, item_id):
    for it in COSMETIC_KINDS.get(kind, []):
        if it["id"] == item_id:
            return it
    return None

def default_cosmetics():
    """Whatever is free in each slot is owned and worn from the start."""
    owned, equipped = {}, {}
    for kind, catalog in COSMETIC_KINDS.items():
        free = [i["id"] for i in catalog if i["price"] == 0]
        owned[kind] = list(free)
        equipped[kind] = free[0] if free else None
    return {"owned": owned, "equipped": equipped}

def get_cosmetics(user):
    """Cosmetics state, repaired against the live catalog.

    Anything equipped but no longer owned or no longer in the catalog falls back
    to the free default rather than rendering an undefined theme.
    """
    c = user.get("cosmetics")
    if not isinstance(c, dict):
        c = default_cosmetics()
    owned = c.get("owned") if isinstance(c.get("owned"), dict) else {}
    equipped = c.get("equipped") if isinstance(c.get("equipped"), dict) else {}
    out = {"owned": {}, "equipped": {}}
    for kind, catalog in COSMETIC_KINDS.items():
        valid = {it["id"] for it in catalog}
        free = [it["id"] for it in catalog if it["price"] == 0]
        have = [i for i in (owned.get(kind) or []) if i in valid]
        for f in free:
            if f not in have:
                have.append(f)
        out["owned"][kind] = have
        eq = equipped.get(kind)
        out["equipped"][kind] = eq if eq in have else (free[0] if free else None)
    return out

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
        # Plain-English why, not just what. Computed from the position, so this
        # needs no API key and cannot make anything up. Only worth the work on
        # moves that actually cost something.
        why = ""
        if sev in ("blunder", "mistake", "inaccuracy") and best_san:
            try:
                # info_after's PV starts with the opponent's best reply -- the
                # refutation. Naming it is most of what makes the explanation land.
                reply_obj = (info_after.get("pv") or [None])[0]
                reply_san = snap.copy()
                reply_san.push(move)
                reply_san = (reply_san.san(reply_obj)
                             if reply_obj and reply_obj in reply_san.legal_moves else None)
                why = explain_mistake(fen_before, san, best_san, reply_san, int(drop))
            except Exception:
                why = ""
        entry = dict(ply=ply,move_number=move_number,side=side,san=san,
                     fen_before=fen_before,fen_after=fen_after,
                     score_before=score_before,score_after=score_after,
                     eval_before=round(score_before/100,2) if score_before else None,
                     eval_after=round(score_after/100,2) if score_after else None,
                     drop_cp=int(drop),severity=sev,pattern=pattern,why=why,
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
              # Guided tutorial removed: new accounts are created already complete
              # so nothing gates or re-triggers a first-run flow.
              "progress":empty_progress(),"onboarding":default_onboarding(new=False),
              "tutorial_done":False}
    save_user(username,new_user)
    session["username"]=username; session.permanent=True
    # Notify admin
    send_admin_email("New ChessForge signup!",f"New user: {username}\nEmail: {email}\nTime: {time.strftime('%Y-%m-%d %H:%M')}")
    return jsonify({"ok":True,"username":username,"xp":0,"plan":"free","progress":empty_progress(),
                    "tutorial_done":False,"onboarding":new_user["onboarding"]})

@app.route("/auth/login", methods=["POST"])
def login():
    data=request.get_json(silent=True) or {}
    username=data.get("username","").strip().lower()
    password=data.get("password","").strip()
    if not username or not password: return jsonify({"error":"Username and password required."}),400
    user=get_user(username)
    if not user or not verify_password(password,user["password"]): time.sleep(0.3); return jsonify({"error":"Incorrect username or password."}),401
    session["username"]=username; session.permanent=True
    now=int(time.time())
    roll_session(user,now)
    user["last_login"]=now; user["last_seen"]=now
    user["login_count"]=int(user.get("login_count") or 0)+1
    save_user(username,user)
    return jsonify({"ok":True,"username":username,"xp":user.get("xp",0),"plan":user.get("plan","free"),
                    "balance":xp_balance(user),"cosmetics":cosmetic_payload(user),
                    "tutorial_done":bool(user.get("tutorial_done")),
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
    # Sessions persist, so many people never hit /auth/login again. This is what
    # keeps "last seen" honest for returning users.
    touch_seen(u, user)
    return jsonify({"loggedIn":True,"username":u,"xp":user.get("xp",0),"plan":user.get("plan","free"),
                    "balance":xp_balance(user),"cosmetics":cosmetic_payload(user),
                    "tutorial_done":bool(user.get("tutorial_done")),
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
    # The client's `amount` is deliberately ignored -- XP buys cosmetics now, so
    # the server prices the event itself. Only the event type is taken on trust.
    xp_type=data.get("type",""); lesson_id=data.get("lesson_id","")
    user=get_user(u)
    if not user: return jsonify({"error":"User not found"}),404
    prog=user.get("progress",empty_progress())
    granted=0
    if xp_type=="puzzle":
        prog["puzzles_solved"]=prog.get("puzzles_solved",0)+1
        granted=grant_xp(user,"puzzle_solved")
    if xp_type=="analysis": prog["games_analysed"]=prog.get("games_analysed",0)+1
    if xp_type=="lesson" and lesson_id:
        completed=prog.get("lessons_completed",[])
        if lesson_id not in completed:
            completed.append(lesson_id)
            granted=grant_xp(user,"lesson_done")   # only the first completion pays
        prog["lessons_completed"]=completed
    user["progress"]=prog
    save_user(u,user)
    return jsonify({"ok":True,"xp":user["xp"],"granted":granted,
                    "balance":xp_balance(user),"progress":prog})

@app.route("/shop/catalog")
@login_required
def shop_catalog():
    """The catalog, plus what this user owns, has equipped, and can afford."""
    user = get_user(current_user())
    if not user: return jsonify({"error": "User not found"}), 404
    refunded = reconcile_retired(current_user(), user)
    cos = get_cosmetics(user)
    bal = xp_balance(user)
    pro = is_pro(user)
    def pack(kind, catalog):
        out = []
        for it in catalog:
            owned = it["id"] in cos["owned"][kind]
            row = {k: it[k] for k in ("id", "name", "price", "blurb")}
            row.update({"owned": owned, "equipped": cos["equipped"][kind] == it["id"],
                        "affordable": owned or bal >= it["price"]})
            if kind == "board":
                row["light"], row["dark"] = it["light"], it["dark"]
                row["tex_light"] = it.get("tex_light") or ""
                row["tex_dark"]  = it.get("tex_dark") or ""
            elif kind == "pieces":
                row["dir"] = it["dir"]
            out.append(row)
        return out
    return jsonify({"ok": True, "balance": bal, "lifetime": user.get("xp", 0), "refunded": refunded,
                    "is_pro": pro, "equipped": cos["equipped"],
                    "board":  pack("board",  BOARD_THEMES),
                    "pieces": pack("pieces", PIECE_SETS),
                    "topper": pack("topper", FORGE_TOPPERS),
                    "face":   pack("face",   FORGE_FACE),
                    "outfit": pack("outfit", FORGE_OUTFITS),
                    "rules": XP_RULES})

@app.route("/shop/buy", methods=["POST"])
@login_required
def shop_buy():
    user = get_user(current_user())
    if not user: return jsonify({"error": "User not found"}), 404
    if not is_pro(user):
        return jsonify({"error": "The cosmetics shop is a Grandmaster feature.", "need_pro": True}), 403
    d = request.get_json(silent=True) or {}
    kind, item_id = d.get("kind", ""), d.get("id", "")
    it = cosmetic_item(kind, item_id)
    if not it: return jsonify({"error": "No such item"}), 400
    cos = get_cosmetics(user)
    if item_id in cos["owned"][kind]:
        return jsonify({"error": "Already owned"}), 400
    bal = xp_balance(user)
    if bal < it["price"]:
        return jsonify({"error": "Not enough XP", "balance": bal, "price": it["price"]}), 400
    w = get_wallet(user)
    w["spent"] = w.get("spent", 0) + it["price"]
    user["wallet"] = w
    cos["owned"][kind].append(item_id)
    cos["equipped"][kind] = item_id          # buying equips it straight away
    user["cosmetics"] = cos
    save_user(current_user(), user)
    return jsonify({"ok": True, "balance": xp_balance(user), "equipped": cos["equipped"],
                    "owned": cos["owned"]})

@app.route("/shop/equip", methods=["POST"])
@login_required
def shop_equip():
    user = get_user(current_user())
    if not user: return jsonify({"error": "User not found"}), 404
    d = request.get_json(silent=True) or {}
    kind, item_id = d.get("kind", ""), d.get("id", "")
    it = cosmetic_item(kind, item_id)
    if not it: return jsonify({"error": "No such item"}), 400
    cos = get_cosmetics(user)
    if item_id not in cos["owned"][kind]:
        return jsonify({"error": "You do not own that"}), 400
    # Free defaults stay equippable without Pro, so a lapsed subscriber is never
    # stuck looking at a board they can no longer change.
    if it["price"] > 0 and not is_pro(user):
        return jsonify({"error": "Equipping paid cosmetics is a Grandmaster feature.", "need_pro": True}), 403
    cos["equipped"][kind] = item_id
    user["cosmetics"] = cos
    save_user(current_user(), user)
    return jsonify({"ok": True, "equipped": cos["equipped"]})

@app.route("/auth/tutorial-seen", methods=["POST"])
@login_required
def tutorial_seen():
    """Remember that this account has been shown the tour."""
    u = current_user(); user = get_user(u)
    if not user:
        return jsonify({"error": "User not found"}), 404
    user["tutorial_done"] = True
    save_user(u, user)
    return jsonify({"ok": True})

@app.route("/auth/upgrade", methods=["POST"])
@login_required
def upgrade():
    u=current_user(); data=request.get_json(silent=True) or {}
    key=data.get("admin_key","")
    if key!=os.environ.get("ADMIN_KEY",""): return jsonify({"error":"Unauthorized"}),403
    user=get_user(u)
    if not user: return jsonify({"error":"User not found"}),404
    user["plan"]="pro"; mark_billing(user,"comp"); save_user(u,user)
    return jsonify({"ok":True,"plan":"pro"})

# ── Admin Routes ───────────────────────────────────────────────────────────────
@app.route("/admin")
def admin_page():
    # The app's own page is cache-busted with ?v=mNN, but this one has no such
    # handle, so a browser will happily serve a stale dashboard after a deploy.
    resp = make_response(render_template("admin.html"))
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp

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
    now=int(time.time())
    for username,user in db.items():
        users.append({"username":username,"email":user.get("email",""),"plan":user.get("plan","free"),
                      "billing":user.get("billing") or ("comp" if user.get("plan")=="pro" else None),
                      "paying":is_paying(user),
                      "xp":user.get("xp",0),"games_count":len(user.get("games",[])),"created":user.get("created",0),
                      "last_login":user.get("last_login") or 0,
                      "last_seen":user.get("last_seen") or user.get("last_login") or 0,
                      "login_count":int(user.get("login_count") or 0),
                      "last_session_xp":int(user.get("last_session_xp") or 0),
                      "session_xp":session_xp_now(user),
                      "in_session":bool(user.get("last_seen") and now-int(user["last_seen"])<=SESSION_GAP),
                      "games_analysed":user.get("progress",{}).get("games_analysed",0)})
    users.sort(key=lambda x:x["last_seen"],reverse=True)
    total=len(users); pro=sum(1 for u in users if u["plan"]=="pro")
    paying=sum(1 for u in users if u["paying"])
    day=sum(1 for u in users if u["last_seen"] and now-u["last_seen"]<86400)
    week=sum(1 for u in users if u["last_seen"] and now-u["last_seen"]<604800)
    return jsonify({"users":users,"total":total,"pro":pro,"free":total-pro,
                    "paying":paying,"comped":pro-paying,
                    "revenue":round(paying*PRO_PRICE,2),"price":PRO_PRICE,"currency":PRO_CURRENCY,
                    "active_24h":day,"active_7d":week,"now":now})

@app.route("/admin/set-plan", methods=["POST"])
def admin_set_plan():
    if not session.get("is_admin"): return jsonify({"error":"Unauthorized"}),401
    data=request.get_json(silent=True) or {}
    username=data.get("username",""); plan=data.get("plan","free")
    user=get_user(username)
    if not user: return jsonify({"error":"User not found"}),404
    # A plan handed out from this page is comped, never revenue. An explicit
    # billing value is still accepted so a Stripe payer can be corrected by hand.
    billing=data.get("billing")
    if plan=="pro":
        mark_billing(user, billing if billing in ("stripe","comp") else "comp")
    else:
        user["billing"]=None
    user["plan"]=plan; save_user(username,user)
    return jsonify({"ok":True,"plan":plan,"billing":user.get("billing")})

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
    paying=sum(1 for u in db.values() if is_paying(u))
    today=time.strftime("%Y-%m-%d")
    now=int(time.time())
    new_today=sum(1 for u in db.values() if time.strftime("%Y-%m-%d",time.localtime(u.get("created",0)))==today)
    seen=lambda u: u.get("last_seen") or u.get("last_login") or 0
    active_24h=sum(1 for u in db.values() if seen(u) and now-seen(u)<86400)
    active_7d=sum(1 for u in db.values() if seen(u) and now-seen(u)<604800)
    body=f"""ChessForge Daily Report — {today}

Total Users: {total}
Pro Users: {pro}  ({paying} paying, {pro-paying} comped)
Free Users: {total-pro}
New Today: {new_today}
Active (24h): {active_24h}
Active (7d): {active_7d}
Monthly Revenue: ${paying*PRO_PRICE:.2f} {PRO_CURRENCY}/mo  — paying subscribers only, comped Pro excluded

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
    # Deep analysis is a Grandmaster feature. Free still gets the summary at the
    # end of its coached game; this is the full engine pass over a whole PGN.
    #
    # The plan check used to sit inside `if u:`, so signing out skipped it
    # entirely and anyone could run a full engine pass anonymously. Not being
    # logged in is now a refusal, not a bypass.
    u=current_user()
    if not u:
        return jsonify({"error":"login_required","upgrade":True,"plan":PLAN_NAME,
                        "message":"Sign in to analyse a game. Deep analysis is part of %s."
                                  % PLAN_NAME}),401
    user=get_user(u) or {}
    if not is_pro(user):
        return jsonify({"error":"pro_required","locked":"analysis","upgrade":True,
                        "plan":PLAN_NAME,
                        "message":"Deep analysis is part of %s. It runs the engine over every "
                                  "move of the game and explains what each mistake cost."
                                  % PLAN_NAME}),403
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
    if is_pro(user): return jsonify({"error":"Already on Grandmaster!"}),400
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
            db[username]["plan"]="pro"; db[username]["plan_started"]=int(time.time())
            mark_billing(db[username],"stripe"); upgraded=True
        elif email:
            for uname,user in db.items():
                if user.get("email","").lower()==email.lower():
                    user["plan"]="pro"; user["plan_started"]=int(time.time())
                    mark_billing(user,"stripe"); upgraded=True; break
        if upgraded:
            save_db(db)
            send_admin_email("New ChessForge Grandmaster subscriber! ",f"User: {username or email}\nPlan: Pro ($%.2f %s/mo)" % (PRO_PRICE, PRO_CURRENCY) + f"\nTime: {time.strftime('%Y-%m-%d %H:%M')}\nEst revenue: ${monthly_revenue(db):.2f} {PRO_CURRENCY}/mo (paying subscribers only)")
    if etype=="customer.subscription.deleted":
        obj=event.get("data",{}).get("object",{}); email=obj.get("customer_email","")
        if email:
            db=load_db()
            for uname,user in db.items():
                if user.get("email","").lower()==email.lower():
                    user["plan"]="free"; user["billing"]=None; break
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
                # The eval bar under the board reads this. It was never sent, so
                # the bar sat at 0.00 all game — the frontend skips a missing eval.
                ev = 0.0
                try:
                    info = engine.analyse(board, chess.engine.Limit(depth=12))
                    sc = info["score"].pov(chess.WHITE)
                    ev = 10.0 if (sc.is_mate() and (sc.mate() or 0) > 0) else \
                         -10.0 if sc.is_mate() else round((sc.score() or 0) / 100.0, 2)
                except Exception:
                    pass
                return jsonify({
                    "eval": ev,
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
    # "Infinite puzzles" is the definition of unlimited, so this is Grandmaster
    # only. Free plays the five its own games produced.
    if not is_pro(user):
        return jsonify({"error": "free_limit_reached", "locked": "puzzles", "plan": PLAN_NAME,
                        "message": "Free plays the %d puzzles a day your own games produce. %s "
                                   "generates unlimited puzzles targeted at your weaknesses."
                                   % (FREE_PUZZLES, PLAN_NAME)}), 403
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
    if not is_pro(user): return jsonify({"error": "You are not on a Grandmaster plan"}), 400

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
        moment = None
        with chess.engine.SimpleEngine.popen_uci(sf) as engine:
            engine.configure({"Threads": 1, "Hash": 32})
            top_lines = analyse_pv(engine, board, depth=12, multipv=3)
            if top_lines and request_type == "position":
                try:
                    moment = build_moment(board, top_lines, played_moves, engine)
                except Exception:
                    moment = None
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
                "dialogue": [{"phase": "reveal",
                              "text": socratic_guard(text, best_san, light, "threat"),
                              "wait": False}],
                "arrows": [build_arrow(best_uci, "#26d07c")], "highlights": [],
                "eval": eval_pawns, "best_move_san": best_san,
            })

        # ── Default: classify the moment and build a two-phase question -> reveal ──
        # ── new-shape moment (fork / hanging / opportunity / trapped) ──
        if moment:
            mv_named = moment.get("help", {}).get("answer_move")
            if mv_named and not validate_move_in_pv(mv_named, top_lines, board):
                moment["help"]["answer_move"] = None
                moment["help"]["answer_text"] = "No verified engine move for this position."
            moment["silent"] = False
            moment["scenario"] = moment.get("pattern")
            moment["engagement"] = moment["intensity"]
            moment["best_move_san"] = best_san
            moment["reaction"] = {"critical":"concerned","opportunity":"excited",
                                  "notable":"curious"}.get(moment["intensity"], "neutral")
            return jsonify(moment)

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
                      "opp_piece": opp_piece, "best": best_san or "the engine move",
                      # How far into the game we are, so the triviality gate in
                      # socratic_guard can tell an opening truism from a real
                      # positional point later on. Derived from the move counter
                      # rather than move_stack, which is empty on a board rebuilt
                      # from a FEN -- as this one always is.
                      "ply": ply_from_board(board)})

        # QUIET — a coach watches most of the time. He speaks here only when
        # something he has been tracking is worth raising; otherwise he says
        # nothing at all, which is what makes the loud moments land.
        if level in ("routine", "silent") or scenario == "quiet":
            mem = build_game_memory(played_moves)
            mctx = memory_ctx(mem)
            speak_odds = 0.22 if len(played_moves) > 12 else 0.12
            if random.random() > speak_odds:
                return jsonify({"silent": True, "engagement": "silent",
                                "scenario": scenario, "blocking": False,
                                "dialogue": [], "arrows": [], "highlights": [],
                                "eval": eval_pawns, "best_move_san": best_san})
            if mctx and len(played_moves) > 12 and random.random() < 0.4:
                text = pick_line(MEMORY_LINES, dict(light, **mctx), recent)   # refer back
            else:
                text = factual_line(board, "routine", light, played_moves)
            # Even a passing remark must not hand over the move.
            text = socratic_guard(text, best_san, light, "activity")
            try: session["recent_lines"] = recent
            except Exception: pass
            return jsonify({
                "silent": False, "engagement": "routine", "scenario": scenario,
                "reaction": "neutral", "blocking": False,
                "dialogue": [{"phase": "reveal",
                              "text": socratic_guard(text, best_san, light, "threat"),
                              "wait": False}],
                "arrows": [], "highlights": [],
                "eval": eval_pawns, "best_move_san": best_san,
            })

        # RHYTHM COOLDOWN — a coach does not comment two moves running. Only a
        # critical moment breaks the silence; anything less waits its turn. This
        # is what makes an interruption feel like it means something.
        if level == "notable":
            ply = len(played_moves)
            try:
                last = session.get("coach_last_ply", -99)
            except Exception:
                last = -99
            if ply - last < 4:
                return jsonify({"silent": True, "engagement": "silent",
                                "scenario": scenario, "blocking": False,
                                "dialogue": [], "arrows": [], "highlights": [],
                                "eval": eval_pawns, "best_move_san": best_san})
            try:
                session["coach_last_ply"] = ply
            except Exception:
                pass

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
                "dialogue": [{"phase": "question",
                              "text": socratic_guard(text, best_san, light, "calculation"),
                              "wait": False}],
                "arrows": [], "highlights": hl,
                "eval": eval_pawns, "best_move_san": best_san,
            })

        # CRITICAL — full stop: point, ask, lock the board
        built = build_coach_dialogue(scenario, ctx, board, top_lines)
        if not built:
            text = pick_line(ROUTINE, light, recent)
            return jsonify({"silent": False, "engagement": "routine", "scenario": scenario,
                            "reaction": "neutral", "blocking": False,
                            "dialogue": [{"phase": "reveal",
                              "text": socratic_guard(text, best_san, light, "threat"),
                              "wait": False}],
                            "arrows": [], "highlights": [],
                            "eval": eval_pawns, "best_move_san": best_san})
        try:
            session["coach_last_ply"] = len(played_moves)   # go quiet again after this
        except Exception:
            pass
        mcq = maybe_build_mcq(board, top_lines, position_type="tactical" if scenario == "tactical_opportunity" else "positional", force=False)
        return jsonify({
            "silent": False,
            "engagement": "critical",
            "blocking": True,
            "scenario": scenario,
            "reaction": ctx.get("reaction", "neutral"),
            "dialogue": socratic_dialogue(built["dialogue"], best_san, ctx, "safety"),
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
            "Ooh, careful with that f-pawn. That pawn is your king's bodyguard — it's literally why scholar's mate targets f7. Try not to move it early.",
            "Mmm, the f-pawn — I wanna break this habit. It guards your king. Get your knights and bishops out instead.",
            "That f-pawn opens a line to your own king. What does it give you in return?",
        ])
    if pc.piece_type == chess.QUEEN and fullmove <= 6:
        return random.choice([
            f"Queen out early with {san}? They'll just develop and hit it with tempo — free time for them. Knights and bishops first.",
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
      "You can still castle here. Is there anything more urgent than getting the king safe?",
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

# Observations that are true but worthless. "Your rook is the worst piece on the
# board" on move 2 is correct and tells the player nothing -- of course it is,
# they have not developed yet. line_is_concrete() waves these through because
# they name a piece and use real vocabulary, so triviality needs its own gate.
TRIVIAL_OPENING = re.compile(
    r"\b(?:worst|least active|inactive|passive|undeveloped|not developed|"
    r"has not moved|hasn't moved|still on its starting|doing nothing|"
    r"needs developing|needs to develop|out of play|asleep|"
    # counting up how many pieces are still on the back rank early is the same
    # non-observation in a different costume
    r"at home|still at home|on (?:its|their) starting square|back rank still)\b", re.I)

# A line is allowed to say these things once there is a real position to say
# them about -- roughly once both sides are out of the book.
TRIVIAL_UNTIL_PLY = 16          # first eight moves each

def ply_from_board(board):
    """Half-moves played, read off the move counter so it survives a FEN."""
    try:
        n = (board.fullmove_number - 1) * 2
        return n if board.turn == chess.WHITE else n + 1
    except Exception:
        return None

def line_is_worth_saying(text, ply=None):
    """Reject observations that are trivially true for where the game is.

    Only applies in the opening. The same sentence on move 25 is a genuine
    positional point and is left alone.
    """
    if not text:
        return False
    if ply is None or ply > TRIVIAL_UNTIL_PLY:
        return True
    if TRIVIAL_OPENING.search(text):
        return False
    # "Develop a piece" during the opening is the definition of unhelpful: it is
    # what every opening move already is.
    if re.search(r"\b(?:develop(?:ing|ment)?|get (?:your )?pieces? out|"
                 r"bring (?:a|your) piece)\b", text, re.I) and ply <= 8:
        return False
    return True

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
    """Critical stops the game; notable asks briefly; routine stays SILENT.

    A coach who comments on every move is noise. Staying quiet most of the time
    is what makes an interruption mean something."""
    if scenario in ("opponent_fork","opponent_pin","player_about_to_blunder",
                    "player_can_win_material","player_found_brilliancy"): return "critical"
    if scenario in ("opponent_threat_single_piece","critical_castling_decision",
                    "opening_deviation","endgame_technique_moment"): return "notable"
    return "silent"

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
    # This used to fire on move 2 with "you still have 4 minor pieces at home",
    # which is true of literally every game at move 2 and teaches nothing. It is
    # only information once development is genuinely behind.
    if n >= 9 and undeveloped_count(board, me) >= 3:
        facts.append(f"It is move {n} and {undeveloped_count(board, me)} of your minor pieces have "
                     f"still not moved. That is the thing costing you, not the move you are "
                     f"looking at. Which one gets out with tempo?")

    if facts:
        random.shuffle(facts)
        return facts[0]
    if level == "notable":
        return f"{opp_san} — nothing forcing yet. Which of your pieces is worst placed right now?"
    return f"{opp_san}. Nothing hanging on either side. Improve your worst piece."


# ══════════════ geometry detection — python-chess facts, engine-verified later ══════════════
def geo_fork(board, victim_color):
    """One enemy piece attacking >=2 valuable pieces of victim_color."""
    out=[]
    for ef in chess.SQUARES:
        ap=board.piece_at(ef)
        if not ap or ap.color==victim_color: continue
        hits=[]
        for t in board.attacks(ef):
            tp=board.piece_at(t)
            if tp and tp.color==victim_color and (tp.piece_type==chess.KING or PIECE_VALS.get(tp.piece_type,0)>=3):
                hits.append((chess.square_name(t), PIECE_NAMES.get(tp.piece_type,"piece"),
                             99 if tp.piece_type==chess.KING else PIECE_VALS.get(tp.piece_type,0)))
        if len(hits)>=2:
            hits.sort(key=lambda h:-h[2])
            out.append({"from":chess.square_name(ef),"piece":PIECE_NAMES.get(ap.piece_type,"piece"),
                        "targets":hits,
                        "defenders":[chess.square_name(s) for s in board.attackers(not victim_color, ef)],
                        "attackers":[chess.square_name(s) for s in board.attackers(victim_color, ef)]})
    return out

def geo_hanging(board, color):
    out=[]
    for sq in chess.SQUARES:
        pc=board.piece_at(sq)
        if not pc or pc.color!=color or pc.piece_type==chess.KING: continue
        a=board.attackers(not color,sq); d=board.attackers(color,sq)
        if a and len(a)>len(d):
            out.append({"square":chess.square_name(sq),"piece":PIECE_NAMES.get(pc.piece_type,"piece"),
                        "attackers":len(a),"defenders":len(d)})
    return out

def geo_trapped(board, color):
    out=[]
    for sq in chess.SQUARES:
        pc=board.piece_at(sq)
        if not pc or pc.color!=color or pc.piece_type in (chess.KING,chess.PAWN): continue
        dests=[m.to_square for m in board.legal_moves if m.from_square==sq]
        if dests and all(board.attackers(not color,d) for d in dests):
            out.append({"square":chess.square_name(sq),"piece":PIECE_NAMES.get(pc.piece_type,"piece")})
    return out

def geo_overload(board, color):
    """A defender responsible for two or more of its own pieces."""
    out=[]
    for sq in chess.SQUARES:
        pc=board.piece_at(sq)
        if not pc or pc.color!=color: continue
        duties=[chess.square_name(t) for t in board.attacks(sq)
                if board.piece_at(t) and board.piece_at(t).color==color
                and board.piece_at(t).piece_type!=chess.PAWN]
        if len(duties)>=2 and board.attackers(not color,sq):
            out.append({"square":chess.square_name(sq),"piece":PIECE_NAMES.get(pc.piece_type,"piece"),"duties":duties})
    return out

def capture_verdicts(board, target_sq, top_lines, engine=None, depth=14):
    """For every legal capture of target_sq, what does the engine actually think?"""
    res=[]
    best_cp = None
    if top_lines:
        best_cp = top_lines[0].get("score_cp")
    sign = 1 if board.turn==chess.WHITE else -1
    for mv in board.legal_moves:
        if mv.to_square!=target_sq or not board.is_capture(mv): continue
        san=board.san(mv)
        cp=None
        for ln in (top_lines or []):
            if ln.get("move")==mv: cp=ln.get("score_cp")
        if cp is None and engine is not None:
            try:
                b2=board.copy(); b2.push(mv)
                cp=engine.analyse(b2, chess.engine.Limit(depth=depth))["score"].white().score(mate_score=10000)
            except Exception: cp=None
        loss = None if (cp is None or best_cp is None) else (best_cp-cp)*sign
        res.append({"san":san,"cp":cp,"loss_cp":loss})
    res.sort(key=lambda r:(r["loss_cp"] if r["loss_cp"] is not None else 9999))
    return res

CONCEPTS = {
 "fork":("What is a fork?","One piece attacks two or more of your pieces at the same time. You can usually only save one, so the defender has to decide which loss hurts least - or find a move that answers both, like a check or a counter-threat."),
 "pin":("What is a pin?","A piece is pinned when moving it would expose something more valuable behind it. A pin to the king is absolute - the piece legally cannot move. Break it by challenging the pinner, blocking the line, or moving the piece behind."),
 "hanging":("What does hanging mean?","A piece is hanging when more enemy pieces attack it than yours defend it. It costs nothing to check every move, and it is the most common way rating points leak away. Loose pieces drop off."),
 "overload":("What is an overloaded piece?","A defender with two jobs at once. Take away one duty - usually by capturing or attacking the thing it guards - and the other collapses, because it cannot be in two places."),
 "trapped":("What is a trapped piece?","A piece whose every legal square is covered by the opponent. It is not captured yet, but it has nowhere to go, so the opponent can take their time and win it."),
 "back_rank":("What is a back-rank weakness?","Your king sits on the back rank behind unmoved pawns with no escape square. A rook or queen reaching that rank is mate. The fix is luft - a quiet pawn move that opens a hole for the king."),
}


def build_moment(board, top_lines, played_moves, engine=None):
    """The coaching brain. Geometry from python-chess, every claim checked against the engine."""
    me = board.turn
    sign = 1 if me == chess.WHITE else -1
    best_uci = top_lines[0]["move"] if top_lines else None
    try: best_san = board.san(best_uci) if best_uci else None
    except Exception: best_san = None
    eval_cp = (top_lines[0].get("score_cp") or 0) if top_lines else 0
    eval_pawns = round(eval_cp/100, 2)
    gap = 0
    if len(top_lines) >= 2:
        gap = ((top_lines[0].get("score_cp") or 0) - (top_lines[1].get("score_cp") or 0)) * sign

    forks   = geo_fork(board, me)
    hanging = geo_hanging(board, me)
    opp_hang= geo_hanging(board, not me)
    trapped = geo_trapped(board, me)

    # ── CRITICAL: you are forked ──
    if forks:
        f = forks[0]
        tsq = chess.parse_square(f["from"])
        verdicts = capture_verdicts(board, tsq, top_lines, engine)
        t1, t2 = f["targets"][0], f["targets"][1]
        steps = [
            {"text": "Stop. Look at that " + f["piece"] + " before you touch anything.", "point": [f["from"]]},
            {"text": "It is hitting both of these - your " + t1[1] + " on " + t1[0] +
                     " and your " + t2[1] + " on " + t2[0] + ". That is a fork.",
             "point": [t1[0], t2[0]]},
        ]
        if f["defenders"]:
            steps.append({"text": "And it is defended from " + f["defenders"][0] +
                                  ", so simply taking it does not win it.", "point": [f["defenders"][0]]})
        # the reframe is DERIVED from what the engine actually says about the captures
        if verdicts and all((v["loss_cp"] or 0) >= 100 for v in verdicts):
            steps.append({"text": "So the question is not which piece to capture with - every capture here loses "
                                  "material. The question is whether you can remove the defender, or move one of "
                                  "the attacked pieces with tempo so the fork stops mattering.", "point": []})
        elif len(verdicts) >= 2 and (verdicts[-1]["loss_cp"] or 0) - (verdicts[0]["loss_cp"] or 0) >= 100:
            steps.append({"text": "You are weighing " + verdicts[0]["san"] + " against " + verdicts[-1]["san"] +
                                  " as if they are the same choice. They are not - one of them costs about " +
                                  str(round((verdicts[-1]["loss_cp"] or 0)/100, 1)) + " pawns more than the other. "
                                  "The real question is which piece you still want on the board after the recapture.",
                          "point": []})
        elif verdicts:
            steps.append({"text": "The capture works here, but only because of what comes after it. "
                                  "Look at the recapture before you commit.", "point": [f["from"]]})
        concept_lbl, concept_txt = CONCEPTS["fork"]
        return {
            "intensity":"critical", "pattern":"fork", "concept":"fork", "blocking":True,
            "dialogue": steps,
            "question": {"kind":"tile_tap",
                         "prompt":"Tap the square that is causing all of this.",
                         "correct":[f["from"]], "options":[],
                         "on_wrong":"Not that one - look at the square his last move landed on."},
            "help": {"concept_label":concept_lbl, "concept_text":concept_txt,
                     "hint":"Look at your " + t1[1] + " on " + t1[0] + " and your " + t2[1] + " on " + t2[0] +
                            " - what do they have in common right now?",
                     "answer_move": best_san,
                     "answer_text": ("The engine plays " + best_san + " here (" + format(eval_pawns, "+.2f") + ")."
                                     ) if best_san else "No engine move available."},
            "eval": eval_pawns,
            "verdicts": verdicts,
        }

    # ── CRITICAL: a piece of yours is hanging ──
    if hanging:
        h = hanging[0]
        concept_lbl, concept_txt = CONCEPTS["hanging"]
        return {
            "intensity":"critical", "pattern":"hanging", "concept":"hanging", "blocking":True,
            "dialogue":[
                # Was a stat readout ("2 attackers and 0 defenders") followed by an
                # instruction. A coach points and asks; the player does the counting.
                {"text":"Hold on. Take another look at your " + h["piece"] + " on " + h["square"] + ".",
                 "point":[h["square"]]},
                {"text":"Is it still defended if they take it?", "point":[h["square"]]}],
            "question":{"kind":"tile_tap","prompt":"Which of your pieces is not defended right now?",
                        "correct":[h["square"]],"options":[],
                        "on_wrong":"Not that one. Go piece by piece and ask who is covering it."},
            "help":{"concept_label":concept_lbl,"concept_text":concept_txt,
                    "hint":"Count the attackers and the defenders on every piece you own.",
                    "answer_move":best_san,
                    "answer_text":("The engine plays " + best_san + ".") if best_san else ""},
            "eval":eval_pawns,
        }

    # ── OPPORTUNITY: something is there for you, but nothing is forced ──
    if opp_hang or gap >= 150:
        tgt = opp_hang[0]["square"] if opp_hang else chess.square_name(best_uci.to_square)
        concept_lbl, concept_txt = CONCEPTS["fork"]
        return {
            "intensity":"opportunity", "pattern":"win_material", "concept":"fork", "blocking":False,
            "dialogue":[{"text":"Wait - there is something here for you.", "point":[tgt]}],
            "question":{"kind":"tile_tap","prompt":"Tap the piece you think you can win.",
                        "correct":[tgt],"options":[],
                        "on_wrong":"Not that one - look for the piece with no defender."},
            "help":{"concept_label":concept_lbl,"concept_text":concept_txt,
                    "hint":"Run the forcing moves: checks first, then captures, then threats.",
                    "answer_move":best_san,
                    "answer_text":("The engine plays " + best_san + ".") if best_san else ""},
            "eval":eval_pawns,
        }

    # ── TRAPPED piece: notable ──
    if trapped:
        t = trapped[0]
        concept_lbl, concept_txt = CONCEPTS["trapped"]
        return {"intensity":"notable","pattern":"trapped","concept":"trapped","blocking":False,
            "dialogue":[{"text":"Your " + t["piece"] + " on " + t["square"] +
                                 " has no safe square right now. Does that worry you?","point":[t["square"]]}],
            "question":{"kind":"none","prompt":"","correct":[],"options":[],"on_wrong":""},
            "help":{"concept_label":concept_lbl,"concept_text":concept_txt,
                    "hint":"Check every square that piece can reach.","answer_move":best_san,
                    "answer_text":("The engine plays " + best_san + ".") if best_san else ""},
            "eval":eval_pawns}
    return None

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

# ══════════════════════════════════════════════════════════════════════════════
# SOCRATIC LAYER
#
# GM Forge is a coach, not an engine readout. He never names the move he wants
# played. Everything he says passes through socratic_guard(), which rewrites any
# line that would give the answer away into a question or a nudge toward the
# right part of the board. The player should feel they found the move.
# ══════════════════════════════════════════════════════════════════════════════

SOCRATIC_QUESTIONS = {
    "threat": [
        "What changed after that last move?",
        "What is your opponent threatening right now?",
        "If you did nothing at all here, what would they play?",
        "If you were playing the other side, what move would scare you?",
    ],
    "safety": [
        "Before you commit — is everything of yours still defended?",
        "Before attacking, are you completely safe?",
        "If you move that piece, what stops being defended?",
        "Which of your pieces is doing too many jobs at once?",
    ],
    "activity": [
        "Which of your pieces is doing the least work?",
        "What is your worst-placed piece?",
        "Which move improves your position even if there is no tactic here?",
        "What happens if nothing changes for the next three moves?",
    ],
    "calculation": [
        "Are you looking at both captures, or only the obvious one?",
        "Can you rule one of your candidate moves out immediately?",
        "You have a candidate. What is your opponent's best answer to it?",
        "Have you checked every forcing move — every check and every capture?",
    ],
}

ATTENTION_LINES = {
    "piece":  ["Take another look at that {piece} on {sq}.",
               "What is that {piece} on {sq} really doing?",
               "That {piece} on {sq} is worth a second look."],
    "square": ["I think there's one square here you're overlooking.",
               "Look again at {sq} before you decide.",
               "Something about {sq} is more important than it looks."],
    "line":   ["Notice that diagonal for a moment.",
               "Look down that file again before you move.",
               "That rook is far stronger now than it was two moves ago."],
}

# Anything that hands the player the answer.
_ANSWER_PATTERNS = [
    re.compile(r"\bthe best move is\b", re.I),
    re.compile(r"\byou should (?:play|move)\b", re.I),
    re.compile(r"\bplay\s+(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8])", re.I),
    re.compile(r"\bthe (?:engine|computer) (?:prefers|likes|wants|recommends)\b", re.I),
    re.compile(r"\bcorrect move (?:is|was)\b", re.I),
    re.compile(r"\binstead,? (?:play|try)\b", re.I),
]

def _names_move(text, best_san):
    """True if the text hands over the move, either by name or by instruction."""
    if not text:
        return False
    if best_san:
        bare = re.sub(r"[+#!?]", "", best_san)
        if re.search(r"(?<![\w])" + re.escape(bare) + r"(?![\w])", text):
            return True
    return any(p.search(text) for p in _ANSWER_PATTERNS)

def socratic_guard(text, best_san, ctx=None, topic="threat"):
    """Rewrite anything that gives the answer away into a question or a nudge.

    Also the single chokepoint for triviality: every line the server emits comes
    through here, so an opening-phase truism is caught once rather than in each
    of the places that can generate one.

    Returns coaching text that raises awareness without ever naming the move."""
    ctx = ctx or {}
    ply = ctx.get("ply")
    if not line_is_worth_saying(text, ply):
        # Say something about the actual position instead, or say nothing.
        sq = ctx.get("sq") or ctx.get("tsq")
        if sq:
            return _fmt(gm_phrase(ATTENTION_LINES["square"]), {"sq": sq, "piece": "piece"})
        return ""
    if not _names_move(text, best_san):
        return text
    sq = ctx.get("sq") or ctx.get("tsq") or ctx.get("fsq")
    piece = ctx.get("piece") or ctx.get("tpiece")
    # Prefer pointing at the board when we know where to point.
    if sq and piece and piece != "piece":
        pool = ATTENTION_LINES["piece"]
    elif sq:
        pool = ATTENTION_LINES["square"]
    else:
        pool = SOCRATIC_QUESTIONS.get(topic) or SOCRATIC_QUESTIONS["threat"]
    line = gm_phrase(pool)
    try:
        return _fmt(line, {"sq": sq or "that square", "piece": piece or "piece"})
    except Exception:
        return gm_phrase(SOCRATIC_QUESTIONS[topic])

def socratic_explain(text, best_san, ctx=None, topic="safety"):
    """Keep the sentences that explain; replace only the one that gives it away.

    A blunder alert should say what the move cost and what the opponent gets —
    that is the teaching. Only the "and the move was X" sentence has to go."""
    if not text:
        return text
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    kept = [p for p in parts if p and not _names_move(p, best_san)]
    if not kept:
        return socratic_guard(text, best_san, ctx, topic)      # nothing salvageable
    out = " ".join(kept)
    # Close with a question so the player does the last step themselves.
    if not out.rstrip().endswith("?"):
        out += " " + gm_phrase(SOCRATIC_QUESTIONS.get(topic) or SOCRATIC_QUESTIONS["threat"])
    return out

def socratic_dialogue(lines, best_san, ctx=None, topic="threat"):
    """Run a whole dialogue list through the guard, dropping anything left empty."""
    out = []
    for item in (lines or []):
        if isinstance(item, dict):
            t = socratic_guard(item.get("text", ""), best_san, ctx, topic)
            if t:
                nd = dict(item); nd["text"] = t; out.append(nd)
        elif isinstance(item, str):
            t = socratic_guard(item, best_san, ctx, topic)
            if t:
                out.append(t)
    return out

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
    # The "reveal" half of the bank names the engine move. A coach does not do
    # that — turn it into a question or a nudge toward the right part of the board.
    topic = ("safety" if scenario in ("player_about_to_blunder", "opponent_fork", "opponent_pin")
             else "calculation" if scenario == "player_can_win_material" else "threat")
    question = socratic_guard(question, best_san, ctx, topic)
    reveal   = socratic_guard(reveal,   best_san, ctx, topic)
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
        # Every coached move is evidence for the thinking profile, not only the
        # ones the player happened to draw arrows for.
        try:
            _u = current_user()
            _usr = get_user(_u) if _u else None
            if _usr:
                # get_phase takes a move number, not a board.
                _pat = detect_pattern(board, move, drop,
                                      get_phase(board.fullmove_number)) \
                       if severity in ("blunder", "mistake") else None
                _d = _mistake_dims(_pat, drop, san_played, coached=True)
                if _d:
                    _fold_profile(_usr, _d, "coached_moves")
                    save_user(_u, _usr)
        except Exception as _e:
            print("profile fold (coached move) failed:", _e)

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
                "explanation": ("Step through it and watch what they get."
                                + (f" Start with their reply, {opp_san}." if opp_san else "")),
                "force": True,
            }

        return jsonify({
            "severity": severity,
            "drop_cp": int(drop),
            "eval_after": round(score_after/100, 1),
            "best_move_san": best_san,
            "best_pv": best_pv,
            # This is the text on the blunder alert. It explained by naming the
            # engine's move; now it explains what the move cost and asks the
            # player to work out the rest.
            "commentary": socratic_explain(" ".join(parts), best_san, None, "safety"),
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

    # persist puzzles so the Puzzles page still has them next visit
    try:
        uname = current_user()
        if uname and puzzles:
            db = load_db()
            rec = db.get(uname) or {}
            existing = rec.get("puzzles") or []
            seen = {q.get("fen") for q in existing}
            for q in puzzles:
                if q.get("fen") not in seen:
                    existing.append(q); seen.add(q.get("fen"))
            rec["puzzles"] = existing[-60:]
            db[uname] = rec
            save_db(db)
    except Exception:
        pass

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
    # Free gets one exercise per theme per day; Grandmaster drills a theme as
    # many times as it takes.
    if not is_pro(user):
        theme = forced or "any"
        key = "drill:" + str(theme)
        if usage(user, key) >= FREE_LESSON_DRILLS:
            return jsonify({"error": "free_limit_reached", "locked": "lesson",
                            "plan": PLAN_NAME, "limit": FREE_LESSON_DRILLS,
                            "message": "Free allows %d exercise per theme per day. %s repeats a "
                                       "theme until it is automatic — which is the whole point of "
                                       "spaced practice."
                                       % (FREE_LESSON_DRILLS, PLAN_NAME)}), 403
        bump_usage(user, key)
        save_user(u, user)
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
    new_streak_day = st.get("last_day") != today
    if new_streak_day:
        st["count"] = (st.get("count", 0) + 1) if _is_yesterday(st.get("last_day", "")) else 1
        st["last_day"] = today
    tr.setdefault("history", []).append({"day": today, "correct": correct, "total": total})
    tr["history"] = tr["history"][-90:]
    mastered = passed and p["strength"] >= 80
    # XP for drills, priced here where the result is already verified.
    granted = 0
    if passed:
        granted += grant_xp(user, "drill_passed")
        if mastered:
            granted += grant_xp(user, "pattern_mastered")
    if new_streak_day:
        granted += grant_streak_xp(user, st.get("count", 1))
    user["training"] = tr; save_user(u, user)
    return jsonify({"ok": True, "pattern": name, "strength": p["strength"], "band": strength_band(p["strength"]),
                    "passed": passed, "mastered": mastered, "streak": st["count"],
                    "xp_granted": granted, "balance": xp_balance(user),
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


TRAP_BIAS = {
 "Hanging piece":    "leaves_loose",
 "Missed tactic":    "offers_tactic",
 "King safety issue":"pressures_king",
 "Endgame mistake":  "simplifies",
 "Opening mistake":  "invites_development_error",
}

def _trap_score(board_after, user_color, bias):
    """How likely is this position to expose the user's weakness? Higher = better bait."""
    s = 0
    if bias == "leaves_loose":
        s += 3 * len(geo_hanging(board_after, user_color))
        s += 2 * len(geo_fork(board_after, user_color))
    elif bias == "offers_tactic":
        s += 3 * len(geo_hanging(board_after, not user_color))
        if _wins_material_available(board_after): s += 2
    elif bias == "pressures_king":
        k = board_after.king(user_color)
        if k is not None:
            s += len(board_after.attackers(not user_color, k)) * 4
            for sq in board_after.attacks(k):
                if board_after.attackers(not user_color, sq): s += 1
        if _back_rank_soft(board_after, user_color): s += 3
    elif bias == "simplifies":
        s += max(0, 30 - total_non_king_material(board_after)) // 4
    elif bias == "invites_development_error":
        s += undeveloped_count(board_after, user_color) * 2
    return s

def choose_trap_move(board, engine, patterns, user_color, window_cp=60, depth=12):
    """Pick among engine-approved moves the one most likely to create the user's weakness shape.
    Never plays a move more than window_cp below the best - the bot still plays credible chess."""
    try:
        info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=5)
    except Exception:
        return None, None, None
    items = info if isinstance(info, list) else [info]
    cands = []
    sign = 1 if board.turn == chess.WHITE else -1
    for i in items:
        pv = i.get("pv") or []
        if not pv: continue
        sc = i.get("score")
        cp = sc.white().score(mate_score=10000) if sc is not None else None
        cands.append((pv[0], cp))
    if not cands: return None, None, None
    best_cp = cands[0][1]
    bias = None
    for pat in (patterns or []):
        if pat in TRAP_BIAS: bias = TRAP_BIAS[pat]; break
    pool = []
    for mv, cp in cands:
        if cp is None or best_cp is None: continue
        loss = (best_cp - cp) * sign
        if loss <= window_cp:                      # hard gate: never worse than 60cp below best
            pool.append((mv, cp, loss))
    if not pool:
        return cands[0][0], cands[0][1], 0
    if not bias:
        return pool[0][0], pool[0][1], pool[0][2]
    scored = []
    for mv, cp, loss in pool:
        b2 = board.copy(); b2.push(mv)
        scored.append((_trap_score(b2, user_color, bias), -loss, mv, cp, loss))
    scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
    top = scored[0]
    return top[2], top[3], top[4]

@app.route("/trap-move", methods=["POST"])
def trap_move():
    """Trap Trainer bot move. Returns the move plus proof it stayed inside the 60cp window."""
    data = request.get_json(silent=True) or {}
    fen = data.get("fen", "")
    patterns = data.get("patterns") or []
    sf = find_stockfish()
    if not sf or not fen: return jsonify({"error": "unavailable"}), 400
    try: board = chess.Board(fen)
    except Exception: return jsonify({"error": "bad fen"}), 400
    if board.is_game_over(): return jsonify({"game_over": True})
    user_color = chess.BLACK if board.turn == chess.WHITE else chess.WHITE
    with chess.engine.SimpleEngine.popen_uci(sf) as engine:
        engine.configure({"Threads": 1, "Hash": 32})
        mv, cp, loss = choose_trap_move(board, engine, patterns, user_color)
    if mv is None: return jsonify({"error": "no move"}), 500
    san = board.san(mv)
    return jsonify({"move": mv.uci(), "san": san, "eval_cp": cp,
                    "loss_vs_best_cp": loss, "within_window": (loss or 0) <= 60,
                    "targeting": (patterns or [None])[0]})

@app.route("/game-review", methods=["POST"])
def game_review():
    """Post-game: every critical moment, what it cost, and which drill to route to."""
    data = request.get_json(silent=True) or {}
    moves = data.get("played_moves") or []
    moments = data.get("moments") or []          # collected client-side during the game
    sf = find_stockfish()
    by_pattern, worst = {}, None
    for m in moments:
        pat = m.get("pattern") or "unknown"
        by_pattern[pat] = by_pattern.get(pat, 0) + 1
        cost = m.get("cost_cp") or 0
        if worst is None or cost > (worst.get("cost_cp") or 0): worst = m
    headline = "A quiet game - nothing decisive went wrong."
    if worst:
        pat = worst.get("pattern", "a pattern")
        headline = ("The game turned on move " + str(worst.get("move_no", "?")) +
                    ", where a " + str(pat).replace("_", " ") + " cost you " +
                    str(round((worst.get("cost_cp") or 0)/100, 1)) + " pawns.")
    pat_to_drill = {"fork":"Missed tactic","hanging":"Hanging piece","win_material":"Missed tactic",
                    "trapped":"Hanging piece","back_rank":"King safety issue"}
    drill = pat_to_drill.get((worst or {}).get("pattern"), "Missed tactic")
    return jsonify({
        "headline": headline,
        "moments": moments,
        "patterns": [{"pattern": k, "count": v} for k, v in sorted(by_pattern.items(), key=lambda x: -x[1])],
        "prescription": {"drill": drill, "label": "Train this - 4 minutes",
                         "then": "Play a Trap Trainer game targeting this pattern"},
        "total_moves": len(moves),
    })

@app.route("/my-puzzles")
def my_puzzles():
    """Puzzles saved from this user's own coached games."""
    uname = current_user()
    if not uname:
        return jsonify({"puzzles": [], "guest": True})
    try:
        db = load_db()
        rec = db.get(uname) or {}
        all_p = rec.get("puzzles") or []
        if is_pro(rec):
            return jsonify({"puzzles": all_p, "locked": 0, "limit": None, "plan": PLAN_NAME})
        # Free sees the first few and is told plainly how many are being held back.
        shown = all_p[:FREE_PUZZLES]
        return jsonify({"puzzles": shown, "locked": max(0, len(all_p) - len(shown)),
                        "limit": FREE_PUZZLES, "plan": PLAN_NAME,
                        "message": "Free gives you %d puzzles a day. %s unlocks every puzzle your "
                                   "own games produce." % (FREE_PUZZLES, PLAN_NAME)})
    except Exception:
        return jsonify({"puzzles": []})

# ══════════════════════════════════════════════════════════════════════════════
# ASK GM FORGE — context-aware post-game chat.
#
# Not a general chatbot: every answer is anchored to the exact position the user
# is looking at and grounded in real Stockfish analysis. "What if I played Nf3?"
# analyses Nf3 rather than guessing.
#
# The model call is deliberately gated on ANTHROPIC_API_KEY. Without a key the
# endpoint still returns the full engine analysis and says plainly that the
# conversational layer is not configured — it never invents an answer.
# ══════════════════════════════════════════════════════════════════════════════

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ASK_MODEL         = os.environ.get("ASK_FORGE_MODEL", "claude-opus-5")

# How the answer is pitched. The user can say "explain like I'm 800".
ASK_LEVELS = {
    "beginner": "a complete beginner. Avoid notation-heavy lines. Name squares plainly and explain any term you use.",
    "800":      "roughly 800 Elo. They know how the pieces move and little else. One idea per paragraph.",
    "1000":     "roughly 1000 Elo. They spot simple one-move threats but miss two-move ideas.",
    "1500":     "roughly 1500 Elo. They know common tactics and basic plans; skip the basics.",
    "1800":     "roughly 1800 Elo. Talk in terms of plans, structures and imbalances.",
    "2000":     "roughly 2000 Elo. Be concrete and concise; assume strong tactical vision.",
    "coach":    "a student sitting across from you. Warm, direct, and always concrete.",
    "gm":       "a strong player. Speak in the language of imbalances, prophylaxis and long-term plans.",
}

def _ask_level_from(text, explicit):
    """Pick an explanation level from the request, falling back to the question text."""
    if explicit in ASK_LEVELS:
        return explicit
    low = (text or "").lower()
    for key in ("beginner", "800", "1000", "1500", "1800", "2000", "grandmaster", "gm"):
        if key in low:
            return "gm" if key in ("grandmaster", "gm") else key
    return "coach"

_WHATIF = re.compile(
    r"\b(?:what if|what about|why not|instead of|could i(?:'ve| have)?|should i(?:'ve| have)?)\b",
    re.I)

def _candidate_moves(question, board):
    """Pull any legal SAN moves the user named, so we can analyse what they asked about."""
    found = []
    for tok in re.findall(r"\b(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b", question or ""):
        try:
            mv = board.parse_san(tok)
        except Exception:
            continue
        if mv in board.legal_moves and tok not in found:
            found.append(tok)
    return found[:3]

def _score_pawns(info, turn):
    sc = info["score"].pov(turn)
    if sc.is_mate():
        m = sc.mate()
        return (100.0 if m and m > 0 else -100.0), ("mate in %d" % abs(m) if m else "mate")
    cp = sc.score() or 0
    return round(cp / 100.0, 2), None

def _analyse_position(engine, board, depth=14, multipv=3):
    """Engine facts for the position on the board: eval, best line, alternatives."""
    out = {"eval": 0.0, "mate": None, "best_san": None, "pv_san": [], "alternatives": []}
    try:
        infos = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=multipv)
        if isinstance(infos, dict):
            infos = [infos]
        for i, info in enumerate(infos):
            pv = info.get("pv") or []
            ev, mate = _score_pawns(info, board.turn)
            san_line, tmp = [], board.copy()
            for mv in pv[:6]:
                try:
                    san_line.append(tmp.san(mv)); tmp.push(mv)
                except Exception:
                    break
            if i == 0:
                out["eval"] = ev; out["mate"] = mate
                out["best_san"] = san_line[0] if san_line else None
                out["pv_san"] = san_line
            elif san_line:
                out["alternatives"].append({"move": san_line[0], "eval": ev, "line": san_line})
    except Exception as e:
        print("ask-forge analyse error:", e)
    return out

def _analyse_what_if(engine, board, san):
    """Play the user's suggested move and report what actually happens after it."""
    try:
        mv = board.parse_san(san)
    except Exception:
        return None
    if mv not in board.legal_moves:
        return None
    after = board.copy(); after.push(mv)
    res = _analyse_position(engine, after, depth=13, multipv=1)
    return {
        "move": san,
        "eval_after": -res["eval"],        # flip: eval is from the mover's side after the move
        "opponent_best": res["best_san"],
        "continuation": res["pv_san"],
        "gives_check": after.is_check(),
        "is_mate": after.is_checkmate(),
    }

def _position_facts(board):
    """Cheap structural facts so the coach can name real squares, not vague ideas."""
    us = board.turn
    facts = {"side_to_move": "white" if us == chess.WHITE else "black",
             "fullmove": board.fullmove_number, "in_check": board.is_check()}
    loose = []
    for sq, pc in board.piece_map().items():
        if pc.color != us or pc.piece_type == chess.KING:
            continue
        atk = len(board.attackers(not us, sq)); dfn = len(board.attackers(us, sq))
        if atk > dfn:
            loose.append("%s on %s (%d attackers, %d defenders)"
                         % (PIECE_NAMES.get(pc.piece_type, "piece"), chess.square_name(sq), atk, dfn))
    facts["your_loose_pieces"] = loose[:5]
    try:
        facts["material"] = total_non_king_material(board)
    except Exception:
        pass
    return facts

def _build_ask_context(engine, board, payload):
    """Everything the coach is allowed to rely on. Engine-derived, never guessed."""
    ctx = {
        "fen": board.fen(),
        "move_number": payload.get("move_number"),
        "move_played": payload.get("san_played"),
        "player_color": payload.get("player_color") or "white",
        "facts": _position_facts(board),
        "engine": _analyse_position(engine, board),
    }
    try:
        moves = payload.get("moves") or []
        if moves:
            ctx["opening"] = detect_opening([m for m in moves if isinstance(m, str)][:20])
    except Exception:
        pass
    q = payload.get("question") or ""
    if _WHATIF.search(q) or _candidate_moves(q, board):
        ctx["what_if"] = [w for w in
                          (_analyse_what_if(engine, board, san) for san in _candidate_moves(q, board))
                          if w]
    return ctx

ASK_SYSTEM = """You are GM Forge, a patient grandmaster sitting beside the student reviewing their game.

Ground rules, in order of importance:
1. Every claim about the position must come from the ENGINE FACTS given to you. Never invent a
   move, an evaluation or a line. If the facts do not cover something, say so plainly.
2. Always name concrete squares and pieces. "Your knight on f3 is overloaded defending d4 and h4"
   — never "your position is a bit loose".
3. Explain the idea, the consequence, and what the opponent wanted. Not just the move.
4. Never dump an evaluation number as the answer. Translate it: what does the position feel like
   to play, and why.
5. You are mid-conversation about one specific position. The student does not need to tell you
   which move they mean — it is the position in the facts unless they name another.
6. Be warm and direct. Ask a follow-up question when curiosity would help. Never robotic.

Answer in 2-5 short paragraphs unless asked for more. No preamble, no restating the question."""

def _ask_prompt(ctx, question, level_key, confused):
    e = ctx["engine"]
    lines = [
        "ENGINE FACTS (authoritative — everything you say must follow from these)",
        "Position (FEN): " + ctx["fen"],
        "Side to move: %s | Move %s | In check: %s" % (
            ctx["facts"]["side_to_move"], ctx["facts"].get("fullmove"), ctx["facts"]["in_check"]),
    ]
    if ctx.get("move_played"):
        lines.append("The move actually played here: " + str(ctx["move_played"]))
    if e.get("mate"):
        lines.append("Evaluation: %s" % e["mate"])
    else:
        lines.append("Evaluation: %+.2f pawns (from the side-to-move's point of view)" % e["eval"])
    if e.get("best_san"):
        lines.append("Engine's best move: %s" % e["best_san"])
    if e.get("pv_san"):
        lines.append("Main line: " + " ".join(e["pv_san"]))
    for alt in e.get("alternatives", []):
        lines.append("Alternative: %s (%+.2f) — %s" % (alt["move"], alt["eval"], " ".join(alt["line"])))
    if ctx["facts"].get("your_loose_pieces"):
        lines.append("Undefended or outnumbered: " + "; ".join(ctx["facts"]["your_loose_pieces"]))
    if ctx.get("opening"):
        lines.append("Opening: " + str(ctx["opening"]))
    for w in ctx.get("what_if", []):
        lines.append(
            "IF %s IS PLAYED: evaluation becomes %+.2f for the mover%s. Opponent's best reply: %s. Line: %s"
            % (w["move"], w["eval_after"],
               " (checkmate)" if w["is_mate"] else (" (with check)" if w["gives_check"] else ""),
               w["opponent_best"] or "unclear", " ".join(w["continuation"]) or "unclear"))
    lines.append("")
    lines.append("Pitch the explanation for: " + ASK_LEVELS.get(level_key, ASK_LEVELS["coach"]))
    if confused:
        lines.append(
            "IMPORTANT: the student already read your previous answer and said they still do not "
            "understand. Do NOT repeat it. Teach the same idea a different way — if you explained "
            "strategically, go concrete and tactical; if you gave a line, compare the two positions "
            "side by side; if that failed, use the simplest possible language or a real-world analogy.")
    lines.append("")
    lines.append("STUDENT'S QUESTION: " + question)
    return "\n".join(lines)

def _suggested_actions(ctx):
    """Follow-ups that keep the student learning instead of ending the exchange."""
    out = []
    e = ctx["engine"]
    if e.get("best_san"):
        out.append("Why is %s better than what I played?" % e["best_san"])
    if e.get("pv_san"):
        out.append("Show me how the engine line continues")
    if ctx.get("what_if"):
        out.append("Compare both positions for me")
    out.append("What was my opponent threatening?")
    out.append("Which of my pieces is worst here?")
    out.append("Turn this into a training puzzle")
    return out[:4]

@app.route("/ask-forge", methods=["POST"])
@login_required
def ask_forge():
    user = get_user(current_user())
    if not user:
        return jsonify({"error": "Not logged in"}), 401
    if not is_pro(user):
        return jsonify({"error": "pro_required",
                        "message": "Ask GM Forge is part of Grandmaster. Upgrade to ask about any position "
                                   "in your games."}), 402

    d = request.get_json(force=True, silent=True) or {}
    question = (d.get("question") or "").strip()
    if not question:
        return jsonify({"error": "Ask me something about this position."}), 400
    if len(question) > 800:
        question = question[:800]

    try:
        board = chess.Board(d.get("fen") or chess.STARTING_FEN)
    except Exception:
        return jsonify({"error": "That position could not be read."}), 400

    sf = find_stockfish()
    if not sf:
        return jsonify({"error": "Engine unavailable right now."}), 503

    engine = None
    try:
        engine = chess.engine.SimpleEngine.popen_uci(sf)
        ctx = _build_ask_context(engine, board, d)
    except Exception as e:
        print("ask-forge context error:", e)
        return jsonify({"error": "Could not analyse that position."}), 500
    finally:
        if engine:
            try: engine.quit()
            except Exception: pass

    # Asking is itself a signal: what you have to ask about is what you could
    # not work out from the board.
    try:
        _ad = _ask_dims(question)
        if _ad:
            _fold_profile(user, _ad, "ask_forge")
            save_user(current_user(), user)
    except Exception as _e:
        print("profile fold (ask) failed:", _e)

    level = _ask_level_from(question, d.get("level"))
    confused = bool(d.get("still_confused"))
    prompt = _ask_prompt(ctx, question, level, confused)

    # ── The model call. Everything above runs with or without a key. ──────────
    if not ANTHROPIC_API_KEY:
        return jsonify({
            "configured": False,
            "answer": "",
            "engine": ctx["engine"],
            "what_if": ctx.get("what_if", []),
            "facts": ctx["facts"],
            "suggested": _suggested_actions(ctx),
            "level": level,
            "message": "GM Forge's conversational coaching is not switched on yet. The engine "
                       "analysis below is live and real — set ANTHROPIC_API_KEY to enable the "
                       "coaching voice on top of it.",
        })

    try:
        import anthropic
    except ImportError:
        return jsonify({"configured": False, "engine": ctx["engine"],
                        "suggested": _suggested_actions(ctx),
                        "message": "The anthropic package is not installed on the server."}), 503

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        history = []
        for turn in (d.get("history") or [])[-8:]:
            role = turn.get("role")
            text = (turn.get("content") or "")[:2000]
            if role in ("user", "assistant") and text:
                history.append({"role": role, "content": text})
        resp = client.messages.create(
            model=ASK_MODEL,
            max_tokens=1600,
            system=ASK_SYSTEM,
            messages=history + [{"role": "user", "content": prompt}],
        )
        if resp.stop_reason == "refusal":
            return jsonify({"configured": True, "answer": "",
                            "error": "I can't answer that one. Ask me about the position instead.",
                            "engine": ctx["engine"], "suggested": _suggested_actions(ctx)})
        answer = "".join(b.text for b in resp.content if b.type == "text").strip()
    except Exception as e:
        print("ask-forge model error:", e)
        return jsonify({"configured": True, "answer": "",
                        "error": "GM Forge could not answer just now. The engine analysis is still below.",
                        "engine": ctx["engine"], "what_if": ctx.get("what_if", []),
                        "suggested": _suggested_actions(ctx)}), 502

    return jsonify({
        "configured": True,
        "answer": answer,
        "engine": ctx["engine"],
        "what_if": ctx.get("what_if", []),
        "facts": ctx["facts"],
        "suggested": _suggested_actions(ctx),
        "level": level,
    })

# ══════════════════════════════════════════════════════════════════════════════
# CANDIDATE MOVES + THINKING PROFILE
#
# Coaches the decision, not just the outcome. The player marks candidates simply
# by drawing right-click arrows while they calculate — no new interaction. When
# the move lands we compare what they played, what they considered, and what the
# engine wanted, then fold the result into a long-term thinking profile.
# ══════════════════════════════════════════════════════════════════════════════

# Cognitive dimensions — WHY mistakes happen, not just what they were.
THINKING_DIMENSIONS = {
    "candidate_quality":   "Candidate Move Quality",
    "opponent_blindness":  "Opponent Blindness",
    "tunnel_vision":       "Tunnel Vision",
    "impulsive_captures":  "Impulsive Captures",
    "premature_attacks":   "Premature Attacks",
    "threat_recognition":  "Threat Recognition",
    "evaluation_accuracy": "Evaluation Accuracy",
    "board_vision":        "Board Vision",
    "calculation_depth":   "Calculation Depth",
    "king_safety":         "King Safety Awareness",
    "piece_coordination":  "Piece Coordination",
    "strategic_planning":  "Strategic Planning",
    "quiet_moves":         "Quiet Move Search",
}

def _empty_thinking_profile():
    return {"samples": 0, "dims": {k: {"hits": 0, "obs": 0} for k in THINKING_DIMENSIONS},
            "notes": [], "updated": ""}

def get_thinking_profile(user):
    tp = user.get("thinking_profile")
    if not tp or "dims" not in tp:
        return _empty_thinking_profile()
    for k in THINKING_DIMENSIONS:
        tp["dims"].setdefault(k, {"hits": 0, "obs": 0})
    return tp

def _uci_or_san_to_san(board, item):
    """Accept {from,to} or a SAN string; return SAN if the move is legal here."""
    try:
        if isinstance(item, dict) and item.get("from") and item.get("to"):
            mv = chess.Move.from_uci(item["from"] + item["to"] + (item.get("promotion") or ""))
            if mv not in board.legal_moves:
                mv = chess.Move.from_uci(item["from"] + item["to"] + "q")
            return board.san(mv) if mv in board.legal_moves else None
        if isinstance(item, str):
            mv = board.parse_san(item)
            return board.san(mv) if mv in board.legal_moves else None
    except Exception:
        return None
    return None

def _is_forcing(board, san):
    """A forcing move is a check or a capture — the moves people calculate first."""
    try:
        mv = board.parse_san(san)
    except Exception:
        return False
    if board.is_capture(mv):
        return True
    t = board.copy(); t.push(mv)
    return t.is_check()

def _opponent_threats(board):
    """What the opponent would win if we passed. Drives Opponent Blindness."""
    threats = []
    try:
        nb = board.copy(); nb.push(chess.Move.null())
        for mv in nb.legal_moves:
            if nb.is_capture(mv):
                victim = nb.piece_at(mv.to_square)
                if victim and victim.piece_type != chess.PAWN:
                    atk = len(nb.attackers(nb.turn, mv.to_square))
                    dfn = len(nb.attackers(not nb.turn, mv.to_square))
                    if atk > dfn:
                        threats.append(nb.san(mv))
    except Exception:
        pass
    return threats[:4]

def _analyse_candidates(engine, board, played_san, candidate_sans):
    """The core comparison: played vs each candidate vs the engine's choice."""
    top = _analyse_position(engine, board, depth=14, multipv=4)
    best = top.get("best_san")
    base_eval = top.get("eval", 0.0)

    def eval_of(san):
        try:
            mv = board.parse_san(san)
        except Exception:
            return None
        after = board.copy(); after.push(mv)
        r = _analyse_position(engine, after, depth=12, multipv=1)
        return -r.get("eval", 0.0)     # flip to the mover's point of view

    rows = []
    for san in candidate_sans:
        ev = eval_of(san)
        if ev is None:
            continue
        rows.append({"move": san, "eval": ev, "loss": round(base_eval - ev, 2),
                     "is_best": san == best, "forcing": _is_forcing(board, san)})
    played_eval = eval_of(played_san) if played_san else None
    return {
        "best": best, "best_line": top.get("pv_san", []), "base_eval": base_eval,
        "played": {"move": played_san, "eval": played_eval,
                   "loss": (round(base_eval - played_eval, 2) if played_eval is not None else None),
                   "is_best": played_san == best,
                   "forcing": _is_forcing(board, played_san) if played_san else False},
        "candidates": rows,
        "threats": _opponent_threats(board),
    }

def _thinking_verdict(cmp_):
    """Turn the comparison into a coaching line plus the dimensions it evidences."""
    cands = cmp_["candidates"]
    played = cmp_["played"]
    best = cmp_["best"]
    names = [c["move"] for c in cands]
    dims, tags = {}, []

    def obs(dim, hit):
        dims[dim] = {"obs": 1, "hits": 1 if hit else 0}

    if not cands:
        # No candidates marked — we can still judge the move itself.
        if played.get("loss") is not None:
            obs("evaluation_accuracy", played["loss"] > 1.0)
        return {"headline": "", "detail": "", "dims": dims, "tags": tags}

    considered_best = best in names
    played_best = played.get("is_best")

    obs("candidate_quality", not considered_best)
    obs("tunnel_vision", len(cands) <= 1)
    if len(cands) <= 1:
        tags.append("Searched narrowly — only one candidate")

    if cmp_["threats"]:
        # Did any candidate actually deal with what the opponent wanted?
        addressed = considered_best or any(c["loss"] <= 0.3 for c in cands)
        obs("opponent_blindness", not addressed)
        obs("threat_recognition", not addressed)
        if not addressed:
            tags.append("Opponent had a real threat (%s) and none of your candidates met it"
                        % cmp_["threats"][0])

    if cands and all(c["forcing"] for c in cands):
        obs("quiet_moves", True)
        tags.append("Every candidate was forcing — no quiet improving move considered")
    elif cands:
        obs("quiet_moves", False)

    if played.get("forcing") and not played_best and len(cands) <= 1:
        obs("impulsive_captures", True)
        tags.append("Played a forcing move without weighing alternatives")

    if played.get("loss") is not None:
        obs("evaluation_accuracy", played["loss"] > 1.0)

    # Headline — the sentence the player actually reads.
    if played_best and considered_best:
        head = "You considered %s and played it. That was the best move." % best
        detail = "Your search found the right move and you trusted it."
    elif considered_best and not played_best:
        head = "You considered the best move (%s) — and rejected it." % best
        detail = ("You played %s instead, which costs about %.2f. The search was right; the "
                  "decision was not. When a candidate looks strong, check what is actually wrong "
                  "with it before discarding it." % (played["move"], max(played["loss"] or 0, 0)))
        obs("evaluation_accuracy", True)
    elif best and not considered_best:
        head = "You never considered %s." % best
        detail = ("Your candidates were %s. The best move was not among them, so no amount of "
                  "calculation was going to find it — the miss happened at the search step, not "
                  "the decision step." % ", ".join(names))
    else:
        head = "You weighed %s and played %s." % (", ".join(names), played["move"])
        detail = ""

    if cands and cands[0]["move"] == played["move"] and played_best and len(cands) > 1:
        head = "Your first instinct was correct — you looked at %s first and it was the best move." % played["move"]

    return {"headline": head, "detail": detail, "dims": dims, "tags": tags}

def _fold_profile(user, dims, source="candidates"):
    """Fold one observation into the long-term profile.

    `source` records where the evidence came from, so the profile can say what
    it is actually built on. It used to be candidate reviews alone, which meant
    it only knew about the moves you happened to draw arrows for.
    """
    tp = get_thinking_profile(user)
    for k, v in (dims or {}).items():
        if k not in tp["dims"]:
            continue
        tp["dims"][k]["obs"] += v.get("obs", 0)
        tp["dims"][k]["hits"] += v.get("hits", 0)
    tp["samples"] = tp.get("samples", 0) + 1
    src = tp.setdefault("sources", {})
    src[source] = int(src.get(source, 0)) + 1
    tp["updated"] = time.strftime("%Y-%m-%d")
    user["thinking_profile"] = tp
    return tp

# Which cognitive dimension a mistake is evidence about. A hanging piece is a
# board-vision failure; a queen sortie on move four is a premature attack. One
# mistake can speak to more than one.
MISTAKE_DIMS = {
    "Hanging piece":            ["board_vision", "opponent_blindness"],
    "Missed tactic":            ["candidate_quality", "calculation_depth"],
    "King safety issue":        ["king_safety"],
    "Early queen development":  ["premature_attacks", "strategic_planning"],
    "Opening mistake":          ["strategic_planning"],
    "Middlegame mistake":       ["strategic_planning", "piece_coordination"],
    "Endgame mistake":          ["calculation_depth"],
    "Positional mistake":       ["quiet_moves", "strategic_planning"],
    "Trapped piece":            ["board_vision"],
    "Overloaded defender":      ["threat_recognition"],
    "Back rank":                ["king_safety", "board_vision"],
}

def _mistake_dims(pattern, drop_cp=0, san="", coached=False):
    """Turn one played move into dimension observations.

    Every relevant dimension is observed; the ones the move actually failed are
    hits. Observing without a hit is what stops a single bad game from reading
    as a permanent weakness.
    """
    keys = list(MISTAKE_DIMS.get(pattern or "", []))
    if not keys:
        keys = ["evaluation_accuracy"]
    bad = int(drop_cp or 0) >= 150
    # A capture that loses material is the signature of grabbing without looking.
    if "x" in (san or "") and bad:
        keys.append("impulsive_captures")
    # Going wrong while the coach was actively asking questions says something
    # sharper than going wrong alone.
    if coached and bad:
        keys.append("opponent_blindness")
    dims = {}
    for k in keys:
        if k not in THINKING_DIMENSIONS:
            continue
        d = dims.setdefault(k, {"obs": 0, "hits": 0})
        d["obs"] += 1
        if bad:
            d["hits"] += 1
    return dims

# What someone asks about is evidence of what they cannot see for themselves.
ASK_DIMS = [
    (r"threat|threaten|attacking me|what is he doing|his plan", ["threat_recognition", "opponent_blindness"]),
    (r"why (is|was) (this|that|it) (bad|wrong|a mistake)",      ["evaluation_accuracy"]),
    (r"hang|loose|undefended|en prise|lose a piece",            ["board_vision"]),
    (r"what if|calculat|line|deeper|further ahead",             ["calculation_depth"]),
    (r"king|castl|mate|check",                                  ["king_safety"]),
    (r"plan|strateg|what should i be doing|long term",          ["strategic_planning"]),
    (r"better move|other move|alternative|instead",             ["candidate_quality"]),
    (r"quiet|slow move|nothing to do|no tactics",               ["quiet_moves"]),
]

def _ask_dims(question):
    """Dimensions implied by a question to GM Forge."""
    q = (question or "").lower()
    dims = {}
    for pat, keys in ASK_DIMS:
        if re.search(pat, q):
            for k in keys:
                d = dims.setdefault(k, {"obs": 0, "hits": 0})
                d["obs"] += 1
                d["hits"] += 1     # needing to ask is itself the observation
    return dims

# ══ PLAIN-ENGLISH MISTAKE EXPLANATION ════════════════════════════════════════
# The review used to print "Re1 engine: dxe5, -1.9" and stop. That is the what,
# never the why, and nobody learns from it. Everything below is derived from the
# position with python-chess -- no model, no API key -- so it works today and
# cannot invent anything.

def _what_hangs(board, color):
    """{square: (piece, attackers, defenders)} for pieces attacked more than defended."""
    out = {}
    for sq in chess.SQUARES:
        pc = board.piece_at(sq)
        if not pc or pc.color != color or pc.piece_type == chess.KING:
            continue
        a = len(board.attackers(not color, sq)); d = len(board.attackers(color, sq))
        if a > d:
            out[chess.square_name(sq)] = (PIECE_NAMES.get(pc.piece_type, "piece"), a, d,
                                          PIECE_VALS.get(pc.piece_type, 0))
    return out

def explain_mistake(fen, played_san, best_san, reply_san=None, loss_cp=0):
    """Say, in words, what the played move actually cost.

    Compares what was safe before the move with what is hanging after it, and
    names the opponent's refutation when there is one.
    """
    try:
        board = chess.Board(fen)
    except Exception:
        return ""
    mover = board.turn
    before = _what_hangs(board, mover)
    try:
        mv = board.parse_san(played_san)
    except Exception:
        return ""
    board.push(mv)
    after = _what_hangs(board, mover)

    parts = []
    # Something became loose that was fine a moment ago.
    fresh = [(sq, v) for sq, v in after.items() if sq not in before]
    if fresh:
        fresh.sort(key=lambda kv: -kv[1][3])
        sq, (name, a, d, _) = fresh[0]
        parts.append("%s leaves your %s on %s attacked %d time%s and defended %d."
                     % (played_san, name, sq, a, "" if a == 1 else "s", d))
    elif played_san in before or any(mv.to_square == chess.parse_square(s) for s in after):
        sq = chess.square_name(mv.to_square)
        if sq in after:
            name, a, d, _ = after[sq]
            parts.append("%s puts your %s on a square where it is attacked %d time%s and "
                         "defended %d." % (played_san, name, a, "" if a == 1 else "s", d))

    # What they get to do about it.
    if reply_san:
        try:
            rb = chess.Board(fen); rb.push(rb.parse_san(played_san))
            rmv = rb.parse_san(reply_san)
            cap = rb.piece_at(rmv.to_square)
            rb.push(rmv)
            if cap:
                parts.append("They answer %s, winning your %s."
                             % (reply_san, PIECE_NAMES.get(cap.piece_type, "piece")))
            elif rb.attackers(not mover, mv.to_square):
                # The piece just moved is now being chased: the classic "lost a
                # tempo" mistake, which no material count would ever surface.
                moved = board.piece_at(mv.to_square)
                parts.append("They answer %s, hitting your %s on %s — you have to move it "
                             "again and they develop for free."
                             % (reply_san,
                                PIECE_NAMES.get(moved.piece_type, "piece") if moved else "piece",
                                chess.square_name(mv.to_square)))
            elif rb.is_check():
                parts.append("They answer %s with check, and you are moving your king "
                             "instead of your plan." % reply_san)
            else:
                parts.append("They answer %s." % reply_san)
        except Exception:
            pass

    if not parts:
        # No material story -- describe it positionally rather than inventing one.
        parts.append("%s is playable but it is not the most testing move here." % played_san)

    if best_san:
        parts.append("%s was the move." % best_san)
    if loss_cp:
        pawns = abs(float(loss_cp)) / 100.0
        if pawns >= 0.8:
            parts.append("The difference is about %.1f pawns." % pawns)
    return " ".join(parts)

# ══ GUIDED REASONING LADDER ══════════════════════════════════════════════════
# "I don't know what to do here" is the state the coach was worst at. It used to
# narrate an observation and move on. This walks the player through the actual
# procedure instead -- count the attackers and defenders, decide whether anything
# is actually loose, then choose a move -- and every rung is measured off the
# real position, so it can never assert something that is not on the board.
#
# The board stays visible for all of it; nothing here dims or blocks it.

def _ladder_material(board, color):
    """Everything of `color` that is attacked, with its attacker/defender count."""
    rows = []
    for sq in chess.SQUARES:
        pc = board.piece_at(sq)
        if not pc or pc.color != color or pc.piece_type == chess.KING:
            continue
        att = board.attackers(not color, sq)
        if not att:
            continue
        dfn = board.attackers(color, sq)
        rows.append({
            "square": chess.square_name(sq),
            "piece": PIECE_NAMES.get(pc.piece_type, "piece"),
            "value": PIECE_VALS.get(pc.piece_type, 0),
            "attackers": len(att), "defenders": len(dfn),
            "loose": len(att) > len(dfn),
        })
    rows.sort(key=lambda r: (not r["loose"], -r["value"]))
    return rows

def _ladder_options(engine, board, best_san, n=3):
    """The right move plus plausible wrong ones, all legal, all real SAN."""
    legal = list(board.legal_moves)
    sans = []
    for mv in legal:
        try:
            sans.append(board.san(mv))
        except Exception:
            pass
    wrong = [s for s in sans if s != best_san]
    # Prefer captures and checks as distractors: those are what a club player
    # actually reaches for, so the answer cannot be found by elimination.
    juicy = [s for s in wrong if "x" in s or "+" in s]
    random.shuffle(juicy); random.shuffle(wrong)
    picks = (juicy + wrong)[: max(0, n - 1)]
    opts = [best_san] + picks
    random.shuffle(opts)
    return opts, opts.index(best_san)

@app.route("/coach/begin", methods=["POST"])
@login_required
def coach_begin():
    """Claim one coached game. Free gets one a day; Grandmaster is unlimited.

    Enforced here rather than in the browser so the limit is real.
    """
    u = current_user(); user = get_user(u)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if is_pro(user):
        return jsonify({"ok": True, "unlimited": True, "plan": PLAN_NAME})
    blocked = quota_blocked(user, "coached", FREE_COACHED_GAMES, "coached game")
    if blocked:
        blocked["message"] = ("You have used your free coached game for today. %s plays with GM "
                              "Forge beside you every single game — that is where the improvement "
                              "actually happens." % PLAN_NAME)
        return jsonify(blocked), 403
    left = FREE_COACHED_GAMES - bump_usage(user, "coached")
    save_user(u, user)
    return jsonify({"ok": True, "unlimited": False, "left": left,
                    "limit": FREE_COACHED_GAMES, "plan": PLAN_NAME})

@app.route("/puzzles/claim", methods=["POST"])
@login_required
def puzzles_claim():
    """Claim one puzzle attempt. Free gets FREE_PUZZLES a day.

    Capping the list returned by /my-puzzles was not enough: the client keeps
    the puzzles it has already been given, and re-solving the same five was
    unlimited. Solving is what gets counted now, so the limit holds however the
    puzzle reached the board.
    """
    u = current_user(); user = get_user(u)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if is_pro(user):
        return jsonify({"ok": True, "unlimited": True})
    used = usage(user, "puzzles")
    if used >= FREE_PUZZLES:
        return jsonify({
            "error": "free_limit_reached", "locked": "puzzles", "plan": PLAN_NAME,
            "limit": FREE_PUZZLES, "used": used,
            "message": "That is your %d puzzles for today. %s serves every puzzle your own games "
                       "produce." % (FREE_PUZZLES, PLAN_NAME),
        }), 403
    left = FREE_PUZZLES - bump_usage(user, "puzzles")
    save_user(u, user)
    return jsonify({"ok": True, "unlimited": False, "left": left, "limit": FREE_PUZZLES})

@app.route("/plan/features")
def plan_features():
    """What each plan includes. One source of truth for every upgrade surface."""
    user = get_user(current_user()) or {}
    return jsonify({
        "plan_name": PLAN_NAME, "free_name": FREE_PLAN_NAME,
        "is_pro": is_pro(user), "price": PRO_PRICE, "currency": PRO_CURRENCY,
        "rows": [
            {"label": "Coached games with GM Forge",
             "free": "1 per day", "pro": "Unlimited", "key": "coached"},
            {"label": "Puzzles from your own games",
             "free": "5 per day",  "pro": "Unlimited", "key": "puzzles"},
            {"label": "Training exercises per theme",
             "free": "1 per day",  "pro": "Unlimited", "key": "lesson"},
            {"label": "Deep game analysis",
             "free": None,         "pro": "Every game", "key": "analysis"},
            {"label": "Ask GM Forge about any position",
             "free": None,         "pro": "Included",   "key": "ask"},
            {"label": "XP shop — board themes and piece sets",
             "free": None,         "pro": "Included",   "key": "shop"},
            {"label": "Dress GM Forge",
             "free": None,         "pro": "Included",   "key": "cosmetics"},
            {"label": "Trap Trainer — bot steers into your weaknesses",
             "free": None,         "pro": "Included",   "key": "trap"},
            {"label": "Thinking Profile — 13 cognitive dimensions",
             "free": None,         "pro": "Included",   "key": "profile"},
            {"label": "Candidate move review",
             "free": None,         "pro": "Included",   "key": "candidates"},
            {"label": "Progress tracking and rating estimate",
             "free": "Basic",      "pro": "Full history", "key": "progress"},
        ],
        "usage": {
            "coached": usage(user, "coached"),
            "coached_limit": FREE_COACHED_GAMES,
            "puzzles_limit": FREE_PUZZLES,
        },
    })

@app.route("/coach/ladder", methods=["POST"])
@login_required
def coach_ladder():
    """A step-by-step think-it-through for the position on the board."""
    d = request.get_json(silent=True) or {}
    try:
        board = chess.Board(d.get("fen") or chess.STARTING_FEN)
    except Exception:
        return jsonify({"error": "bad position"}), 400
    if board.is_game_over():
        return jsonify({"error": "game over"}), 400

    me = board.turn
    mine = _ladder_material(board, me)
    theirs = _ladder_material(board, not me)
    loose_mine = [r for r in mine if r["loose"]]
    loose_theirs = [r for r in theirs if r["loose"]]

    sf = find_stockfish()
    if not sf:
        return jsonify({"error": "engine unavailable"}), 503
    engine = None
    try:
        engine = chess.engine.SimpleEngine.popen_uci(sf)
        info = engine.analyse(board, chess.engine.Limit(depth=min(ANALYSIS_DEPTH, 14)))
        pv = info.get("pv") or []
        if not pv:
            return jsonify({"error": "no line"}), 500
        best_san = board.san(pv[0])
        line = []
        tmp = board.copy()
        for mv in pv[:4]:
            line.append(tmp.san(mv)); tmp.push(mv)
        opts, answer = _ladder_options(engine, board, best_san)
    except Exception as e:
        print("ladder error:", e)
        return jsonify({"error": "analysis failed"}), 500
    finally:
        if engine:
            try: engine.quit()
            except Exception: pass

    steps = []

    # 0 ─ When it opens in response to something -- the opponent's move, or a
    # mistake just made -- start from that rather than from a cold count. Being
    # walked through why the position changed is the whole point.
    last_san = (d.get("last_san") or "").strip()
    reason = (d.get("reason") or "").strip()
    if last_san:
        # The position before their move has to be supplied: this board was
        # rebuilt from a FEN, so its move stack is empty and pop() would throw.
        gained = ""
        prev_fen = (d.get("prev_fen") or "").strip()
        try:
            if prev_fen:
                was = _what_hangs(chess.Board(prev_fen), me)
                now_loose = {k: v for k, v in _what_hangs(board, me).items() if k not in was}
                if now_loose:
                    sq, (nm, a, dd, _) = sorted(now_loose.items(), key=lambda kv: -kv[1][3])[0]
                    gained = ("It attacked your %s on %s, which is now hit %d time%s and defended "
                              "%d." % (nm, sq, a, "" if a == 1 else "s", dd))
                else:
                    gained = ("Nothing of yours became loose, so this is a positioning move rather "
                              "than a direct threat. Work out which square or line it is going after.")
        except Exception:
            gained = ""
        steps.append({
            "kind": "note",
            "title": "They played %s. What changed?" % last_san,
            "body": (gained or "Work out what that move is actually going after before you reply.")
                    + " Go through it properly.",
            "rows": [], "point": [],
        })
    elif reason == "blunder":
        steps.append({
            "kind": "note",
            "title": "Hold on. Let us go through this one.",
            "body": "That move costs something. Rather than being told what, work it out in the "
                    "same order every strong player does.",
            "rows": [], "point": [],
        })

    # 1 ─ Count. The numbers are shown, not claimed.
    if mine or theirs:
        counted = (mine + theirs)[:5]
        steps.append({
            "kind": "count",
            "title": "Start by counting.",
            "body": "Before anything else: what is attacked, and is it defended enough? "
                    "Count the attackers, then the defenders.",
            "rows": counted,
            "point": [r["square"] for r in counted[:3]],
        })
    else:
        steps.append({
            "kind": "count",
            "title": "Nothing is attacked yet.",
            "body": "No piece on either side is under attack, so this is not a tactical "
                    "position. That makes it a developing move: get a piece out, or take a "
                    "square you want.",
            "rows": [], "point": [],
        })

    # 2 ─ A yes/no the player answers themselves, with the truth known server-side.
    if loose_mine:
        r = loose_mine[0]
        steps.append({
            "kind": "yesno",
            "title": "Is anything of yours actually loose?",
            "body": "Loose means attacked more times than it is defended.",
            "answer": True,
            "why_yes": "Correct — your %s on %s is attacked %d time%s and defended %d. "
                       "That is the thing to deal with first."
                       % (r["piece"], r["square"], r["attackers"],
                          "" if r["attackers"] == 1 else "s", r["defenders"]),
            "why_no": "Look again — your %s on %s is attacked %d time%s and defended only %d."
                      % (r["piece"], r["square"], r["attackers"],
                         "" if r["attackers"] == 1 else "s", r["defenders"]),
            "point": [r["square"]],
        })
        goal = ("Something of yours is hanging. You can defend it, move it, "
                "or create a bigger threat somewhere else.")
    elif loose_theirs:
        r = loose_theirs[0]
        steps.append({
            "kind": "yesno",
            "title": "Is anything of THEIRS loose?",
            "body": "Same count, other side of the board.",
            "answer": True,
            "why_yes": "Yes — their %s on %s is attacked %d time%s and defended %d. "
                       "That is yours to take."
                       % (r["piece"], r["square"], r["attackers"],
                          "" if r["attackers"] == 1 else "s", r["defenders"]),
            "why_no": "Count again — their %s on %s is attacked %d and defended %d."
                      % (r["piece"], r["square"], r["attackers"], r["defenders"]),
            "point": [r["square"]],
        })
        goal = "They have left something hanging. Work out whether you can actually win it."
    else:
        steps.append({
            "kind": "yesno",
            "title": "Is anything loose for either side?",
            "body": "Attacked more often than it is defended.",
            "answer": False,
            "why_yes": "Not quite — count again. Everything attacked is defended at least as often.",
            "why_no": "Right. Nothing is hanging, so nothing is forced. That means you get to "
                      "improve your position instead of reacting to theirs.",
            "point": [],
        })
        goal = ("Nothing is forced, so the move is about improvement: develop a piece, "
                "take a strong square, or make your king safer.")

    # 3 ─ Now choose, with the board still in front of them.
    steps.append({
        "kind": "mcq",
        "title": "So what do you play?",
        "body": goal,
        "options": opts,
        "answer": answer,
        "why_right": "Yes — %s. The line runs %s." % (best_san, " ".join(line)),
        "why_wrong": "Not that one. Play through it in your head and see what they answer with.",
        "point": [],
    })

    return jsonify({"ok": True, "steps": steps, "best": best_san, "line": line})

@app.route("/candidates/review", methods=["POST"])
@login_required
def candidates_review():
    """Compare the played move against the candidates the player marked."""
    d = request.get_json(force=True, silent=True) or {}
    try:
        board = chess.Board(d.get("fen") or chess.STARTING_FEN)
    except Exception:
        return jsonify({"error": "bad position"}), 400
    played = d.get("played")
    if isinstance(played, dict):
        played = _uci_or_san_to_san(board, played)
    elif isinstance(played, str):
        played = _uci_or_san_to_san(board, played)
    if not played:
        return jsonify({"error": "played move not legal here"}), 400

    # Keep the played move if the player marked it — "you considered it and played
    # it" is a real and important verdict, and dropping it also under-counted how
    # wide their search actually was.
    cands, seen = [], set()
    for item in (d.get("candidates") or [])[:6]:
        san = _uci_or_san_to_san(board, item)
        if san and san not in seen:
            seen.add(san); cands.append(san)

    sf = find_stockfish()
    if not sf:
        return jsonify({"error": "engine unavailable"}), 503
    engine = None
    try:
        engine = chess.engine.SimpleEngine.popen_uci(sf)
        cmp_ = _analyse_candidates(engine, board, played, cands)
    except Exception as e:
        print("candidates error:", e)
        return jsonify({"error": "analysis failed"}), 500
    finally:
        if engine:
            try: engine.quit()
            except Exception: pass

    verdict = _thinking_verdict(cmp_)
    user = get_user(current_user())
    if user:
        _fold_profile(user, verdict["dims"], "candidates")
        # Reward the habit itself: weighing more than one move, and more again
        # when the engine's choice was actually among what they weighed.
        granted = 0
        if len(cands) >= 2:
            granted += grant_xp(user, "candidates_reviewed")
            if cmp_.get("best") and cmp_["best"] in cands:
                granted += grant_xp(user, "found_best")
        verdict["xp_granted"] = granted
        verdict["balance"] = xp_balance(user)
        save_user(current_user(), user)

    return jsonify({"comparison": cmp_, "headline": verdict["headline"],
                    "detail": verdict["detail"], "tags": verdict["tags"],
                    "considered": cands})

@app.route("/thinking-profile")
@login_required
def thinking_profile():
    """The long-term cognitive profile, built across every game reviewed."""
    user = get_user(current_user())
    if not user:
        return jsonify({"error": "Not logged in"}), 401
    tp = get_thinking_profile(user)
    rows = []
    for key, label in THINKING_DIMENSIONS.items():
        dd = tp["dims"].get(key, {"hits": 0, "obs": 0})
        obs = dd.get("obs", 0); hits = dd.get("hits", 0)
        if not obs:
            continue
        rate = hits / float(obs)
        band = ("Strength" if rate < 0.25 else
                "Steady"   if rate < 0.5  else
                "Leak"     if rate < 0.75 else "Big leak")
        rows.append({"key": key, "label": label, "observations": obs,
                     "rate": round(rate * 100), "band": band})
    rows.sort(key=lambda r: (-r["rate"], -r["observations"]))
    confidence = min(100, int(tp.get("samples", 0) / 60.0 * 100))
    # Say what the profile is actually built on. It used to be candidate reviews
    # alone, so it could be confidently wrong about someone who never drew an
    # arrow; naming the sources makes that visible instead of implied.
    src = tp.get("sources") or {}
    SOURCE_LABELS = {
        "coached_moves":  "Moves played with the coach watching",
        "coached_games":  "Coached games finished",
        "solo_games":     "Solo games finished",
        "candidates":     "Candidate-move reviews",
        "ask_forge":      "Questions asked of GM Forge",
    }
    sources = [{"key": k, "label": SOURCE_LABELS.get(k, k), "count": int(v)}
               for k, v in sorted(src.items(), key=lambda kv: -int(kv[1])) if v]
    return jsonify({"samples": tp.get("samples", 0), "confidence": confidence,
                    "updated": tp.get("updated", ""), "dimensions": rows,
                    "sources": sources,
                    "headline": (rows[0]["label"] if rows and rows[0]["rate"] >= 50 else None)})

# ══════════════════════════════════════════════════════════════════════════════
# COACH RAIL — position-specific questions, and candidate playback.
#
# The old hints were generic because they came from a fixed bank. These are
# generated from THIS position: what is actually hanging, what he is actually
# threatening, which of your pieces is actually doing the least. And when you
# have arrows on the board, /candidates/preview plays each one out so you can
# see his reply rather than being told which is best.
# ══════════════════════════════════════════════════════════════════════════════

def _least_active(board, color):
    """The piece with the fewest legal destinations — the one to improve."""
    worst, n = None, 99
    for sq, pc in board.piece_map().items():
        if pc.color != color or pc.piece_type in (chess.KING, chess.PAWN):
            continue
        c = sum(1 for m in board.legal_moves if m.from_square == sq)
        if c < n:
            worst, n = (PIECE_NAMES.get(pc.piece_type, "piece"), chess.square_name(sq)), c
    return worst

def _overloaded(board, color):
    """A defender holding up two or more of your own pieces at once."""
    for sq, pc in board.piece_map().items():
        if pc.color != color or pc.piece_type == chess.KING:
            continue
        duties = 0
        for tsq, tp in board.piece_map().items():
            if tp.color == color and tsq != sq and sq in board.attackers(color, tsq):
                if board.attackers(not color, tsq):
                    duties += 1
        if duties >= 2:
            return (PIECE_NAMES.get(pc.piece_type, "piece"), chess.square_name(sq), duties)
    return None

@app.route("/coach-rail", methods=["POST"])
def coach_rail():
    """Questions built from THIS position — never the same generic hint twice."""
    d = request.get_json(force=True, silent=True) or {}
    try:
        board = chess.Board(d.get("fen") or chess.STARTING_FEN)
    except Exception:
        return jsonify({"error": "bad position"}), 400
    me = board.turn
    items = []

    # 1. What is he threatening? Widened to include pawn grabs and checks —
    # the previous rule ignored both, which is why the rail came back near-empty
    # in real middlegames.
    threats = _opponent_threats(board)
    extra = []
    try:
        nb = board.copy(); nb.push(chess.Move.null())
        for mv in nb.legal_moves:
            a = nb.copy(); a.push(mv)
            if a.is_check():
                extra.append(nb.san(mv))
            elif nb.is_capture(mv) and len(nb.attackers(nb.turn, mv.to_square)) >= len(nb.attackers(not nb.turn, mv.to_square)):
                extra.append(nb.san(mv))
    except Exception:
        pass
    if threats or extra:
        items.append({"kind": "threat", "q": "Before anything else — what is he threatening?",
                      "detail": "Give him a free move in your head and play it. What does he get?",
                      "squares": []})

    # 2. Always ask them to look at the forcing moves. This is the habit.
    forcing = 0
    try:
        for mv in board.legal_moves:
            a = board.copy(); a.push(mv)
            if a.is_check() or board.is_capture(mv):
                forcing += 1
    except Exception:
        pass
    if forcing:
        items.append({"kind": "forcing",
                      "q": "You have %d forcing move%s here. Have you looked at all of them?"
                           % (forcing, "" if forcing == 1 else "s"),
                      "detail": "Every check and every capture, before any quiet move.",
                      "squares": []})

    # 2. Anything of yours actually hanging?
    loose = []
    for sq, pc in board.piece_map().items():
        if pc.color != me or pc.piece_type == chess.KING:
            continue
        if len(board.attackers(not me, sq)) > len(board.attackers(me, sq)):
            loose.append((PIECE_NAMES.get(pc.piece_type, "piece"), chess.square_name(sq)))
    if loose:
        nm, sq = loose[0]
        items.append({"kind": "loose", "q": "Is your %s on %s actually defended?" % (nm, sq),
                      "detail": "Count who attacks it and who covers it. Do it piece by piece.",
                      "squares": [sq]})

    # 3. A defender doing two jobs.
    ov = _overloaded(board, me)
    if ov:
        nm, sq, n = ov
        items.append({"kind": "overload", "q": "Your %s on %s is holding up %d things at once — can it?" % (nm, sq, n),
                      "detail": "If it gets pulled away, what falls?", "squares": [sq]})

    # 4. Worst-placed piece — the quiet improving move.
    la = _least_active(board, me)
    if la:
        nm, sq = la
        items.append({"kind": "activity", "q": "Your %s on %s is doing the least. Where does it belong?" % (nm, sq),
                      "detail": "When there is no tactic, improve your worst piece.",
                      "squares": [sq]})

    # 5. King safety, only when it is a live question.
    ksq = board.king(me)
    if ksq is not None and board.is_check():
        items.append({"kind": "check", "q": "You are in check. How many legal answers do you have?",
                      "detail": "Move, block, or capture — count all three before choosing.",
                      "squares": [chess.square_name(ksq)]})

    return jsonify({"items": items[:5], "in_check": board.is_check(),
                    "side": "white" if me == chess.WHITE else "black"})

@app.route("/candidates/preview", methods=["POST"])
def candidates_preview():
    """Play each candidate out: what does he reply, and where does it leave you?"""
    d = request.get_json(force=True, silent=True) or {}
    try:
        board = chess.Board(d.get("fen") or chess.STARTING_FEN)
    except Exception:
        return jsonify({"error": "bad position"}), 400
    sf = find_stockfish()
    if not sf:
        return jsonify({"error": "engine unavailable"}), 503

    out = []
    engine = None
    try:
        engine = chess.engine.SimpleEngine.popen_uci(sf)
        base = _analyse_position(engine, board, depth=12, multipv=1)
        for item in (d.get("candidates") or [])[:5]:
            san = _uci_or_san_to_san(board, item)
            if not san:
                continue
            mv = board.parse_san(san)
            after = board.copy(); after.push(mv)
            r = _analyse_position(engine, after, depth=12, multipv=1)
            reply = r.get("best_san")
            fen_after = after.fen()
            fen_reply = None
            if reply:
                try:
                    a2 = after.copy(); a2.push(a2.parse_san(reply)); fen_reply = a2.fen()
                except Exception:
                    pass
            # Build the actual walk-through: each step is a board position plus
            # one line of plain coaching. The player watches the consequence
            # rather than being handed a number.
            steps = [{"fen": fen_after, "san": san, "who": "you",
                      "say": "You play %s. Watch what he gets." % san}]
            walk = after.copy()
            for i, nxt in enumerate(r.get("pv_san", [])[:4]):
                try:
                    mvn = walk.parse_san(nxt)
                except Exception:
                    break
                cap = walk.is_capture(mvn)
                victim = walk.piece_at(mvn.to_square)
                walk.push(mvn)
                who = "him" if i % 2 == 0 else "you"
                if walk.is_checkmate():
                    say = "%s — and that is mate." % nxt
                elif walk.is_check():
                    say = "%s, with check. Your king has to answer." % nxt
                elif cap and victim:
                    say = "%s takes your %s." % (nxt, PIECE_NAMES.get(victim.piece_type, "piece")) \
                          if who == "him" else "%s wins the %s back." % (nxt, PIECE_NAMES.get(victim.piece_type, "piece"))
                else:
                    say = "%s." % nxt if who == "him" else "You answer %s." % nxt
                steps.append({"fen": walk.fen(), "san": nxt, "who": who, "say": say})
            out.append({
                "move": san, "fen_after": fen_after,
                "reply": reply, "fen_reply": fen_reply,
                # From your point of view, after his best answer.
                "eval": round(-r.get("eval", 0.0), 2),
                "line": r.get("pv_san", [])[:4],
                "steps": steps,
            })
    except Exception as e:
        print("preview error:", e)
        return jsonify({"error": "analysis failed"}), 500
    finally:
        if engine:
            try: engine.quit()
            except Exception: pass

    # Rank them so the player can compare — without being told what to play.
    if out:
        best = max(o["eval"] for o in out)
        for o in out:
            o["gap"] = round(best - o["eval"], 2)
    return jsonify({"candidates": out, "base_eval": base.get("eval", 0.0)})

# ══════════════════════════════════════════════════════════════════════════════
# PROGRESS — what the player is actually doing, measured over time.
#
# Solo games (no coach) are the honest signal: nobody is nudging you, so the
# blunder rate and the patterns you repeat are yours. Coached games are excluded
# from the rating estimate for exactly that reason.
# ══════════════════════════════════════════════════════════════════════════════

def _empty_stats():
    return {"solo": {"games": 0, "moves": 0, "blunders": 0, "mistakes": 0, "inaccuracies": 0,
                     "acpl_sum": 0.0, "elo_samples": []},
            "coached": {"games": 0, "moves": 0, "blunders": 0, "mistakes": 0, "inaccuracies": 0},
            "patterns": {}, "history": [], "daily": {}}

def get_stats(user):
    st = user.get("stats")
    if not st or "solo" not in st:
        return _empty_stats()
    base = _empty_stats()
    for k in base:
        if k not in st:
            st[k] = base[k]
    for k in base["solo"]:
        st["solo"].setdefault(k, base["solo"][k])
        st["coached"].setdefault(k, base["coached"].get(k, 0))
    return st

@app.route("/progress/record", methods=["POST"])
@login_required
def progress_record():
    """Fold one finished game into the player's long-term record."""
    d = request.get_json(force=True, silent=True) or {}
    user = get_user(current_user())
    if not user:
        return jsonify({"error": "Not logged in"}), 401
    st = get_stats(user)
    mode = "coached" if d.get("coached") else "solo"
    bucket = st[mode]
    bucket["games"] = bucket.get("games", 0) + 1
    bucket["moves"] = bucket.get("moves", 0) + int(d.get("moves") or 0)
    for k in ("blunders", "mistakes", "inaccuracies"):
        bucket[k] = bucket.get(k, 0) + int(d.get(k) or 0)
    if mode == "solo":
        acpl = float(d.get("acpl") or 0)
        bucket["acpl_sum"] = bucket.get("acpl_sum", 0.0) + acpl
        est = int(d.get("est_elo") or 0)
        if est:
            bucket["elo_samples"] = (bucket.get("elo_samples") or [])[-19:] + [est]
    for pat in (d.get("patterns") or [])[:8]:
        if isinstance(pat, str):
            st["patterns"][pat] = st["patterns"].get(pat, 0) + 1
    st["history"] = (st.get("history") or [])[-29:] + [{
        "d": time.strftime("%Y-%m-%d"), "mode": mode,
        "blunders": int(d.get("blunders") or 0), "acpl": round(float(d.get("acpl") or 0), 1),
        "elo": int(d.get("est_elo") or 0), "result": d.get("result") or "",
    }]
    st["daily"][time.strftime("%Y-%m-%d")] = st["daily"].get(time.strftime("%Y-%m-%d"), 0) + 1
    user["stats"] = st
    # The thinking profile used to be built from candidate reviews alone, so it
    # only knew about moves you happened to draw arrows for. A finished game is
    # evidence too -- and a coached game and a solo one say different things,
    # since one had someone asking questions and the other did not.
    gdims = {}
    for pat in (d.get("patterns") or [])[:8]:
        if not isinstance(pat, str):
            continue
        for k, v in _mistake_dims(pat, 200, "", coached=(mode == "coached")).items():
            g = gdims.setdefault(k, {"obs": 0, "hits": 0})
            g["obs"] += v["obs"]; g["hits"] += v["hits"]
    # A clean game is evidence in the other direction: observed, not hit.
    if int(d.get("blunders") or 0) == 0 and int(d.get("moves") or 0) >= 20:
        for k in ("board_vision", "threat_recognition", "evaluation_accuracy"):
            g = gdims.setdefault(k, {"obs": 0, "hits": 0})
            g["obs"] += 1
    if gdims:
        _fold_profile(user, gdims, "coached_games" if mode == "coached" else "solo_games")
    # XP for finishing a game. Solo pays more than coached because solo is the
    # honest test -- it is also the only mode the rating estimate trusts.
    granted = grant_xp(user, "game_solo" if mode == "solo" else "game_coached")
    if int(d.get("moves") or 0) >= 20 and int(d.get("blunders") or 0) == 0:
        granted += grant_xp(user, "clean_game")
    save_user(current_user(), user)
    return jsonify({"ok": True, "xp_granted": granted, "balance": xp_balance(user)})

@app.route("/progress/report")
@login_required
def progress_report():
    """Everything the Progress tab shows."""
    user = get_user(current_user())
    if not user:
        return jsonify({"error": "Not logged in"}), 401
    st = get_stats(user)
    solo, coached = st["solo"], st["coached"]

    sg = max(1, solo.get("games", 0))
    sm = max(1, solo.get("moves", 0))
    blunder_rate = round(solo.get("blunders", 0) / float(sm) * 100, 1)
    acpl = round(solo.get("acpl_sum", 0.0) / float(sg), 1)
    samples = solo.get("elo_samples") or []
    est_elo = int(sum(samples) / len(samples)) if samples else None
    # Confidence grows with solo games; ten is a fair read, thirty is solid.
    conf = min(100, int(solo.get("games", 0) / 30.0 * 100))

    trend = None
    hist = [h for h in (st.get("history") or []) if h.get("mode") == "solo" and h.get("acpl")]
    if len(hist) >= 6:
        half = len(hist) // 2
        early = sum(h["acpl"] for h in hist[:half]) / half
        late = sum(h["acpl"] for h in hist[half:]) / (len(hist) - half)
        trend = round(early - late, 1)          # positive = losing fewer centipawns

    pats = sorted(st.get("patterns", {}).items(), key=lambda kv: -kv[1])[:6]
    tp = get_thinking_profile(user)
    dims = []
    for key, label in THINKING_DIMENSIONS.items():
        dd = tp["dims"].get(key, {})
        if dd.get("obs"):
            dims.append({"label": label, "rate": round(dd["hits"] / float(dd["obs"]) * 100)})
    dims.sort(key=lambda r: -r["rate"])

    # One thing to do today, chosen from the strongest signal available.
    if pats:
        nudge = "Your most repeated mistake is %s. One drill today." % pats[0][0]
    elif solo.get("games", 0) < 3:
        nudge = "Play a game without the coach — that is what the rating estimate reads."
    elif blunder_rate > 4:
        nudge = "Blunders are the fastest thing to fix. Five seconds before every move."
    else:
        nudge = "Keep the streak going — one drill or one game today."

    return jsonify({
        "solo_games": solo.get("games", 0), "coached_games": coached.get("games", 0),
        "est_elo": est_elo, "confidence": conf,
        "blunder_rate": blunder_rate, "acpl": acpl, "trend": trend,
        "totals": {"blunders": solo.get("blunders", 0) + coached.get("blunders", 0),
                   "mistakes": solo.get("mistakes", 0) + coached.get("mistakes", 0),
                   "inaccuracies": solo.get("inaccuracies", 0) + coached.get("inaccuracies", 0)},
        "patterns": [{"name": k, "count": v} for k, v in pats],
        "thinking": dims[:5],
        "history": (st.get("history") or [])[-30:],   # the chart wants a trajectory, not a snapshot
        "xp": user.get("xp", 0), "plan": user.get("plan", "free"),
        "nudge": nudge,
    })

@app.route("/daily-nudge")
@login_required
def daily_nudge():
    """The one line shown on the Play screen — what to work on today."""
    user = get_user(current_user())
    if not user:
        return jsonify({"error": "Not logged in"}), 401
    st = get_stats(user)
    pats = sorted(st.get("patterns", {}).items(), key=lambda kv: -kv[1])
    tp = get_thinking_profile(user)
    worst = None
    for key, label in THINKING_DIMENSIONS.items():
        dd = tp["dims"].get(key, {})
        if dd.get("obs", 0) >= 3 and dd["hits"] / float(dd["obs"]) >= 0.5:
            worst = label
            break
    if worst:
        msg, tag = "Watch for this today: %s." % worst, "thinking"
    elif pats:
        msg, tag = "You keep repeating one mistake: %s." % pats[0][0], "pattern"
    elif st["solo"].get("games", 0) < 3:
        msg, tag = "Play one game without the coach so I can read your real level.", "solo"
    else:
        msg, tag = "Nothing repeating yet — keep playing and I will find the pattern.", "none"
    return jsonify({"message": msg, "tag": tag,
                    "streak": (user.get("training") or {}).get("streak", {}).get("count", 0)})

@app.route("/health")
def health():
    sf=find_stockfish()
    return jsonify({"status":"ok","stockfish":sf or "not found","depth":ANALYSIS_DEPTH})

if __name__ == "__main__":
    port=int(os.environ.get("PORT",5000))
    app.run(debug=False,host="0.0.0.0",port=port)
