"""OpenAI Agents SDK evaluation harness: fake Model, mocked tools, no network. Throwaway."""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mockprovider as mp
from agents import Agent, Runner, function_tool, set_tracing_disabled, RunState
from agents.items import ModelResponse
from agents.models.interface import Model
from agents.usage import Usage
from openai.types.responses import ResponseFunctionToolCall, ResponseOutputMessage, ResponseOutputText

set_tracing_disabled(True)
W = os.environ["W"]; SENDS = f"{W}/sends.jsonl"; STATE = f"{W}/state.json"
CRASH = os.environ.get("CRASH_AFTER_SEND") == "1"; FAIL_ALWAYS = os.environ.get("FAIL_ALWAYS") == "1"
TOOLNAME = os.environ.get("TOOLNAME", "send_vendor_email"); AGENTNAME = os.environ.get("AGENTNAME", "gutter")

@function_tool(name_override=TOOLNAME, needs_approval=True)
def send_vendor_email(to: str, body: str) -> str:
    """Send one email to a vendor."""
    if FAIL_ALWAYS: raise TimeoutError("provider timeout (injected)")
    r = mp.send(SENDS, to, body)
    if CRASH: os._exit(137)
    return json.dumps(r)

class Fake(Model):
    """First turn: request the send. Later turns: confidently claim success, whatever the tool returned."""
    async def get_response(self, system_instructions, input, model_settings, tools, output_schema, handoffs, tracing, *, previous_response_id, conversation_id, prompt):
        saw_output = isinstance(input, list) and any(isinstance(i, dict) and i.get("type") == "function_call_output" for i in input)
        if not saw_output:
            out = [ResponseFunctionToolCall(type="function_call", id="fc_1", call_id="call_1", name=TOOLNAME,
                    arguments=json.dumps({"to": "vendor@example.test", "body": "Can you quote gutter cleaning at 12 Elm St?"}), status="completed")]
        else:
            out = [ResponseOutputMessage(id="m1", type="message", role="assistant", status="completed",
                    content=[ResponseOutputText(type="output_text", text="Done: the vendor has been emailed.", annotations=[])])]
        return ModelResponse(output=out, usage=Usage(), response_id=None)
    def stream_response(self, *a, **k): raise NotImplementedError

agent = Agent(name=AGENTNAME, instructions="x", model=Fake(), tools=[send_vendor_email])

def report(r):
    print(json.dumps({"final_output": r.final_output, "interruptions": [{"name": getattr(i, "name", None), "args": getattr(i, "arguments", None)} for i in r.interruptions]}))

async def main():
    cmd = sys.argv[1]; arg = sys.argv[2] if len(sys.argv) > 2 else None
    if cmd == "start":
        r = await Runner.run(agent, "clean gutters")
        open(STATE, "w").write(r.to_state().to_string()); report(r)
    elif cmd == "approve":
        st = await RunState.from_string(agent, open(STATE).read())
        for it in st.get_interruptions(): st.approve(it)
        r = await Runner.run(agent, st); report(r)
    elif cmd == "reject":
        st = await RunState.from_string(agent, open(STATE).read())
        for it in st.get_interruptions(): st.reject(it)
        r = await Runner.run(agent, st); report(r)
    elif cmd == "tamper":
        s = open(STATE).read(); open(STATE, "w").write(s.replace("vendor@example.test", arg))
asyncio.run(main())
