# Preset roadmap

這份 roadmap 描述作品層的方向，不把尚未驗證的視覺決策硬編進 shared core。每個新 preset 都應先找出可重用的拓撲、field、memory、reveal 與 renderer 能力，再新增最小的 feature module。

## 已實作

- **Breathing Membrane**：壓力場驅動三角薄膜，使用 membrane wave、tension pulse、結構 memory 與 reveal；以 WebGL membrane 為主，Canvas 為 fallback。
- **Crumpled Paper**：有 crease topology 與 crease life 的紙面，使用 WebGL paper 為主，Canvas 為 fallback。
- **Wandering Ink**：一條會漫遊並刻入紙面的 ink creature，使用 Delaunay lattice 與 Canvas ink renderer。
- **Tide Archive**：慢速潮汐穿過摺疊場，只顯示相交高度與歷史痕跡，使用 crease topology 與 Canvas contour renderer。

## 規劃中：Stress Cartography

### 核心概念

把晶格當成一張持續累積的壓力地圖：壓力不是短暫的 blob，而是以路徑、方向與時間尺度留下可讀的 cartographic trace。

### 可重用模組

- Delaunay topology 與共享 node／edge／triangle state
- pressure field、ambient drift、pointer field
- edge/triangle memory、memory diffusion 與固定 timestep
- generic reveal bindings、Canvas/WebGL renderer contract

### 新增模組

- `stressCartography` config 與 runtime resource key
- 方向性 stress accumulation／advection system
- 可選的 local basin 或 ridge classification system
- 將 stress history 映射成 contour、isobar 或 vector glyph 的 renderer layer

### 拓撲

先使用現有 Delaunay topology。只有當方向性鄰接或多尺度區域查詢成為瓶頸時，才新增 topology metadata；不把 cartography 欄位加進共享 state。

### Reveal

以累積 stress、stress gradient 與最近一次脈衝的 age 控制顯影。長時間存在的 trace 應慢慢變淡，讓地圖具有可讀的歷史而不是永久塗滿畫面。

### Renderer

優先做可降級的 Canvas 2D layer，將 edge tint、細 contour 與少量方向標記分開繪製；若 glyph 數量或混合效果需要，再評估 WebGL pass。

### 刻意避免

不做即時儀表板、座標軸、文字標籤、固定色階 legend 或「科學資料視覺化」的 UI 感。它仍應是安靜的生成式桌布，而不是圖表工具。

## 規劃中：Phase Fold

### 核心概念

讓晶格呈現週期性相位折疊：各區域的 phase 逐漸同步、錯位、再跨過 fold threshold，形成不依賴單一中心的結構轉換。

### 可重用模組

- shared topology 與 crease topology 的鄰接資料
- ambient drift、pressure field、spring/integration/geometry
- triangle fold reveal、memory 與 pointer smoothing
- preset renderer factory 與 Lively property bindings

### 新增模組

- `phaseFold` config 與 runtime phase field resource
- phase oscillator／neighbour coupling system
- phase discontinuity 或 fold-front topology annotation
- 專門的 phase-aware shading/reveal renderer layer

### 拓撲

先沿用 Delaunay topology，將 phase 放在 feature runtime resource。若 fold front 需要穩定的 crease graph，再讓 builder 回傳 feature-specific resource initializer；共享 `NodeState`、`EdgeState` 與 `TriangleState` 不因作品名稱而增加欄位。

### Reveal

以 phase difference、crossing direction 與 fold-front age 驅動 reveal。顯影應像一個通過表面的相位事件，而非所有三角形同時閃爍。

### Renderer

以 WebGL 為候選主 renderer，利用 phase-based shading 與低成本的 fold-front pass；同時保留能維持結構閱讀性的 Canvas fallback，並把 fallback 決策留在 preset renderer factory。

### 刻意避免

不做霓虹科技介面、粒子爆炸、固定節拍的音樂可視化、明顯的 logo 或遊戲式分數。phase 應該改變 lattice 的內在狀態，而不是覆蓋成另一種特效。

## Roadmap 原則

規劃中的名稱不是 core 的 enum，也不是 `main.ts` 的分支。新增作品時，先以 feature config、feature resource、systems、topology builder 與 renderer factory 組合；只有完成 alias test、topology test 與 engine smoke test 後，才加入 registry。
