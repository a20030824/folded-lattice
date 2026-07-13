# 新增 preset 指南

新增 preset 應讓它成為一個可替換的 `PresetDefinition`，而不是把作品差異散落到 app 或 core。以下順序是建議的實作檢查表。

## 實作步驟

1. **建立 feature-specific config key**：若作品有專屬參數，在 `src/features/<feature>/config.ts` 定義型別與 typed key，從 `FoldedLatticeConfig` 的 `modules` 取用。
2. **建立 feature-specific runtime resource key**：若作品需要 creature、field、cache、tag 或其他可變資料，在 feature 的 `state.ts` 定義 runtime 型別與 `ResourceKey`，不要把它加到 `SimulationState`。
3. **建立 config factory**：在 preset 的 `createConfig()` 建立共享 config、`ModuleConfigStore`，並寫入 feature config。每次呼叫都要得到獨立的 runtime config。
4. **建立 topology builder**：使用現有 builder，或實作 `TopologyBuilder`。若 topology 需要初始化 feature runtime，回傳 `TopologyBuildResult.initializeResources`。
5. **組合 systems**：把共享 systems 與新 feature systems 排成固定 timestep 與 frame timestep 兩組；system 以 contract 取得 config/state，不分支檢查 preset id。
6. **建立 renderer factory**：實作 `createRenderer(canvas, config)`，回傳 `PresetRendererResult`。WebGL fallback、canvas replacement 與 feature-specific draw state 都留在這個 factory/renderer 內。
7. **建立 property bindings**：在 preset 內實作 `createPropertyBindings(config)`。平台 property 只透過 binding 修改設定；需要重建 topology 或刷新 renderer 時使用 binding context。
8. **加入 registry**：在 `src/presets/registry.ts` 註冊 canonical id 與 aliases，讓 URL 和平台 preset selection 都走同一個 resolver。
9. **加入 alias test**：確認 canonical id、每個 alias、未知名稱與空值都解析到預期 definition。
10. **加入 smoke test**：使用 fake renderer 建立 engine，至少驗證初始 topology、固定 tick 後 state 有限、resize/rebuild 與 dispose；若有 feature runtime，再驗證 resource key 的初始化與生命週期。

## 邊界規則

- `main.ts` 不得新增 preset id switch。renderer 與 mode 應由 `PresetDefinition` 提供。
- core state 不得新增 work name、作品 id 或作品專屬欄位。專屬可變資料放在 feature runtime resource。
- 不得在 `FoldedLatticeConfig` 新增任意 optional feature 欄位。專屬設定放進 feature-specific `ModuleConfigStore` key。
- `src/wallpaper/lively.ts` 不得直接操控 feature config。它只能執行 preset 提供的 property bindings，並處理平台事件與 debounce。
- renderer 不應透過全域變數尋找作品設定；由 preset factory 或 feature key 明確注入／取用。
- topology rebuild 後，所有與 topology index 對齊的 feature resource 都必須重新初始化或明確保留有效性。
- 新 preset 的 aliases 應在 registry test 中固定下來，避免 URL 行為因重構而漂移。

## 最小結構

```text
src/features/<feature>/
  config.ts       feature config type + module key
  state.ts        optional runtime resource type + resource key

src/presets/<preset>.ts
  createConfig()
  createRenderer()
  createPropertyBindings()
  topologyBuilder
  simulationSystems
  frameSystems

tests/
  registry.test.ts
  <feature>.test.ts
  engine.test.ts
```

若新作品完全由現有 feature 組成，可以省略新的 feature 目錄，但仍須保留 preset 自己的 config factory、renderer factory、bindings、registry alias test 與 engine smoke test。

## 完成前檢查

```bash
npm run typecheck
npm run test:run
npm run build
```

同時確認 README 只保留高層架構入口，詳細責任分界更新在 [`architecture.md`](./architecture.md)，作品構想更新在 [`preset-roadmap.md`](./preset-roadmap.md)。
