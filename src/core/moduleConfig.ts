export interface ModuleConfigKey<T> {
  readonly id: symbol;
  readonly debugName: string;
  readonly __type?: T;
}

export function createModuleConfigKey<T>(
  debugName: string,
): ModuleConfigKey<T> {
  return {
    id: Symbol(debugName),
    debugName,
  };
}

export class ModuleConfigStore {
  private readonly values = new Map<symbol, unknown>();

  get<T>(key: ModuleConfigKey<T>): T | undefined {
    return this.values.get(key.id) as T | undefined;
  }

  require<T>(key: ModuleConfigKey<T>): T {
    if (!this.values.has(key.id)) {
      throw new Error(`Module config "${key.debugName}" is not available.`);
    }
    return this.values.get(key.id) as T;
  }

  set<T>(key: ModuleConfigKey<T>, value: T): void {
    this.values.set(key.id, value);
  }
}
