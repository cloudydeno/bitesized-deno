const { stdin } = Deno;
const LF = "\n".charCodeAt(0);
const CR = "\r".charCodeAt(0);
const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function readLineFromStdinSync() {
  const c = new Uint8Array(1);
  const buf = [];

  while (true) {
    const n = stdin.readSync(c);
    if (n === null || n === 0) {
      if (buf.length === 0) {
        return null;
      }
      continue;
    }
    if (c[0] === CR) {
      const n = stdin.readSync(c);
      if (c[0] === LF) {
        break;
      }
      buf.push(CR);
      if (n === null || n === 0) {
        break;
      }
    }
    if (c[0] === LF) {
      break;
    }
    buf.push(c[0]);
  }
  return decoder.decode(new Uint8Array(buf));
}

export function prompt(message: string, defaultValue: string): string;
export function prompt(message: string): string | null;
export function prompt(message: string, defaultValue?: string) {
  if (!stdin.isTerminal()) {
    return null;
  }

  Deno.stderr.writeSync(encoder.encode(`${message} `));

  if (defaultValue) {
    Deno.stderr.writeSync(encoder.encode(`[${defaultValue}] `));
    const input = readLineFromStdinSync();
    return input == null ? null : (input || defaultValue);
  } else {
    return readLineFromStdinSync();
  }
}
