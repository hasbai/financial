/** Gateway logs retain attribution and usage while keeping private story payloads out of storage. */
export function roleplayGatewayOptions(env: Pick<Env, 'AIG_GATEWAY_ID'>, username: string, requestId: string): AiOptions {
  return {
    gateway: {
      id: env.AIG_GATEWAY_ID,
      skipCache: true,
      collectLog: true,
      eventId: requestId,
      retries: { maxAttempts: 1 },
      requestTimeoutMs: 170000,
      metadata: { app: 'tavern', task: 'roleplay', username },
    },
    extraHeaders: { 'cf-aig-collect-log-payload': 'false', 'cf-aig-event-id': requestId, 'cf-aig-max-attempts': '1', 'cf-aig-request-timeout': '170000' },
  };
}
