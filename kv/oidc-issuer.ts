import * as JWT from "https://deno.land/x/djwt@v2.8/mod.ts";

export class OidcIssuer {
    constructor(
        private readonly kv: Deno.Kv,
        public readonly kvPrefix: string[],
        public readonly keyOptions: RsaHashedKeyGenParams | EcKeyGenParams,
    ) {}
    
    async getCurrentPrivateKey() {
        const foundKey = await this.getLatestPrivateKey();
        return foundKey ?? await this.issueNewKey();
    }

    async getCurrentKeys() {
        const keys = [];
        const oldestReasonable = Date.now() - (1000 * 60 * 60 * 24); // one day old
        const iter = this.kv.list({
            prefix: [...this.kvPrefix],
            start: [...this.kvPrefix, oldestReasonable],
        }, {
            // consistency: 'eventual',
        });
        for await (const res of iter) {
            keys.push({
                kid: res.value.header.kid,
                ...res.value.publicJwk,
                use: 'sig',
                key_ops: undefined,
                ext: undefined,
            });
        }
        return keys;
    }

    async dropOldKeys() {
        const oldestReasonable = Date.now() - ((1000 * 60 * 60) * 24); // one day old
        const oldKeys = [];
        const iter = this.kv.list({
            prefix: [...this.kvPrefix],
            end: [...this.kvPrefix, oldestReasonable],
        }, {
            // consistency: 'eventual',
        });
        for await (const res of iter) {
            oldKeys.push(res.key);
        }
        if (oldKeys.length) {
            await kv.atomic()
                .mutate(...oldKeys.map(key => ({
                    key,
                    type: "delete",
                })))
                .commit();
        }
        console.log('Dropped', oldKeys.length, 'old signing keys');
    }

    async getLatestPrivateKey() {
        const oldestReasonable = Date.now() - ((1000 * 60 * 60) * 12); // some hours old
        const iter = await this.kv.list({
            prefix: [...this.kvPrefix],
            start: [...this.kvPrefix, oldestReasonable],
        }, {
            reverse: true,
            limit: 1,
            // consistency: 'eventual',
        });
        for await (const res of iter) {
            console.log('found private key:', res.value.header);
            const cryptoKey = await crypto.subtle.importKey(
                'jwk',
                res.value.privateJwk,
                res.value.algorithm,
                false,
                ['sign'],
            );
            return {
                header: res.value.header,
                privateKey: cryptoKey,
            };
        }
    }

    async issueNewKey() {
        console.log('making new key');

        // seems like this can take 50-100 ms
        const key = await crypto.subtle
            .generateKey(this.keyOptions, true, ["sign", "verify"]);

        const publicJwk = await crypto.subtle.exportKey('jwk', key.publicKey);
        const privateJwk = await crypto.subtle.exportKey('jwk', key.privateKey);
        const header = {
            kid: (publicJwk.n ?? publicJwk.x).slice(0, 8),
            alg: publicJwk.alg, // key.privateKey.algorithm.name.slice(0,2) + key.privateKey.algorithm.hash.name.slice(4),
        };

        // store key, make sure we never overwrite an existing key
        const keyStamp = Date.now();
        await kv.atomic()
            .check({ key: [...this.kvPrefix, keyStamp], versionstamp: null })
            .set([...this.kvPrefix, keyStamp], {
                header,
                publicJwk,
                privateJwk,
                algorithm: key.privateKey.algorithm,
            })
            .commit();

        return {
            header,
            privateKey: key.privateKey,
        };
    }

    async signJwt(claims) {
        const signingKey = await this.getCurrentPrivateKey();
        const jwt = await JWT.create(signingKey.header, {
            "exp": getNumericDate(5 * 60),
            "iat": getNumericDate(0),
            "nbf": getNumericDate(-5),
            ...claims,
        }, signingKey.privateKey);
        return jwt;
    }
}
