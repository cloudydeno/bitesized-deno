import {
  type Header,
  type Payload,
  create as createJwt,
  getNumericDate,
} from "https://deno.land/x/djwt@v2.8/mod.ts";
export { getNumericDate };

type StoredKey = {
  header: {
    kid: string;
    alg: Header['alg'];
  };
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  algorithm: KeyAlgorithm;
}

export class OidcIssuer {
  constructor(
    private readonly kv: Deno.Kv,
    public readonly kvPrefix: string[],
    public readonly keyGenOptions: RsaHashedKeyGenParams | EcKeyGenParams,
  ) {}

  async getCurrentPrivateKey() {
    const foundKey = await this.getLatestPrivateKeyIfAny();
    return foundKey ?? await this.issueNewKey();
  }

  async getCurrentKeys() {
    const keys: Array<JsonWebKey & { kid: string }> = [];
    const oldestReasonable = Date.now() - (1000 * 60 * 60 * 24); // one day old
    const iter = this.kv.list({
      prefix: [...this.kvPrefix],
      start: [...this.kvPrefix, oldestReasonable],
    }, {
      // Rationale: we need to include just-created keys
      // consistency: 'eventual',
    });
    for await (const res of iter) {
      const record = res.value as StoredKey;
      keys.push({
        kid: record.header.kid,
        ...record.publicJwk,
        use: 'sig',
        key_ops: undefined,
        ext: undefined,
      });
    }
    return keys;
  }

  async dropOldKeys() {
    const oldestReasonable = Date.now() - ((1000 * 60 * 60) * 24); // one day old
    const mutations = new Array<Deno.KvMutation>();
    const iter = this.kv.list({
      prefix: [...this.kvPrefix],
      end: [...this.kvPrefix, oldestReasonable],
    }, {
      // rationale: latency hit not important
      // consistency: 'eventual',
    });
    for await (const res of iter) {
      mutations.push({
        key: res.key,
        type: "delete",
      });
    }
    if (mutations.length) {
      await this.kv.atomic()
        .mutate(...mutations)
        .commit();
    }
    console.log('Dropped', mutations.length, 'old signing keys');
  }

  async getLatestPrivateKeyIfAny() {
    const oldestReasonable = Date.now() - ((1000 * 60 * 60) * 12); // some hours old
    const iter = await this.kv.list({
      prefix: [...this.kvPrefix],
      start: [...this.kvPrefix, oldestReasonable],
    }, {
      reverse: true,
      limit: 1,
      // rationale: reduce chances of creating multiple keys in parallel
      // consistency: 'eventual',
    });
    for await (const res of iter) {
      const record = res.value as StoredKey;
      // console.log('found existing private key:', record.header);
      const cryptoKey = await crypto.subtle.importKey(
        'jwk',
        record.privateJwk,
        record.algorithm,
        false,
        ['sign'],
      );
      return {
        header: record.header,
        privateKey: cryptoKey,
      };
    }
    return null; // No valid key
  }

  // TODO: this can easily create numerous keys per renewal if called frequently enough
  async issueNewKey() {
    // console.log('making new key');

    // seems like this can take 50-100 ms
    const key = await crypto.subtle
    .generateKey(this.keyGenOptions, true, ["sign", "verify"]);

    const publicJwk = await crypto.subtle.exportKey('jwk', key.publicKey);
    const privateJwk = await crypto.subtle.exportKey('jwk', key.privateKey);

    const newKey: StoredKey = {
      header: {
        kid: (publicJwk.n ?? publicJwk.x ?? Math.random().toString(16).slice(2)).slice(0, 8),
        alg: publicJwk.alg as Header['alg'],
      },
      publicJwk,
      privateJwk,
      algorithm: key.privateKey.algorithm,
    };

    // store key, make sure we never overwrite an existing key
    const keyStamp = Date.now();
    await this.kv.atomic()
    .check({ key: [...this.kvPrefix, keyStamp], versionstamp: null })
    .set([...this.kvPrefix, keyStamp], newKey)
    .commit();

    return {
      header: newKey.header,
      privateKey: key.privateKey,
    };
  }

  async signJwt(claims: Payload) {
    const signingKey = await this.getCurrentPrivateKey();
    const jwt = await createJwt(signingKey.header, {
      "exp": getNumericDate(5 * 60),
      "iat": getNumericDate(0),
      "nbf": getNumericDate(-5),
      ...claims,
    }, signingKey.privateKey);
    return jwt;
  }
}
