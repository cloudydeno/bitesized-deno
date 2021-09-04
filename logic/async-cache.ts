export type AsyncKeyedCacheOptions<TInput,TKey,TValue> = {
  loadFunc: (input: TInput, key: TKey) => PromiseLike<TValue>;
  keyFunc: (input: TInput) => TKey;
  cacheRejects?: boolean;
  cacheFalsey?: boolean;
}

export class AsyncKeyedCache<TInput,TKey,TValue> {
  constructor(opts: AsyncKeyedCacheOptions<TInput,TKey,TValue>) {
    this.loadFunc = opts.loadFunc;
    this.keyFunc = opts.keyFunc;
    this.cacheRejects = opts.cacheRejects ?? false;
    this.cacheFalsey = opts.cacheFalsey ?? true;
  }

  loadFunc: (input: TInput, key: TKey) => PromiseLike<TValue>;
  keyFunc: (input: TInput) => TKey;
  cacheRejects: boolean;
  cacheFalsey: boolean;
  entities = new Map<TKey,TValue>();
  promises = new Map<TKey,PromiseLike<TValue>>();

  // returns value only if it's already loaded
  peek(input: TInput) {
    const key = this.keyFunc(input);
    return this.entities.get(key);
  }

  // returns existing value or promise, or loads the node afresh
  get(input: TInput, loadFunc=this.loadFunc) {
    const key = this.keyFunc(input);
    //console.log('cache is using key', key)
    if (this.entities.has(key))
      return this.entities.get(key);
    if (this.promises.has(key))
      return this.promises.get(key);

    const promise = this.load(key, input, loadFunc);
    this.set(key, promise);
    return promise;
  }

  // bring a new value into the cache
  async load(key: TKey, input: TInput, loadFunc: (input: TInput, key: TKey) => PromiseLike<TValue>) {
    try {
      const value = await loadFunc(input, key);
      // TODO: check if we're still relevant before writing
      this.set(key, value);
      return value;
    } catch (err) {
      const rejection = Promise.reject(err);
      if (this.cacheRejects) {
        this.set(key, rejection);
      } else {
        // TODO: check if we're still relevant before deleting
        this.promises.delete(key);
      }
      //console.error(`LoaderCache failed to load value`, key, input, err);
      return rejection;
    }
  }

  // (sync) iterate what's immediately available
  loadedEntities() {
    return this.entities.values();
  }
  // wait for pending loads to finish, then iterate everything
  async allEntities() {
    await Promise.all(this.promises.values());
    return this.entities.values();
  }

  // replace a key with specific value or promise
  set(key: TKey, value: TValue | PromiseLike<TValue>) {
    if (key == null) throw new Error(
      `BUG: AsyncCache can't set nullish key`);
    // if (typeof key !== 'string')
    //   key = this.keyFunc(key);

    this.promises.delete(key);
    this.entities.delete(key);

    if (isPromiseLike(value))
      this.promises.set(key, value);
    else if (value != null || this.cacheFalsey)
      this.entities.set(key, value);
  }

  clearAll() {
    this.entities.clear();
    this.promises.clear();
  }

  async delete(id: TKey/*, input: I*/): Promise<void> {
    if (this.entities.has(id)) {
      // const value = this.entities.get(id);
      // if (value && value.stop) {
      //   await value.stop(input);
      // }
      this.entities.delete(id);

    } else if (this.promises.has(id)) {
      try {
        console.warn('purge-pending value', id, 'is still starting, waiting...');
        await this.promises.get(id);
        return this.delete(id);
      } catch (err) {
        console.warn('purge-pending value', id, 'failed to start -- moving on');
      }

    } else {
      console.warn('not purging value', id, `- it wasn't started (??)`);
    }
  }

}

export class AsyncCache<TInput,TValue> extends AsyncKeyedCache<TInput,TInput,TValue> {
  constructor(opts: Omit<AsyncKeyedCacheOptions<TInput,TInput,TValue>, 'keyFunc'>) {
    super({ ...opts,
      keyFunc: x => x,
    });
  }
}

function isPromiseLike<T>(val: T | PromiseLike<T>): val is PromiseLike<T> {
  return val && typeof (<PromiseLike<T>>val).then == 'function';
}
