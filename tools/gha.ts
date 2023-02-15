#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env
// Looks up a specific Github Actions job for the current repository
// and tries runs the same commands locally.

import { parse as parseYAML } from "https://deno.land/std@0.177.0/encoding/yaml.ts";
import * as path from "https://deno.land/std@0.177.0/path/mod.ts";

const context = findFsContext();

const configFile = context.workflows.find(x => x.includes('ci'));
if (!configFile) throw die
  `No actions workflow file has "ci" in the name.`;
const config = await readConfig(path.join(context.ghaDir, configFile));

// By default, run all unencumbered jobs
// Otherwise take a list of job IDs as arguments
const jobList = Deno.args.length ? Deno.args : Object
  .entries(config.jobs)
  .filter(x => !x[1].if && !x[1].needs)
  .map(x => x[0]);

for (const job of jobList) {
  const jobConfig = config.jobs[job];
  if (!jobConfig) throw die
    `Didn't find job ${job} in ${configFile}.`;

  console.error('#', jobConfig.name || job);
  let success = true;
  for (const step of jobConfig.steps) {
    if (!success && step.if !== 'always()') continue;
    if (step.uses) continue;

    if (step.run) {
      console.error('');
      const proc = Deno.run({
        cmd: ['bash', '--noprofile', '--norc', '-euxo', 'pipefail', '-c', step.run],
        cwd: path.resolve(step["working-directory"] || '.', context.rootDir),
        env: { ...config.env, ...jobConfig.env, ...step.env },
      });
      const status = await proc.status();
      if (!status.success) {
        console.error(`Exit code:`, status.code);
        success = false;
      }
      console.error();
    } else throw die
      `Tried executing unsupported job in ${job}.`;
  }

  if (!success)
    throw die `❌ Some jobs resulted in an error.`;
}
console.log('✅', 'All jobs completed successfully.\n');

function findFsContext() {
  const cleanTail = (x: string) => x.endsWith(path.sep) ? x.slice(0, -path.sep.length) : x;
  // always stop before the homedir if we know one
  const defaultTop = cleanTail(Deno.env.get('HOME') ?? path.parse(Deno.cwd()).root);
  let current = cleanTail(Deno.cwd());
  while (current != defaultTop) {
    const ghaDir = path.join(current, '.github', 'workflows');
    try {
      const items = Deno.readDirSync(ghaDir);
      const workflows = Array.from(items).filter(x => x.isFile).map(x => x.name);
      return { rootDir: current, ghaDir, workflows };
    } catch (err: unknown) {
      if (!(err instanceof Deno.errors.NotFound)) throw err;
    }
    const parent = path.dirname(current);
    if (parent == current) break;
    current = parent;
  }
  throw die `Didn't find any ".github/workflows" directories.`;
}

async function readConfig(path: string) {
  const parsed = parseYAML(await Deno.readTextFile(path));
  return parsed as {
    'name': string;
    'env'?: Record<string, string>;
    'jobs': Record<string, {
      'runs-on': string;
      'name': string;
      'needs'?: string;
      'env'?: Record<string, string>;
      'if'?: string;
      'steps': Array<{
        'name': string;
        'uses'?: string;
        'with'?: Record<string, unknown>;
        'run'?: string;
        'working-directory'?: string;
        'env'?: Record<string, string>;
        'if'?: string;
        'id'?: string;
      }>;
    }>;
  };
}

function die(template: TemplateStringsArray, ...stuff: unknown[]) {
  console.error(`\ngha:`, String.raw(template, ...stuff.map(x => JSON.stringify(x))), '\n');
  Deno.exit(1);
}
