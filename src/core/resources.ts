export interface ResourceKey<T> {
  readonly id: symbol;
  readonly debugName: string;
  readonly __type?: T;
}

export function createResourceKey<T>(debugName: string): ResourceKey<T> {
  return {
    id: Symbol(debugName),
    debugName,
  };
}

export class ResourceStore {
  private readonly values = new Map<symbol, unknown>();

  get<T>(key: ResourceKey<T>): T | undefined {
    return this.values.get(key.id) as T | undefined;
  }

  require<T>(key: ResourceKey<T>): T {
    if (!this.values.has(key.id)) {
      throw new Error(`Resource "${key.debugName}" is not available.`);
    }
    return this.values.get(key.id) as T;
  }

  set<T>(key: ResourceKey<T>, value: T): void {
    this.values.set(key.id, value);
  }

  delete<T>(key: ResourceKey<T>): void {
    this.values.delete(key.id);
  }

  getOrCreate<T>(key: ResourceKey<T>, factory: () => T): T {
    if (this.values.has(key.id)) {
      return this.values.get(key.id) as T;
    }

    const value = factory();
    this.values.set(key.id, value);
    return value;
  }
}
