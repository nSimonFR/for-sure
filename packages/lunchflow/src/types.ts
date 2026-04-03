export interface LunchflowAccount {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

export interface LunchflowTransaction {
  id: string;
  merchant: string;
  date: string;
  amount: number;
  currency: string;
  isPending: boolean;
}

export interface LunchflowBalance {
  amount: number;
  currency: string;
}

export interface RouteResult {
  status: number;
  body: unknown;
}

export interface LunchflowHandlers {
  getAccounts(): Promise<LunchflowAccount[]>;
  getTransactions(accountId: string): Promise<LunchflowTransaction[]>;
  getBalance(accountId: string): Promise<LunchflowBalance>;
  getHoldings(accountId: string): Promise<RouteResult>;
}
