export interface HealthResponse {
  ok: true;
  service: "cd-wallet";
}

/** Minimal Lambda handler so the stack has something to deploy and the owner can check it is alive. */
export async function handler(): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> {
  const body: HealthResponse = { ok: true, service: "cd-wallet" };
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
