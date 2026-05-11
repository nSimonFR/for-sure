# SPEC — for-sure

This is the authoritative specification for the **for-sure** monorepo as it is
currently implemented on `main`. It describes the HTTP surface, providers, data
contract, configuration, and invariants of the production combined connector at
`connectors/for-sure/`. Treat any disagreement between this document and the
source as a bug in this document.

---

## 1. Purpose

`for-sure` is a small set of "connectors" that bridge French neobank-style data
sources into [Sure](https://sure.am/) (a self-hosted Maybe Finance fork) via
the Lunchflow-style HTTP integration. The production binary, `for-sure`,
serves a **combined Swile + Sumeria** connector behind a single HTTP endpoint
on port `8340`. Sure pulls accounts, transactions, and balances from this
endpoint over plain HTTP (typically `127.0.0.1`) and presents the merged result
in its UI. A `services.for-sure` NixOS module runs it as a hardened systemd
service on the user's RPi5.

---

## 2. Repository layout

```
package.json                       # npm workspace root: workspaces = packages/*, connectors/*
package-lock.json                  # single canonical lockfile (used by Nix buildNpmPackage)

packages/
  lunchflow/                       # @for-sure/lunchflow — shared HTTP server, router, types
    src/{index,logger,router,server,types}.ts

connectors/
  for-sure/                        # PRODUCTION combined connector (bin: for-sure)
    flake.nix                      # exposes packages.default + nixosModules.default
    package.nix                    # buildNpmPackage from monorepo root, npmWorkspace=connectors/for-sure
    module.nix                     # NixOS module: services.for-sure
    package.json                   # bin: { for-sure: dist/index.js }
    src/
      index.ts                     # entrypoint: wires handlers, dispatches by ID prefix
      config.ts                    # shared env-derived config + API-key loader
      setup.ts                     # dispatcher for `--setup swile|sumeria`
      notify.ts                    # sendTelegram() helper (HTML parse mode)
      swile/{auth,client,config,setup,types}.ts
      swile/handlers/{accounts,transactions,balance,holdings,index}.ts
      sumeria/{auth,client,config,setup,types}.ts
      sumeria/handlers/{accounts,transactions,balance,holdings,index}.ts

  swile/                           # LEGACY — empty of source; only stale dist/ + node_modules/
                                   # Superseded by connectors/for-sure. Not built, not shipped.

scripts/                           # one-shot CSV import helpers for back-filling Sure (out of scope)
  lydia_csv_to_sure.py             # Lydia/Sumeria CSV → Sure import CSV
  batch_import.py                  # batch driver around the converter
  import_and_publish.rb            # Sure Rails console snippet
  publish_import.rb                # Sure Rails console snippet

.github/settings.yml               # repo metadata (probot/settings)
```

The npm workspaces resolve `@for-sure/lunchflow` (`packages/lunchflow`) inside
`connectors/for-sure` via a symlink in `node_modules`. The Nix package installs
the lunchflow `dist/` and `package.json` under
`$out/lib/for-sure/node_modules/@for-sure/lunchflow/` so the runtime resolution
works without `npm install`.

---

## 3. Surface area — HTTP API

The combined connector is a plain Node `http.createServer` (`packages/lunchflow/src/server.ts`).
It listens on `${HOST}:${PORT}` (defaults `127.0.0.1:8340`).

### 3.1 Routing rules

All routes are defined in `packages/lunchflow/src/router.ts`:

- **Method**: only `GET` is accepted. Anything else returns `404 {"error":"Not found"}`.
- **Path prefix**: all routes are mounted under `/api/v1`. Any other path returns
  `404 {"error":"Not found"}`.
- The `:accountId` segment is `decodeURIComponent`'d before dispatch so a colon in
  the prefix (`swile:...`, `sumeria:...`) survives URL encoding by clients.

### 3.2 Endpoints

| Method | Path                                       | Handler                | Success status |
| ------ | ------------------------------------------ | ---------------------- | -------------- |
| GET    | `/api/v1/accounts`                         | `handlers.getAccounts` | 200            |
| GET    | `/api/v1/accounts/:accountId/transactions` | `handlers.getTransactions(id)` | 200    |
| GET    | `/api/v1/accounts/:accountId/balance`      | `handlers.getBalance(id)` | 200         |
| GET    | `/api/v1/accounts/:accountId/holdings`     | `handlers.getHoldings(id)` | passthrough |

`holdings` returns the `RouteResult` the handler produces; for both Swile and
Sumeria this is `{ status: 501, body: { error: "Holdings not supported for <provider>" } }`.

### 3.3 Authentication

- If `FOR_SURE_API_KEY_FILE` is set (and readable, non-empty when trimmed), every
  request must carry header `x-api-key: <key>`. Mismatched or missing key →
  `401 {"error":"Unauthorized"}`.
- If `FOR_SURE_API_KEY_FILE` is empty / unset / resolves to empty after trim,
  authentication is disabled and any caller can hit the API. This is the
  default for local-only `127.0.0.1` binding.
- The key is read once and cached in process memory; the file is consulted on
  the first request after startup.

### 3.4 Response shapes

All response bodies are JSON. Field names are stable; types are the Lunchflow
contract from `packages/lunchflow/src/types.ts`.

```jsonc
// GET /api/v1/accounts
{
  "accounts": [
    { "id": "swile:<uuid>",       "name": "string", "balance": <number>, "currency": "EUR" },
    { "id": "sumeria:<emitterId>", "name": "string", "balance": <number>, "currency": "EUR" }
  ]
}

// GET /api/v1/accounts/:accountId/transactions
{
  "transactions": [
    {
      "id":        "string",
      "merchant":  "string",
      "date":      "ISO-8601-ish string from upstream",
      "amount":    <number>,   // signed; negative = debit
      "currency":  "EUR",
      "isPending": <boolean>
    }
  ]
}

// GET /api/v1/accounts/:accountId/balance
{
  "balance": { "amount": <number>, "currency": "EUR" }
}

// GET /api/v1/accounts/:accountId/holdings  (501 for both providers)
{ "error": "Holdings not supported for <provider>" }
```

### 3.5 Error shape

- Any unmatched route or method → `404 {"error":"Not found"}`.
- Account ID does not match any known prefix → `404` (`handlers.getTransactions/getBalance/getHoldings`
  throw `Error("Unknown account")` with `statusCode: 404`, but **the current
  server.ts converts every throw to `500`** — see §7 Failure modes for the
  precise behavior. Same for "Account not found" thrown by per-provider
  balance/transaction lookups.
- Any thrown error in a handler → `500 {"error":"Internal server error"}`,
  with the real cause logged as JSON to stdout.
- Holdings explicitly returns `501` via the `RouteResult` passthrough — this is
  the only non-200/non-404/non-500 status the server emits in normal operation.

### 3.6 Logging

`packages/lunchflow/src/logger.ts` writes single-line JSON to stdout per event:
```json
{"ts":"2026-05-11T...","level":"info","msg":"request","method":"GET","path":"/api/v1/accounts","status":200,"ms":42}
```
Errors carry `{"level":"error","msg":"request failed",...,"error":"<message>"}`.
There is no separate log file; systemd captures stdout to the journal.

---

## 4. Account ID conventions

The connector is **a router**, not a single provider. Sure sees one connector
but pulls from two upstreams; the discriminator is the **prefix on the
Lunchflow account id**.

| Prefix     | Source object                  | Example                                       |
| ---------- | ------------------------------ | --------------------------------------------- |
| `swile:`   | Swile wallet UUID              | `swile:6f2a8c1e-3b4d-4f5a-9b1c-2e8f7a6c5d3b`  |
| `sumeria:` | Sumeria account `emitter_id` (NOT `account_id`) | `sumeria:em_abc123...`         |

Routing happens in `connectors/for-sure/src/index.ts`:

1. `getAccounts` calls both providers in parallel, then prefixes each provider's
   IDs (`swile:<id>` / `sumeria:<id>`) before merging.
2. `getTransactions` / `getBalance` / `getHoldings` look at `accountId.startsWith("swile:")`
   vs `"sumeria:"`, strip the prefix, and forward to the matching provider's
   handler. Unknown prefix → throws `Error("Unknown account")` with `statusCode: 404`.

This is the single dispatching mechanism — there is no other registry.

---

## 5. Providers

### 5.1 Swile

**Auth flow.** OAuth Resource Owner Password Credentials grant against
`https://directory.swile.co/oauth/token`, with a hardcoded public `client_id`
extracted from the Swile web app (`SWILE_CLIENT_ID` in `swile/auth.ts`). Setup
(`for-sure --setup swile`) prompts for email + password, performs the password
grant, and if the response carries `error: "missing_authentication_code"` it
prompts for the email OTP and retries with `authentication_code`.

**Token storage.** `${SWILE_TOKEN_FILE}` or
`${FOR_SURE_DATA_DIR}/swile-tokens.json` (default
`/var/lib/for-sure/swile-tokens.json`). Mode `0600`. Format:
```jsonc
{
  "access_token":  "string",
  "refresh_token": "string",
  "expires_at":    <unix_seconds>
}
```
Writes are atomic via `<file>.tmp` + `rename`.

**Refresh semantics.** `getAccessToken` checks `expires_at - now <
REFRESH_MARGIN_SEC` (60s); if so it refreshes via
`grant_type=refresh_token`. A concurrent-refresh guard (`refreshPromise`)
ensures only one refresh runs at a time. `swileFetch` also reactively
refreshes on a 401 from the API and retries the original request **once**.

**Upstream API.** `https://neobank-api.swile.co/api`
- `GET /v0/wallets` → `{ wallets: SwileWallet[] }` — used for accounts + balance
- `GET /v3/user/operations?per=999999` → `{ items: SwileOperation[] }` — used for transactions

**Mapping → Lunchflow.**
- Accounts: filter to `type === "meal_voucher" && is_activated && !archived_at`,
  then `{ id: wallet.id, name: SWILE_ACCOUNT_NAME ?? wallet.label, balance: wallet.balance.value, currency: wallet.balance.currency.iso_3 }`.
  Swile balance is already in major-unit float here (no `/100`).
- Transactions: keep operations that have at least one `transaction` whose
  `wallet.uuid === accountId` and `status ∈ {CAPTURED, VALIDATED, REFUNDED}`,
  then `{ id: op.id, merchant: op.name, date: op.date, amount: op.amount.value / 100, currency: op.amount.currency.iso_3, isPending: false }`.
  Transactions are emitted as **always settled** (`isPending: false`) and
  amounts are divided by 100 (Swile transaction amounts are in cents).
- Balance: looked up via `wallets.find(w => w.id === accountId)`; throws
  `Error("Account not found")` with `statusCode: 404` if absent.
- Holdings: unsupported → `{ status: 501, body: { error: "Holdings not supported for Swile" } }`.

### 5.2 Sumeria

**Auth flow.** No OAuth; Sumeria is treated as opaque static session headers
captured **out-of-band** from the iOS app via an mitmproxy ("sumeria-mitm")
service that lives outside this repo. Setup (`for-sure --setup sumeria`)
prompts for the three header values and writes the token file, but on the RPi5
the file is normally written by the external `sumeria-mitm` service when the
user opens the Sumeria iOS app through the RPi5 exit node.

**Token storage.** `${SUMERIA_TOKEN_FILE}` or
`${FOR_SURE_DATA_DIR}/sumeria-tokens.json`. The production deployment points
this at `/var/lib/sumeria-mitm/tokens.json` (written by the external service).
Format:
```jsonc
{
  "auth_token":   "32-hex string, static device credential",
  "public_token": "static device identifier",
  "access_token": "long-lived session token (base64-ish)"
}
```

**Refresh semantics.** **There is none.** Tokens expire (~3h per the user's
memory) and are refreshed externally. On a 401 from the upstream API the
connector:
1. Sends a Telegram alert: `"⚠️ for-sure / Sumeria: tokens expired (401) — enable RPi5 exit node on iPhone and open the Sumeria app to auto-refresh."`
2. Throws an `Error` that propagates to the request as a `500`.

If the token file is missing entirely (`ENOENT`), an analogous Telegram alert
fires before the read throws.

**Upstream API.** `https://api.lydia-app.com` (Sumeria is the rebranded Lydia
banking app).
- `GET /accounts` → `{ items: SumeriaAccount[] }` — used for accounts + balance
- `POST /history/_search` with an Elasticsearch-style body filtering by
  `emitter.id` / `receiver.id` and excluding `selfPayment`, `aispis_transaction`,
  `purpose:"savings:roundings"`. `size: 999`. Used for transactions.

The connector spoofs the iOS LYDIA client by setting all five upstream-required
headers in `sumeria/client.ts`: `auth_token`, `public_token`, `access-token`,
`Authorization: Bearer <access_token>`, plus `user-agent`, `app_version`,
`phone_os`, `x-app-source`.

**Mapping → Lunchflow.**
- Accounts: `{ id: account.emitter_id, name: account.display_name, balance: parseFloat(account.balance), currency: account.currency || "EUR" }`.
  Sumeria returns `balance` as a string; `parseFloat` converts to number.
  **`emitter_id` is the account identity used everywhere downstream** — never
  `account_id`.
- Transactions: `{ id: tx.id, merchant: tx.title, date: tx.created_at, amount: tx.amount, currency: "EUR", isPending: !(status ∈ {settled, done, completed}) }`.
  Sumeria amounts are already signed major-unit floats; no `/100`.
- Balance: looked up via `accounts.find(a => a.emitter_id === accountId)`;
  throws `Error("Account not found")` with `statusCode: 404` if absent.
- Holdings: unsupported → `{ status: 501, body: { error: "Holdings not supported for Sumeria" } }`.

---

## 6. Configuration

### 6.1 Environment variables (consumed by the connector)

| Variable                  | Default                              | Purpose                                                                    |
| ------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| `PORT`                    | `8340`                               | TCP port to bind                                                           |
| `HOST`                    | `127.0.0.1`                          | Bind address                                                               |
| `FOR_SURE_DATA_DIR`       | `/var/lib/for-sure`                  | Base directory for default token file paths                                |
| `FOR_SURE_API_KEY_FILE`   | unset (auth disabled)                | Path to API key file. If relative, resolved against `$CREDENTIALS_DIRECTORY` |
| `CREDENTIALS_DIRECTORY`   | unset                                | systemd credentials base dir (read by `config.ts` only for API-key resolution) |
| `SWILE_TOKEN_FILE`        | `${FOR_SURE_DATA_DIR}/swile-tokens.json` | Swile OAuth token file (rw by service)                                  |
| `SWILE_ACCOUNT_NAME`      | unset                                | Override Swile wallet label in `name` field of `/accounts` response        |
| `SUMERIA_TOKEN_FILE`      | `${FOR_SURE_DATA_DIR}/sumeria-tokens.json` | Sumeria session-headers file (read-only by service in production)    |
| `TELEGRAM_BOT_TOKEN_FILE` | unset (alerts disabled)              | Path to file containing the Telegram bot token                             |
| `TELEGRAM_CHAT_ID`        | unset (alerts disabled)              | Chat ID for token-expiry alerts                                            |

If `TELEGRAM_BOT_TOKEN_FILE` or `TELEGRAM_CHAT_ID` is unset, `sendTelegram`
silently no-ops. Both must be present for alerts to fire.

### 6.2 NixOS module (`services.for-sure`)

`connectors/for-sure/module.nix` exposes:

- `enable`
- `port` (default `8340`)
- `host` (default `127.0.0.1`)
- `dataDir` (default `/var/lib/for-sure`, tmpfiles-managed at `0700 for-sure:for-sure`)
- `apiKeyFile` (required string; path to API key file)
- `swile.accountName` (nullable string)
- `sumeria.tokenFile` (nullable string; points at the externally-written file)
- `telegram.botTokenFile` (nullable string)
- `telegram.chatId` (nullable string)

The module creates a `for-sure` system user/group, makes `dataDir` writable,
and starts `systemd.services.for-sure` with `ExecStart =
${pkg}/bin/for-sure`, `Restart = on-failure`, `RestartSec = 10`, and the env
variables above. It does **not** declare the API-key or Telegram-token files
as systemd credentials — they are referenced by absolute path.

### 6.3 Expected on-disk layout (production)

```
/var/lib/for-sure/                          0700 for-sure:for-sure
  swile-tokens.json                         rw by service (atomic rename)
/var/lib/sumeria-mitm/tokens.json           written by external sumeria-mitm service, read by for-sure
/run/agenix/for-sure-api-key                read by service via FOR_SURE_API_KEY_FILE
/run/agenix/telegram-bot-token              read by service via TELEGRAM_BOT_TOKEN_FILE
```

The specific agenix paths are deployment policy, not code-enforced — only that
files at the configured paths exist and are readable by the `for-sure` user.

---

## 7. Failure modes

### 7.1 Server-level

- **Auth header mismatch** (when API key is configured) → `401 Unauthorized`.
- **Unknown route or non-GET method** → `404 Not found`.
- **Any handler throw** is caught by `server.ts` and returned as
  `500 Internal server error`. **The `statusCode` property on thrown errors is
  not honored**; even errors that semantically mean "404" become `500` over
  the wire. The cause is logged as JSON (level `error`, msg `request failed`).
  Downstream callers must not depend on body-level error codes beyond the HTTP
  status.

### 7.2 Swile

- **401 from upstream** → one automatic refresh + retry. If refresh succeeds
  the request continues transparently. If refresh fails, the refresh error
  propagates and the request becomes a `500`.
- **Refresh failure** (e.g. revoked refresh token) → error like
  `Token refresh failed (<status>): <body>` is thrown. No Telegram alert is
  sent for Swile (only Sumeria has the alert path).
- **Missing token file** → `ENOENT` from `readFile` propagates as `500`. No
  alert. Setup must be re-run.

### 7.3 Sumeria

- **Missing token file** (`ENOENT`) → Telegram alert "token file missing"
  before the `ENOENT` is rethrown to the caller.
- **401 from upstream** → Telegram alert "tokens expired (401)", request
  becomes a `500`. The connector does not attempt to refresh; the user must
  re-run the iOS app through the RPi5 exit node so the external
  `sumeria-mitm` service rewrites the token file.
- **Other non-2xx** → `Error("Sumeria API error (<status>): <body>")` thrown;
  becomes a `500`.

### 7.4 Account-not-found

For both providers, balance lookups that don't find a matching account throw
`Error("Account not found")` with `statusCode: 404`. As noted above, the
server currently surfaces this as `500`.

---

## 8. Non-goals / out of scope

- **Holdings / investments.** Both providers return 501. Sure may probe the
  endpoint; do not implement it unless an upstream signal exists.
- **POST / PUT / DELETE.** The connector is read-only. Any state changes to
  Swile/Sumeria are explicitly out of scope.
- **Sumeria OAuth or self-refresh.** Token capture lives in the external
  `sumeria-mitm` service, not here. See `connectors/for-sure/src/sumeria/auth.ts`
  comments.
- **Multi-tenant operation.** One running connector = one Swile account + one
  Sumeria account. There is no per-request user / org context.
- **CSV import path.** `scripts/*.py` and `scripts/*.rb` exist for one-shot
  historical CSV imports straight into Sure; they neither call nor are called
  by the connector.
- **The legacy `connectors/swile/` directory.** Source has been removed; only
  stale `dist/` and `node_modules/` remain. Do not edit it; do not depend on
  it. It will be deleted in a future cleanup.
- **TLS.** The server is plain HTTP. Reverse proxies (e.g. Tailscale Serve,
  nginx) are expected to provide TLS termination if needed.

---

## 9. Invariants

These must remain true. Changes that violate them are breaking for Sure.

1. **Account-id prefix is the routing key.** Every account id returned by
   `GET /api/v1/accounts` starts with `swile:` or `sumeria:`, and the same
   prefix is what the server uses to dispatch subsequent
   `transactions` / `balance` / `holdings` calls. Sure must echo the id
   verbatim.
2. **Prefix segment is opaque to Sure.** The substring after `swile:` is a
   Swile wallet UUID; after `sumeria:` is a Sumeria `emitter_id` (NOT
   `account_id`). Both are upstream-stable identifiers — Sure does not parse
   them.
3. **Only `GET` under `/api/v1/`.** Adding new methods or moving the prefix is
   a breaking change.
4. **JSON wrapping shape is stable.** `{ accounts: [...] }`,
   `{ transactions: [...] }`, `{ balance: {...} }`. Do not flatten to a bare
   array.
5. **Currency precision.** Lunchflow amounts are signed major-unit numbers
   (negative = debit). Swile divides operation amounts by 100; Sumeria does
   not (its API already gives major-unit floats). New providers must convert
   to the same convention.
6. **Token-file writes are atomic.** Use `<file>.tmp` + `rename` (see
   `swile/auth.ts`, `sumeria/auth.ts`). Never write the destination path
   directly.
7. **Swile `client_id` is public, not a secret.** It identifies the Swile
   web app, not the user. Do not move it to a secret store.
8. **API-key auth is opt-in via file presence.** Empty / unset
   `FOR_SURE_API_KEY_FILE` ⇒ no auth. This is intentional for the
   `127.0.0.1`-only default binding.
9. **Logging is single-line JSON to stdout.** Anything else breaks journald
   structured logging.
10. **The single source of identity is npm workspaces + the root lockfile.**
    Adding a connector means: a new `connectors/<name>/` workspace and a
    corresponding mapping branch in `connectors/for-sure/src/index.ts`. Do
    **not** spin up a second HTTP server.

---

## 10. Build & runtime topology

- **Toolchain.** Node + npm workspaces. Single `package-lock.json` at the
  repo root. TypeScript project references link
  `connectors/for-sure` → `packages/lunchflow`.
- **Build order.** `npm run build -w packages/lunchflow` then
  `npm run build -w connectors/for-sure`. Both emit ESM to `dist/`.
- **Nix package.** `connectors/for-sure/flake.nix` exposes
  `packages.${aarch64-linux}.default` (the `for-sure` binary, a `node`
  wrapper around `dist/index.js`) and `nixosModules.default`
  (`services.for-sure`). `package.nix` invokes `buildNpmPackage` against the
  monorepo root with `npmWorkspace = "connectors/for-sure"` and a pinned
  `npmDepsHash`.
- **Runtime topology.** One systemd unit (`for-sure.service`) binding
  `127.0.0.1:8340`. Sure points at `http://127.0.0.1:8340/api/v1` via a single
  Lunchflow integration. The four exposed Lunchflow accounts (1 Swile + 3-5
  Sumeria, depending on user) are merged into Sure's account list under one
  source.
