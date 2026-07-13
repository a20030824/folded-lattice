# Folded Lattice

以 TypeScript、Canvas 2D 與 WebGL 製作的生成式動態桌布引擎。共享的晶格物理、拓撲與 reveal 管線，透過 preset 組合成不同作品；目前包含 **Breathing Membrane**、**Crumpled Paper**、**Wandering Ink** 與 **Tide Archive**。

## 開發

```bash
npm install
npm run dev
```

驗證與正式打包：

```bash
npm run typecheck
npm run test:run
npm run build
```

`npm run build` 會輸出可離線執行的 `dist/`，可直接載入 Lively Wallpaper。開發時維護 `public/LivelyProperties.json`；Lively 的平台事件由 `src/wallpaper/` 轉換成 preset 提供的 property bindings，核心引擎不依賴 Lively API。

## 架構入口

```text
src/core/       共享資料、拓撲、系統、引擎迴圈與 renderer
src/features/   feature 專屬 config、runtime resource 與型別
src/presets/    作品組合、renderer、property bindings 與 registry
src/wallpaper/  Lively 與 pointer 等平台 adapter
src/app/        瀏覽器啟動與 runtime glue
```

閱讀順序：

- [`docs/architecture.md`](./docs/architecture.md)：模組邊界、資料所有權與依賴方向
- [`docs/adding-a-preset.md`](./docs/adding-a-preset.md)：新增 preset 的實作檢查表
- [`docs/preset-roadmap.md`](./docs/preset-roadmap.md)：已實作與規劃中的作品方向
- [`初始.md`](./初始.md)：完整的原始設計背景

## Presets

- [Wandering Ink](https://a20030824.github.io/folded-lattice/?preset=ink)
- [Breathing Membrane](https://a20030824.github.io/folded-lattice/?preset=membrane)
- [Crumpled Paper](https://a20030824.github.io/folded-lattice/?preset=paper)
- [Tide Archive](https://a20030824.github.io/folded-lattice/?preset=tide)
