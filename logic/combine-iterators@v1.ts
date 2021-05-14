// port of https://stackoverflow.com/a/50586391
type IteratorBundle<T> = { index: number, result: IteratorResult<T,any> };
export async function* combine<T>(iterable: Iterable<AsyncIterableIterator<T>>) {
  const asyncIterators = Array.from(iterable, o => o[Symbol.asyncIterator]());
  const results = [];
  let count = asyncIterators.length;
  let complete: ((val: IteratorBundle<T>) => void) | undefined;
  const never = new Promise<IteratorBundle<T>>(ok => {complete = ok});
  async function getNext(asyncIterator: AsyncIterator<T>, index: number) {
    const result = await asyncIterator.next();
    return { index, result };
  }
  const nextPromises = asyncIterators.map(getNext);
  try {
    while (count) {
      const {index, result} = await Promise.race(nextPromises);
      if (result.done) {
        nextPromises[index] = never;
        results[index] = result.value;
        count--;
      } else {
        nextPromises[index] = getNext(asyncIterators[index], index);
        yield result.value;
      }
    }
  } finally {
    for (const [index, iterator] of asyncIterators.entries())
      if (nextPromises[index] != never && iterator.return != null)
        iterator.return();
    if (complete) complete({index: -1, result: {value: undefined, done: true}});
    // no await here - see https://github.com/tc39/proposal-async-iteration/issues/126
  }
  return results;
}
