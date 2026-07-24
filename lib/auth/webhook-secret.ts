/** Fail-closed shared-secret check for inbound webhooks that write business data. */
export function verifySharedSecret(request: Request, envVarName: string): boolean {
  const secret = process.env[envVarName]?.trim();
  if (!secret) return false;
  return request.headers.get("x-webhook-secret") === secret;
}
