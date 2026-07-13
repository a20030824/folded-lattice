# Folded Lattice 架構

Folded Lattice 將「共享的晶格模擬」與「作品的個性」分開。`core` 提供可重用的資料結構、拓撲建構、模擬系統與引擎生命週期；`presets` 決定一個作品要組合哪些模組、如何建立設定、如何顯示，以及如何接收平台設定。

## 依賴方向

```text
app → preset registry → preset/features → core
platform adapter → property bindings
```

其中：

- `src/app/main.ts` 只處理瀏覽器 runtime glue：選擇 preset、建立 renderer、綁定 pointer、安裝 Lively bridge，以及處理 resize、visibility 與 cleanup。
- `src/presets/registry.ts` 是 preset 的唯一解析入口。URL 或平台事件只需要提供名稱，registry 便回傳完整的 `PresetDefinition`。
- `src/presets/` 組合共享 core 系統與作品專屬 feature。preset 不把作品名稱或 id 傳進 core 讓 core 分支處理。
- `src/features/` 放置某個可重用 feature 的設定、runtime resource 與型別；它可以依賴 core contract，但不應把另一個作品的知識塞回 core。
- `src/core/` 不依賴具體作品。core 只認識通用的 `FoldedLatticeConfig`、`SimulationState`、system、topology builder 與 renderer contract。
- `src/wallpaper/` 是平台 adapter。它把 Lively 的 property 事件轉成 preset 提供的 binding，不直接讀寫 feature config。

## 主要責任

### Config

`FoldedLatticeConfig` 位於 `src/core/config.ts`，只保留所有 preset 都能理解的共享設定：topology、physics、fields、memory、reveal、render 與 performance。每個 preset 由自己的 `createConfig()` 建立完整設定，並建立 `ModuleConfigStore`。

作品或 feature 專屬設定不再新增成 core config 的任意 optional 欄位。它們放在 feature 目錄，例如：

- `features/membrane/config.ts`：pulse、wave 與 legacy memory 設定
- `features/crease/config.ts`：crease 與 crease life 設定
- `features/tideArchive/config.ts`：contour 設定
- `features/wanderingInk/config.ts`：creature 設定

### State

`src/core/state.ts` 只描述共享晶格：nodes、edges、triangles、fields、pointer、viewport 與時間。共享 mesh state 不應出現某個作品的 creature、crease 或其他專屬欄位。

可變的 feature runtime 存在 `ResourceStore`（`src/core/resources.ts`）中，以 feature 自己定義的 typed key 取用。目前的例子包括：

- `features/wanderingInk/state.ts` 的 creature、edge ink 與 wick scratch
- `features/crease/state.ts` 的 crease edges、crease field 與 node tags

這讓 topology rebuild 能以 `TopologyBuildResult.initializeResources` 初始化或替換相關 resource，而不必擴張共享 `SimulationState`。

### System

`SimulationSystem` 在固定時間步更新 state，`FrameSystem` 在每個繪製 frame 更新非固定步驟的資料。system 透過 contract 接收 state 與 config，不知道目前是哪個 preset。

共享系統位於 `src/core/fields`、`src/core/memory`、`src/core/reveal`、`src/core/simulation`；preset 只在自己的定義中排列需要的系統。這使同一個 pressure、spring、memory 或 pointer 系統可被多個作品重用。

### Preset

`PresetDefinition` 是一個作品的組合邊界，包含：

- canonical `id`、URL `aliases`、顯示名稱與描述
- `createConfig()` 與可選的 `applyMode()`
- `createRenderer()`
- `createPropertyBindings()`
- `topologyBuilder`
- fixed simulation systems 與 frame systems

目前的 preset 對應如下：

| Preset | 拓撲 | 主要顯示方式 | 專屬 feature |
| --- | --- | --- | --- |
| Breathing Membrane | Delaunay | WebGL membrane，Canvas fallback | pulse、wave、legacy memory |
| Crumpled Paper | crease topology | WebGL paper，Canvas fallback | crease、crease life |
| Wandering Ink | Delaunay | Canvas ink | creature、ink wick |
| Tide Archive | crease topology | Canvas contours | crease、contour archive |

### ResourceStore

`ResourceStore` 是 typed key/value 容器，負責 feature runtime 的生命週期邊界。feature 定義自己的 key 與 state factory，system 以 key 取得資源；core 不需要知道資源的具體型別或作品名稱。拓撲重建時，builder 可透過 `initializeResources` 建立與新 topology 對齊的 resource。

### ModuleConfigStore

`ModuleConfigStore` 是 feature 設定的 typed key/value 容器。preset 在 `createConfig()` 中寫入 feature config；system、topology builder 與 renderer 透過 feature key 取得設定。這與 `ResourceStore` 分開：前者是相對穩定、可由平台 binding 修改的設定，後者是每次模擬持續變化的 runtime 資料。

### TopologyBuilder

`TopologyBuilder` 接收 viewport 與共享 config，回傳 `TopologyBuildResult`。結果包含通用 `TopologyState`，也可提供 `initializeResources` 來初始化 feature runtime。Delaunay 與 crease topology 都遵守同一個 contract；引擎不需要知道使用哪一種幾何。

### Renderer ownership

renderer 由 preset 的 `createRenderer()` 建立，並實作共享的 `Renderer` contract：`resize`、`render` 與 `dispose`。因此 renderer 可以讀取共享 state，也可以讀取自己 feature 的 module config/resource，但 renderer 選擇不放在 core 或 `main.ts` 的 preset id switch 裡。

需要 WebGL fallback 的 preset 在自己的 renderer factory 內替換 canvas 並回傳新的 canvas 與 renderer。app 只接收 `PresetRendererResult`，不保存任何作品專屬的渲染判斷。

### Property bindings

`src/core/propertyBindings.ts` 定義平台無關的 property binding 與 binding context。每個 preset 的 `createPropertyBindings(config)` 決定平台設定如何改變該 preset 的共享或 feature config；例如 node count 可以要求 topology rebuild，quality 可以要求 renderer refresh。

`src/wallpaper/lively.ts` 只負責：讀取 Lively 事件、尋找 binding、執行 binding、管理 debounce，以及將 preset selection 交回 app。它不能直接操作 `creatureConfig`、`creaseConfig` 或其他 feature config。

### Platform adapters

`src/wallpaper/lively.ts` 與 `src/wallpaper/pointer.ts` 是平台邊界。Lively adapter 處理 `window.livelyPropertyListener`，pointer adapter 處理 DOM pointer event；兩者都透過 contract 呼叫引擎，不讓 core 依賴瀏覽器平台 API。未來若加入另一個 host，應新增 adapter 或 binding layer，而不是改寫 core system。

## 生命週期

```text
URL / platform event
        ↓
  preset registry
        ↓
createConfig → createRenderer → createEngine
        ↓              ↓
topology builder   renderer.resize/render
        ↓
resource initialization
        ↓
fixed systems → frame systems → renderer
```

`createEngine()` 只負責通用的 animation loop、fixed timestep、resize/rebuild、render 與 dispose。preset 的資料與行為由 `PresetDefinition` 注入；切換 preset 時，app 會清理舊 runtime，再用 registry 解析的新 definition 建立下一個 runtime。
