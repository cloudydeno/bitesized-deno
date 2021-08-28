/**
 * A Map which can upsert keys on use.
 * Uses a supplied factory function in cases where the key doesn't exist yet.
 */
export class FactoryMap<K,V> extends Map<K,V> {

  constructor(private factoryFunc: (key: K) => V) {
    super();
  }

  getOrCreate(key: K) {
    let value = this.get(key);
    if (!value) {
      value = this.factoryFunc(key);
      this.set(key, value);
    }
    return value;
  }
}
