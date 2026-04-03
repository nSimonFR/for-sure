export interface SwileWallet {
  id: string;
  label: string;
  type: string;
  is_activated: boolean;
  archived_at: string | null;
  balance: {
    value: number;
    currency: { iso_3: string };
  };
}

export interface SwileOperation {
  id: string;
  name: string;
  date: string;
  amount: {
    value: number;
    currency: { iso_3: string };
  };
  transactions: Array<{
    status: string;
    wallet: { uuid: string } | null;
  }>;
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
