/** Gateway retains complete requests and responses with verified account attribution. */
export function roleplayGatewayOptions(env: Pick<Env, 'AIG_GATEWAY_ID'>, username: string, requestId: string): AiOptions {
  return {
    gateway: {
      id: env.AIG_GATEWAY_ID,
      skipCache: true,
      collectLog: true,
      eventId: requestId,
      retries: { maxAttempts: 1 },
      metadata: { app: 'tavern', task: 'roleplay', username },
    },
    extraHeaders: { 'cf-aig-collect-log-payload': 'true', 'cf-aig-event-id': requestId, 'cf-aig-max-attempts': '1' },
  };
}

/** Keep HTTP failures and response-local Gateway headers available to every inference phase. */
export function runRoleplay(env:Env,username:string,requestId:string,input:Record<string,unknown>,signal:AbortSignal){
 return env.AI.run('dynamic/rp',input,{...roleplayGatewayOptions(env,username,requestId),returnRawResponse:true,signal});
}
