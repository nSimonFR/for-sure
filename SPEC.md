# SPEC — for-sure

This is the authoritative specification for **for-sure** as it must behave on
the wire. It describes the contract: HTTP surface, providers, data shapes,
configuration, and invariants. The current implementation language and source
layout are **not** part of the contract; see the appendix for pointers into
the current codebase.

Treat any disagreement between this document and the source as a bug — first
in this document, then in the source. Known implementation deviations from
the contract are surfaced inline and tagged "Known current-implementation
bug".

---

## 1. Purpose

`for-sure` is a connector that bridges French neobank-style data sources
(currently **Swile** and **Sumeria**) into [Sure](https://sure.am/) (a
self-hosted Maybe Finance fork) via the Lunchflow-style HTTP integration.

The deployed binary runs a **combined Swile + Sumeria** connector behind a
single HTTP endpoint (default `127.0.0.1:8340`). Sure pulls accounts,
transactions, and balances from this endpoint over plain HTTP and presents
the merged result in its UI. A NixOS module runs it as a hardened systemd
service on the user's RPi5.

---

## 2. Surface area — HTTP API

The connector is a plain HTTP server listening on `${HOST}:${PORT}` (defaults
`127.0.0.1:8340`).

### 2.1 Routing rules

- **Method**: only `GET` is accepted. Anything else returns
  `404 {"error":"Not found"}`.
- **Path prefix**: all routes are mounted under `/api/v1`. Any other path
  returns `404 {"error":"Not found"}`.
- The `:accountId` segment is URL-decoded before dispatch so a colon in the
  prefix (`swile:...`, `sumeria:...`) survives URL encoding by clients.

### 2.2 Endpoints

| Method | Path                                       | Success status | Body shape (success)                  |
| ------ | ------------------------------------------ | -------------- | ------------------------------------- |
| GET    | `/api/v1/accounts`                         | 200            | `{ "accounts": [Account, ...] }`      |
| GET    | `/api/v1/accounts/:accountId/transactions` | 200            | `{ "transactions": [Transaction, ...] }` |
| GET    | `/api/v1/accounts/:accountId/balance`      | 200            | `{ "balance": Balance }`              |
| GET    | `/api/v1/accounts/:accountId/holdings`     | 501            | `{ "error": "Holdings not supported for <provider>" }` |

Holdings always returns `501` for both providers. It is not implemented; Sure
may probe it, and the connector must answer with the documented 501 body.

### 2.3 Authentication

- If `FOR_SURE_API_KEY_FILE` resolves to a non-empty (trimmed) key, every
  request must carry header `x-api-key: <key>`. Mismatched or missing key →
  `401 {"error":"Unauthorized"}`.
- If `FOR_SURE_API_KEY_FILE` is empty / unset / resolves to empty after trim,
  authentication is disabled and any caller can hit the API. This is the
  default for local-only `127.0.0.1` binding.
- The key may be read once and cached in process memory; callers cannot
  expect the file to be re-read between requests within a single process
  lifetime.

### 2.4 Response shapes

All response bodies are JSON. Field names and wrapping objects are stable
contract surface — clients (Sure) parse them by name.

```jsonc
// GET /api/v1/accounts
{
  "accounts": [
    { "id": "swile:<uuid>",        "name": "string", "balance": <number>, "currency": "EUR" },
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
      "amount":    <number>,   // signed major-unit; negative = debit
      "currency":  "EUR",
      "isPending": <boolean>
    }
  ]
}

// GET /api/v1/accounts/:accountId/balance
{
  "balance": { "amount": <number>, "currency": "EUR" }
}

// GET /api/v1/accounts/:accountId/holdings   (always 501)
{ "error": "Holdings not supported for <provider>" }
```

### 2.5 Error shape

- Any unmatched route or method → `404 {"error":"Not found"}`.
- An account-id that doesn't match a known provider prefix should be treated
  as **not found** (`404 {"error":"Not found"}` or similar 404 body). Same
  for a balance/transaction lookup against a known prefix but no matching
  account at the upstream.
- Any unexpected error during request handling → `500 {"error":"Internal
  server error"}`, with the real cause logged to stdout.
- Holdings explicitly returns `501` — this is the only non-200/non-404/non-500
  status the server emits in normal operation.

> **Known current-implementation bug.** Handlers signal "account not found" /
> "unknown account-id prefix" by raising errors that carry a `404` hint, but
> the current server converts every raised error into `500`. Over the wire,
> "not found" account-ids therefore surface as `500` today. The contract is
> still `404`; see implementation pointers for the fix site.

### 2.6 Logging

The connector writes single-line JSON to stdout per request:
```json
{"ts":"2026-05-11T...","level":"info","msg":"request","method":"GET","path":"/api/v1/accounts","status":200,"ms":42}
```
Errors carry `{"level":"error","msg":"request failed",...,"error":"<message>"}`.
There is no separate log file; the supervisor (systemd) captures stdout.

---

## 3. Account ID conventions

The connector is **a router**, not a single provider. Sure sees one connector
but pulls from two upstreams; the discriminator is the **prefix on the
Lunchflow account id**.

| Prefix     | Source object                  | Example                                       |
| ---------- | ------------------------------ | --------------------------------------------- |
| `swile:`   | Swile wallet UUID              | `swile:6f2a8c1e-3b4d-4f5a-9b1c-2e8f7a6c5d3b`  |
| `sumeria:` | Sumeria account `emitter_id` (NOT `account_id`) | `sumeria:em_abc123...`         |

Routing semantics:

1. `GET /accounts` fans out to both providers in parallel, then prefixes each
   provider's IDs (`swile:<id>` / `sumeria:<id>`) before merging into a
   single `accounts` array.
2. `GET /accounts/:accountId/{transactions,balance,holdings}` inspects the
   account-id prefix, strips it, and forwards to the matching provider's
   handler.
3. Unknown prefix → `404` (subject to the "Known current-implementation bug"
   noted in §2.5).

This is the single dispatching mechanism — there is no other registry.

---

## 4. Providers

### 4.1 Swile

**Auth flow.** OAuth 2.0 Resource Owner Password Credentials grant against
`https://directory.swile.co/oauth/token`, with a hardcoded public `client_id`
extracted from the Swile web app. Setup (`--setup swile`) prompts for email
+ password, performs the password grant, and if the response carries
`error: "missing_authentication_code"` it prompts for the email OTP and
retries with `authentication_code`.

**Token storage.** `${SWILE_TOKEN_FILE}` or
`${FOR_SURE_DATA_DIR}/swile-tokens.json` (default
`/var/lib/for-sure/swile-tokens.json`). Mode `0600`. JSON shape:
```jsonc
{
  "access_token":  "string",
  "refresh_token": "string",
  "expires_at":    <unix_seconds>
}
```
Writes are atomic via `<file>.tmp` + `rename`.

**Refresh semantics.**
- Proactive: if `expires_at - now < 60s`, refresh via
  `grant_type=refresh_token` before issuing the upstream call.
- Concurrent-refresh guard: at most one refresh runs at a time;
  concurrent callers wait for the in-flight refresh.
- Reactive: on a 401 from the upstream API, refresh once and retry the
  original request a single time.

**Upstream API.** `https://neobank-api.swile.co/api`
- `GET /v0/wallets` → `{ wallets: SwileWallet[] }` — used for accounts + balance
- `GET /v3/user/operations?per=999999` → `{ items: SwileOperation[] }` — used for transactions

**Mapping → Lunchflow.**
- **Accounts.** Filter to `type === "meal_voucher" && is_activated &&
  !archived_at`, then emit
  `{ id: wallet.id, name: SWILE_ACCOUNT_NAME ?? wallet.label,
     balance: wallet.balance.value, currency: wallet.balance.currency.iso_3 }`.
  Swile wallet balances are already in major-unit float (no `/100`).
- **Transactions.** Keep operations that have at least one constituent
  transaction whose `wallet.uuid === accountId` and whose `status` is one of
  `CAPTURED`, `VALIDATED`, `REFUNDED`, then emit
  `{ id: op.id, merchant: op.name, date: op.date,
     amount: op.amount.value / 100, currency: op.amount.currency.iso_3,
     isPending: false }`. Swile transaction amounts are in **minor units**
  (cents), so divide by 100. Transactions are always emitted as settled
  (`isPending: false`).
- **Balance.** Look up `wallets.find(w => w.id === accountId)`. Not found →
  404 (see §2.5).
- **Holdings.** Unsupported →
  `{ status: 501, body: { error: "Holdings not supported for Swile" } }`.

### 4.2 Sumeria

**Auth flow.** No OAuth. Sumeria is treated as opaque static session headers
captured **out-of-band** from the iOS app via an mitmproxy service
("sumeria-mitm") that lives outside this repo. Setup (`--setup sumeria`)
prompts for the three header values and writes the token file, but in
production the file is normally written by the external `sumeria-mitm`
service when the user opens the Sumeria iOS app through the RPi5 exit node.

**Token storage.** `${SUMERIA_TOKEN_FILE}` or
`${FOR_SURE_DATA_DIR}/sumeria-tokens.json`. The production deployment points
this at `/var/lib/sumeria-mitm/tokens.json` (written by the external
service). JSON shape:
```jsonc
{
  "auth_token":   "32-hex string, static device credential",
  "public_token": "static device identifier",
  "access_token": "long-lived session token (base64-ish)"
}
```

**Refresh semantics.** **There is none.** Tokens expire (~3h in practice)
and are refreshed externally. On a 401 from the upstream API the connector
must:
1. Send a Telegram alert: `"⚠️ for-sure / Sumeria: tokens expired (401) —
   enable RPi5 exit node on iPhone and open the Sumeria app to auto-refresh."`
2. Surface the failure as `500` to the caller.

If the token file is missing entirely, an analogous Telegram alert fires
before the read failure propagates.

**Upstream API.** `https://api.lydia-app.com` (Sumeria is the rebranded
Lydia banking app).
- `GET /accounts` → `{ items: SumeriaAccount[] }` — used for accounts + balance
- `POST /history/_search` with an Elasticsearch-style body filtering by
  `emitter.id` / `receiver.id` and excluding `selfPayment`,
  `aispis_transaction`, and `purpose:"savings:roundings"`. `size: 999`.
  Used for transactions.

The connector spoofs the iOS LYDIA client by setting all upstream-required
headers on every request: `auth_token`, `public_token`, `access-token`,
`Authorization: Bearer <access_token>`, plus `user-agent`, `app_version`,
`phone_os`, `x-app-source`.

**Mapping → Lunchflow.**
- **Accounts.**
  `{ id: account.emitter_id, name: account.display_name,
     balance: parseFloat(account.balance), currency: account.currency || "EUR" }`.
  Sumeria returns `balance` as a string; convert to number. **`emitter_id`
  is the account identity used everywhere downstream** — never `account_id`.
- **Transactions.**
  `{ id: tx.id, merchant: tx.title, date: tx.created_at,
     amount: tx.amount, currency: "EUR",
     isPending: !(status ∈ {settled, done, completed}) }`.
  Sumeria amounts are already signed major-unit floats; **no `/100`**.
- **Balance.** Look up `accounts.find(a => a.emitter_id === accountId)`.
  Not found → 404 (see §2.5).
- **Holdings.** Unsupported →
  `{ status: 501, body: { error: "Holdings not supported for Sumeria" } }`.

---

## 5. Configuration

### 5.1 Environment variables (consumed by the connector)

| Variable                  | Default                                    | Purpose                                                                          |
| ------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| `PORT`                    | `8340`                                     | TCP port to bind                                                                 |
| `HOST`                    | `127.0.0.1`                                | Bind address                                                                     |
| `FOR_SURE_DATA_DIR`       | `/var/lib/for-sure`                        | Base directory for default token file paths                                      |
| `FOR_SURE_API_KEY_FILE`   | unset (auth disabled)                      | Path to API key file. If relative, resolved against `$CREDENTIALS_DIRECTORY`     |
| `CREDENTIALS_DIRECTORY`   | unset                                      | systemd credentials base dir (read only for API-key path resolution)             |
| `SWILE_TOKEN_FILE`        | `${FOR_SURE_DATA_DIR}/swile-tokens.json`   | Swile OAuth token file (read/write by service)                                   |
| `SWILE_ACCOUNT_NAME`      | unset                                      | Override Swile wallet label in `name` field of `/accounts` response              |
| `SUMERIA_TOKEN_FILE`      | `${FOR_SURE_DATA_DIR}/sumeria-tokens.json` | Sumeria session-headers file (read-only by service in production)                |
| `TELEGRAM_BOT_TOKEN_FILE` | unset (alerts disabled)                    | Path to file containing the Telegram bot token                                   |
| `TELEGRAM_CHAT_ID`        | unset (alerts disabled)                    | Chat ID for token-expiry alerts                                                  |

If `TELEGRAM_BOT_TOKEN_FILE` or `TELEGRAM_CHAT_ID` is unset, the Telegram
alert path is a silent no-op. Both must be present for alerts to fire.

### 5.2 CLI entrypoints

- `<connector-bin>` (no args) — start the HTTP server.
- `<connector-bin> --setup swile` — interactive setup writing the Swile
  token file (email + password + optional OTP grant).
- `<connector-bin> --setup sumeria` — interactive setup writing the Sumeria
  token file. In production the file is normally provisioned externally
  instead.

### 5.3 NixOS module (`services.for-sure`)

The shipped NixOS module exposes:

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
and starts `systemd.services.for-sure` with `Restart = on-failure`,
`RestartSec = 10`, and the env variables above. It does **not** declare the
API-key or Telegram-token files as systemd credentials — they are referenced
by absolute path.

### 5.4 Expected on-disk layout (production)

```
/var/lib/for-sure/                          0700 for-sure:for-sure
  swile-tokens.json                         rw by service (atomic rename)
/var/lib/sumeria-mitm/tokens.json           written by external sumeria-mitm service, read by for-sure
/run/agenix/for-sure-api-key                read by service via FOR_SURE_API_KEY_FILE
/run/agenix/telegram-bot-token              read by service via TELEGRAM_BOT_TOKEN_FILE
```

The specific agenix paths are deployment policy, not enforced by the
connector — only that files at the configured paths exist and are readable
by the service user.

---

## 6. Failure modes

### 6.1 Server-level

- **Auth header mismatch** (when API key is configured) → `401 Unauthorized`.
- **Unknown route or non-GET method** → `404 Not found`.
- **Unexpected handler error** → `500 Internal server error`, with the cause
  logged as JSON. Callers must not depend on body-level error codes beyond
  the HTTP status.

### 6.2 Swile

- **401 from upstream** → one automatic refresh + retry. If refresh
  succeeds, the request continues transparently. If refresh fails, the
  refresh error propagates as `500`.
- **Refresh failure** (e.g. revoked refresh token) → surfaced as `500`. No
  Telegram alert (only Sumeria has the alert path). Setup must be re-run.
- **Missing token file** → `500`. No alert. Setup must be re-run.

### 6.3 Sumeria

- **Missing token file** → Telegram alert ("token file missing") before the
  underlying file-not-found surfaces as `500`.
- **401 from upstream** → Telegram alert ("tokens expired (401)"), request
  becomes `500`. The connector does not attempt to refresh; the user must
  re-run the iOS app through the RPi5 exit node so the external
  `sumeria-mitm` service rewrites the token file.
- **Other non-2xx** from upstream → `500`.

### 6.4 Account-not-found

For both providers, a balance/transactions lookup that doesn't find a
matching account at the upstream is contractually `404` (see §2.5 for the
current implementation bug surfacing it as `500`).

---

## 7. Non-goals / out of scope

- **Holdings / investments.** Both providers return 501. Sure may probe the
  endpoint; do not implement it unless an upstream signal exists.
- **POST / PUT / DELETE.** The connector is read-only. Any state changes to
  Swile/Sumeria are explicitly out of scope.
- **Sumeria OAuth or self-refresh.** Token capture lives in the external
  `sumeria-mitm` service, not here.
- **Multi-tenant operation.** One running connector = one Swile account +
  one Sumeria account. There is no per-request user / org context.
- **CSV import path.** One-shot historical CSV import helpers may live
  alongside the connector but neither call nor are called by it.
- **TLS.** The server is plain HTTP. Reverse proxies (e.g. Tailscale Serve,
  nginx) are expected to provide TLS termination if needed.

---

## 8. Invariants

These must remain true. Changes that violate them are breaking for Sure.

1. **Account-id prefix is the routing key.** Every account id returned by
   `GET /api/v1/accounts` starts with `swile:` or `sumeria:`, and the same
   prefix is what the server uses to dispatch subsequent
   `transactions` / `balance` / `holdings` calls. Sure must echo the id
   verbatim.
2. **Prefix segment is opaque to Sure.** The substring after `swile:` is a
   Swile wallet UUID; after `sumeria:` is a Sumeria `emitter_id` (NOT
   `account_id`). Both are upstream-stable identifiers — Sure does not
   parse them.
3. **Only `GET` under `/api/v1/`.** Adding new methods or moving the prefix
   is a breaking change.
4. **JSON wrapping shape is stable.** `{ accounts: [...] }`,
   `{ transactions: [...] }`, `{ balance: {...} }`. Do not flatten to a
   bare array.
5. **Currency precision.** Lunchflow amounts are signed major-unit numbers
   (negative = debit). Swile divides operation amounts by 100; Sumeria does
   not (its API already gives major-unit floats). New providers must
   convert to the same convention.
6. **Token-file writes are atomic.** Use `<file>.tmp` + `rename`. Never
   write the destination path directly.
7. **Swile `client_id` is public, not a secret.** It identifies the Swile
   web app, not the user. Do not move it to a secret store.
8. **API-key auth is opt-in via file presence.** Empty / unset
   `FOR_SURE_API_KEY_FILE` ⇒ no auth. This is intentional for the
   `127.0.0.1`-only default binding.
9. **Logging is single-line JSON to stdout.** Anything else breaks
   journald structured logging.
10. **The connector is a single HTTP process for all upstreams.** Adding a
    provider means adding a prefix and a new dispatching branch in the
    router — never spinning up a second HTTP server.

---

## 9. Build & runtime topology (contract surface only)

- **One process, one port.** A single connector process binds
  `${HOST}:${PORT}` and serves all routes for all upstreams it knows about.
- **Sure integration.** Sure points at `http://${HOST}:${PORT}/api/v1` via a
  single Lunchflow integration. All exposed accounts (currently 1 Swile +
  3–5 Sumeria, depending on user) appear under one source.
- **Supervisor.** A systemd unit (`for-sure.service`) runs the connector
  with `Restart=on-failure`, `RestartSec=10`. stdout is captured by
  journald.

---

## Implementation pointers (current)

These are pointers into the current codebase, not part of the contract.
A reimplementation in another language can ignore everything in this
section. They exist so an agent reading the source today knows where each
contract clause lives.

- **Language / runtime.** TypeScript on Node.js, ESM output.
- **Monorepo.** npm workspaces; single root `package-lock.json`. Layout:
  - `packages/lunchflow/` — `@for-sure/lunchflow`: shared HTTP server
    (`src/server.ts`), router (`src/router.ts`), JSON logger
    (`src/logger.ts`), Lunchflow type definitions (`src/types.ts`).
  - `connectors/for-sure/` — the production combined connector (binary:
    `for-sure`). Entrypoint `src/index.ts` wires handlers and does the
    `swile:` / `sumeria:` prefix dispatch. Per-provider code under
    `src/swile/` and `src/sumeria/` (each with `auth.ts`, `client.ts`,
    `config.ts`, `setup.ts`, `types.ts`, and `handlers/{accounts,
    transactions,balance,holdings,index}.ts`). Shared env + API-key loader
    in `src/config.ts`. Telegram helper in `src/notify.ts`. Setup
    dispatcher in `src/setup.ts`.
  - `connectors/swile/` — legacy, source removed; do not edit.
- **Nix packaging.** `connectors/for-sure/flake.nix` exposes
  `packages.default` and `nixosModules.default`. `package.nix` invokes
  `buildNpmPackage` against the monorepo root with `npmWorkspace =
  "connectors/for-sure"` and a pinned `npmDepsHash`. `module.nix` defines
  `services.for-sure`. The lunchflow `dist/` and `package.json` are
  installed under `$out/lib/for-sure/node_modules/@for-sure/lunchflow/` so
  runtime resolution works without `npm install`.
- **Known bug — handler error → 500 instead of 404.** `packages/lunchflow/
  src/server.ts` `catch`-clause unconditionally returns `500`. Handlers in
  `connectors/for-sure/src/index.ts` (and inside each provider's
  `handlers/balance.ts`) raise errors decorated with `statusCode: 404` for
  "Unknown account" / "Account not found", but `server.ts` does not read
  `err.statusCode`. Fix: in `server.ts`, on caught error, read
  `(err as any).statusCode` and use it if it is a number in `[400, 599]`,
  defaulting to `500`. The contract in §2.5 is `404`; the current behavior
  is `500`.
