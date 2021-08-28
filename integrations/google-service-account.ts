import * as JWT from "https://deno.land/x/djwt@v2.2/mod.ts";

export const _mockCurrentTime = Symbol();
export const _mockFetch = Symbol();

export class ServiceAccount {
  constructor(
    private credential: ServiceAccountCredential,
  ) {
    this.#privateKey = this.credential.private_key;
  }
  #privateKey: string;

  [_mockCurrentTime]?: Date;
  [_mockFetch] = fetch;

  get projectId() {
    return this.credential.project_id;
  }

  // You have a choice of async or sync loading for the file.
  // Async is generally better but ServiceAccounts are often configured in constructors.
  // That's a good time to use the ...Sync version since JS constructors can't be async.
  static async readFromFile(path: string): Promise<ServiceAccount> {
    const rawFile = await Deno.readTextFile(path);
    return this.loadFromJsonString(rawFile, `The file at ${JSON.stringify(path)}`);
  }
  static readFromFileSync(path: string): ServiceAccount {
    const rawFile = Deno.readTextFileSync(path);
    return this.loadFromJsonString(rawFile, `The file at ${JSON.stringify(path)}`);
  }
  static loadFromJsonString(jsonData: string, origin = 'The given service account'): ServiceAccount {
    if (jsonData[0] !== '{') throw new Error(
      `${origin} doesn't look like a JSON document`);
    const accountInfo: ServiceAccountCredential = JSON.parse(jsonData);

    if (accountInfo.type !== 'service_account') throw new Error(
      `${origin} doesn't look like a service_account`);
    return new ServiceAccount(accountInfo);
  }

  async issueToken(scope: string): Promise<TokenResponse> {
    const jwt = await JWT.create({
      alg: "RS256", typ: "JWT",
    }, {
      "iss": this.credential.client_email,
      "scope": scope,
      "aud": this.credential.token_uri,
      "exp": this.getNumericDate(60 * 60),
      "iat": this.getNumericDate(0),
    }, this.#privateKey+'    ');

    const payload = new FormData();
    payload.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
    payload.append("assertion", jwt);

    const resp = await this[_mockFetch](this.credential.token_uri, {
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
      "exp": this.getNumericDate(60 * 60),
      "iat": this.getNumericDate(0),
    }, this.#privateKey+'    ');
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
