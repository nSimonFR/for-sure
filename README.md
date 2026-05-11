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

> Install the for-sure connector on a NixOS host:
>
> 1. Add to flake inputs: `for-sure.url = "github:nSimonFR/for-sure?dir=connectors/for-sure";`
> 2. Import and configure:
>    ```nix
>    services.for-sure = {
>      enable = true;
>      environmentFile = "/run/agenix/for-sure-env";
>    };
>    ```
> 3. `sudo nixos-rebuild switch --flake .#<host>` — the daemon listens on `:8340`.
> 4. Mint Swile tokens: `for-sure --setup swile` (OAuth flow, writes to `/var/lib/for-sure/swile-tokens.json`).
> 5. Sumeria tokens are captured by the separate `sumeria-mitm` service; they appear at `/var/lib/sumeria-mitm/tokens.json` and the connector re-reads on 401.
> 6. In Sure: add a Lunchflow data source pointing at `http://127.0.0.1:8340/api/v1`. Accounts are prefixed `swile:<uuid>` and `sumeria:<emitter_id>`.
