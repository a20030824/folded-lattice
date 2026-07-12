import { describe, expect, it } from "vitest";
import {
  createModuleConfigKey,
  ModuleConfigStore,
} from "../src/core/moduleConfig";
import { createResourceKey, ResourceStore } from "../src/core/resources";

describe("ResourceStore", () => {
  it("keeps symbol-keyed values isolated and lazily creates once", () => {
    const store = new ResourceStore();
    const numberKey = createResourceKey<number>("number");
    const stringKey = createResourceKey<string>("string");

    expect(numberKey.id).not.toBe(stringKey.id);
    expect(store.get(numberKey)).toBeUndefined();
    expect(store.getOrCreate(numberKey, () => 4)).toBe(4);
    expect(store.getOrCreate(numberKey, () => 5)).toBe(4);
    store.set(stringKey, "ok");
    expect(store.require(stringKey)).toBe("ok");
    store.delete(stringKey);
    expect(() => store.require(stringKey)).toThrow(/string/);
  });
});

describe("ModuleConfigStore", () => {
  it("keeps typed module values isolated and reports missing values", () => {
    const store = new ModuleConfigStore();
    const key = createModuleConfigKey<{ enabled: boolean }>("feature");
    expect(store.get(key)).toBeUndefined();
    expect(() => store.require(key)).toThrow(/feature/);
    store.set(key, { enabled: true });
    expect(store.require(key)).toEqual({ enabled: true });
  });
});
