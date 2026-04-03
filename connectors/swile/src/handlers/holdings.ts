export async function handleHoldings(_accountId: string): Promise<unknown> {
  return { error: "Holdings not supported for Swile", status: 501 };
}
