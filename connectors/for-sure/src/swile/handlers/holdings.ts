import type { RouteResult } from "@for-sure/lunchflow/types";

export async function getHoldings(_accountId: string): Promise<RouteResult> {
  return { status: 501, body: { error: "Holdings not supported for Swile" } };
}
