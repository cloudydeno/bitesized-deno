// Deno implmentation of these steps:
//   https://firebase.google.com/docs/hosting/api-deploy
// You need to provide an API token with scope:
//   "https://www.googleapis.com/auth/firebase" (not a URL)
// This script can get an API token from a Service Account .json:
//   https://danopia.net/deno/google-service-account@v1.ts
// Online documentation:
//   https://doc.deno.land/https/danopia.net/deno/firebase-hosting-deploy@v1.ts

import { gzipEncode } from "https://deno.land/x/wasm_gzip@v1.0.0/mod.ts";
import { Sha256 } from "https://deno.land/std@0.78.0/hash/sha256.ts";

export type SiteFile = {path: string, body: Uint8Array};
export async function deployFirebaseSite(siteId: string, accessToken: string, files: Iterable<SiteFile>, siteConfig?: unknown) {
  const authorization = `Bearer ${accessToken}`;
  const jsonHeaders = {
    authorization,
    'content-type': 'application/json',
  };

  const {name, status} = await fetch(
    `https://firebasehosting.googleapis.com/v1beta1/sites/${siteId}/versions`, {
      method: 'POST',
      body: JSON.stringify({
        config: siteConfig,
      }),
      headers: jsonHeaders,
    }).then(x => x.json()) as {name: string; status: string};
  console.log('Firebase release', name, 'is', status);

  const fileHashes: Record<string,string> = Object.create(null);
  const hashMap = new Map<string,SiteFile&{compressed: Uint8Array}>();
  for (const file of files) {
    const compressed = gzipEncode(file.body);
    const hash = new Sha256().update(compressed).hex();
    hashMap.set(hash, {...file, compressed});
    fileHashes[file.path] = hash;
  }

  let {uploadRequiredHashes, uploadUrl} = await fetch(
    `https://firebasehosting.googleapis.com/v1beta1/${name}:populateFiles`, {
      method: 'POST',
      body: JSON.stringify({
        files: fileHashes,
      }),
      headers: jsonHeaders,
    }).then(x => x.json()) as {uploadRequiredHashes: string[], uploadUrl: string};
  uploadRequiredHashes = uploadRequiredHashes ?? [];
  console.log('Firebase wants', uploadRequiredHashes.length, 'files out of', hashMap.size);

  for (const requiredHash of uploadRequiredHashes) {
    const file = hashMap.get(requiredHash);
    if (!file) throw new Error(`BUG: firebase wanted hash ${requiredHash} which we didn't offer`);

    const resp = await fetch(uploadUrl+'/'+requiredHash, {
      method: 'POST',
      body: file.compressed,
      headers: { authorization,
        'content-type': 'application/octet-stream',
      },
    });
    if (resp.status !== 200) throw new Error(`Firebase file upload returned ${resp.status}`);
    const compRatio = (file.body.length - file.compressed.length) / file.body.length;
    console.log('Uploaded', file.path, '-', Math.round(compRatio * 100), '% compression');
  }

  const release = await fetch(
    `https://firebasehosting.googleapis.com/v1beta1/${name}?update_mask=status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'FINALIZED',
      }),
      headers: jsonHeaders,
    }).then(x => x.json());
  console.log('Completed Firebase release:', release);

  const deployParams = new URLSearchParams([['versionName', name]]);
  const deploy = await fetch(
    `https://firebasehosting.googleapis.com/v1beta1/sites/${siteId}/releases?${deployParams}`, {
      method: 'POST',
      headers: { authorization },
    }).then(x => x.json());
  console.log('Completed Firebase deploy:', deploy);
  return deploy;
}
