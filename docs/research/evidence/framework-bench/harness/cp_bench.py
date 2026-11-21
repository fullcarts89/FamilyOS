"""Control-plane baseline: deterministic state, approvals bound to a payload hash, outbox, event dedupe, tenant check.
SQLite stands in for Postgres. Throwaway, written by the evaluator, so its passes show design intent, not neutrality."""
import hashlib, json, os, sqlite3, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mockprovider as mp
W = os.environ["W"]; SENDS = f"{W}/sends.jsonl"; DB = f"{W}/cp.sqlite"
CRASH = os.environ.get("CRASH_AFTER_SEND") == "1"; PROVIDER_IDEM = os.environ.get("PROVIDER_IDEM") == "1"
c = sqlite3.connect(DB, isolation_level=None); c.row_factory = sqlite3.Row
c.executescript("""
create table if not exists run(id text primary key, household text, state text, draft text, recipient text, external_ref text);
create table if not exists approval(id text primary key, run text, household text, payload_hash text, status text);
create table if not exists outbox(idem text primary key, run text, status text, external_ref text);
create table if not exists event(id text primary key, run text, kind text, at real);
""")
def h(to, body): return hashlib.sha256(json.dumps([to, body]).encode()).hexdigest()
def ev(eid, run, kind):
    try: c.execute("insert into event values(?,?,?,?)", (eid, run, kind, time.time())); return True
    except sqlite3.IntegrityError: return False
def out(**k): print(json.dumps(k))
def start(run, hh):
    to, body = "vendor@example.test", "Can you quote gutter cleaning at 12 Elm St?"
    c.execute("insert into run values(?,?,?,?,?,null)", (run, hh, "awaiting_approval", body, to))
    c.execute("insert into approval values(?,?,?,?,?)", (run + ":a1", run, hh, h(to, body), "pending")); out(state="awaiting_approval")
def approve(run, hh, eid, shown_hash=None):
    r = c.execute("select * from run where id=?", (run,)).fetchone()
    if not r or r["household"] != hh: return out(error="not_found")      # same answer for missing and foreign
    if not ev(eid, run, "approve"): return out(ignored="duplicate_event", state=r["state"])
    a = c.execute("select * from approval where run=? and status='pending'", (run,)).fetchone()
    if not a: return out(error="no_pending_approval", state=r["state"])
    live = h(r["recipient"], r["draft"])
    if a["payload_hash"] != live or (shown_hash and shown_hash != live):
        c.execute("update approval set status='invalidated' where id=?", (a["id"],))
        c.execute("update run set state='blocked' where id=?", (run,)); return out(error="payload_changed_since_approval", state="blocked")
    c.execute("begin immediate")
    c.execute("update approval set status='approved' where id=?", (a["id"],))
    c.execute("insert or ignore into outbox values(?,?,?,null)", (run + ":send1", run, "pending"))
    c.execute("update run set state='sending' where id=?", (run,)); c.execute("commit"); deliver(run)
def deliver(run):
    r = c.execute("select * from run where id=?", (run,)).fetchone()
    o = c.execute("select * from outbox where run=?", (run,)).fetchone()
    if not o or o["status"] != "pending": return out(state=r["state"], outbox=o["status"] if o else None)
    c.execute("update outbox set status='sending' where idem=?", (o["idem"],))    # intent committed before the call
    res = mp.send(SENDS, r["recipient"], r["draft"], idem=o["idem"] if PROVIDER_IDEM else None)
    if CRASH: os._exit(137)
    c.execute("update outbox set status='sent', external_ref=? where idem=?", (res["id"], o["idem"]))
    c.execute("update run set state='awaiting_external', external_ref=? where id=?", (res["id"], run)); out(state="awaiting_external")
def recover():
    # An outbox row stuck in 'sending' means the outcome is unknown. Never blind-resend without provider idempotency.
    for o in c.execute("select * from outbox where status='sending'").fetchall():
        if PROVIDER_IDEM:
            c.execute("update outbox set status='pending' where idem=?", (o["idem"],)); deliver(o["run"])
        else:
            c.execute("update outbox set status='unknown' where idem=?", (o["idem"],))
            c.execute("update run set state='blocked' where id=?", (o["run"],)); out(state="blocked", reason="delivery_unknown_needs_human")
def reply(run, hh, eid, text):
    r = c.execute("select * from run where id=?", (run,)).fetchone()
    if not r or r["household"] != hh: return out(error="not_found")
    if r["state"] != "awaiting_external": return out(error="unexpected_event_for_state", state=r["state"])
    if not ev(eid, run, "reply"): return out(ignored="duplicate_event", state=r["state"])
    c.execute("update run set state='awaiting_user_confirmation' where id=?", (run,)); out(state="awaiting_user_confirmation")
def tamper(run, val): c.execute("update run set recipient=? where id=?", (val, run))
def state(run): out(state=c.execute("select state from run where id=?", (run,)).fetchone()["state"])
{"start": start, "approve": approve, "recover": recover, "reply": reply, "tamper": tamper, "state": state}[sys.argv[1]](*sys.argv[2:])
