# asmr3d UI v2.1 修订交接单 · 执行结果

> 执行日期：2026-10-07
> 依据：`design/UI_REVISION_BRIEF.md`
> 基线：v2 原型（`design/prototype`）定向修订，未重写、未新增页面、未模拟系统标题栏。

---

## 1. 修改的文件

| 文件 | 动作 | 摘要 |
|---|---|---|
| `design/prototype/index.html` | 重写结构 | 每栏一个连续面板（`.rail-panel`/`.stage-panel` + `.sect` 章节 + 分隔线）；播放/暂停/停止/±10 秒改图标按钮（aria-label+title 保留）；空间参数行内单项复位图标；视频转音频变可折叠章节；版本号降为低对比灰字；`modeNote` 单行截断 |
| `design/prototype/styles.css` | 重写体系 | 毛玻璃 16px→8px；卡片→连续面板；圆角收敛 7/8/10；阴影只剩 Toast/抽屉/滑杆拇指；粉色收敛（章节图标/信号链箭头/电平表转中性或琥珀）；"运行中"改蓝色；新增 ≤1080px 单列堆叠兜底（原生窗口 minWidth 390） |
| `design/prototype/enhance.js` | 增量修订 | 折叠选择器适配 `.sect-fold`；新增 `data-param-reset` 单项复位；徽章语义细分（需要 PowerShell 7=琥珀警告，不可用/失败=红）；`modeNote` tooltip 同步 |
| `design/REDESIGN.md` | 更新至 v2.1 | 新增 §0 修订摘要；令牌/组件/证据章节同步；修正 elements 依赖 ID 计数（80 → **81**） |
| `design/screenshots/*` | 新增 | 四视口 + 六张独立状态截图，共 10 张 PNG（见 §2；直播不可用与默认态合并） |
| `design/UI_REVISION_NOTES.md` | 新增 | 本文件 |

未修改：`renderer/app.js`、`desktop/*.cjs`、音频 Web Audio 链路和 IPC 协议。
修正记录：`design/prototype/app.js` 已由旧工作区副本替换为主仓库
`D:\asmr3dv0.2\renderer\app.js`，并随距离模型和直播衰减修正继续同步。

## 2. 截图证据（`design/screenshots/`）

四视口（全新加载态）：

- `viewport-1280x720.png` / `viewport-1440x900.png` / `viewport-1536x864.png` / `viewport-1920x1080.png`

状态截图（1440×900；直播不可用与默认态是同一画面，已合并）：

| 文件 | 状态 | 画面要点 |
|---|---|---|
| `state-01-default.png` | 默认 | 空态提示、虚线进度轨、暂停/停止禁用、直播"不可用"徽章 |
| `state-02-playing.png` | 播放 | 播放按钮描边+稳定状态点、顶栏"运行中"蓝胶囊、进度 6%、AudioContext running 芯片 |
| `state-03-paused.png` | 暂停 | 时间冻结 0:07、状态栏"已暂停。" |
| `state-04-exporting.png` | 导出中 | 状态"导出中 0.9 / 5.0 秒"蓝色 running、进度条前进、取消可用、其余控件锁定 |
| `state-05-export-done.png` | 导出完成 | "完整导出完成：32.6 秒，16-bit WAV."粉色 done、进度 100%、控件解锁 |
| `state-06-error.png` | 错误 | liveStatus 红色错误 + 右下角错误 Toast（8s，可关闭） |
| `state-01-default.png` | 直播不可用（同默认态） | 初始态已含直播"不可用"徽章和设备类文案，因此不再另存重复文件 |

## 3. 核验结果（脚本输出）

1. **四视口溢出检查**：1280×720 / 1536×864 / 1440×900 / 1920×1080 的 `scrollWidth - clientWidth` 均为 **0**，视口内越界元素为空列表（1280×720 与 1920×1080 逐元素扫描含在通用探针内）。
2. **82 个 DOM ID 契约**：从 `app.js` `elements` 表提取 `$("#…")` 依赖 ID 去重后 **82 个**，`index.html` **无缺失、无重复 ID**。
3. **模式顺序**：`#modeControl` 内 `data-mode` 顺序为 `binaural → hrtf → parametric → bypass`（双耳兼容最左），4 个按钮。
4. **方法项数量**：`.method-list li[data-method]` = **12**。
5. **`node --check`**：`enhance.js`、`dev-server.mjs`、`app.js` 全部通过。
6. **app.js 哈希**：`design/prototype/app.js` 与主仓库
   `D:\asmr3dv0.2\renderer\app.js` 当前 sha256 均为
   `1935728F4F736175367103982F79843C55B8EAD74A0316F443B22A0D47ABDAA5`，**一致**。
7. **结构性契约**：`#templateFileInput` 保持 `hidden`；`.method-list` 存在；`#liveModeBadge`/`[data-state]` 钩子齐全。
8. **交互回归**（1440×900 实测）：播放→停止后滑杆 6.552s **不归零**且保持可拖；→ 键 +10 秒（0:06→0:16）；行内单项复位 45°→0°（滑杆值、读数、`--fill` 三者同步）；章节折叠/展开（aria-expanded 正确）；模式选中态三重表达；读数点击输入 62.5°（上一轮验证，逻辑未变）。

> 说明：上述交互与截图是在同步主仓库新版 `app.js` 之前采集的设计验证结果。
> 已完成静态契约复核；长音频分段导出、超长提示和真实 Electron 窗口行为仍需在
> 主仓库集成后重新回归，不能只沿用旧 `app.js` 的运行结果。

## 4. 集成方式（进入 EXE 的路径）

1. 用 `design/prototype/index.html`、`styles.css` 覆盖 `renderer/` 同名文件；复制 `enhance.js` 到 `renderer/`。`renderer/app.js` 不动。
2. `tools/build_mobile.mjs` 三处小补丁（EXE 的 web 资源由它产出，见 `REDESIGN.md` §6.3）：复制白名单加 `enhance.js`；HTML 改写查找串对齐相对路径 `./styles.css` / `./app.js`；Service Worker 预缓存加 `./enhance.js`。
3. `node tools/build_exe.mjs` 出 EXE；`node renderer/server.mjs` 为开发预览（4173 端口）。
4. 原型本地预览：`node design/prototype/dev-server.mjs` → http://127.0.0.1:4183/

## 5. 风险与未完成项

| # | 项 | 说明 |
|---|---|---|
| N1 | 125%/150% 实机缩放 | 自动化只能等效验证 CSS 视口（1536×864、1280×720），无法改 DPR；需真机装一次 EXE 确认渲染密度与插画裁切 |
| N2 | PowerShell 7 缺失徽章色 | "需要 PowerShell 7 = 琥珀警告"的映射已实现，但浏览器原型无法触发该 IPC 返回，仅代码审查覆盖；桌面实机扫描一次即可确认 |
| N3 | 隐藏页自动化限制 | 本次采集在 `document.hidden` 的页面中进行：rAF 停摆导致部分定位器超时，导出完成态借助"rAF→setTimeout 垫片"取得（仅测试会话，零工程影响）；真实窗口无此问题。播放/暂停/停止/扫描用 CUA 真实坐标点击完成 |
| N4 | 模式说明首播前不刷新 | 切模式后 `#modeNote` 在首次建图（首次播放）前保持初始文案——这是 app.js 原语义（`updateModeCrossfade` 仅在建图后运行），未改动；如需即时刷新需改 app.js（超出本任务约束） |
| N5 | 折叠状态不持久化 | 与 v2 相同，未加 localStorage（避免过度设计，见 REDESIGN.md R4） |
| N6 | "输出目录不可写"细分态 | 依赖 IPC 错误消息原文呈现（红色 error + Toast）；未做专门的徽章措辞，因为桌面桥未在浏览器环境可触发，实机验证后如有需要再补映射 |

## 6. 验收对照（交接单 §8）

- 视觉：更像紧凑桌面工具 ✓（每栏单面板、分隔线切分、低毛玻璃、无投影）；粉色更克制 ✓（仅主按钮/当前选项/焦点环/成功态）；顶栏 44px、状态栏 32px ✓
- 交互：核心流程无新增点击步骤 ✓；播放/调参/直播状态常驻可见 ✓（sticky 播放区 + 三栏独立滚动）；选中/禁用/错误三态互不混淆 ✓（底色+描边+字重 / 虚线+降透明 / 红+图标+Toast）；键盘快捷键可用 ✓
- 工程：`app.js` 仅增加默认参数读取和播放状态输出，未改音频算法/IPC ✓；82 ID 无缺失无重复 ✓；无水平溢出 ✓；原型服务器可运行 ✓；集成路径已说明 ✓

---

## 7. v2.2 参数工作区迁移与直播预设验证

### 结构调整

按照“本地播放和直播截获共用参数”的产品判断，把空间参数工作区从
左栏移动到中栏，顺序固定为：

```text
播放进度
→ 空间参数（四滑杆）
→ 参数模板导入 / 导出
→ 空间参数读数
→ 视频转音频
```

左栏保留声音对象、渲染方式、导出和元数据。所有既有 DOM ID 不变，
`app.js` 未修改。宽屏下四滑杆为两列，窄窗口回退单列。

### 直播截获 + 预设参数实测

测试环境：

```text
打包版 EXE
独立 Edge 播放本地 OGG 素材
截获来源：msedge（进程回环）
录制：24-bit WAV / 48 kHz / 2 ch
```

测试流程：

1. 开始截获并同步录制。
2. 截获过程中导入模板 A：方位角 `-80°`、参数化 HRTF。
3. 等待 4 秒，再导入模板 B：方位角 `+80°`。
4. 等待 4 秒后停止并合并。

实测 UI：

```text
模板 A：azimuth=-80, mode=parametric, ILD=7.9 dB
模板 B：azimuth=+80, mode=parametric, ILD=7.9 dB
```

录制 WAV 分窗左右声道能量：

| 窗口 | L-R 差异 | 对应阶段 |
|---:|---:|---|
| 1 | -15.19 dB | 输入前段 / 切换过渡 |
| 2 | +7.00 dB | 模板 A，左侧更响 |
| 3 | +7.42 dB | 模板 A，左侧更响 |
| 4 | -7.38 dB | 模板 B，右侧更响 |
| 5 | -8.11 dB | 模板 B，右侧更响 |
| 6 | -7.96 dB | 模板 B，右侧更响 |

结论：直播截获过程中导入预设模板会立即更新直播渲染链，并写入同步录制
成品。左右声级差按模板方位角反转，验证通过。

测试产物：

```text
D:\asmr3dv0.2\dist\asmr3d-v0.2-win-x64\输出\asmr3d_recording_20261007_165242.wav
SHA-256: 411572fe8a97…
```

## 8. 原声压低改为 −60 dB

用户反馈默认 `−40 dB` 下原声仍可听见，确认改为 `−60 dB`。

实现：

```text
SOURCE_ATTENUATION_VOLUME = 0.001
MAX_COMPENSATION_GAIN = 2000   // +66 dB 余量
```

Windows 进程回环实测（循环粉噪声，锁定同一 PID）：

```text
基准        峰值 -0.64 dBFS / RMS -12.10 dBFS
0.01 (-40) 峰值 -40.66 dBFS / RMS -52.42 dBFS / 实测约 -40.3 dB
0.001(-60) 峰值 -60.83 dBFS / RMS -72.40 dBFS / 实测约 -60.3 dB
```

打包版端到端回归：

```text
状态文案：已把原声压到 −60 dB 并在渲染链补偿
截获：msedge / 48000 Hz / 2 ch
参数模板：截获中 −80° → +80° 即时生效
成品左右声级差：约 +7.6 dB → −7.6 dB
录制文件：asmr3d_recording_20261007_185805.wav
SHA-256 前缀：6d921c32548f
```

## 9. 设置、主题与关于页面

新增 `renderer/settings.js`，在 `app.js` 前加载并管理：

- 主题：跟随系统 / 浅色 / 深色
- 背景图显隐、背景模糊、面板透明度
- 默认渲染方式、空间参数、导出/转换位深和录制默认值
- 设置持久化到 `localStorage`

界面调整：

- 删除页面内重复的产品名、版本号、待机胶囊和输出文件夹按钮
- 页面内工具条只保留主题切换和设置入口
- 各章节静态说明改为右上角圆圈问号弹层
- 进度、错误、警告和动态状态继续常驻显示

关于页面内容：

```text
开发者：紫色系汽水
邮箱：tokc2327@gmail.com
GitHub：tokc2327-code/ASMR3D
许可证：MIT
技术栈：Electron / Web Audio API
```

打包版验收：

```text
问号按钮：9 个
设置面板：正常打开
浅色主题：截图通过
深色主题：截图通过
主题持久化：重启后保持深色
设置面板和 info-popover：可见且可关闭
```

## 10. 验收修正（第二版）

- 渲染方式按钮提高文字对比度，选中项使用粉色边框/底色。
- 渲染方式问号改为显示当前选中模式的说明。
- 背景显隐范围扩大为 0–100%，默认 80%；新增蒙版强度 0–100%，默认 55%。
- 背景模糊范围扩大为 0–20px。
- 播放/暂停/停止按钮加粗图标并提高禁用态对比度。
- 播放、暂停、停止状态移入播放进度区域。
- 检查更新按钮通过 GitHub Release API 联网检查，结果和联网提示显示在按钮下方。

实测：

```text
浅色模式参数按钮：背景 rgba(217,79,136,.14)，文字/边框对比明显
参数化 HRTF 问号：显示 ILD / ITD / 头部阴影 / 仰角滤波说明
停止状态：已停止播放，播放位置已保留。显示在播放进度区域内
背景默认：显隐 80%，浅色蒙版 35% 时背景肉眼可见
播放控制：三角、双竖线、方块图标可辨
```
