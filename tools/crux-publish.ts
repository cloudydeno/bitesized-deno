#!/usr/bin/env -S deno run --allow-read=. --allow-write=README.md --allow-net=crux.land
import { walk } from "https://deno.land/std@0.177.0/fs/walk.ts";
import { encode as base64Enc } from "https://deno.land/std@0.177.0/encoding/base64.ts";
const serverOrigin = "https://crux.land";

// Let the server know who we are, if we're from the Internet
const userAgent = `cloudydeno-crux-publish/1 (Deno/${Deno.version}${
  import.meta.url.startsWith("http") ? `, +${import.meta.url}` : ""
})`;

if (Deno.args.length < 1) {
  console.error(`usage: crux-publish <root directory> [--update-readme]`);
  console.error(`WARN: this script uploads your files to the Internet forever`);
  Deno.exit(4);
}

let modules = new Array<{ path: string; url: string; fragment: string }>();
for await (
  const file of walk(Deno.args[0], {
    includeDirs: false,
    exts: [".ts"],
  })
) {
  if (file.isSymlink) continue;
  if (file.name.endsWith('_test.ts')) continue;
  await writeProgress(`  - ${file.name} ... `);

  if (modules.length >= 20) {
    console.error(`Refusing to upload more than ${modules.length} modules`);
    Deno.exit(3);
  }

  try {
    const data = await Deno.readFile(file.path);
    const { id, comment } = await uploadFile(file.name, data);
    modules.push({
      path: file.path,
      url: `${serverOrigin}/${id}`,
      fragment: file.name.replace(/\.ts$/, ""),
    });
    await writeProgress(`${serverOrigin}/${id} ${comment}`.trimRight());
  } finally {
    await writeProgress("\n");
  }
}
console.log(`Submitted ${modules.length} modules to ${serverOrigin}`);
modules.sort((a, b) => a.path.localeCompare(b.path));

if (Deno.args.includes("--update-readme")) {
  await writeProgress(`Updating README.md ... `);
  try {
    await updateTable(
      "README.md",
      "| Module |",
      [
        `| Module | Permanent URL |`,
        `|---|---|`,
        ...modules.map((x) =>
          `| \`${x.path}\` | [${x.url}](${x.url}#${x.fragment}) |`
        ),
      ].join("\n"),
    );

    await writeProgress("done");
  } finally {
    await writeProgress("\n");
  }
}

// end of script :)

/// Upload a text file to crux.land and return the assigned ID
async function uploadFile(name: string, body: Uint8Array) {
  const resp = await fetch(`${serverOrigin}/api/add`, {
    method: "POST",
    body: JSON.stringify({
      name: name,
      content: base64Enc(body),
    }),
    headers: {
      "user-agent": userAgent,
      "content-type": "application/json",
    },
  });
  if (![201, 400].includes(resp.status)) {
    throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json() as { error?: string; id?: string };
  if (data.id) return { id: data.id, comment: "(new version)" };

  // catch a specific HTTP 400, handle as a success
  // TODO: make crux.land's API friendlier to already-successful uploads
  const match = data.error?.match(/^File already exists \((?<id>[^)]+)\)/);
  if (match?.groups) {
    return { id: match.groups.id, comment: "" };
  }

  throw new Error(`server said: ${data.error || resp.statusText}`);
}

/// Replace a specific section of the Markdown file with new contents
async function updateTable(path: string, magic: string, newChunk: string) {
  const original = await Deno.readTextFile(path);
  const chunks = original.split(/\n\n+/g);
  const tableChunkIdx = chunks.findIndex((x) => x.startsWith(magic));
  if (tableChunkIdx < 0) {
    console.error(`\nI didn't find a Markdown table to update in ${path}`);
    console.error(`Make sure you have a section starting with "${magic}"`);
    Deno.exit(6);
  }
  chunks[tableChunkIdx] = newChunk;
  await Deno.writeTextFile(path, chunks.join("\n\n"));
}

/// Helper for printing without automatic trailing newlines
async function writeProgress(text: string) {
  await Deno.stdout.write(new TextEncoder().encode(text));
}
