# asmr3d空间渲染器 · Windows EXE UI 重设计 v2.1

> 更新日期：2026-10-07（v2.1 修订，吸收 ErgouTreeCrypt 紧凑平坦风格；修订摘要见 §0，修订交接证据见 `design/UI_REVISION_NOTES.md`）
> v2.2 调整：空间参数、参数模板与参数读数迁移到中栏，位于播放进度和
> 视频转音频之间；本地播放和直播截获共用该参数工作区。
> 范围：仅渲染层（`renderer/index.html`、`renderer/styles.css`、新增 `renderer/enhance.js`）。
> 音频算法、Web Audio 链路、IPC 协议（`desktop/preload.cjs`）、直播捕获逻辑（`desktop/*.cjs`）零改动；
> `renderer/app.js` 逐字节保持原样（原型目录内为主仓库验证用副本，sha256 已核对一致）。

---

## 0. v2.1 修订摘要（对照 v2）

依据 `design/UI_REVISION_BRIEF.md`，向"暗色版 ErgouTreeCrypt 的紧凑外壳"靠拢，功能与三栏结构不变：

| # | 修订 | v2 → v2.1 |
|---|------|-----------|
| 1 | 面板层级 | 每栏 7 个同权重玻璃卡片 → **每栏一个连续面板**，章节用标题行 + 1px 分隔线切分（`.panel` → `.rail-panel > .sect`） |
| 2 | 毛玻璃 | 面板 `blur(16px) saturate(120%)` → `blur(8px)`；顶栏/状态栏 16 → 8 |
| 3 | 顶栏 | 46 → 44px；版本号从描边徽章降为低对比灰字（不与引擎状态抢视觉） |
| 4 | 播放控制 | 文字按钮 → **图标按钮**（播放/暂停/停止/±10 秒），保留 aria-label 与 title；播放中为稳定状态点（去掉呼吸动画与外发光） |
| 5 | 空间参数 | 新增**行内单项复位图标**（`data-param-reset`），与读数精确输入、双击复位、Shift+方向 ×10 并存 |
| 6 | 渲染方式说明 | 固定 2-3 行 → **单行截断 + tooltip**（enhance.js 同步 `title`） |
| 7 | 视频转音频 | 变为可折叠章节（默认展开），仍居播放区下方 |
| 8 | 状态色语义 | "运行中"从粉改为**蓝**（进行中=蓝），与成功粉/警告琥珀/失败红四向分离；所有状态保持"颜色+图标+文字"三重表达 |
| 9 | 粉色收敛 | 章节标题图标、信号链箭头从粉改为中性灰；电平表渐变改为琥珀系；粉色仅存于主按钮/当前选项/焦点环/成功态 |
| 10 | 状态细分 | 徽章语义新增"需要 PowerShell 7 = 警告（琥珀）"，与"不可用=红"区分 |
| 11 | 阴影 | 依旧只有 Toast/抽屉/滑杆拇指三类；面板零投影 |
| 12 | 窄窗兜底 | 新增 `≤1080px` 单列堆叠（播放区最先），覆盖原生窗口 `minWidth:390` 的极端情况 |
| 13 | 窗口形态 | 确认 `desktop/main.cjs` 使用原生标题栏（1440×960，min 390×700），**不模拟系统标题栏、不加窗口控制按钮**；应用内顶栏只是工具条 |

不变的：81 个 ID 契约、三栏实时工作流、播放 sticky、停止不归零、进度可拖、直播/录制全程可见、抽屉与 Toast、快捷键、拖放导入。

---

## 1. 现状审计（v0.2 原版 UI）

### 1.1 信息层级问题

| # | 问题 | 证据（原文件） |
|---|------|----------------|
| A1 | 左栏 7 组功能平铺、无主次，1280×720 需滚动约 2 屏才能看到导出入口 | `index.html` L24-184（声音对象/渲染方式/空间参数+模板/导出/元数据全部同级展开） |
| A2 | 顶栏高 86px 只放标题和版本徽章，对常驻工具是纯浪费 | `styles.css` L77-84 `.topbar{min-height:86px}` |
| A3 | **整页滚动**而非分区滚动：向下查看导出/元数据时，正在播放的进度条与读数滚出视野，用户失去"现在在哪"的参照 | `styles.css` L146 `.workspace{min-height:calc(100vh - 126px)}` + body 滚动 |
| A4 | 底部"已实现方法"固定占一整行，把右栏"同步录制"块推出首屏 | `index.html` L381-438 |
| A5 | "视频转音频"占据中栏播放器正下方的黄金位置，但它是低频独立工具，与播放/渲染无关 | `index.html` L221-254 |
| A6 | 渲染方式当前模式的说明文字固定占 2-3 行（`#modeNote`），四档按钮选中态弱（小字+浅粉底） | `index.html` L57-65 |
| A7 | 输出文件夹入口埋在右栏录制块内，且初始 disabled（要等桌面桥返回目录后才可用），新用户找不到"结果在哪" | `index.html` L369-372 |

### 1.2 视觉问题

| # | 问题 | 证据 |
|---|------|------|
| B1 | 强调色语义混乱：粉 `#f58bbd`（品牌/主按钮）、琥珀 `#f2a65a`（数值+版本徽章）、`--ok:#ff9ecb` 也是粉。琥珀同时承担"数值读数"和"版本徽章"，看起来像警告 | `styles.css` L10-13 |
| B2 | 无图标体系，全部纯文字按钮，扫视成本高；按钮视觉重量全部相同 | 全文件 |
| B3 | 滑杆只用 `accent-color`，保留 Windows 原生细轨道小拇指，±0.1° 的精确调整很难 | `styles.css` L467-470 |
| B4 | 原生文件输入控件裸露（"未选择文件"灰字+默认按钮），与深色 UI 割裂 | `styles.css` L246-248 |
| B5 | 禁用态只有 `opacity:.45`，且可用的次要按钮也是低对比描边样式，两者容易混淆 | `styles.css` L267-270 等 |
| B6 | 背景顶部有一个 radial 粉色光斑，属"装饰性光斑"，且和插画叠加后显脏 | `styles.css` L29-34 |
| B7 | 12 个已实现方法全部被 `markMethods()` 标记 `.active`，左边框全部变粉，强调失去意义 | `app.js` L1909-1913 |
| B8 | 徽章样式不统一：`engine-state` 是方框、`version-badge` 琥珀、`#sourceBadge` 纯文字，状态一眼扫不出来 | `styles.css` L112-148 |

### 1.3 操作效率问题

| # | 问题 | 证据 |
|---|------|------|
| C1 | 无任何键盘快捷键（空格播放/暂停、方向键 ±10 秒都没有） | `app.js` 事件绑定全表 |
| C2 | 参数只能拖滑杆，无法键入精确值；复位按钮是全复位，没有单项复位 | `app.js` L2977-2983 |
| C3 | 错误只改一行行内文字颜色（如 `#liveStatus` data-state），无 Toast、无图标，直播扫描失败等提示极易被忽略 | `app.js` L2192-2195 |
| C4 | 不支持拖放导入音频/视频 | 全文件 |
| C5 | 暂停/停止在未加载任何音频时仍然可点（点了没反应但不说明原因） | `app.js` L2837-2850 无 disabled 逻辑 |
| C6 | AudioContext 状态藏在页脚最右侧小字，播放异常时用户不知道引擎状态 | `index.html` L443 |

**既有正确行为（v2 必须保留，已保留）**：停止不清零播放位置（`app.js` L2843-2850）、进度条拖动+80ms 节流跳播（L2852-2887）、导出期间锁定控件（L449-478）、模板导入即套用（L1164-1211）。

---

## 2. 新信息架构与三栏线框

### 2.1 布局原则

1. **三栏独立滚动**（左右 rail、中栏 stage 各自 overflow-y），app 框架本身不滚动——调参时播放面板永远可见。
2. 中栏播放面板 **sticky 置顶**，滚动中栏时最后消失。
3. 低频区折叠：参数模板、导出设置、对象元数据可折叠（默认展开，chevron 明示）；"已实现方法"收进状态栏触发的底部抽屉（只在 720p 以下显著省空间，方法说明是文档不是操作项，不构成"功能藏进二级页"）。
4. 当前模式三重反馈：左栏分段按钮选中态（radio 点+粉底）、`#modeNote` 一行说明、中栏信号链整体随模式切换——不新增大段文字。
5. 结果可达性：顶栏常驻"输出文件夹"按钮（桌面版）；导出完成状态文案自带保存路径。

### 2.2 线框图（1440×900）

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ▣ asmr3d空间渲染器 〈v0.2 公测版〉          [●待机]  [⤢ 输出文件夹]        46px  │
├───────────────┬───────────────────────────────────────────────┬──────────────────┤
│ 左栏 272-306  │ 中栏 fluid（sticky 播放面板）                  │ 右栏 288-326     │
│               │ ┌─ 播放进度 ─────────────────────────────┐    │ ┌─ 直播截获 ───┐ │
│ ┌ 声音对象 ─┐ │ │ 0:01 / 0:32  [5%]                     │    │ │ [未扫描]     │ │
│ │[未加载]   │ │ │ ═══════●──────────────────────────    │    │ │ 截获来源 ▾   │ │
│ │素材库 ▾   │ │ │ 拖动可实时跳转    [«后退10s][前进10s»] │    │ │ [扫描音频应用]│ │
│ │导入文件   │ │ └───────────────────────────────────────┘    │ │ [开始截获][停止]│
│ │▶播放 ⏸ ⏹ │ │ ┌─ 视频转音频 ──────────[待机]───────┐      │ │ 电平 ▂▄▆ −∞dB │ │
│ │↻ 循环播放 │ │ │ [选择文件…]                        │      │ │ 原声处理 ▾    │ │
│ └──────────┘ │ │ [24-bit▾][转换为 WAV]              │      │ │ 状态说明…     │ │
│ ┌ 渲染方式 ─┐ │ └───────────────────────────────────────┘    │ ├─ 同步录制 ───┤
│ │◉双耳兼容推荐│ │ ┌─ 空间参数读数 ──[随参数实时更新]──┐      │ │ ◉录制开关     │ │
│ │○浏览器HRTF│ │ │ ┌距离增益┐┌双耳声级差┐┌双耳时差┐   │      │ │ 分段|位深     │ │
│ │○参数化HRTF│ │ │ ┌空气吸收┐┌近场提升┐┌输出延时┐   │      │ │ 静音自动停止▾ │ │
│ │○Bypass    │ │ │ Mono→HRTF→Distance→Limiter→…      │      │ │ [保存位置][打开]│
│ │一行模式说明│ │ └───────────────────────────────────────┘    │ │ 保存位置…     │ │
│ └──────────┘ │ │（下方留白透出插画背景）              │      │ │ 录制状态…     │ │
│ ┌ 空间参数⤺┐ │ │                                       │      │ └──────────────┘ │
│ │方位角 0.0°│ │                                       │      │                  │
│ │───●───左/前/右│ │                                   │      │                  │
│ │仰角 … 距离…│ │                                       │      │                  │
│ │音量 …     │ │                                       │      │                  │
│ └──────────┘ │                                       │      │                  │
│ ┌ 参数模板 ▾┐ │                                       │      │                  │
│ ┌ 导出成品 ▾┐ │                                       │      │                  │
│ ┌ 元数据  ▾┐ │                                       │      │                  │
├───────────────┴───────────────────────────────────────────────┴──────────────────┤
│ ⓘ状态信息…                    [AudioContext:running·48kHz·10ms]  [▤已实现方法 12/12⌄] 34px│
└──────────────────────────────────────────────────────────────────────────────────┘
     ▲ 方法抽屉：点状态栏按钮后自底弹出，占中栏宽度，Esc/点击外部/×关闭
```

1280×720：三栏宽度收到 262/Fluid/274，章节内边距收紧（`@media max-height:760px`），左右栏内部滚动。
1920×1080：遥测六项单行排布（`@media min-width:1760px`），中栏自然留白透出背景插画。
≤1080px：单列堆叠兜底（播放区→左栏→右栏），覆盖原生窗口 `minWidth:390` 的极端缩窄。

---

## 3. 设计令牌

完整实现见 `design/prototype/styles.css` 第 1 节。要点：

### 3.1 颜色

| 令牌 | 值 | 用途 |
|---|---|---|
| `--bg-0` | `#0b0d12` | 页面基底（深蓝黑） |
| `--surface` | `rgba(19,22,30,.86)` | 三栏连续面板（低毛玻璃） |
| `--surface-2` | `rgba(26,30,40,.92)` | 中栏 sticky 播放区（更实底，保证滚动可读） |
| `--chrome` | `rgba(13,16,22,.9)` | 顶栏/状态栏 |
| `--line` / `--line-strong` | `rgba(163,173,202,.14/.30)` | 分隔线/控件描边 |
| `--text-1/2/3` | `#eef1f8 / #bcc4d6 / #8d95a9` | 主/次/弱文本（对 `--bg-0` 对比度 ≥ 13.9 / 9.6 / 5.4） |
| `--pink-300/400/500` | `#ffa9cd / #ff8fb8 / #f0609c` | 焦点环 / 强调描边 / 实底主按钮 |
| `--pink-soft` / `--pink-line` | `rgba(255,143,184,.13/.5)` | 选中底色 / 选中描边 |
| `--on-pink` | `#2a0f1c` | 粉底上的文字（对比度 ≥ 7） |
| `--num` | `#ffcf96` | **仅** 数值读数与遥测（琥珀，与状态无关） |
| `--ok` | `#ff9ec4` | 成功/完成（粉系，与品牌一致，小面积点缀） |
| `--warn` | `#f5b56a` | 警告（如"需要 PowerShell 7"前的中间态） |
| `--danger` | `#ff7a80` | 失败/停止/取消 |
| `--info` | `#8ab6ff` | 进行中（扫描/导出中/转换中） |

刻意规避大面积绿色；成功态用品牌粉 + ✓ 图标表达，与"进行中"（蓝）、"警告"（琥珀）、"失败"（红）在色相上四向分离。

### 3.2 字体

| 令牌 | 值 |
|---|---|
| `--font-ui` | `"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", system-ui` |
| `--font-mono` | `"Cascadia Mono", "Consolas", "Courier New", monospace`（时间/读数/遥测，全部 `tabular-nums`） |
| 字号阶梯 | 10（刻度）· 11（徽章/次要注记）· 12（标签/说明）· 12.5（面板标题）· 13（正文/按钮）· 14（遥测值）· 21（当前时间） |
| 字重 | 400 / 600（标签）/ 650（标题、主按钮） |

### 3.3 几何

| 令牌 | 值 |
|---|---|
| 间距 | 4 基准：章节内边距 12×14，控件间距 5-10，栏内边距 10 |
| 圆角 | `--r-sm 7` · `--r-md 8` · `--r-lg 10`（连续面板与抽屉）· 999（徽章/进度）。全部落在 7-10 区间 |
| 阴影 | 仅两类：滑杆拇指 `0 1px 4px rgba(0,0,0,.55)`；浮层（抽屉/Toast）`0 10px 36px rgba(0,0,0,.45)`。面板零投影，靠 1px 边框与分隔线分层 |
| 动效 | 仅 Toast 入场 0.18s、进度条不定态条纹、0.16s 折叠箭头旋转；播放中为**稳定状态点**，无呼吸/发光动画 |

---

## 4. 组件清单与状态矩阵

### 4.1 组件清单

| 组件 | 变体 | 说明 |
|---|---|---|
| `btn` | primary / 默认 / danger-ghost / ghost / wide / **btn-icon** / link-btn / icon-btn | 32px 高；btn-icon 为图标按钮（播放/暂停/停止/±10 秒），带 aria-label+title |
| `badge` | 中性 / ok / busy / danger / warn / static | 由 `data-tone` 驱动；"需要 PowerShell 7"=warn，"不可用/失败"=danger |
| `rail-panel` / `sect` | 连续面板 + 章节 | 每栏一个面板；章节 = 标题行（图标+标题+徽章+可选折叠钮）+ 1px 分隔线 |
| `field` | 单列 / `field-2col` | label 上、控件下；select 禁用=虚线边框+降透明 |
| 文件选择 | `input[type=file]` 定制 `::file-selector-button` | 中性描边"选择文件"按钮 |
| `toggle-chip` | 循环播放 / 录制开关 | 胶囊选中态，`:has(input:checked)` |
| `param` | 名称 + 可编辑读数 + **单项复位图标** + 滑杆 + 三段刻度 | thumb 14/16px、`--fill` 填充、读数点击精确输入、双击复位、Shift+方向 ×10 |
| `progress` | 确定进度 / `:not([value])` 不定态条纹动画 | 导出/转换/电平共用 |
| `mode-grid` | 2×2 单选 | radio 点+「推荐」角标；选中=底色+描边+字重三重表达 |
| `metric` | 6 联遥测块 | 琥珀 mono 数值 |
| `signal-chain` | 按 `[data-mode]` 更新内容 | 中性箭头连线，横向滚动兜底 |
| `time-readout` | 当前时间 21px 粉 mono + 总时长 + 百分比芯片 | 当前时间显著大于总时长 |
| `meter` | 电平表 | 琥珀渐变 + dB 读数 |
| `drawer` | 方法说明抽屉 | 底部浮层，Esc/外部点击/×关闭 |
| `toast` | error / ok / info | 右下角，5s/8s 自动消失，可手动关，aria-live |
| `engine-state` | 待机（灰）/ running（蓝点）/ error（红） | 顶栏胶囊，颜色+圆点+文字 |
| `statusbar` | 状态文本 + AudioContext 芯片 + 方法抽屉开关 | 32px |

### 4.2 状态矩阵（17 项全覆盖）

| 状态 | 触发 | 视觉表现 | 关键控件状态 |
|---|---|---|---|
| 默认 | 启动未播放 | 播放面板空态：进度条虚线轨道、`--:--`、"载入音频后可拖动调整进度" | 进度条/±10s disabled；暂停/停止 disabled（无源） |
| 播放 | 点击播放/空格 | 播放按钮亮起（描边+稳定状态点）；engineState=运行中（蓝点）；AudioContext 芯片显示 running·采样率·延时 | 时间/百分比每帧刷新 |
| 暂停 | 暂停/空格 | 呼吸点消失，时间冻结，状态栏"已暂停。" | 控件全部可用，位置保留 |
| 停止 | 停止按钮 | 状态栏"已停止播放，播放位置已保留。" | **进度条不清零**、保持可拖 |
| 循环 | 勾选循环芯片 | 芯片变粉（选中态），`audio.loop` 生效 | — |
| 导出中 | 开始导出 | 进度条按实时比例前进（完整导出前读取/解码阶段为不定态条纹）；状态文本蓝色 running | 范围/参数/播放/暂停/停止/滑杆全禁用；取消按钮启用 |
| 转换中 | 转换为 WAV | 转换进度条+蓝色状态文本；badge=处理中（蓝） | 转换按钮/文件框禁用，完成后恢复 |
| 直播扫描 | 扫描音频应用 | 扫描按钮禁用+状态"正在扫描音频会话…"；badge 文本切换（按应用/不可用/…） | 来源下拉在成功后启用 |
| 直播截获 | 开始截获 | badge=按应用（粉/ok）；电平表活动；`#sourceBadge` 变"直播：〈应用〉"；状态文本 running | 开始禁用、停止启用、来源锁定 |
| 分段录制 | 勾选录制+开始截获 | badge=录制中（蓝）；`#recordStatus` 每秒刷新（时长/体积/分段数，tabular-nums 固定 2 行高防跳动） | 录制开关禁用防误触 |
| 合并中 | 停止截获/录制 | badge=合并中（蓝）；状态"正在校验并合并分段…" | 打开输出文件夹保持禁用直至成功 |
| 完成 | 导出/转换/录制合并成功 | 状态文本粉色 done；badge=完成（粉）；成功 Toast（含文件名/时长/位深） | 打开输出文件夹启用 |
| 失败 | 任何 catch 分支 | 状态文本红色 error；badge=失败（红）；错误 Toast（8s）；engineState=错误（红） | 控件恢复可用；录制失败提示"临时分段已保留" |
| 空数据 | 素材服务不可达/无截获来源 | 状态栏"未连接素材服务，可上传本地音频文件。"；来源下拉"没有可用的截获来源" | 素材下拉空但可导入本地文件；开始截获禁用 |
| 权限不足 | 录制目录不可写等 | `recordStatus`/`liveStatus` 红色 error + Toast，保留原始 IPC 错误消息文本 | 相关按钮回退可用 |
| 设备不可用 | 非桌面环境（无 `window.asmr3dDesktop`） | badge=不可用（红）；"直播截获与录制仅在 Windows 桌面版可用。"；输出文件夹/更改保存位置禁用并带 title 说明 | 录制开关禁用 |
| PowerShell 7 缺失 | 扫描返回 `processLoopback:false` | badge="需要 PowerShell 7"（红，`on-warn` 类）；状态文本给出安装指引（app.js 原文） | 开始截获保持禁用 |

---

## 5. 原型

位置：`design/prototype/`。`app.js` 为主仓库
`D:\asmr3dv0.2\renderer\app.js` 的逐字节副本，验证原型与主仓库逻辑一致。

运行（含真实素材库与播放）：

```bash
node design/prototype/dev-server.mjs
# 打开 http://127.0.0.1:4183/
```

不带素材服务也能运行（直接静态托管或 file:// 打开，素材下拉为空并提示"未连接素材服务"）。

已验证矩阵（v2.1，Chromium 实测；截图证据见 `design/screenshots/`，核对脚本输出见 `design/UI_REVISION_NOTES.md` §3）：

- 四视口 1280×720 / 1440×900 / 1536×864（1080p@125% 等效）/ 1920×1080：水平溢出 0、无越界元素；四视口截图已存档。
- 状态截图：默认（其中已包含直播不可用）/ 播放 / 暂停 / 导出中 / 导出完成 / 错误，共 6 张独立状态；直播不可用与默认态合并，避免重复证据。
- 工程核验：`node --check`（enhance.js / dev-server.mjs / app.js）通过；81 个 ID 无缺失、无重复；模式顺序 `binaural → hrtf → parametric → bypass`；方法项 12 条；`design/prototype/app.js` 与主仓库 `renderer/app.js` sha256 一致。
- 交互回归：播放→暂停→停止（6.5s 位置保留不归零、滑杆可拖）、→ 键 +10 秒、行内单项复位（45°→0°）、章节折叠/展开、模式切换选中态、读数精确输入（62.5°）、Toast/徽章语义、禁用态（虚线边框+降透明）。
- 自动化环境说明：采集在隐藏页面中进行，导出完成态通过"分段导出/完整导出 + rAF 让步垫片"取得；垫片只存在于测试会话，不进入任何工程文件。真实 Electron 窗口无此限制。
- 基线说明：设计截图采集于旧工作区副本；原型 `app.js` 已完成主仓库版本替换。主仓库集成后必须重新回归长音频分段导出、超长提示和真实 Electron 窗口状态。

---

## 6. 工程交接说明

### 6.1 文件变更清单（集成时）

| 文件 | 动作 | 说明 |
|---|---|---|
| `renderer/index.html` | **整体替换** | 用 `design/prototype/index.html`。所有 app.js 依赖的 ID 原样保留（见 6.2）；新增 `outDirButton` / `methodsToggle` / `methodDrawer` / `methodCloseBtn` / `toastRegion` 五个增强 ID |
| `renderer/styles.css` | **整体替换** | 用 `design/prototype/styles.css`。保留并新增 app.js 依赖的类钩子：`.engine-state.running/.error`、`.method-list li.active`、`#liveModeBadge.on-process/.on-warn`、`[data-state=…]`、`#modeControl button.active`、`[data-mode]` |
| `renderer/enhance.js` | **新增** | 附加交互层（Toast/快捷键/徽章语义/滑杆填充/精确输入/抽屉/拖放）。可整体删除，删除后 UI 仍完整可用，只是失去增强 |
| `renderer/app.js` | **不动** | 逐字节保持 v0.2 原版 |
| `desktop/*.cjs`、IPC、音频链路 | **不动** | — |
| `tools/build_mobile.mjs` | **小补丁** | 见 6.3，否则 EXE 打包缺 enhance.js、移动端 HTML 注入失效 |

### 6.2 禁改清单（app.js 的 DOM 契约）

以下 ID 出现在 `app.js` `elements` 表（L3-85），**任何重构不得改名/删除/换类型**：

```
sampleSelect fileInput playButton pauseButton stopButton loopToggle
azimuth azimuthOutput elevation elevationOutput distance distanceOutput
volume volumeOutput resetButton modeControl modeNote engineState audioStatus
statusText sourceBadge metaFile metaCategory metaChannels metaSampleRate
metaDuration metaLicense progressRange currentTime totalTime progressPercent
progressHint skipBackButton skipForwardButton exportScopeSelect exportStartSelect
exportDurationSelect exportBitDepth exportButton cancelExportButton exportProgress
exportStatus metricDistanceGain metricIld metricItd metricAir metricNear
metricLatency signalChain methodCount liveSection liveModeBadge liveTargetSelect
liveRefreshButton liveStartButton liveStopButton liveLevelBar liveLevelText
liveStatus liveSilenceSelect sourceModeSelect recordToggle recordBadge
recordSegmentSelect recordBitDepthSelect recordDirButton recordRevealButton
recordDirText recordStatus exportDirText convertFileInput convertBitDepth
convertButton convertProgress convertStatus convertBadge templateImportButton
templateExportButton templateFileInput templateStatus templateBadge
```

结构性契约（同样禁改）：

1. `#modeControl` 内部必须是 4 个带 `data-mode="binaural|hrtf|parametric|bypass"` 的 `<button>`，顺序固定（双耳兼容最左）。
2. `document.querySelectorAll(".method-list li")` 需要 `.method-list` + 12 个 `<li>`（12 项方法）。
3. app.js 会整体覆写 `#liveModeBadge.className`（`on-process` / `on-warn`），CSS 必须按 ID+类选择器命中。
4. `#templateStatus` / `#convertStatus` / `#liveStatus` 由 app.js 写 `dataset.state`（idle/error/running/done/warn）。
5. `<input id="templateFileInput" hidden>` 必须保持 hidden（由模板按钮触发）。
6. `progressRange` 的 min/max/step 由 app.js 动态改写，勿在 HTML 之外锁定。
7. `#signalChain` 的 innerHTML 会被整体替换（span + i 箭头），初始内容仅是首帧。

### 6.3 `tools/build_mobile.mjs` 补丁（EXE 打包必需）

EXE 的 web 资源来自 `dist/asmr3d-v0.2-mobile`（`build_exe.mjs` L64 `fs.cpSync(MOBILE_BUILD,…)`），而该目录由 `build_mobile.mjs` 从白名单生成。需做三处小改：

1. 复制白名单（L36-47）加入 `"enhance.js"`。
2. HTML 改写（L60-68）的匹配串需与新 `index.html` 对齐：新文件用相对路径 `./styles.css` / `./app.js`，并在其后多一个 `<script defer src="./enhance.js"></script>`。把两个 `.replace()` 的查找串分别改为 `'<link rel="stylesheet" href="./styles.css" />'` 与 `'<script type="module" src="./app.js"></script>'`；enhance.js 标签保持原样即可（移动端忽略或同样 defer 加载都安全）。
3. Service Worker 预缓存 `cacheAssets`（L98-109）加入 `"./enhance.js"`。

### 6.4 行为保持清单（验收对照）

- 停止不清零位置 ✓（app.js 原逻辑 + 原型实测）
- 进度条可拖、80ms 节流跳播 ✓
- 渲染方式四档顺序与语义 ✓；模式说明保留但收敛为 `#modeNote` 一处
- 空间参数范围/步进/对数距离映射 ✓（HTML 属性未动）
- 模板 TXT 导入导出、字段别名表 ✓
- 导出范围联动的起点/时长禁用逻辑 ✓（实测完整模式下行内禁用）
- 直播扫描/截获/静音自动停止/分段合并全部事件绑定 ✓（UI 仅换壳）
- 视频转音频、WAV 位深、进度语义 ✓

---

## 7. 风险与待人工确认项

| # | 风险/待确认 | 说明与建议 |
|---|---|---|
| R1 | **系统缩放实机验证** | 125%/150% 只能等效验证 CSS 视口（1536×864、1280×720），无法在自动化里改 DPR。需在真实 Windows 150% 缩放的机器上装一次 EXE，确认背景插画裁切与文字渲染密度。预期无问题（布局全部 CSS px），但属验收缺口 |
| R2 | **liveStatus 文本启发式** | enhance.js 的 Toast/徽章着色基于正则匹配中文状态文本。app.js 后续若改文案（如新增错误措辞），可能漏 Toast。误报风险低（正则只命中明确的失败/完成词），但建议把 enhance.js 视为"文案契约"的一部分，改动状态文案时同步检查 `RE_ERROR/RE_OK` |
| R3 | **暂停/停止的前置禁用是增强行为** | 原版任何时刻可点（点了无效果），v2 在无源时禁用。语义更清晰，但若有依赖"永远可点"的边缘用法（如先点停止清状态），需确认。可一行删掉（enhance.js 第 5 节） |
| R4 | **可折叠面板的记忆** | 当前折叠态不持久化（刷新复位为展开）。若需要记住用户偏好，应在 enhance.js 加 localStorage（未做，避免过度设计） |
| R5 | **拖放导入依赖 `input.files` 可赋值** | Chromium/Electron 支持从 DataTransfer 赋值 `files`；已加 try/catch 兜底提示用按钮选择。移动端 PWA 未验证拖放（无意义），不影响 |
| R6 | **导出完成的下载行为差异** | 浏览器原型经 `<a download>` 落盘；Electron 桌面版由主进程处理（与 v0.2 相同路径），未改。EXE 实机需走一次完整导出确认输出目录文案与实际落盘一致 |
| R7 | **`outDirButton` 在无桌面桥时禁用** | 顶栏"输出文件夹"按钮在纯浏览器/PWA 中禁用（title 说明）。若希望 PWA 也可用，需要另想入口（当前 PWA 本就没有输出文件夹概念） |
| R8 | **`--num` 琥珀与 `--warn` 琥珀同族** | 遥测数值与警告色相近。目前数值从不闪动、警告必有徽章/文案载体，混淆风险低；若反馈混淆，把数值换成粉或引入第三色需全局评估 |
| R9 | **方法抽屉的可发现性** | 由"始终可见的底部横条"改为"状态栏按钮 + 抽屉"。按钮常驻且带计数徽标（12/12），判定可发现；若用户研究反对，可加回一行式横条（布局已预留 `@media` 分级） |
| R10 | **PowerShell 7 缺失引导** | 提示文案沿用 app.js 原文（含安装建议）。是否要加"打开下载页"按钮需要产品确认（涉及打开外部链接的 IPC，未擅自加） |
