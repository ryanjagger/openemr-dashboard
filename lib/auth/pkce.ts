import * as oauth from "oauth4webapi";

export async function generateVerifier(): Promise<string> {
  return oauth.generateRandomCodeVerifier();
}

export async function generateChallenge(verifier: string): Promise<string> {
  return oauth.calculatePKCECodeChallenge(verifier);
}

export async function generateState(): Promise<string> {
  return oauth.generateRandomState();
}

export async function generateNonce(): Promise<string> {
  return oauth.generateRandomNonce();
}
