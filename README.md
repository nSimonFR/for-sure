# for-sure for-sure

My connectors and script for [sure finance](https://sure.am/) !

Be sure to check https://github.com/nSimonFR/sure-nix too !

## Layout

```
package.json                       # npm workspace root (workspaces: packages/*, connectors/*)
packages/lunchflow/                # shared HTTP server + router + types (@for-sure/lunchflow)
connectors/for-sure/               # combined Swile + Sumeria connector, ships the `for-sure` bin
  flake.nix / package.nix          # buildNpmPackage from the monorepo root
  module.nix                       # NixOS module: services.for-sure
  src/{config,index,notify,setup}.ts
  src/swile/{auth,client,config,setup,types,handlers/*}.ts
  src/sumeria/{auth,client,config,setup,types,handlers/*}.ts
scripts/                           # Python + Ruby one-shot CSV import helpers for Sure
```

The combined connector listens on **port 8340** by default and exposes the
Lunchflow REST surface (`GET /api/v1/accounts`, `/accounts/:id/transactions`,
`/accounts/:id/balance`, `/accounts/:id/holdings`). Account IDs are prefixed —
`swile:<wallet_uuid>` or `sumeria:<emitter_id>` — and dispatched inside
`connectors/for-sure/src/index.ts`.

## Setup for AI coding agents

This is the orientation map for someone (human or LLM) sitting down with
the repo for the first time.

### Toolchain

- **Node.js** + **npm workspaces** (no pnpm, no yarn). The root `package.json`
  is private and declares `workspaces: ["packages/*", "connectors/*"]`.
- **TypeScript** (project references — `packages/lunchflow` is referenced by
  `connectors/for-sure/tsconfig.json`).
- **tsx** for dev runs.
- **Nix** flake under `connectors/for-sure/` for the production build /
  NixOS module. There is **no root flake** — the only flake lives at
  `connectors/for-sure/flake.nix`.

### Install + build

From the repo root:

```sh
npm install                                   # hydrates node_modules for all workspaces
npm run build --workspace=packages/lunchflow  # build the shared lib first
npm run build --workspace=connectors/for-sure # then the connector
```

`build` is just `tsc --build` in both workspaces — the connector depends on
`@for-sure/lunchflow`'s compiled `dist/`, so always build the package
before the connector.

### Dev loop

```sh
cd connectors/for-sure
npm run dev      # tsx src/index.ts — watches nothing, restart manually
```

Useful env vars when running locally (mirrors `module.nix`):

| Var                       | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `PORT`                    | default `8340`                                                   |
| `HOST`                    | default `127.0.0.1`                                              |
| `FOR_SURE_DATA_DIR`       | where Swile token JSON lives, default `/var/lib/for-sure`        |
| `FOR_SURE_API_KEY_FILE`   | path to a file holding the `X-Api-Key` the server requires       |
| `SWILE_TOKEN_FILE`        | override for `<dataDir>/swile-tokens.json`                       |
| `SWILE_ACCOUNT_NAME`      | override the account label exposed to Sure                       |
| `SUMERIA_TOKEN_FILE`      | path to `sumeria-tokens.json` (written by the MITM service)      |
| `TELEGRAM_BOT_TOKEN_FILE` | optional, for 401/missing-token alerts                           |
| `TELEGRAM_CHAT_ID`        | optional, paired with `TELEGRAM_BOT_TOKEN_FILE`                  |

If `FOR_SURE_API_KEY_FILE` is unset/empty, the server skips the API-key check
(see `packages/lunchflow/src/server.ts`). Handy for local probes.

### Tests

There is no test runner — `npm test` fails with "Missing script". Don't add
one without asking. The smoke test is hitting the server:

```sh
curl -s -H "X-Api-Key: $(cat $FOR_SURE_API_KEY_FILE)" \
  http://127.0.0.1:8340/api/v1/accounts
```

### Nix build

```sh
cd connectors/for-sure
nix build                              # builds .#default (aarch64-linux / x86_64-linux)
./result/bin/for-sure                  # runs the bundled wrapper
```

`package.nix` builds the whole monorepo via `buildNpmPackage` and only
copies `connectors/for-sure/dist` + `packages/lunchflow/dist` into the
output. If you change `package-lock.json`, you'll need to bump
`npmDepsHash` — the failing build will print the expected hash.

### Swile auth (OAuth, self-refreshing)

- Public OAuth client_id is hardcoded in `src/swile/auth.ts` (extracted from
  Swile's web-app JS bundle).
- Token file: `<dataDir>/swile-tokens.json` (`{access_token, refresh_token,
  expires_at}`).
- One-time bootstrap (interactive — handles email OTP):

  ```sh
  node dist/index.js --setup swile
  ```

  On NixOS run it as the `for-sure` system user so the file ends up at
  `/var/lib/for-sure/swile-tokens.json` with the right ownership.
- The connector auto-refreshes when `expires_at` is within 60s, and on any
  401 from the Swile API (`src/swile/client.ts`).

### Sumeria auth (MITM-captured static headers)

Sumeria (api.lydia-app.com) has no public OAuth; the connector uses three
session headers (`auth_token`, `public_token`, `access-token`) lifted from
the iOS app via mitmproxy. They live in a JSON file the connector reads
read-only:

- Path: `$SUMERIA_TOKEN_FILE` (on the RPi5: `/var/lib/sumeria-mitm/tokens.json`,
  written by the separate `sumeria-mitm` service in `nic-os`).
- One-time interactive setup if you want to drop tokens in by hand:

  ```sh
  node dist/index.js --setup sumeria
  ```

- Tokens expire ≈ every 3h. On 401 (`src/sumeria/client.ts`) the connector
  fires a Telegram alert via `src/notify.ts` and throws — the fix is to
  enable the RPi5 exit node on the iPhone and open the Sumeria app, which
  lets the MITM service capture a fresh set.
- ENOENT on the token file also triggers a Telegram alert
  (`src/sumeria/auth.ts`).

### Adding a new connector

The combined connector under `connectors/for-sure/` is the model:

1. Create `connectors/<name>/` with `package.json` (depend on
   `@for-sure/lunchflow`) and `tsconfig.json` (reference
   `../../packages/lunchflow`).
2. Implement the four `LunchflowHandlers` (`getAccounts`,
   `getTransactions`, `getBalance`, `getHoldings` — see
   `packages/lunchflow/src/types.ts`).
3. Wire them up by calling `startServer(...)` from
   `@for-sure/lunchflow/server`.

If your connector should share the for-sure HTTP port instead of running
standalone, add a new `<name>:` ID prefix and dispatch inside
`connectors/for-sure/src/index.ts` (look at how `swile:` / `sumeria:`
already route through `withPrefix` / `strip`).

### Shared lunchflow package

`@for-sure/lunchflow` is a tiny lib, not a framework. The whole public
surface:

- `server.startServer(config, handlers)` — node:http server, API-key check,
  JSON logging, error handling.
- `router.createRouter(handlers)` — pure routing for `/api/v1/*`.
- `types.ts` — `LunchflowAccount`, `LunchflowTransaction`,
  `LunchflowBalance`, `LunchflowHandlers`, `RouteResult`.
- `logger.ts` — structured stdout logger.

Re-exported from the index so `import { startServer } from
"@for-sure/lunchflow"` works, but the connector imports the submodule
entry points (`@for-sure/lunchflow/server`, `/logger`, `/types`) to keep
the dep graph readable.

### Scripts

`scripts/*.py` and `scripts/*.rb` are ad-hoc CSV importers for Sumeria's
exported CSVs into Sure — they call the Sure API directly (`X-Api-Key`
header, default `http://127.0.0.1:13334`) and shell out to
`sure-rails runner` for the publish step. Not part of the connector
runtime.

### GitHub workflow

- **Account:** every `gh` / `git push` op MUST use `nSimonFR-ai`. Switch
  with `gh auth switch -u nSimonFR-ai` before touching the remote — the
  personal `nSimonFR` account is not allowed.
- Default branch is `main`; protected (see `.github/settings.yml`). Open
  a PR from a feature branch, don't push to `main`.
- Squash + merge-commit are disabled — **rebase merge only**.
- `delete_branch_on_merge: false` — clean up feature branches by hand.

### Commit style

Conventional-commit-ish, lowercase type + optional scope, imperative
subject, no trailing period. Real recent examples from `git log
--oneline`:

```
feat(for-sure): switch mitmproxy to transparent mode via Tailscale exit node
fix(for-sure): scope iptables REDIRECT to exitNodeClients IPs only
refactor(for-sure): remove MITM code, expose sumeria.tokenFile option
chore: remove old standalone swile connector, fix bugs in combined connector
docs(swile): add README
```

Types in use: `feat`, `fix`, `refactor`, `chore`, `docs`. Scope is the
affected piece — `for-sure`, `swile`, `router`, `build`. Keep subjects
under ~72 chars.
