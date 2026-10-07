# asmr3d UI v2.1 原型

新版 Windows 桌面 UI 的可运行原型。`app.js` 是主仓库 `D:\asmr3dv0.2\renderer\app.js` 的逐字节副本（未改动），
`index.html` / `styles.css` 为重写版，`enhance.js` 为新增的附加交互层。

## 运行

```bash
# 方式一：带真实素材库（推荐）
node design/prototype/dev-server.mjs
# 打开 http://127.0.0.1:4183/
```

方式二：任意静态服务器托管本目录（素材下拉为空属正常，提示"未连接素材服务"）。

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` | 新版结构。保留 app.js 依赖的全部 81 个 ID 与 `data-mode` / `.method-list` / `[data-state]` 契约 |
| `styles.css` | 设计系统（令牌见文件头注释与 `design/REDESIGN.md` 第 3 节） |
| `enhance.js` | 附加层：Toast、快捷键（空格/←→）、徽章语义色、滑杆填充同步、读数精确输入、双击单项复位、Shift+方向 ×10、方法抽屉、拖放导入、无源时禁用暂停/停止。**可整体删除不影响功能** |
| `app.js` | 主仓库 `renderer\app.js` 的逐字节副本，勿编辑；当前 sha256 为 `E4E6844C…` |
| `dev-server.mjs` | 原型专用：静态服务 + 复刻 `/api/materials` 与 `/media/*`（Range） |

## 落地到 Electron 工程

1. 用本目录 `index.html`、`styles.css` 覆盖 `renderer/` 同名文件；复制 `enhance.js` 到 `renderer/`。
2. 按 `design/REDESIGN.md` §6.3 给 `tools/build_mobile.mjs` 打三处小补丁（白名单加 enhance.js、HTML 改写串对齐相对路径、SW 预缓存加 enhance.js）——否则 EXE 打包会缺文件。
3. `renderer/app.js`、`desktop/`、IPC、音频链路零改动。

完整审计 / 线框 / 令牌 / 状态矩阵 / 风险清单见 [`../REDESIGN.md`](../REDESIGN.md)，
本轮修正结果另见 [`../UI_REVISION_NOTES.md`](../UI_REVISION_NOTES.md)。
