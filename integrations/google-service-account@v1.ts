import * as JWT from "https://deno.land/x/djwt@v1.9/mod.ts";
import * as Base64 from "https://deno.land/x/base64@v0.2.1/mod.ts";
import { ber_decode } from "https://deno.land/x/god_crypto@v1.4.3/src/rsa/basic_encoding_rule.ts";

// workaround for https://github.com/invisal/god_crypto/issues/16
function stripKeyWrapping(originalKey: string) {
  const originalData = originalKey.split('\n').filter(x => x && x[0] !== '-').join('');
  const decoded = ber_decode(Base64.toUint8Array(originalData));
  if (decoded.type !== 48) return false;
  const [_, header, body] = decoded.value as any[];
  if (header?.type !== 48) return false;
  if (body?.type !== 4) return false;
  if (header.value[0]?.value !== '1.2.840.113549.1.1.1') return false; // RSA key
  if (!(body.value instanceof Uint8Array)) return false;
  const innerBytes: Uint8Array = body.value;
  return [
    '-----BEGIN RSA PRIVATE KEY-----',
    Base64.fromUint8Array(innerBytes),
    '-----END RSA PRIVATE KEY-----\n',
  ].join('\n');
}

export class ServiceAccount {
  constructor(
    private credential: ServiceAccountCredential,
  ) {
    if (credential.private_key.startsWith("-----BEGIN PRIVATE KEY-----\n")) {
      const fixedKey = stripKeyWrapping(credential.private_key);
      if (!fixedKey) throw new Error(
        `BUG: This private key can't be read by the 'god_crypto' library directly, and I failed to fix it`);
      this.#privateKey = fixedKey;
    } else {
      this.#privateKey = credential.private_key;
    }
  }
  #privateKey: string;

  static async readFromFile(path: string): Promise<ServiceAccount> {
    const rawFile = await Deno.readTextFile(path);
    if (rawFile[0] !== '{') throw new Error(
      `The file at ${JSON.stringify(path)} doesn't look like a JSON document`);

    const accountInfo: ServiceAccountCredential = JSON.parse(rawFile);
    if (accountInfo.type !== 'service_account') throw new Error(
      `The file at ${JSON.stringify(path)} doesn't look like a service_account`);

    return new ServiceAccount(accountInfo);
  }

  async issueToken(scope: string): Promise<TokenResponse> {
    const jwt = await JWT.create({
      alg: "RS256", typ: "JWT",
    }, {
      "iss": this.credential.client_email,
      "scope": scope,
      "aud": this.credential.token_uri,
      "exp": JWT.getNumericDate(60 * 60),
      "iat": JWT.getNumericDate(0),
    }, this.#privateKey);

    const payload = new FormData();
    payload.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
    payload.append("assertion", jwt);

    const resp = await fetch(this.credential.token_uri, {
      method: 'POST',
      body: payload,
    })
    return await resp.json();
  }

  selfSignToken(audience: string): Promise<string> {
    return JWT.create({
      alg: "RS256", typ: "JWT",
      kid: this.credential.private_key_id,
    }, {
      "iss": this.credential.client_email,
      "sub": this.credential.client_email,
      "aud": audience,
      "exp": JWT.getNumericDate(60 * 60),
      "iat": JWT.getNumericDate(0),
    }, this.#privateKey);
  }
}

export interface ServiceAccountCredential {
  "type": "service_account";

  "project_id": string;
  "private_key_id": string;
  "private_key": string;
  "client_email": string;
  "client_id": string;

  "auth_uri": "https://accounts.google.com/o/oauth2/auth";
  "token_uri": "https://oauth2.googleapis.com/token";
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs";
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firestore-maintenance%40stardust-skychat.iam.gserviceaccount.com";
};

export interface TokenResponse {
  "access_token": string;
  "scope"?: string;
  "token_type": "Bearer";
  "expires_in": number;
};
