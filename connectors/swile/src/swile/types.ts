export interface SwileWallet {
  id: string;
  name: string;
  type: string;
  status: string;
  balance: {
    value: number;
    currency: { iso_3: string };
  };
}

export interface SwileOperation {
  id: string;
  name: string;
  date: string;
  status: string;
  amount: {
    value: number;
    currency: { iso_3: string };
  };
  wallet_id: string;
  category?: string;
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
