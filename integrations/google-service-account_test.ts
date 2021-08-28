import {
  assertEquals,
} from "https://deno.land/std@0.105.0/testing/asserts.ts";

import {
  ServiceAccount,
  ServiceAccountCredential,
  _mockCurrentTime,
  _mockFetch,
} from "./google-service-account.ts";

Deno.test('Fetching an issued JWT', async () => {
  const sa = new ServiceAccount(TestCredential);
  sa[_mockCurrentTime] = new Date(2021, 0, 1);

  sa[_mockFetch] = async (url, opts) => {
    if (!opts || typeof url != 'string') throw new Error(`mock fail`);
    if (!(opts.body instanceof FormData)) throw new Error(`mock body fail`);

    assertEquals(opts.body.get('assertion'), "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIiLCJzY29wZSI6InRlc3Qtc2NvcGUiLCJhdWQiOiJodHRwczovL29hdXRoMi5nb29nbGVhcGlzLmNvbS90b2tlbiIsImV4cCI6MTYwOTQ1OTIwMCwiaWF0IjoxNjA5NDU1NjAwfQ.d7WbLF29_tM457LfhZc4pq-4WdH002LjLCZaZMerl1FNTJ7r1Bf76JPc-QGq-QksIZJ33HGHjc27U9tBkoiZa1ja16-La-VoUkDrcBXIBZbGaWt7BSp4liHoX_Hnlhe8MrOctQb0MBmlkMOn_yu1Got3tyNqdrClAIpC5apWKucs_ZUzyZdxPZCjehjClY7RAkot1sTKj6rj_lVQY9lqRKgwyz4Ba7UvX7RA3YN1_5_niZTstl_dxsNv1DGHahgoT4fpmTuDikO_eoa8sfS59Ql8FXqwZVLCbIdzgi9Rc3Y9c6FzeXOn6gzR2KoBx7XjZxZlUPyToQM9Lmsw0JOb9A");

    return new Response('{}');
  };
  await sa.issueToken('test-scope');
});


Deno.test('Self-signing a JWT', async () => {
  const sa = new ServiceAccount(TestCredential);
  sa[_mockCurrentTime] = new Date(2021, 0, 1);

  const jwt = await sa.selfSignToken('test-audience');

  assertEquals(jwt, "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IiJ9.eyJpc3MiOiIiLCJzdWIiOiIiLCJhdWQiOiJ0ZXN0LWF1ZGllbmNlIiwiZXhwIjoxNjA5NDU5MjAwLCJpYXQiOjE2MDk0NTU2MDB9.TCkFWZYxeDpj8vY73Ds-INZXtwgymk3sXB5rTKXyX0Cdw_mbq48IsuzYC6sE1NNvi5dRPp7SaMS1laz7sAFjUyd_Lm7CPuzOrBUfLLKBvfKSf5Ol_-6rPOv9a0RVpNU_if2_JXZA4Id7S75e7HAocjS_braIiOA42zuqARHB-eM0-pz5PCStehb0Cq_Y9QVQ3cflxSMuj0RwvIUVbGcAw4YHFKyAZAki8sSBXAaqM6AnFubGji5S4UHlc2mbHyHQLphF1m42EvN5FDkYpfYvcqwrEA-GbFXsh4xjSWiA7DabohUDo07POvWvSwyIZAxPDOKcNc5h_9jdhTK6B7dL_Q");
});


export const PrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCVZ6og4XGxLAHH
ZwHm27AtUMP6+8wFqllvup0Tr0V21YvxzPxWjav2+mLOIM8upa7pzvcpc5EiCH58
denmLJsygqo0r2B8WhzHY+rCIWJfV2YSZxjzpvSAHfzLJrDphXgqgnCNxEjRsuyC
YAiGLIMK0huY90A5MMMArgUzkx8kMd/fq/Gd9Xt5iI+F7NlylJ+arnJc306pgGHK
3NN2GBX1vnSuCB280SUXkZfTBeykyDZ6YrAq0XpnCNV9JyHqLQ4EmjEhc2yUo3aN
RyXNMBddZx3HCLFcxwZCVAp0tQkAd7ErsUD5P5DR8RIJ3frklSUUZB6EkDw8G7KL
WKVcNQ2FAgMBAAECggEABVqkmOQ4s2PzlgkDDdofxJFL+KhXMyPGlo+uNd32hA/v
4YTaTSLAv8t7c3jEW/RW4ezyDrj5bD9i2FnPEu8pyk6u7qTon67eBaeMapO7h1Wl
5DEazo5+3WwrBT+4ICI8QG+8vK6E+ojU23DkFU+D4a/OX+C1GzzmsWqgZ+z/inKL
aMwS6rsWROUlgA1x5zNSoqC3SJFllVXXew5UyANTsBjvQ5J2Mmb9g8CEaAOn+xMk
xNlwTlDot+09nFJ9vvAWirUkZdsYNnlY+zrDQoPT7Am5jtKTHmMI1KfWNfmznyji
RltdnWfd8Bg0H7VtwrhWMWGs8QkATUAE+fC3qS144QKBgQDNFLk8eMwK6koMoNmY
vsRAf1Y6Xdd+LUN+TJqkZiUEySaKy8NLi71IBbzK7zKqbYXDPUFCbNJFhOlluKOw
bsKPkwBjR0JfoXVzbUdE+2tM2YccswaJe7iinZxr0wHGXIvJL0HNVIzmNggS7+Zm
rEsdCyFXnTT/83o1wVW3E/lspQKBgQC6gBVyYCP7AxYHTSRDCgcpsTO7HyzuY92t
aYOhRJFC7HNbzJbVdVsfnbtQH/Epe8ySk91GyFZ1dSJrxetcLhHsS2TMrkYUmY4x
bJnqzJTh7cgWBP9DuWYvSJxPooSpFwbh2L12vQ2ADpwwoAZMLkAagaGlY9MZz821
XY+KkOLnYQKBgQCQ49lTTgzqkUirz2Cst+qznsNvDSnYbWZH7xs6lygET5E5cmiS
ETIzlkoiHgjvu91LaRWYNoYAs7yqL18Godo30aXufkP4iHwQht5ZcEAI1Y7NyfYO
YCi8SxpeW3/fgzcHdqnIxbmeVAI0TuW7GHMhG+H8oob1ZjGrlOJYLHaGOQKBgDLO
vgkAxAyYFKI8k8pnqvfivJMXtSfksPmTKzb99QzkWbEClXzlkcOVNvhnG04P2fV8
ruWfol4xYQU3UB02t89F4toYCCOIicJRMcVToqPCIaZOCjSrB3mOMHdJcRaXnVpd
r4/vhQQD9u0QS2bpmrEd66mg/lujzwi/ymEXg5lBAoGAacrPblD+G/DAmTUt3tZw
GLdIvw4BeDyCvzxkJx1Z04rMZH71EEyBDPMBByZNPtjpTuzgAZE71MiD3BVLxj/H
dqEjUVQSjuOUyiJKe5GiGF25Xhe3/1VawurCdHfrv6Xmze+lRDHZuEOcV1FrM+zn
KQXlkpPbL3lU2CpgGFFKlFU=
-----END PRIVATE KEY-----`;

const TestCredential: ServiceAccountCredential = {
  type: 'service_account',
  private_key: PrivateKey,
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/firestore-maintenance%40stardust-skychat.iam.gserviceaccount.com',
  token_uri: 'https://oauth2.googleapis.com/token',
  private_key_id: '',
  client_email: '',
  client_id: '',
  project_id: '',
};
