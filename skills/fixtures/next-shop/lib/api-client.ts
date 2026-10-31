export function placeOrder(code: string, units: number): Promise<Response> {
  return fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, units }),
  });
}
