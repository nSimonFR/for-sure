export interface SumeriaAccount {
  display_name: string;
  balance: string; // string in API response — use parseFloat()
  currency: string;
  emitter_id: string; // use as Lunchflow account id (NOT account_id)
}

// A party on a transaction. For card payments / direct debits the counterparty
// is the merchant; for P2P it's a person; for internal moves it's an own account.
export interface SumeriaParty {
  id?: string | null;
  name?: string | null;
}

export interface SumeriaTransaction {
  id: string;
  title: string;
  amount: number; // already EUR, signed (negative = debit)
  created_at: string;
  status: string;
  // Transaction kind (e.g. "lydia_card_marqeta_payment", "p2p_payment_acquiring",
  // "lydia_iban_direct_debit", "lydia_iban_credit", "withdraw", "pro_payment").
  // Determines whether `title` is a real merchant or a free-text user note.
  type: string;
  // The two sides of the transaction. The counterparty (the side that isn't this
  // account) is the real merchant/payee for non-card transactions — far cleaner
  // than the free-text `title`, which for P2P is a user-typed note (emoji, etc.).
  emitter?: SumeriaParty | null;
  receiver?: SumeriaParty | null;
}

export interface SumeriaTokens {
  auth_token: string;   // 32-hex, static device credential
  public_token: string; // static device identifier
  access_token: string; // 64-hex-as-base64, long-lived session token
}
