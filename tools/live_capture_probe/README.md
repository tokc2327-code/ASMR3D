# asmr3d Live Capture Probe

用于验证 Windows Electron 的实时系统音频捕获流程。

## 验证目标

```text
Twitch 正常播放
→ Electron desktopCapturer
→ loopbackWithMute
→ MediaStreamAudioSourceNode
→ Web Audio
→ 监听输出
```

## 运行

先确保 Twitch 直播正在播放且标签页未静音：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\run_live_capture_probe.ps1
```

打开窗口后：

1. 点击“启动捕获”。
2. 确认输入峰值和输入 RMS 持续高于 `-60 dBFS`。
3. 使用“播放 8 秒测试音”验证捕获链，不依赖 Twitch 当时的音量。
4. 在“监听输出设备”中选择和使用捕获端点不同的耳机设备。
5. 点击“应用输出设备”。
6. 提高“监听音量”，确认可以听到处理后的声音。
7. 点击“反馈检测”，检查处理结果是否被自身再次捕获。

## 已验证信息

- `deviceId` 为 `loopbackWithMute`。
- `suppressLocalAudioPlayback` 为 `true`。
- 捕获格式为 `48000 Hz / 2 channels / 16-bit`。
- `echoCancellation`、`noiseSuppression`、`autoGainControl` 均已关闭。
- 内置测试音可以被捕获链持续接收。

## 注意

- WASAPI 回环测量发生在本地硬件静音之前，因此不能用系统输出电平直接证明扬声器已经静音。
- 最终是否听到原始声音仍需实际监听确认。
- 捕获端点与处理后监听端点共用同一设备时，可能发生自反馈。
- Twitch 手动静音标签页会切断输出，因此应在未静音状态下启动捕获，再由 `loopbackWithMute` 抑制本地播放。
