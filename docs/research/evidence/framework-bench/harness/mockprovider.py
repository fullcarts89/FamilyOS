"""File-backed fake email provider. Never touches a network. Counts deliveries."""
import json, os, time
def send(path, to, body, idem=None, fail_first=0):
    state = path + ".attempts"
    n = int(open(state).read()) if os.path.exists(state) else 0
    open(state, "w").write(str(n + 1))
    if n < fail_first:
        raise TimeoutError("provider timeout (injected)")
    rows = [json.loads(l) for l in open(path)] if os.path.exists(path) else []
    if idem and any(r.get("idem") == idem for r in rows):
        return {"id": "dedup", "dedup": True}
    with open(path, "a") as f:
        f.write(json.dumps({"to": to, "body": body, "idem": idem, "t": time.time()}) + "\n")
        f.flush(); os.fsync(f.fileno())
    return {"id": f"msg-{len(rows)+1}"}
def count(path):
    return sum(1 for _ in open(path)) if os.path.exists(path) else 0
def rows(path):
    return [json.loads(l) for l in open(path)] if os.path.exists(path) else []
