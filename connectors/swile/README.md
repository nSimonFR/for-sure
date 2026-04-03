# for-sure-swile

Lunchflow-compatible HTTP shim that translates [Swile](https://www.swile.co)'s neobank API into the 4 endpoints expected by [Sure](https://github.com/maybe-finance/maybe) (Maybe Finance fork), so Swile meal voucher transactions can be imported natively.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/accounts` | Active meal voucher wallets |
| `GET` | `/api/v1/accounts/:id/transactions` | Transactions (CAPTURED, VALIDATED, REFUNDED) |
| `GET` | `/api/v1/accounts/:id/balance` | Current wallet balance |
| `GET` | `/api/v1/accounts/:id/holdings` | Not supported (501) |

All endpoints require an `x-api-key` header.

## Setup

Initial authentication requires an OTP sent to your Swile account:

```
POST /setup          { "email": "...", "password": "..." }
POST /setup/otp      { "code": "..." }
```

Tokens are persisted to `dataDir/tokens.json` and refreshed automatically.

## NixOS

```nix
services.for-sure-swile = {
  enable      = true;
  port        = 8340;
  apiKeyFile  = "/run/agenix/for-sure-swile-api-key";
  accountName = "Swile";  # display name in Sure
};
```

The module creates a `for-sure-swile` system user and stores tokens in `/var/lib/for-sure-swile/`.
