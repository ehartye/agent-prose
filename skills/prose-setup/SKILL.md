---
name: prose-setup
description: Install, check and repair the managed agent-prose runtime (the prose CLI and its Node dependencies) outside the plugin cache.
when_to_use: Use before the first prose command in a session, after a plugin update, or when a prose skill reports "Managed CLI ... is missing", "rerun prose-setup", E_RUNTIME_MISSING, or a runtime version mismatch.
---
# prose-setup

The plugin cache holds source only. The `prose` CLI runs from a managed release in
`~/.agent-prose/releases/<version>-<fingerprint>-...` (override with `AGENT_PROSE_HOME`).
Skills always launch it through the plugin's checked launcher, never a `prose` on PATH:

    node "<plugin-root>/scripts/run-managed.js" <command> [args]

`<plugin-root>` is the directory two levels above this SKILL.md.

## Check

    node "<plugin-root>/scripts/setup.js" --check --json

Done when the JSON reports `"ok": true` and `cliVersion` equals `pluginVersion`.
`ok` describes the managed launcher and its dependencies. `linked`, `linkedVersion`
and `warnings` report the optional global command separately. A stale, missing or
uninspectable global link is advisory; it does not require repairing a healthy runtime.

## Install or repair

1. Confirm Node 24 or newer: `node --version`. The CLI runs TypeScript directly and refuses older Node.
2. Run `node "<plugin-root>/scripts/setup.js"`. It copies the runtime, runs `npm ci`, verifies the
   imports, writes a receipt and links the CLI. Use `--no-link` when repairing only
   the managed runtime or preserving the global command used by another session.
3. Run the check again and confirm `"ok": true`.
4. Smoke test: `node "<plugin-root>/scripts/run-managed.js" capabilities` prints JSON with `"name":"prose"`.

For PDF exports, run `node "<plugin-root>/scripts/setup.js" --pdf` to install the paired Chromium
headless shell under the managed home. Check with `--check --pdf --json`. Other exports need no browser.
On Linux, install Playwright's required system libraries separately if the browser cannot start.
`--no-link` combines with `--pdf`, `--check` and `--json`.

For validation, use a disposable `AGENT_PROSE_HOME` and `--no-link`; exercise the
checked launcher, not bare `prose`. When testing default linking, also scope
`npm_config_prefix` to a disposable directory. Both overrides are needed to isolate
setup on versions before 0.13.1, which have no `--no-link` option.

## When it fails

| Message | Fix |
|---|---|
| `Managed CLI x.y.z is missing` | Run step 2. |
| `Managed runtime modified or version mismatch` | Move the named release directory aside, then run step 2. |
| `Another setup may be running (...setup.lock)` | Confirm no setup process is running, delete the lock, rerun. |
| `needs Node 24 or newer` | Upgrade Node; do not work around it. |
| Optional global link/version warning | Continue with the checked launcher. Run setup without `--no-link` only if replacing the global command is intended. |
| `pathHint` in the report | Optional: add the directory to PATH for a bare `prose`. Skills do not need it. |

Never edit files inside a managed release; reinstall instead. `AGENT_PROSE_HOME` moves both the managed
runtime and the taste logs; to reinstall, remove `releases/<key>`, not the directory: it also holds the taste history.
