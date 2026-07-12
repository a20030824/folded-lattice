# Folded Lattice

以 TypeScript 與 Canvas 2D 製作的生成式動態桌布引擎。第一個 preset 是 **Breathing Membrane**：一張由壓力場、彈簧、結構記憶與顯影共同驅動的三角薄膜。

## 開發

```bash
npm install
npm run dev
```

正式打包與本機預覽：

```bash
npm run build
npm run preview
```

`npm run build` 會先執行嚴格 TypeScript 檢查，再輸出可離線執行的 `dist/`。Vite 的資源路徑使用相對路徑，因此成品可作為一般網頁或桌布程式的 Web wallpaper 載入。

## Lively Wallpaper

1. 執行 `npm run build`。
2. 在 Lively 選擇新增桌布，載入 `dist/index.html`。
3. Lively 會讀取同層的 `LivelyProperties.json`，提供顏色、結構密度、壓力、記憶、滑鼠互動、畫質與 FPS 設定。

開發時只維護 `public/LivelyProperties.json`；Vite 會在建置時自動將它複製到 `dist/`。核心引擎沒有依賴 Lively API，`src/wallpaper/lively.ts` 只負責把 Lively 的設定事件映射到引擎 config。

## 架構

```text
src/
  core/        資料型別、拓撲、系統、引擎迴圈與 Canvas renderer
  presets/     作品個性與參數組合
  wallpaper/   Lively 設定橋接與指標輸入
  app/         瀏覽器啟動入口
```

目前已包含：

- 固定 seed 的全畫面 Poisson-disc sampling 與 Delaunay triangulation
- node／edge／triangle adjacency 與固定 hull 邊界
- 固定時間步、壓力場、環境漂移、彈簧、阻尼及深度限制
- edge／triangle memory 與 tension/fold reveal
- HiDPI Canvas 2D renderer、resize 重建、背景分頁暫停
- hover、拖曳及按下反向形變
- Lively Properties 即時設定橋接

詳細設計與後續 preset 規格保留在 [`初始.md`](./初始.md)。

## Presets

- [Wandering Ink](https://a20030824.github.io/folded-lattice/)
- [Breathing Membrane](https://a20030824.github.io/folded-lattice/?preset=membrane)
- [Crumpled Paper](https://a20030824.github.io/folded-lattice/?preset=paper)
- [Tide Archive](https://a20030824.github.io/folded-lattice/?preset=tide)
