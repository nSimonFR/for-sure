// Swile API response types

export interface SwileWallet {
  id: string;
  name: string;
  type: string;
  status: string;
  balance: {
    value: number;
    currency: {
      iso_3: string;
    };
  };
}

export interface SwileWalletsResponse {
  wallets: SwileWallet[];
}

export interface SwileAmount {
  value: number;
  currency: {
    iso_3: string;
  };
}

export interface SwileOperation {
  id: string;
  name: string;
  date: string;
  status: string;
  amount: SwileAmount;
  wallet_id: string;
  category?: string;
}

export interface SwileOperationsResponse {
  operations: SwileOperation[];
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
}
