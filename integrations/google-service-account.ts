import * as JWT from "https://deno.land/x/djwt@v2.8/mod.ts";
import * as Base64 from "https://deno.land/std@0.177.0/encoding/base64.ts";

export const _mockCurrentTime = Symbol();
export const _mockFetch = Symbol();

export type ShortLivedToken = {
  accessToken: string;
  expiresAt: Date;
}

export interface ServiceAccountApi {
  getProjectId(): Promise<string>;
  issueToken(scopes: string[]): Promise<ShortLivedToken>;
}

export const ServiceAccount = {
  // You have a choice of async or sync loading for the file.
  // Async is generally better but ServiceAccounts are often configured in constructors.
  // That's a good time to use the ...Sync version since JS constructors can't be async.
  async readFromFile(path: string): Promise<ServiceAccountApi> {
    const rawFile = await Deno.readTextFile(path);
    return this.loadFromJsonString(rawFile, `The file at ${JSON.stringify(path)}`);
  },
  readFromFileSync(path: string): ServiceAccountApi {
    const rawFile = Deno.readTextFileSync(path);
    return this.loadFromJsonString(rawFile, `The file at ${JSON.stringify(path)}`);
  },

  loadFromJsonString(jsonData: string, origin = 'The given service account'): ServiceAccountApi {
    if (jsonData[0] !== '{') throw new Error(
      `${origin} doesn't look like a JSON document`);
    const accountInfo: ServiceAccountJson = JSON.parse(jsonData);
    return this.loadFromJson(accountInfo, origin);
  },

  loadFromJson(accountInfo: ServiceAccountJson, origin = 'The given service account'): ServiceAccountApi {
    if (accountInfo.type === 'metadata_service_account') {
      return new MetadataServiceAccount();
    }

    if (accountInfo.type === 'service_account') {
      return new PrivateKeyServiceAccount(accountInfo);
    }

    if (accountInfo.type === 'external_account') {
      return new ExternalServiceAccount(accountInfo);
    }

    throw new Error(`${origin} doesn't look like a support service_account. type="${(accountInfo as {type?: string}).type}"`);
  },
}

/**
 * Useful for Cloud Run, Compute Engine, Kubernete Engine,
 * and I suppose anywhere else on GCloud that you're told to grab tokens from this URL.
 */
export class MetadataServiceAccount implements ServiceAccountApi {
  async getProjectId() {
    const path = '/computeMetadata/v1/project/project-id';
    const resp = await fetch(new URL(path, "http://metadata.google.internal"), {
      headers: {
        "Metadata-Flavor": "Google",
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from http://metadata.google.internal${path}`);
    return (await resp.text()).trimEnd();
  }
  async issueToken(scopes: string[]) {
    let path = '/computeMetadata/v1/instance/service-accounts/default/token';

    if (scopes?.length) {
      const params = new URLSearchParams();
      params.set('scopes', scopes.join(','));
      path += '?' + params.toString();
    }

    const resp = await fetch(new URL(path, "http://metadata.google.internal"), {
      headers: {
        "Metadata-Flavor": "Google",
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from http://metadata.google.internal${path}`);
    const tokenResp: TokenResponse = await resp.json();
    return {
      accessToken: tokenResp.access_token,
      expiresAt: new Date(Date.now() + (tokenResp.expires_in * 1000)),
    };
  }
}

/** Static credentials stored directly in JSON, in the form of an RSA Private Key. */
export class PrivateKeyServiceAccount implements ServiceAccountApi {
  constructor(
    private credential: ServiceAccountCredential,
  ) {
    // Strip PEM key down to its bytes
    const keyData = this.credential.private_key
      .split('\n').filter(x => !x.startsWith('-')).join('');
    this.#privateKey = crypto.subtle.importKey(
      'pkcs8',
      Base64.decode(keyData),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  }
  #privateKey: Promise<CryptoKey>;

  [_mockCurrentTime]?: Date;
  [_mockFetch] = fetch;

  getProjectId() {
    return Promise.resolve(this.credential.project_id);
  }

  async issueToken(scopes: string[]): Promise<ShortLivedToken> {
    const jwt = await JWT.create({
      alg: "RS256", typ: "JWT",
    }, {
      "iss": this.credential.client_email,
      "scope": scopes.join(' '),
      "aud": this.credential.token_uri,
      "exp": this.getNumericDate(60 * 60),
      "iat": this.getNumericDate(0),
    }, await this.#privateKey);

    const payload = new FormData();
    payload.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
    payload.append("assertion", jwt);

    const resp = await this[_mockFetch](this.credential.token_uri, {
      method: 'POST',
      body: payload,
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${this.credential.token_uri}`);
    const tokenResp: TokenResponse = await resp.json();
    return {
      accessToken: tokenResp.access_token,
      expiresAt: new Date(Date.now() + (tokenResp.expires_in * 1000)),
    };
  }

  async selfSignToken(audience: string): Promise<string> {
    return JWT.create({
      alg: "RS256", typ: "JWT",
      kid: this.credential.private_key_id,
    }, {
      "iss": this.credential.client_email,
      "sub": this.credential.client_email,
      "aud": audience,
      "exp": this.getNumericDate(60 * 60),
      "iat": this.getNumericDate(0),
    }, await this.#privateKey);
  }

  /**
   * Returns the number of seconds since January 1, 1970, 00:00:00 UTC.
   * Allows for mocking the current time.
   * From https://github.com/timonson/djwt/blob/v2.2/mod.ts#L190-L198
   */
  private getNumericDate(exp: number | Date): number {
    const now = this[_mockCurrentTime]?.valueOf() ?? Date.now();
    return Math.round(
      (exp instanceof Date ? exp.getTime() : now + exp * 1000) / 1000,
    );
  }
}

export class ExternalServiceAccount implements ServiceAccountApi {
  constructor(
    private credential: ExternalAccountCredential,
  ) {}


  getProjectId() {
    return Promise.resolve(this.credential.service_account_impersonation_url.split('/')[7].split('@')[1].split('.')[0]);
  }

  async issueToken(scopes: string[]): Promise<ShortLivedToken> {
    if (!this.credential.credential_source?.file) throw new Error(`TODO: non-file credential sources`);

    const stsResp = await fetch(this.credential.token_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        "grantType": "urn:ietf:params:oauth:grant-type:token-exchange",
        "subjectTokenType": "urn:ietf:params:oauth:token-type:jwt",
        "requestedTokenType": "urn:ietf:params:oauth:token-type:access_token",
        "audience": this.credential.audience,
        "scope": scopes.join(' '),
        "subjectToken": await Deno.readTextFile(this.credential.credential_source.file),
      }),
    });
    if (!stsResp.ok) throw new Error(`HTTP ${stsResp.status} from ${this.credential.token_url}`);
    const firstTokenResp: TokenResponse = await stsResp.json();

    const resp = await fetch(this.credential.service_account_impersonation_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${firstTokenResp.access_token}`,
      },
      body: JSON.stringify({
        "scope": scopes,
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${this.credential.service_account_impersonation_url}`);
    const secondToken: {
      "accessToken": string;
      "expireTime": string;
    } = await resp.json();


    return {
      accessToken: secondToken.accessToken,
      expiresAt: new Date(secondToken.expireTime),
    };
  }
}

export type ServiceAccountJson =
  | { "type": "metadata_service_account" } // fake config for using the ambient role
  | ServiceAccountCredential
  | ExternalAccountCredential
;

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

export interface ExternalAccountCredential {
  "type": "external_account",

  "subject_token_type": "urn:ietf:params:oauth:token-type:jwt" | string,
  "credential_source"?: {
    "file": string,
  },

  "audience": string,
  "token_url": "https://sts.googleapis.com/v1/token",
  "service_account_impersonation_url": string,
};

export interface TokenResponse {
  "access_token": string;
  "scope"?: string;
  "issued_token_type"?: "urn:ietf:params:oauth:token-type:access_token";
  "token_type": "Bearer";
  "expires_in": number;
};
