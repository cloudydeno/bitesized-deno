// Useful for Cloud Run, Compute Engine, Kubernete Engine,
// and I suppose anywhere else on GCloud that you're told to grab tokens from this URL.

export async function fetchServiceAccountToken(scopes?: string[]) {
  let path = '/computeMetadata/v1/instance/service-accounts/default/token';

  if (scopes) {
    const params = new URLSearchParams();
    params.set('scopes', scopes.join(','));
    path += '?' + params.toString();
  }

  const resp = await fetch(new URL(path, "http://metadata.google.internal"), {
    headers: {
      "Metadata-Flavor": "Google",
    },
  });

  return await resp.json() as TokenResponse;
}

export interface TokenResponse {
  "access_token": string;
  "scope"?: string;
  "token_type": "Bearer";
  "expires_in": number;
};
