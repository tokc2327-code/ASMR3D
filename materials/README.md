# ASMR 空间音频测试素材

本目录由 `tools/fetch_materials.mjs` 从 Freesound 自动收集，时间为 2026-10-03T06:28:05.137Z。

## 使用范围

- 所有素材均为 Freesound 标注的 **Creative Commons 0**。
- CC0 允许复制、修改、分发和商业使用，无需署名；本清单仍保留来源和作者，便于复核。
- 下载文件是 Freesound 的 **HQ OGG 预览**，不是作者上传的原始 WAV/FLAC。
- 预览适合交互和主观听感测试，不应替代母带用于最终客观指标验收。
- `04_test_signals` 中的测量信号可能包含高电平脉冲或扫频，测试前必须降低监听音量。

## 类别

| 目录 | 用途 |
|---|---|
| `01_binaural_reference` | 已知双耳/dummy-head 录音，用于方向、外部化和前后混淆检查 |
| `02_asmr_nearfield` | 耳语、敲击、刷麦克风、口腔声、耳部清洁、包装纸等近场素材 |
| `03_environment_distance` | 雨、鸟鸣、水声等环境声，用于距离、混响和声场宽度的内容差异测试 |
| `04_test_signals` | 粉红噪声、冲激和测量扫频，用于客观检查与稳健性测试 |
| `05_mono_controls` | 单声道对照，用于验证中心/单声道素材无法被中侧处理横向旋转 |

## 文件

- `manifest.json`：完整来源、许可证、页面、文件和分析元数据。
- `manifest.csv`：便于表格和批量脚本读取的简表。

## 复现

在项目根目录运行：

```powershell
node .\tools\fetch_materials.mjs
```

脚本会跳过已经存在的文件，并重建清单。
