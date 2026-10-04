param(
    [int]$ProcessId = 0,
    [string]$ProcessName = "",
    [int]$DurationSeconds = 8,
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

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
                if (!peaks.TryGetValue(processId, out SessionPeak info))
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

    [ComImport]
    [Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IActivateAudioInterfaceAsyncOperation
    {
        int GetActivateResult(out int activateResult, out IntPtr activatedInterface);
    }

    [ComImport]
    [Guid("41D949AB-9862-444A-80F6-C261334DA5EB")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IActivateAudioInterfaceCompletionHandler
    {
        void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
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

    [DllImport("Mmdevapi.dll", ExactSpelling = true)]
    private static extern int ActivateAudioInterfaceAsync(
        [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
        ref Guid riid,
        ref PROPVARIANT activationParams,
        IActivateAudioInterfaceCompletionHandler completionHandler,
        out IActivateAudioInterfaceAsyncOperation activationOperation);

    private sealed class CompletionHandler : IActivateAudioInterfaceCompletionHandler, IDisposable
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

    public sealed class Result
    {
        public float[] Samples;
        public int Channels;
        public int SampleRate;
        public long Frames;
        public double Peak;
        public double Rms;
    }

    public static Result Capture(int processId, int durationSeconds)
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
        var completionHandler = new CompletionHandler();
        IActivateAudioInterfaceAsyncOperation asyncOperation = null;
        IAudioClient audioClient = null;
        IAudioCaptureClient captureClient = null;
        var samples = new List<float>();

        try
        {
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
            Marshal.ThrowExceptionForHR(ActivateAudioInterfaceAsync(
                VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                ref audioClientIid,
                ref propVariant,
                completionHandler,
                out asyncOperation));
            completionHandler.Wait();
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

            Marshal.ThrowExceptionForHR(audioClient.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                2000000,
                0,
                formatPointer,
                IntPtr.Zero));

            Guid captureClientIid = typeof(IAudioCaptureClient).GUID;
            IntPtr captureClientPointer;
            Marshal.ThrowExceptionForHR(audioClient.GetService(ref captureClientIid, out captureClientPointer));
            captureClient = (IAudioCaptureClient)Marshal.GetObjectForIUnknown(captureClientPointer);
            Marshal.Release(captureClientPointer);

            Marshal.ThrowExceptionForHR(audioClient.Start());
            var result = new Result
            {
                Channels = channels,
                SampleRate = sampleRate
            };
            double sumSquares = 0;
            DateTime deadline = DateTime.UtcNow.AddSeconds(durationSeconds);

            while (DateTime.UtcNow < deadline)
            {
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
                        for (int index = 0; index < totalSamples; index++)
                        {
                            double value = block[index];
                            double absolute = Math.Abs(value);
                            if (absolute > result.Peak) result.Peak = absolute;
                            sumSquares += value * value;
                        }
                        samples.AddRange(block);
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
"@

if ($PSVersionTable.PSVersion.Major -ge 6) {
    Add-Type -TypeDefinition $source -Language CSharp -CompilerOptions "/unsafe"
} else {
    $compilerParameters = New-Object System.CodeDom.Compiler.CompilerParameters
    $compilerParameters.CompilerOptions = "/unsafe"
    Add-Type -TypeDefinition $source -Language CSharp -CompilerParameters $compilerParameters
}

$sessionPeaks = [ProcessAudioProbe]::GetSessionPeaks(12)
Write-Host "Active audio sessions:"
$sessionPeaks | Select-Object ProcessId, ProcessName, Peak |
    Format-Table -AutoSize |
    Out-Host

if ($ProcessId -le 0) {
    $allowedNames = if ($ProcessName) {
        @($ProcessName)
    } else {
        @("msedge", "chrome", "firefox", "brave", "opera", "vivaldi")
    }
    $ProcessId = [ProcessAudioProbe]::FindActiveProcessId($allowedNames)
}

if ($ProcessId -le 0) {
    throw "No active audio process was found."
}

$target = Get-Process -Id $ProcessId -ErrorAction Stop
$ProcessName = $target.ProcessName
Write-Host "Target process: $($target.ProcessName) ($ProcessId)"
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
    OutputPath = $OutputPath
    CaptureWallSeconds = [Math]::Round($wallClock.Elapsed.TotalSeconds, 3)
    CaptureCpuSeconds = [Math]::Round($processCpuAfter - $processCpuBefore, 4)
    CaptureCpuPercentOfOneCore = [Math]::Round(
        100 * ($processCpuAfter - $processCpuBefore) /
            [Math]::Max($wallClock.Elapsed.TotalSeconds, 0.001),
        3
    )
} | Format-List
