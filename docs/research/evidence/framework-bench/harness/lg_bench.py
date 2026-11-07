"""LangGraph evaluation harness: mocked tools, no LLM, no network. Throwaway."""
import json, os, sys, sqlite3
from typing import TypedDict, Optional
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mockprovider as mp
from langgraph.graph import StateGraph, END
from langgraph.types import interrupt, Command, RetryPolicy
from langgraph.checkpoint.sqlite import SqliteSaver

W = os.environ["W"]; SENDS = f"{W}/sends.jsonl"; DB = f"{W}/lg.sqlite"
USE_IDEM = os.environ.get("USE_IDEM") == "1"
CRASH = os.environ.get("CRASH_AFTER_SEND") == "1"
FAIL_FIRST = int(os.environ.get("FAIL_FIRST", "0"))
RETRIES = int(os.environ.get("RETRIES", "1"))
VARIANT = os.environ.get("VARIANT", "v1")
DUR = os.environ.get("DUR", "sync")

class S(TypedDict, total=False):
    request: str; draft: str; to: str; approved: bool; external_ref: str; reply: str; status: str

def bump(name):
    p = f"{W}/{name}.count"; n = int(open(p).read()) if os.path.exists(p) else 0
    open(p, "w").write(str(n + 1))

def plan(s): return {"status": "planned"}
def research(s): return {"to": "vendor@example.test", "status": "researched"}
def draft(s): return {"draft": "Hi, can you quote gutter cleaning at 12 Elm St?", "status": "drafted"}
def approval(s):
    bump("pre_interrupt_effect")                 # stands in for "notify approver"
    d = interrupt({"action": "send", "to": s["to"], "payload": s["draft"]})
    return {"approved": d == "approved", "status": "approved" if d == "approved" else "rejected"}
def send_email(s):
    r = mp.send(SENDS, s["to"], s["draft"], idem="run1:send" if USE_IDEM else None, fail_first=FAIL_FIRST)
    if CRASH: os._exit(137)                      # killed after provider ack, before checkpoint
    return {"external_ref": r["id"], "status": "awaiting_external"}
def await_reply(s):
    return {"reply": interrupt({"awaiting": "vendor_reply"})}
def verify(s):
    return {"status": "booked_pending_user_confirmation" if "confirm" in (s.get("reply") or "").lower() else "needs_review"}

def build(cp):
    g = StateGraph(S)
    appr_name = "approval" if VARIANT == "v1" else "approval_v2"
    g.add_node("plan", plan); g.add_node("research", research); g.add_node("draft", draft)
    g.add_node(appr_name, approval)
    g.add_node("send", send_email, retry_policy=RetryPolicy(max_attempts=RETRIES, initial_interval=0.01, retry_on=TimeoutError))
    g.add_node("await_reply", await_reply); g.add_node("verify", verify)
    g.set_entry_point("plan"); g.add_edge("plan", "research"); g.add_edge("research", "draft"); g.add_edge("draft", appr_name)
    g.add_conditional_edges(appr_name, lambda s: "send" if s.get("approved") else END, {"send": "send", END: END})
    g.add_edge("send", "await_reply"); g.add_edge("await_reply", "verify"); g.add_edge("verify", END)
    return g.compile(checkpointer=cp)

def main():
    cmd, thread = sys.argv[1], sys.argv[2]; arg = sys.argv[3] if len(sys.argv) > 3 else None
    conn = sqlite3.connect(DB, check_same_thread=False); cp = SqliteSaver(conn); cp.setup()
    g = build(cp); cfg = {"configurable": {"thread_id": thread}}
    if cmd == "start": g.invoke({"request": "clean gutters"}, cfg, durability=DUR)
    elif cmd == "resume": g.invoke(Command(resume=arg), cfg, durability=DUR)
    elif cmd == "reinvoke": g.invoke(None, cfg, durability=DUR)
    elif cmd == "tamper": g.update_state(cfg, {"draft": arg, "to": "attacker@example.test"})
    elif cmd == "resume_stale":
        # resume keyed to an interrupt id captured earlier
        g.invoke(Command(resume={arg: "approved"}), cfg, durability=DUR)
    st = g.get_state(cfg)
    print(json.dumps({"values": st.values, "next": list(st.next),
        "interrupts": [{"id": i.id, "value": i.value} for t in st.tasks for i in t.interrupts]}))
main()
