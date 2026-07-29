"""Verify the premove FEN side-flip trick the JS fix relies on, using python-chess
as a stand-in for chess.js: flipping side-to-move must yield a loadable position
and sensible targets for the player's pieces."""
import chess

def premove_targets(fen, player_color, square):
    parts = fen.split(' ')
    parts[1] = player_color
    parts[3] = '-'
    try:
        b = chess.Board(' '.join(parts))
    except ValueError:
        return None
    sq = chess.parse_square(square)
    pc = b.piece_at(sq)
    if not pc or (pc.color == chess.WHITE) != (player_color == 'w'):
        return None
    return sorted(chess.square_name(m.to_square) for m in b.legal_moves if m.from_square == sq)

cases = [
    # (label, fen, player, square, expect_nonempty)
    ("start, black to move, white premoves e2", chess.STARTING_FEN.replace(" w ", " b "), 'w', 'e2', True),
    ("start, black to move, white knight g1",   chess.STARTING_FEN.replace(" w ", " b "), 'w', 'g1', True),
    ("opponent piece -> None",                  chess.STARTING_FEN.replace(" w ", " b "), 'w', 'e7', False),
    ("empty square -> None",                    chess.STARTING_FEN.replace(" w ", " b "), 'w', 'e4', False),
]
ok = True
for label, fen, col, sq, expect in cases:
    t = premove_targets(fen, col, sq)
    got = bool(t)
    status = "PASS" if got == expect else "FAIL"
    if got != expect: ok = False
    print(f"  [{status}] {label}: {t}")

# The important safety case: flipping the turn can make a position illegal
# (side not to move left in check). Must degrade to None, never raise.
illegal = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"  # white in check
try:
    r = premove_targets(illegal, 'b', 'h4')
    print(f"  [PASS] illegal flip degrades safely -> {r}")
except Exception as e:
    ok = False
    print(f"  [FAIL] illegal flip raised: {e}")

print("\nALL PASS" if ok else "\nFAILURES PRESENT")
