import * as oauth from "oauth4webapi";
import { requireOAuthClient, serverEnv } from "@/lib/env";
import { openemrFetch } from "@/lib/http";
import { log } from "@/lib/log";

let cachedAS: oauth.AuthorizationServer | null = null;

const fetchOpt = { [oauth.customFetch]: openemrFetch };

export const SCOPES = [
  "openid",
  "fhirUser",
  "offline_access",
  "user/Patient.read",
  "user/AllergyIntolerance.read",
  "user/Condition.read",
  "user/MedicationRequest.read",
  "user/CareTeam.read",
  "user/Encounter.read",
].join(" ");

export async function getAuthorizationServer(): Promise<oauth.AuthorizationServer> {
  if (cachedAS) return cachedAS;
  const env = serverEnv();
  const issuer = new URL(`${env.OPENEMR_BASE_URL}/oauth2/${env.OPENEMR_SITE}`);
  log.debug({ issuer: issuer.href }, "oidc.discovery");
  const response = await oauth.discoveryRequest(issuer, {
    algorithm: "oidc",
    ...fetchOpt,
  });
  cachedAS = await oauth.processDiscoveryResponse(issuer, response);
  return cachedAS;
}

export async function buildAuthorizeUrl(opts: {
  state: string;
  codeChallenge: string;
  nonce?: string;
  scope?: string;
}): Promise<string> {
  const as = await getAuthorizationServer();
  if (!as.authorization_endpoint) {
    throw new Error("OIDC discovery: authorization_endpoint missing");
  }
  const env = serverEnv();
  const { clientId } = requireOAuthClient();

  const url = new URL(as.authorization_endpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", env.OAUTH_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", opts.scope ?? SCOPES);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", opts.state);
  if (opts.nonce) url.searchParams.set("nonce", opts.nonce);
  return url.href;
}

function clientPair(): { client: oauth.Client; clientAuth: oauth.ClientAuth } {
  const { clientId, clientSecret } = requireOAuthClient();
  return {
    client: { client_id: clientId },
    clientAuth: oauth.ClientSecretPost(clientSecret),
  };
}

export async function exchangeCodeForTokens(opts: {
  callbackUrl: URL;
  expectedState: string;
  expectedNonce?: string;
  codeVerifier: string;
}): Promise<oauth.TokenEndpointResponse> {
  const as = await getAuthorizationServer();
  const env = serverEnv();
  const { client, clientAuth } = clientPair();

  const params = oauth.validateAuthResponse(
    as,
    client,
    opts.callbackUrl,
    opts.expectedState,
  );

  const tokenResponse = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    clientAuth,
    params,
    env.OAUTH_REDIRECT_URI,
    opts.codeVerifier,
    fetchOpt,
  );

  return oauth.processAuthorizationCodeResponse(as, client, tokenResponse, {
    expectedNonce: opts.expectedNonce,
    requireIdToken: true,
  });
}

export async function refreshTokens(
  refreshToken: string,
): Promise<oauth.TokenEndpointResponse> {
  const as = await getAuthorizationServer();
  const { client, clientAuth } = clientPair();

  const tokenResponse = await oauth.refreshTokenGrantRequest(
    as,
    client,
    clientAuth,
    refreshToken,
    fetchOpt,
  );

  return oauth.processRefreshTokenResponse(as, client, tokenResponse);
}

export async function buildEndSessionUrl(opts: {
  idTokenHint: string;
  postLogoutRedirectUri: string;
}): Promise<string | null> {
  const as = await getAuthorizationServer();
  if (!as.end_session_endpoint) return null;
  const url = new URL(as.end_session_endpoint);
  url.searchParams.set("id_token_hint", opts.idTokenHint);
  url.searchParams.set("post_logout_redirect_uri", opts.postLogoutRedirectUri);
  return url.href;
}

export function getIdTokenClaims(
  result: oauth.TokenEndpointResponse,
): oauth.IDToken | undefined {
  return oauth.getValidatedIdTokenClaims(result);
}
