export interface SumeriaAccount {
  display_name: string;
  balance: string; // string in API response — use parseFloat()
  currency: string;
  emitter_id: string; // use as Lunchflow account id (NOT account_id)
}

export interface SumeriaTransaction {
  id: string;
  title: string;
  amount: number; // already EUR, signed (negative = debit)
  created_at: string;
  status: string;
}

export interface SumeriaTokens {
  auth_token: string;   // 32-hex, static device credential
  public_token: string; // static device identifier
  access_token: string; // 64-hex-as-base64, long-lived session token
}
