# Building FamilyOS with Atomic Agent (Fusion mode)

Optional. This uses [Atomic Agent](https://github.com/AtomicBot-ai/atomic-agent) (MIT, developer preview, v0.7.0 when written) as a coding agent on your own computer. In **Fusion** mode a strong cloud model plans and reviews, and a local model on your machine does the bulk edits for free. Nothing here has been tried on a real machine yet; check each step with `/runmode status`.

## What runs where

| Role | Model | Cost |
|---|---|---|
| Planner (orchestrator), judge | Claude, through your signed-in `claude` CLI (`subscription-cli` provider) | Your Claude subscription, no API key |
| Workers | A local model served by `llama.cpp`, managed by Atomic Agent | $0; uses your RAM and GPU |

The code is read by the planner (Claude, as now) and by the local model. It is not sent anywhere else. Do not add cloud workers (OpenRouter and similar) without first checking that host's data policy: this repository is proprietary.

## Setup

1. **Install:** `curl -fsSL https://atomicagent.io/install | sh` (or a Linux package from its README). Read the script first if you prefer.
2. **Turn off analytics:** it is on by default. Add `export DO_NOT_TRACK=1` to your shell profile, or run `/privacy analytics off` in the TUI.
3. **Pick a local worker model:** `atomic-agent models recommend`. Its own guidance is Qwen 3.5 9B on a 16 GB Mac, Gemma 4 26B A4B on 32 GB, Qwen 3.6 35B A3B on 64 GB. On 16 GB the worker will be weak; use Fusion for small, well-specified tasks only.
4. **Add Claude as a provider:** make sure `claude` is installed and signed in. Then add it in the TUI provider wizard, or in `~/.atomic-agent/config.json`.
5. **Turn on Fusion:** `ctrl+r` → Fusion in the TUI, or `/runmode fusion`.

Reference config (merge into the existing file; do not replace it):

```json
{
  "analytics": { "enabled": false },
  "llm": {
    "activeTextProvider": "claude-cli",
    "providers": [
      { "id": "claude-cli", "kind": "subscription-cli", "defaultChatModel": "opus", "subscriptionCli": { "cli": "claude" } }
    ],
    "runMode": {
      "mode": "fusion",
      "fusion": {
        "orchestratorProvider": "claude-cli",
        "workerProvider": "local-llama",
        "workers": 2,
        "judge": "on",
        "isolation": "worktree",
        "autoReplan": 1,
        "turnTimeBudgetMs": 3600000
      }
    }
  }
}
```

- `judge: "on"`: each delegated task closes only on a passing checklist. Ask the planner to include `pnpm typecheck && pnpm lint && pnpm test` as a check.
- `isolation: "worktree"`: each worker edits its own git worktree, and the results are merged back. This keeps parallel workers from overwriting each other.
- `workers: 2`: a local machine serves workers from one model. More slots means less context per worker.

## Using it on this repository

Start it in the repository root: `cd FamilyOS && atomic-agent`. It loads `AGENTS.md`, which points to the execution brief and lists the rules.

**Good to delegate to workers:** domain-package tests, new mobile screens that follow existing ones, API routes that copy an existing route's pattern, fixtures and docs.

**Keep on the planner, or do it yourself:** migrations, grants and row-level security, authorization, auth and service logins (`AGENTS.md` says so too). Also avoid delegating anything whose failure would not be caught by a test.

Before you push, run the full checks yourself:

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

CI on the pull request is the final gate, whichever agent wrote the code.

## Expectations

The reel's "5x cheaper, 2x faster" is the vendor's own result on one generation task. On a subscription, the saving shows up as fewer Claude usage-limit hits rather than dollars. Measure it on a few real tasks before relying on it.
