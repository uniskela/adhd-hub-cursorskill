# ADHD Hub — Cursor client plugin

**Public repo:** [github.com/uniskela/adhd-hub-cursorskill](https://github.com/uniskela/adhd-hub-cursorskill)

Connect Cursor to **your** self-hosted [ADHD Progress Hub](https://github.com/uniskela/adhd-hub): session continuity skills, project registry skill, env-check, an always-on Hub rule, and BYO Streamable HTTP MCP wiring.

This repository is a **single advanced Cursor plugin** at the repo root (skills + rules + `mcp.json`). It does not run a Hub server.

## Requirements

- A running ADHD Hub you operate ([Compose or `adhd-hub serve`](https://github.com/uniskela/adhd-hub))
- Cursor with Plugins / Marketplace support
- Network path from Cursor (or Cloud agents) to your Hub `/mcp` endpoint

## Install flow

Order is fixed: Hub first, then plugin, then MCP credentials, then verify.

### 1. Run Hub

Follow [uniskela/adhd-hub](https://github.com/uniskela/adhd-hub) install. Set a strong `ADHD_HUB_AUTH_TOKEN` on the server. Confirm health:

```bash
curl -sS "$ADHD_HUB_BASE_URL/api/health"
```

### 2. Install this plugin

- **Marketplace** (once published): install **ADHD Hub** from Cursor Marketplace, or
- **Local / dev**: install this repository’s root as a Cursor plugin and enable it for the workspace.

### 3. Configure MCP variables

In Cursor **Plugins → Configure** (or install-time prompts), set:

| Variable | Value |
|----------|--------|
| `ADHD_HUB_MCP_URL` | `{base}/mcp` (e.g. `http://127.0.0.1:8787/mcp` or Tailscale HTTPS) |
| `ADHD_HUB_AUTH_TOKEN` | Same bearer token as the Hub server `ADHD_HUB_AUTH_TOKEN` |

Do not commit tokens or private URLs with credentials. Plugin-managed MCP config is read-only aside from these variables.

**Security**

- Prefer `https://` when traffic leaves loopback / private LAN / Tailscale.
- Plain `http://` only for loopback, Docker network, or an operator-controlled private link.
- Never paste the token into skills, rules, or progress notes.

**Cloud agents:** localhost on your laptop is not reachable from Cursor Cloud. Use a Hub URL reachable from the agent network (Tailscale or public HTTPS with a strong token).

### 4. Verify

- Cursor MCP shows server `adhd-hub` connected (tools such as `resolve_project`, `session_digest`).
- Skills available: `adhd-hub-session`, `adhd-hub-projects`, `env-check`.
- Rule `adhd-hub` is present (always-apply).
- Optional: from the plugin install root, `bash skills/env-check/scripts/check_runtime.sh` prints `RUNTIME_ENV: …`.
- Smoke: ask the agent to `resolve_project` for the current workspace. On failure, expect a first-line Hub-down warning (no invented continuity).

## What ships

| Component | Path |
|-----------|------|
| Manifest | `.cursor-plugin/plugin.json` |
| MCP (HTTP + variables) | `mcp.json` |
| Rule | `rules/adhd-hub.mdc` |
| Skills | `skills/adhd-hub-session`, `skills/adhd-hub-projects`, `skills/env-check` |
| Logo | `assets/logo.svg` |
| Validator | `scripts/validate-template.mjs` |

**Not shipped:** agents, commands, hooks, Graphify, Hub app source, or a stdio MCP entry.

### Optional local stdio (documented only)

Hub supports `adhd-hub mcp-stdio` for advanced local-only setups (no bearer header; same tool catalog). This Marketplace plugin configures **Streamable HTTP + variables** only so remote/Tailscale/Cloud agents can reach a persistent Hub. For project-level MCP patterns used inside the Hub repo, see upstream [`adapters/cursor-mcp.json`](https://github.com/uniskela/adhd-hub/blob/main/adapters/cursor-mcp.json) (`${env:…}` syntax) — do not confuse that with this plugin’s `${VAR}` variables.

## Validate locally

```bash
node scripts/validate-template.mjs
```

Expect `Validation passed.`

## Upstream sync

Skills and the Hub rule are mirrored from [uniskela/adhd-hub](https://github.com/uniskela/adhd-hub) with path/link adaptations for Marketplace packaging. **Hub is the source of truth** — do not hand-edit mirrored skill/rule bodies here except for packaging emergencies. Sync is automated from Hub via GitHub Actions and opens a PR on this repo (never direct-pushes `main`). Contributor docs: [Cursor plugin skill sync](https://github.com/uniskela/adhd-hub/blob/main/docs/cursor-plugin-skill-sync.md).

| Field | Value |
|-------|--------|
| Upstream commit | `fd88f6a47401d2ca776c039231ad88a9f31009de` |
| `hub_skill_version` (session / projects) | `3` |
| `hub_skill_version` (env-check) | `1` |
| `hub_guidance_version` (rule) | `4` |


## License

MIT — Copyright (c) 2026 ADHD Hub contributors. See [LICENSE](LICENSE).
