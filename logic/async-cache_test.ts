import { AsyncCache } from "./async-cache.ts";

import {
  assertEquals,
} from "https://deno.land/std@0.105.0/testing/asserts.ts";

Deno.test('basic async functionality', async () => {

  let counter = 1;
  const cache = new AsyncCache({
    loadFunc: async (delayMs: number) => {
      await new Promise(ok => setTimeout(ok, delayMs));
      return counter++;
    },
  });

  const ids = await Promise.all([
    cache.get(500),
    cache.get(500),
    cache.get(200),
    cache.get(250),
  ]);

  assertEquals(ids, [3, 3, 1, 2]);

});
