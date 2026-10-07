param(
    [int]$ProcessId = 0,
    [string]$ProcessName = "",
    [int]$DurationSeconds = 8,
    [string]$OutputPath = "",
    [int]$SilenceTimeoutSeconds = 0,
    [switch]$SetMute,
    [string]$MuteState = "true",
    [string]$SetVolume = "",
    [switch]$GetVolume,
    [string]$RestoreVolumeOnExit = "",
    [double]$AudibleThreshold = 0.0009,
    [int]$ParentProcessId = 0,
    [switch]$ListJson,
    [switch]$StreamToStdout
)

$ErrorActionPreference = "Stop"

# Console output defaults to the system ANSI code page when stdout is a pipe,
# which mangles non-ASCII process names in the JSON we emit.
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch {
}

$source = @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public static class ProcessAudioProbe
{
    private const int CLSCTX_ALL = 23;
    private const int AUDCLNT_SHAREMODE_SHARED = 0;
    private const int AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;
    private const int AUDCLNT_BUFFERFLAGS_SILENT = 0x00000002;
    private const int VT_BLOB = 65;
    private const int AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK = 1;
    private const int PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE = 0;
    private const string VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK = "VAD\\Process_Loopback";

    private static readonly Guid IID_IAudioClient = new Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2");
    private static readonly Guid KSDATAFORMAT_SUBTYPE_IEEE_FLOAT = new Guid("00000003-0000-0010-8000-00AA00389B71");

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct WAVEFORMATEX
    {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct WAVEFORMATEXTENSIBLE
    {
        public WAVEFORMATEX Format;
        public ushort Samples;
        public uint ChannelMask;
        public Guid SubFormat;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BLOB
    {
        public uint cbSize;
        public IntPtr pBlobData;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROPVARIANT
    {
        public ushort vt;
        public ushort reserved1;
        public ushort reserved2;
        public ushort reserved3;
        public BLOB blob;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS
    {
        public uint TargetProcessId;
        public int ProcessLoopbackMode;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AUDIOCLIENT_ACTIVATION_PARAMS
    {
        public int ActivationType;
        public AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS ProcessLoopbackParams;
    }

    [ComImport]
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumeratorComObject { }

    private enum EDataFlow
    {
        eRender = 0,
        eCapture = 1,
        eAll = 2
    }

    private enum ERole
    {
        eConsole = 0,
        eMultimedia = 1,
        eCommunications = 2
    }

    [ComImport]
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(EDataFlow dataFlow, int stateMask, out IntPtr devices);
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        int RegisterEndpointNotificationCallback(IntPtr client);
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport]
    [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
        int OpenPropertyStore(int stgmAccess, out IntPtr properties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetState(out int state);
    }

    [ComImport]
    [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl
    {
        int GetState(out int state);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string displayName);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string displayName, ref Guid eventContext);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string iconPath);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string iconPath, ref Guid eventContext);
        int GetGroupingParam(out Guid groupingId);
        int SetGroupingParam(ref Guid groupingId, ref Guid eventContext);
        int RegisterAudioSessionNotification(IntPtr client);
        int UnregisterAudioSessionNotification(IntPtr client);
    }

    [ComImport]
    [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl2 : IAudioSessionControl
    {
        new int GetState(out int state);
        new int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string displayName);
        new int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string displayName, ref Guid eventContext);
        new int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string iconPath);
        new int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string iconPath, ref Guid eventContext);
        new int GetGroupingParam(out Guid groupingId);
        new int SetGroupingParam(ref Guid groupingId, ref Guid eventContext);
        new int RegisterAudioSessionNotification(IntPtr client);
        new int UnregisterAudioSessionNotification(IntPtr client);
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string sessionIdentifier);
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string sessionInstanceIdentifier);
        int GetProcessId(out uint processId);
        int IsSystemSoundsSession();
        int SetDuckingPreference(bool optOut);
    }

    [ComImport]
    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionEnumerator
    {
        int GetCount(out int sessionCount);
        int GetSession(int sessionIndex, out IAudioSessionControl session);
    }

    [ComImport]
    [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ISimpleAudioVolume
    {
        int SetMasterVolume(float level, ref Guid eventContext);
        int GetMasterVolume(out float level);
        int SetMute(bool mute, ref Guid eventContext);
        int GetMute(out bool mute);
    }

    [ComImport]
    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionManager2
    {
        int GetAudioSessionControl(ref Guid audioSessionGuid, uint streamFlags, out IAudioSessionControl sessionControl);
        int GetSimpleAudioVolume(ref Guid audioSessionGuid, uint streamFlags, out IntPtr audioVolume);
        int GetSessionEnumerator(out IAudioSessionEnumerator sessionEnumerator);
        int RegisterSessionNotification(IntPtr sessionNotification);
        int UnregisterSessionNotification(IntPtr sessionNotification);
        int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId, IntPtr duckNotification);
        int UnregisterDuckNotification(IntPtr duckNotification);
    }

    [ComImport]
    [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioMeterInformation
    {
        int GetPeakValue(out float peak);
        int GetMeteringChannelCount(out int channelCount);
        int GetChannelsPeakValues(int channelCount, [Out] float[] peakValues);
        int QueryHardwareSupport(out int hardwareSupportMask);
    }

    public sealed class SessionPeak
    {
        public uint ProcessId;
        public string ProcessName;
        public float Peak;
    }

    public static SessionPeak[] GetSessionPeaks(int samples)
    {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice device;
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device));
        object sessionManagerObject;
        Guid sessionManagerIid = typeof(IAudioSessionManager2).GUID;
        Marshal.ThrowExceptionForHR(device.Activate(ref sessionManagerIid, CLSCTX_ALL, IntPtr.Zero, out sessionManagerObject));
        var sessionManager = (IAudioSessionManager2)sessionManagerObject;
        IAudioSessionEnumerator sessionEnumerator;
        Marshal.ThrowExceptionForHR(sessionManager.GetSessionEnumerator(out sessionEnumerator));

        var peaks = new Dictionary<uint, SessionPeak>();
        for (int sample = 0; sample < samples; sample++)
        {
            int count;
            Marshal.ThrowExceptionForHR(sessionEnumerator.GetCount(out count));
            for (int index = 0; index < count; index++)
            {
                IAudioSessionControl control;
                Marshal.ThrowExceptionForHR(sessionEnumerator.GetSession(index, out control));
                var control2 = control as IAudioSessionControl2;
                var meter = control as IAudioMeterInformation;
                if (control2 == null || meter == null) continue;

                uint processId;
                Marshal.ThrowExceptionForHR(control2.GetProcessId(out processId));
                float peak;
                Marshal.ThrowExceptionForHR(meter.GetPeakValue(out peak));
                SessionPeak info;
                if (!peaks.TryGetValue(processId, out info))
                {
                    string processName = "";
                    try { processName = Process.GetProcessById((int)processId).ProcessName; } catch { }
                    info = new SessionPeak { ProcessId = processId, ProcessName = processName };
                    peaks[processId] = info;
                }
                if (peak > info.Peak) info.Peak = peak;
            }
            Thread.Sleep(50);
        }

        Marshal.ReleaseComObject(sessionEnumerator);
        Marshal.ReleaseComObject(sessionManager);
        Marshal.ReleaseComObject(device);
        Marshal.ReleaseComObject(enumerator);

        var output = new List<SessionPeak>(peaks.Values);
        output.Sort((left, right) => right.Peak.CompareTo(left.Peak));
        return output.ToArray();
    }

    public static int FindActiveProcessId(string[] processNames)
    {
        var allowed = new HashSet<string>(processNames, StringComparer.OrdinalIgnoreCase);
        SessionPeak[] sessions = GetSessionPeaks(10);
        foreach (SessionPeak session in sessions)
        {
            if (session.Peak > 0.0001f && allowed.Contains(session.ProcessName))
            {
                return (int)session.ProcessId;
            }
        }
        return 0;
    }

    // Sets every audio session of a process to the given volume and returns
    // the previous value so it can be restored. Session volume scales the
    // process-loopback capture proportionally, so lowering it makes the
    // original inaudible while the capture stays usable once the renderer
    // compensates with the matching gain.
    public static float SetProcessVolume(int processId, float level)
    {
        return SetProcessVolume(processId, level, true);
    }

    public static float SetProcessVolume(int processId, float level, bool apply)
    {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice device = null;
        object sessionManagerObject = null;
        IAudioSessionManager2 sessionManager = null;
        IAudioSessionEnumerator sessionEnumerator = null;
        float previous = -1f;
        try
        {
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(
                EDataFlow.eRender, ERole.eMultimedia, out device));
            Guid sessionManagerIid = typeof(IAudioSessionManager2).GUID;
            Marshal.ThrowExceptionForHR(device.Activate(
                ref sessionManagerIid, CLSCTX_ALL, IntPtr.Zero, out sessionManagerObject));
            sessionManager = (IAudioSessionManager2)sessionManagerObject;
            Marshal.ThrowExceptionForHR(sessionManager.GetSessionEnumerator(out sessionEnumerator));

            int count;
            Marshal.ThrowExceptionForHR(sessionEnumerator.GetCount(out count));
            for (int index = 0; index < count; index++)
            {
                IAudioSessionControl control;
                Marshal.ThrowExceptionForHR(sessionEnumerator.GetSession(index, out control));
                if (control == null) continue;
                var control2 = control as IAudioSessionControl2;
                uint sessionProcessId;
                if (control2 != null &&
                    control2.GetProcessId(out sessionProcessId) == 0 &&
                    (int)sessionProcessId == processId)
                {
                    var volume = control as ISimpleAudioVolume;
                    if (volume != null)
                    {
                        float current;
                        if (volume.GetMasterVolume(out current) == 0)
                        {
                            if (previous < 0f) previous = current;
                            if (apply)
                            {
                                Guid eventContext = Guid.Empty;
                                volume.SetMasterVolume(level, ref eventContext);
                            }
                        }
                    }
                }
                if (Marshal.IsComObject(control)) Marshal.ReleaseComObject(control);
            }
        }
        finally
        {
            if (sessionEnumerator != null && Marshal.IsComObject(sessionEnumerator)) Marshal.ReleaseComObject(sessionEnumerator);
            if (sessionManager != null && Marshal.IsComObject(sessionManager)) Marshal.ReleaseComObject(sessionManager);
            if (device != null && Marshal.IsComObject(device)) Marshal.ReleaseComObject(device);
            if (enumerator != null && Marshal.IsComObject(enumerator)) Marshal.ReleaseComObject(enumerator);
        }
        return previous;
    }

    // Mutes or unmutes every audio session owned by a process.
    // Watches the host process on a dedicated thread. If the host dies while
    // the capture thread is blocked writing to a full pipe, this still restores
    // the source app's volume and exits.
    public static void StartParentWatchdog(int parentProcessId, int targetProcessId, float restoreVolume)
    {
        string logPath = Environment.GetEnvironmentVariable("ASMR3D_WATCHDOG_LOG");
        if (string.IsNullOrEmpty(logPath))
        {
            logPath = Path.Combine(Path.GetTempPath(), "asmr3d-capture-watchdog.log");
        }
        var watchdog = new Thread(delegate()
        {
            Action<string> log = delegate(string message)
            {
                try
                {
                    File.AppendAllText(
                        logPath,
                        DateTime.Now.ToString("HH:mm:ss.fff") + " " + message + Environment.NewLine);
                }
                catch { }
            };
            log("watchdog started parent=" + parentProcessId + " target=" + targetProcessId + " restore=" + restoreVolume);
            while (true)
            {
                Thread.Sleep(2000);
                bool alive = false;
                try
                {
                    alive = !Process.GetProcessById(parentProcessId).HasExited;
                }
                catch
                {
                    alive = false;
                }
                if (!alive)
                {
                    log("parent gone; restoring volume");
                    if (restoreVolume >= 0f)
                    {
                        try { SetProcessVolume(targetProcessId, restoreVolume); }
                        catch (Exception exception) { log("restore failed: " + exception.Message); }
                    }
                    log("exiting");
                    Environment.Exit(0);
                }
            }
        });
        watchdog.IsBackground = true;
        watchdog.Start();
    }

    public static int SetProcessMute(int processId, bool mute)
    {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice device = null;
        object sessionManagerObject = null;
        IAudioSessionManager2 sessionManager = null;
        IAudioSessionEnumerator sessionEnumerator = null;
        int applied = 0;
        try
        {
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(
                EDataFlow.eRender, ERole.eMultimedia, out device));
            Guid sessionManagerIid = typeof(IAudioSessionManager2).GUID;
            Marshal.ThrowExceptionForHR(device.Activate(
                ref sessionManagerIid, CLSCTX_ALL, IntPtr.Zero, out sessionManagerObject));
            sessionManager = (IAudioSessionManager2)sessionManagerObject;
            Marshal.ThrowExceptionForHR(sessionManager.GetSessionEnumerator(out sessionEnumerator));

            int count;
            Marshal.ThrowExceptionForHR(sessionEnumerator.GetCount(out count));
            for (int index = 0; index < count; index++)
            {
                IAudioSessionControl control;
                Marshal.ThrowExceptionForHR(sessionEnumerator.GetSession(index, out control));
                if (control == null) continue;
                var control2 = control as IAudioSessionControl2;
                uint sessionProcessId;
                if (control2 != null &&
                    control2.GetProcessId(out sessionProcessId) == 0 &&
                    (int)sessionProcessId == processId)
                {
                    var volume = control as ISimpleAudioVolume;
                    if (volume != null)
                    {
                        Guid eventContext = Guid.Empty;
                        if (volume.SetMute(mute, ref eventContext) == 0) applied++;
                    }
                }
                if (Marshal.IsComObject(control)) Marshal.ReleaseComObject(control);
            }
        }
        finally
        {
            if (sessionEnumerator != null && Marshal.IsComObject(sessionEnumerator)) Marshal.ReleaseComObject(sessionEnumerator);
            if (sessionManager != null && Marshal.IsComObject(sessionManager)) Marshal.ReleaseComObject(sessionManager);
            if (device != null && Marshal.IsComObject(device)) Marshal.ReleaseComObject(device);
            if (enumerator != null && Marshal.IsComObject(enumerator)) Marshal.ReleaseComObject(enumerator);
        }
        return applied;
    }

    [ComImport]
    [Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioClient
    {
        int Initialize(int shareMode, int streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr audioSessionGuid);
        int GetBufferSize(out uint frames);
        int GetStreamLatency(out long latency);
        int GetCurrentPadding(out uint frames);
        int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closestMatch);
        int GetMixFormat(out IntPtr deviceFormat);
        int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        int Start();
        int Stop();
        int Reset();
        int SetEventHandle(IntPtr eventHandle);
        int GetService(ref Guid iid, out IntPtr service);
    }

    [ComImport]
    [Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioCaptureClient
    {
        int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
        int ReleaseBuffer(uint frames);
        int GetNextPacketSize(out uint frames);
    }

    private static float[] ConvertBlockToFloat(
        IntPtr data, int frames, int channels, ushort formatTag, ushort bitsPerSample,
        bool isFloat)
    {
        int total = frames * channels;
        float[] block = new float[total];
        if (isFloat)
        {
            Marshal.Copy(data, block, 0, total);
        }
        else if (bitsPerSample == 16)
        {
            short[] source = new short[total];
            Marshal.Copy(data, source, 0, total);
            for (int index = 0; index < total; index++) block[index] = source[index] / 32768f;
        }
        else if (bitsPerSample == 24)
        {
            byte[] source = new byte[total * 3];
            Marshal.Copy(data, source, 0, source.Length);
            for (int index = 0; index < total; index++)
            {
                int value = source[index * 3] | (source[index * 3 + 1] << 8) | (source[index * 3 + 2] << 16);
                if ((value & 0x800000) != 0) value -= 0x1000000;
                block[index] = value / 8388608f;
            }
        }
        else if (bitsPerSample == 32)
        {
            int[] source = new int[total];
            Marshal.Copy(data, source, 0, total);
            for (int index = 0; index < total; index++) block[index] = (float)(source[index] / 2147483648.0);
        }
        return block;
    }

    [DllImport("Mmdevapi.dll", ExactSpelling = true)]
    private static extern int ActivateAudioInterfaceAsync(
        [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
        ref Guid riid,
        ref PROPVARIANT activationParams,
        IActivateAudioInterfaceCompletionHandler completionHandler,
        out IActivateAudioInterfaceAsyncOperation activationOperation);

    public sealed class Result
    {
        public float[] Samples;
        public int Channels;
        public int SampleRate;
        public long Frames;
        public double Peak;
        public double Rms;
        public string StoppedReason = "duration";
        public bool SilenceDetected;
    }

    public static Result Capture(int processId, int durationSeconds)
    {
        return Capture(processId, durationSeconds, null, 0, false);
    }

    public static Result Capture(int processId, int durationSeconds, Stream output)
    {
        return Capture(processId, durationSeconds, output, 0, false);
    }

    public static Result Capture(int processId, int durationSeconds, Stream output, int silenceTimeoutSeconds, bool stopOnProcessExit)
    {
        return Capture(
            processId,
            durationSeconds,
            output,
            silenceTimeoutSeconds,
            stopOnProcessExit,
            0.0009);
    }

    public static Result Capture(
        int processId,
        int durationSeconds,
        Stream output,
        int silenceTimeoutSeconds,
        bool stopOnProcessExit,
        double audibleThreshold)
    {
        // ActivateAudioInterfaceAsync is only accepted from a multithreaded
        // apartment. Windows PowerShell 5.1 (.NET Framework) runs scripts on an
        // STA thread, so every capture runs on a dedicated MTA worker thread.
        Result result = null;
        Exception failure = null;
        var worker = new Thread(delegate()
        {
            try
            {
                result = CaptureCore(
                    processId,
                    durationSeconds,
                    output,
                    silenceTimeoutSeconds,
                    stopOnProcessExit,
                    audibleThreshold);
            }
            catch (Exception exception)
            {
                failure = exception;
            }
        });
        worker.IsBackground = true;
        try { worker.SetApartmentState(ApartmentState.MTA); } catch { }
        worker.Start();
        worker.Join();
        if (failure != null)
        {
            throw new Exception("mta-worker | " + failure.Message, failure);
        }
        return result;
    }

    private static Result CaptureCore(
        int processId,
        int durationSeconds,
        Stream output,
        int silenceTimeoutSeconds,
        bool stopOnProcessExit,
        double audibleThreshold)
    {
        const int channels = 2;
        const int sampleRate = 48000;

        var activationParams = new AUDIOCLIENT_ACTIVATION_PARAMS
        {
            ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
            ProcessLoopbackParams = new AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS
            {
                TargetProcessId = (uint)processId,
                ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
            }
        };

        IntPtr activationPointer = Marshal.AllocHGlobal(Marshal.SizeOf<AUDIOCLIENT_ACTIVATION_PARAMS>());
        IntPtr formatPointer = IntPtr.Zero;
        var completionHandler = new AudioActivationCompletionHandler();
        IActivateAudioInterfaceAsyncOperation asyncOperation = null;
        IAudioClient audioClient = null;
        IAudioCaptureClient captureClient = null;
        var samples = new List<float>();
        string step = "prepare";

        try
        {
            step = "marshal-activation-params";
            Marshal.StructureToPtr(activationParams, activationPointer, false);
            var propVariant = new PROPVARIANT
            {
                vt = VT_BLOB,
                blob = new BLOB
                {
                    cbSize = (uint)Marshal.SizeOf<AUDIOCLIENT_ACTIVATION_PARAMS>(),
                    pBlobData = activationPointer
                }
            };

            Guid audioClientIid = IID_IAudioClient;
            step = "activate-async";
            Marshal.ThrowExceptionForHR(ActivateAudioInterfaceAsync(
                VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                ref audioClientIid,
                ref propVariant,
                completionHandler,
                out asyncOperation));
            step = "wait-completion";
            completionHandler.Wait();
            step = "get-object-for-iunknown";
            audioClient = (IAudioClient)Marshal.GetObjectForIUnknown(completionHandler.ActivatedInterface);
            Marshal.Release(completionHandler.ActivatedInterface);
            completionHandler.ActivatedInterface = IntPtr.Zero;

            var format = new WAVEFORMATEXTENSIBLE
            {
                Format = new WAVEFORMATEX
                {
                    wFormatTag = 0xFFFE,
                    nChannels = channels,
                    nSamplesPerSec = sampleRate,
                    nAvgBytesPerSec = sampleRate * channels * 4,
                    nBlockAlign = channels * 4,
                    wBitsPerSample = 32,
                    cbSize = 22
                },
                Samples = 32,
                ChannelMask = 3,
                SubFormat = KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
            };
            formatPointer = Marshal.AllocHGlobal(Marshal.SizeOf<WAVEFORMATEXTENSIBLE>());
            Marshal.StructureToPtr(format, formatPointer, false);

            step = "initialize";
            Marshal.ThrowExceptionForHR(audioClient.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                2000000,
                0,
                formatPointer,
                IntPtr.Zero));

            Guid captureClientIid = typeof(IAudioCaptureClient).GUID;
            IntPtr captureClientPointer;
            step = "get-service";
            Marshal.ThrowExceptionForHR(audioClient.GetService(ref captureClientIid, out captureClientPointer));
            captureClient = (IAudioCaptureClient)Marshal.GetObjectForIUnknown(captureClientPointer);
            Marshal.Release(captureClientPointer);

            step = "start";
            Marshal.ThrowExceptionForHR(audioClient.Start());
            var result = new Result
            {
                Channels = channels,
                SampleRate = sampleRate
            };
            double sumSquares = 0;
            DateTime deadline = durationSeconds > 0
                ? DateTime.UtcNow.AddSeconds(durationSeconds)
                : DateTime.MaxValue;
            DateTime lastAudibleUtc = DateTime.UtcNow;
            Process targetProcess = null;
            bool trackProcess = false;
            if (stopOnProcessExit)
            {
                try
                {
                    targetProcess = Process.GetProcessById(processId);
                    trackProcess = true;
                }
                catch { }
            }

            while (DateTime.UtcNow < deadline)
            {
                if (trackProcess)
                {
                    // Browser processes can deny exit-status queries, which
                    // must not abort an otherwise healthy capture.
                    bool exited = false;
                    try { exited = targetProcess.HasExited; } catch { exited = false; }
                    if (exited)
                    {
                        result.StoppedReason = "process-exited";
                        break;
                    }
                }
                if (silenceTimeoutSeconds > 0 &&
                    (DateTime.UtcNow - lastAudibleUtc).TotalSeconds >= silenceTimeoutSeconds)
                {
                    result.StoppedReason = "silence";
                    result.SilenceDetected = true;
                    break;
                }

                uint packetFrames;
                Marshal.ThrowExceptionForHR(captureClient.GetNextPacketSize(out packetFrames));
                if (packetFrames == 0)
                {
                    Thread.Sleep(5);
                    continue;
                }

                while (packetFrames > 0)
                {
                    IntPtr data;
                    uint frames;
                    uint flags;
                    ulong devicePosition;
                    ulong qpcPosition;
                    Marshal.ThrowExceptionForHR(captureClient.GetBuffer(out data, out frames, out flags, out devicePosition, out qpcPosition));
                    if ((flags & AUDCLNT_BUFFERFLAGS_SILENT) == 0 && frames > 0)
                    {
                        int totalSamples = checked((int)(frames * channels));
                        float[] block = new float[totalSamples];
                        Marshal.Copy(data, block, 0, totalSamples);
                        bool audible = false;
                        for (int index = 0; index < totalSamples; index++)
                        {
                            double value = block[index];
                            double absolute = Math.Abs(value);
                            if (absolute > result.Peak) result.Peak = absolute;
                            if (absolute > audibleThreshold) audible = true;
                            sumSquares += value * value;
                        }
                        if (audible) lastAudibleUtc = DateTime.UtcNow;
                        if (output != null)
                        {
                            byte[] bytes = new byte[block.Length * 4];
                            Buffer.BlockCopy(block, 0, bytes, 0, bytes.Length);
                            output.Write(bytes, 0, bytes.Length);
                            output.Flush();
                        }
                        else
                        {
                            samples.AddRange(block);
                        }
                        result.Frames += frames;
                    }
                    Marshal.ThrowExceptionForHR(captureClient.ReleaseBuffer(frames));
                    Marshal.ThrowExceptionForHR(captureClient.GetNextPacketSize(out packetFrames));
                }
            }

            result.Samples = samples.ToArray();
            result.Rms = samples.Count > 0
                ? Math.Sqrt(sumSquares / samples.Count)
                : 0;
            return result;
        }
        catch (Exception exception)
        {
            throw new Exception(
                "capture-step=" + step + " | " + exception.GetType().Name + ": " + exception.Message,
                exception);
        }
        finally
        {
            if (audioClient != null)
            {
                try { audioClient.Stop(); } catch { }
            }
            if (formatPointer != IntPtr.Zero) Marshal.FreeHGlobal(formatPointer);
            Marshal.FreeHGlobal(activationPointer);
            if (captureClient != null && Marshal.IsComObject(captureClient)) Marshal.ReleaseComObject(captureClient);
            if (audioClient != null && Marshal.IsComObject(audioClient)) Marshal.ReleaseComObject(audioClient);
            if (asyncOperation != null && Marshal.IsComObject(asyncOperation)) Marshal.ReleaseComObject(asyncOperation);
            if (completionHandler.ActivatedInterface != IntPtr.Zero)
            {
                Marshal.Release(completionHandler.ActivatedInterface);
            }
            completionHandler.Dispose();
        }
    }

    public static void WriteFloatWav(string path, Result result)
    {
        using (var stream = File.Create(path))
        using (var writer = new BinaryWriter(stream))
        {
            int bytesPerSample = 4;
            int dataSize = result.Samples.Length * bytesPerSample;
            writer.Write(new char[] { 'R', 'I', 'F', 'F' });
            writer.Write(36 + dataSize);
            writer.Write(new char[] { 'W', 'A', 'V', 'E' });
            writer.Write(new char[] { 'f', 'm', 't', ' ' });
            writer.Write(16);
            writer.Write((ushort)3);
            writer.Write((ushort)result.Channels);
            writer.Write(result.SampleRate);
            writer.Write(result.SampleRate * result.Channels * bytesPerSample);
            writer.Write((ushort)(result.Channels * bytesPerSample));
            writer.Write((ushort)32);
            writer.Write(new char[] { 'd', 'a', 't', 'a' });
            writer.Write(dataSize);
            foreach (float sample in result.Samples)
            {
                writer.Write(sample);
            }
        }
    }
}

// The completion handler must be a top-level, COM-visible type. Windows
// PowerShell 5.1 (.NET Framework) cannot build a usable COM callable wrapper
// for a private nested class, which makes process-loopback activation fail
// with E_ILLEGAL_METHOD_CALL / E_NOTIMPL.
[ComImport]
[Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IActivateAudioInterfaceAsyncOperation
{
    int GetActivateResult(out int activateResult, out IntPtr activatedInterface);
}

[ComVisible(true)]
[Guid("41D949AB-9862-444A-80F6-C261334DA5EB")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IActivateAudioInterfaceCompletionHandler
{
    void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
}

[ComVisible(true)]
public sealed class AudioActivationCompletionHandler : IActivateAudioInterfaceCompletionHandler, IDisposable
{
    private readonly ManualResetEvent completed = new ManualResetEvent(false);
    public int ResultCode;
    public IntPtr ActivatedInterface;
    public Exception Error;

    public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation)
    {
        try
        {
            int resultCode;
            IntPtr activatedInterface;
            Marshal.ThrowExceptionForHR(operation.GetActivateResult(out resultCode, out activatedInterface));
            ResultCode = resultCode;
            ActivatedInterface = activatedInterface;
        }
        catch (Exception exception)
        {
            Error = exception;
        }
        finally
        {
            completed.Set();
        }
    }

    public void Wait()
    {
        if (!completed.WaitOne(15000))
        {
            throw new TimeoutException("Timed out waiting for process loopback activation.");
        }
        if (Error != null) throw Error;
        Marshal.ThrowExceptionForHR(ResultCode);
    }

    public void Dispose()
    {
        completed.Dispose();
    }
}
"@

Add-Type -TypeDefinition $source -Language CSharp

$processLoopbackSupported = $PSVersionTable.PSVersion.Major -ge 6

if ($SetMute) {
    if ($ProcessId -le 0) {
        [Console]::Error.WriteLine("SetMute requires -ProcessId.")
        exit 4
    }
    $muteValue = -not (@("false", "0", "no", "off") -contains $MuteState.ToLowerInvariant())
    $applied = [ProcessAudioProbe]::SetProcessMute($ProcessId, $muteValue)
    [Console]::Out.WriteLine(([pscustomobject]@{
        type      = "mute"
        processId = $ProcessId
        mute      = $muteValue
        applied   = $applied
    } | ConvertTo-Json -Compress))
    exit 0
}

if ($SetVolume -ne "") {
    if ($ProcessId -le 0) {
        [Console]::Error.WriteLine("SetVolume requires -ProcessId.")
        exit 4
    }
    $level = [float]$SetVolume
    if ($level -lt 0) { $level = 0 }
    if ($level -gt 1) { $level = 1 }
    $previous = [ProcessAudioProbe]::SetProcessVolume($ProcessId, $level)
    [Console]::Out.WriteLine(([pscustomobject]@{
        type      = "session-volume"
        processId = $ProcessId
        volume    = $level
        previous  = $previous
    } | ConvertTo-Json -Compress))
    exit 0
}

if ($GetVolume) {
    if ($ProcessId -le 0) {
        [Console]::Error.WriteLine("GetVolume requires -ProcessId.")
        exit 4
    }
    $current = [ProcessAudioProbe]::SetProcessVolume($ProcessId, 0.0, $false)
    [Console]::Out.WriteLine(([pscustomobject]@{
        type      = "session-volume"
        processId = $ProcessId
        current   = $current
    } | ConvertTo-Json -Compress))
    exit 0
}

if ($ListJson) {
    $targets = @()
    if ($processLoopbackSupported) {
        $sessionPeaks = [ProcessAudioProbe]::GetSessionPeaks(12)
        foreach ($session in $sessionPeaks) {
            if ($session.ProcessId -le 4) { continue }
            $targets += [pscustomobject]@{
                processId   = [int]$session.ProcessId
                processName = [string]$session.ProcessName
                peak        = [Math]::Round([double]$session.Peak, 6)
            }
        }
    }
    $payload = [pscustomobject]@{
        type              = "targets"
        processLoopback   = $processLoopbackSupported
        runtime           = $PSVersionTable.PSVersion.ToString()
        targets           = @($targets)
    }
    [Console]::Out.WriteLine(($payload | ConvertTo-Json -Depth 5 -Compress))
    exit 0
}

if (-not $processLoopbackSupported) {
    $message = "Process loopback requires PowerShell 7 (pwsh); this host is Windows PowerShell $($PSVersionTable.PSVersion)."
    if ($StreamToStdout) {
        [Console]::Error.WriteLine($message)
        exit 3
    }
    throw $message
}

if ($ProcessId -le 0) {
    $allowedNames = if ($ProcessName) {
        @($ProcessName)
    } else {
        @("msedge", "chrome", "firefox", "brave", "opera", "vivaldi")
    }
    $ProcessId = [ProcessAudioProbe]::FindActiveProcessId($allowedNames)
}

if ($ProcessId -le 0) {
    if ($StreamToStdout) {
        [Console]::Error.WriteLine("No active audio process was found.")
        exit 2
    }
    throw "No active audio process was found."
}

$target = Get-Process -Id $ProcessId -ErrorAction Stop
$ProcessName = $target.ProcessName
$captureLabel = "$ProcessName ($ProcessId)"

if ($StreamToStdout) {
    $header = [pscustomobject]@{
        type        = "header"
        mode        = "process"
        processId   = $ProcessId
        processName = $ProcessName
        channels    = 2
        sampleRate  = 48000
        format      = "f32le"
    } | ConvertTo-Json -Compress
    $stdout = [Console]::OpenStandardOutput()
    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header + "`n")
    $stdout.Write($headerBytes, 0, $headerBytes.Length)
    $stdout.Flush()
    [Console]::Error.WriteLine(
        "streaming $($header.mode) $captureLabel parent=$ParentProcessId restore=$RestoreVolumeOnExit")
    if ($ParentProcessId -gt 0) {
        $restoreValue = [float]-1
        if ($RestoreVolumeOnExit -ne "") {
            $restoreValue = [float]$RestoreVolumeOnExit
        }
        [ProcessAudioProbe]::StartParentWatchdog(
            $ParentProcessId, $ProcessId, $restoreValue)
    }
    try {
        $streamResult = [ProcessAudioProbe]::Capture(
            $ProcessId, 0, $stdout, $SilenceTimeoutSeconds, $true, $AudibleThreshold)
        [Console]::Error.WriteLine("capture-reason: $($streamResult.StoppedReason)")
    } catch {
        [Console]::Error.WriteLine("capture-reason: failed")
        [Console]::Error.WriteLine("capture-ended: $($_.Exception.Message)")
    }
    if ($RestoreVolumeOnExit -ne "") {
        # Safety net: if the host app dies, the broken pipe ends the capture and
        # this restores the source app's original volume.
        try {
            [void][ProcessAudioProbe]::SetProcessVolume(
                $ProcessId, [float]$RestoreVolumeOnExit)
            [Console]::Error.WriteLine("restored-source-volume")
        } catch {
        }
    }
    try { $stdout.Flush() } catch { }
    exit 0
}

$sessionPeaks = [ProcessAudioProbe]::GetSessionPeaks(12)
Write-Host "Active audio sessions:"
$sessionPeaks | Select-Object ProcessId, ProcessName, Peak |
    Format-Table -AutoSize |
    Out-Host
Write-Host "Target process: $($target.ProcessName) ($ProcessId)"

Write-Host "Capture mode: $captureLabel"
$processCpuBefore = [System.Diagnostics.Process]::GetCurrentProcess().TotalProcessorTime.TotalSeconds
$wallClock = [System.Diagnostics.Stopwatch]::StartNew()
$result = [ProcessAudioProbe]::Capture($ProcessId, $DurationSeconds)
$wallClock.Stop()
$processCpuAfter = [System.Diagnostics.Process]::GetCurrentProcess().TotalProcessorTime.TotalSeconds
if ($OutputPath) {
    [ProcessAudioProbe]::WriteFloatWav($OutputPath, $result)
}

$peakDb = if ($result.Peak -gt 0) { 20 * [Math]::Log10($result.Peak) } else { [double]::NegativeInfinity }
$rmsDb = if ($result.Rms -gt 0) { 20 * [Math]::Log10($result.Rms) } else { [double]::NegativeInfinity }

[pscustomobject]@{
    ProcessName = $target.ProcessName
    ProcessId = $ProcessId
    DurationSeconds = $DurationSeconds
    Channels = $result.Channels
    SampleRate = $result.SampleRate
    CapturedFrames = $result.Frames
    PeakLinear = $result.Peak
    PeakDbFs = $peakDb
    RmsLinear = $result.Rms
    RmsDbFs = $rmsDb
    HasOutput = ($result.Peak -gt 0.001)
    StoppedReason = $result.StoppedReason
    OutputPath = $OutputPath
    CaptureWallSeconds = [Math]::Round($wallClock.Elapsed.TotalSeconds, 3)
    CaptureCpuSeconds = [Math]::Round($processCpuAfter - $processCpuBefore, 4)
    CaptureCpuPercentOfOneCore = [Math]::Round(
        100 * ($processCpuAfter - $processCpuBefore) /
            [Math]::Max($wallClock.Elapsed.TotalSeconds, 0.001),
        3
    )
} | Format-List
