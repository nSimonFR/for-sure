# for-sure for-sure

My connectors and script for [sure finance](https://sure.am/) !

Be sure to check https://github.com/nSimonFR/sure-nix too !

## AI Installation Prompt

> Install the `for-sure` Sure-finance connector on a Node-capable host. **Done when** `curl -s http://127.0.0.1:8340/api/v1/accounts` returns a JSON array (empty is fine before tokens; non-empty after).
>
> 1. Clone: `git clone https://github.com/nSimonFR/for-sure && cd for-sure`
> 2. Read first: top-level `package.json`, `connectors/for-sure/package.json`, `packages/lunchflow/package.json`, `connectors/for-sure/README.md` if present. Toolchain is Node + npm workspaces (root lockfile is `package-lock.json`).
> 3. Install: `npm install` at the repo root (picks up every workspace).
> 4. Build the shared package first, then the connector: `npm run build -w packages/lunchflow && npm run build -w connectors/for-sure`.
> 5. Required env (per connector): `SWILE_TOKENS_FILE` (path), `SUMERIA_TOKEN_FILE` (path). Create both files as empty JSON `{}` if you don't have tokens yet.
> 6. Start: `npm start -w connectors/for-sure`. The HTTP API binds `:8340`.
> 7. Mint Swile tokens once: `node connectors/for-sure/dist/index.js --setup swile` (OAuth flow, writes to `$SWILE_TOKENS_FILE`). Sumeria tokens are captured by a separate MITM service; this connector only re-reads `$SUMERIA_TOKEN_FILE` and surfaces 401s.
> 8. Point your Sure instance at `http://127.0.0.1:8340/api/v1`. Account IDs come back prefixed `swile:<uuid>` and `sumeria:<emitter_id>`.
> 9. NixOS hosts have a `services.for-sure` module — see `connectors/for-sure/flake.nix`.
>
> **Token files are sensitive.** Never commit them, never echo their contents, never copy them to a logging system.
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

