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

# 產生四個可獨立匯入 Lively 的資料夾與 ZIP
npm run build:lively

# 安裝 Playwright Chromium 並執行 app entry runtime tests
npx playwright install chromium
npm run test:browser
```

Vitest 覆蓋 core、topology、systems、feature runtime、preset lifecycle 與 Lively package manifest；Playwright 會透過 Vite 啟動真正的 `index.html` / app entry，驗證 RAF runtime、preset aliases、Lively preset switching、pointer input、URL mode、WebGL recovery 與 Canvas fallback。

`npm run build` 會輸出可離線執行的 `dist/`，普通網站仍是四個 preset 的共同展示頁。`npm run build:lively` 另外輸出 `lively-dist/`，其中包含四個獨立桌布項目與 ZIP；每個項目有固定 preset 和精簡的個人化面板，但共用同一份應用程式碼。開發時維護 `public/LivelyProperties.json`，各發行包的控制清單由 `lively-packages/manifest.json` 決定。

Lively 的平台事件由 `src/wallpaper/` 轉換成 preset 提供的 property bindings，核心引擎不依賴 Lively API。

## 架構入口

```text
src/core/       共享資料、拓撲、系統、引擎迴圈與 renderer
src/features/   feature 專屬 config、runtime resource 與型別
src/presets/    作品組合、renderer、property bindings 與 registry
src/wallpaper/  Lively 與 pointer 等平台 adapter
src/app/        瀏覽器啟動與 runtime lifecycle
```

閱讀順序：

- [`docs/art-direction.md`](./docs/art-direction.md)：現行藝術方向、動態語言與視覺禁區
- [`docs/architecture.md`](./docs/architecture.md)：模組邊界、資料所有權與依賴方向
- [`docs/runtime-lifecycle.md`](./docs/runtime-lifecycle.md)：preset staging、commit、rollback 與 cleanup
- [`docs/lively-packages.md`](./docs/lively-packages.md)：四個獨立 Lively 發行包的建置方式
- [`docs/adding-a-preset.md`](./docs/adding-a-preset.md)：新增 preset 的實作檢查表
- [`docs/preset-roadmap.md`](./docs/preset-roadmap.md)：已實作與規劃中的作品方向
- [`設計大競爭.md`](./設計大競爭.md)：四版設計競爭總覽；逐回合完整紀錄另存於 `docs/archive/`

## Presets

- [Wandering Ink](https://a20030824.github.io/folded-lattice/?preset=ink)
- [Breathing Membrane](https://a20030824.github.io/folded-lattice/?preset=membrane)
- [Crumpled Paper](https://a20030824.github.io/folded-lattice/?preset=paper)
- [Tide Archive](https://a20030824.github.io/folded-lattice/?preset=tide)
