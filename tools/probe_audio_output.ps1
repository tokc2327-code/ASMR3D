param(
    [int]$DurationSeconds = 8,
    [ValidateSet("Console", "Multimedia", "Communications")]
    [string]$Role = "Multimedia"
)

$ErrorActionPreference = "Stop"

$source = @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class AudioOutputProbe
{
    private const int CLSCTX_ALL = 23;
    private const int AUDCLNT_SHAREMODE_SHARED = 0;
    private const int AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;
    private const int AUDCLNT_BUFFERFLAGS_SILENT = 0x00000002;
    private const int WAVE_FORMAT_PCM = 1;
    private const int WAVE_FORMAT_IEEE_FLOAT = 3;
    private const int WAVE_FORMAT_EXTENSIBLE = 0xFFFE;

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

    public sealed class Result
    {
        public double Peak;
        public double Rms;
        public long Frames;
        public int Channels;
        public int SampleRate;
        public int BitsPerSample;
        public string SampleFormat;
        public string EndpointId;
    }

    public static Result CaptureDefaultOutput(int durationSeconds, int role)
    {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice device;
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, (ERole)role, out device));
        string endpointId;
        Marshal.ThrowExceptionForHR(device.GetId(out endpointId));

        object audioClientObject;
        Guid audioClientIid = typeof(IAudioClient).GUID;
        Marshal.ThrowExceptionForHR(device.Activate(ref audioClientIid, CLSCTX_ALL, IntPtr.Zero, out audioClientObject));
        var audioClient = (IAudioClient)audioClientObject;

        IntPtr formatPointer;
        Marshal.ThrowExceptionForHR(audioClient.GetMixFormat(out formatPointer));
        var format = Marshal.PtrToStructure<WAVEFORMATEX>(formatPointer);
        int formatTag = format.wFormatTag;
        if (formatTag == WAVE_FORMAT_EXTENSIBLE)
        {
            formatTag = Marshal.ReadInt16(formatPointer, 24);
        }

        Marshal.ThrowExceptionForHR(audioClient.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK,
            10000000,
            0,
            formatPointer,
            IntPtr.Zero));

        Guid captureClientIid = typeof(IAudioCaptureClient).GUID;
        IntPtr captureClientPointer;
        Marshal.ThrowExceptionForHR(audioClient.GetService(ref captureClientIid, out captureClientPointer));
        var captureClient = (IAudioCaptureClient)Marshal.GetObjectForIUnknown(captureClientPointer);
        Marshal.Release(captureClientPointer);

        Marshal.ThrowExceptionForHR(audioClient.Start());
        var result = new Result
        {
            Channels = format.nChannels,
            SampleRate = (int)format.nSamplesPerSec,
            BitsPerSample = format.wBitsPerSample,
            SampleFormat = formatTag == WAVE_FORMAT_IEEE_FLOAT ? "float" : "pcm",
            EndpointId = endpointId
        };

        double sumSquares = 0;
        long sampleCount = 0;
        DateTime deadline = DateTime.UtcNow.AddSeconds(durationSeconds);

        try
        {
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
                        int totalSamples = checked((int)(frames * format.nChannels));
                        if (formatTag == WAVE_FORMAT_IEEE_FLOAT && format.wBitsPerSample == 32)
                        {
                            unsafe
                            {
                                float* samples = (float*)data;
                                for (int index = 0; index < totalSamples; index++)
                                {
                                    double value = samples[index];
                                    double absolute = Math.Abs(value);
                                    if (absolute > result.Peak) result.Peak = absolute;
                                    sumSquares += value * value;
                                }
                            }
                        }
                        else if (formatTag == WAVE_FORMAT_PCM && format.wBitsPerSample == 16)
                        {
                            unsafe
                            {
                                short* samples = (short*)data;
                                for (int index = 0; index < totalSamples; index++)
                                {
                                    double value = samples[index] / 32768.0;
                                    double absolute = Math.Abs(value);
                                    if (absolute > result.Peak) result.Peak = absolute;
                                    sumSquares += value * value;
                                }
                            }
                        }
                        else
                        {
                            throw new NotSupportedException(
                                "Unsupported output format: tag=" + formatTag +
                                " bits=" + format.wBitsPerSample);
                        }
                        sampleCount += totalSamples;
                        result.Frames += frames;
                    }

                    Marshal.ThrowExceptionForHR(captureClient.ReleaseBuffer(frames));
                    Marshal.ThrowExceptionForHR(captureClient.GetNextPacketSize(out packetFrames));
                }
            }
        }
        finally
        {
            audioClient.Stop();
            Marshal.FreeCoTaskMem(formatPointer);
            Marshal.ReleaseComObject(enumerator);
            Marshal.ReleaseComObject(device);
            Marshal.ReleaseComObject(audioClient);
            Marshal.ReleaseComObject(captureClient);
        }

        result.Rms = sampleCount > 0 ? Math.Sqrt(sumSquares / sampleCount) : 0;
        return result;
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

$roleValue = @{
    Console = 0
    Multimedia = 1
    Communications = 2
}[$Role]

$result = [AudioOutputProbe]::CaptureDefaultOutput($DurationSeconds, $roleValue)
$peakDb = if ($result.Peak -gt 0) { 20 * [Math]::Log10($result.Peak) } else { [double]::NegativeInfinity }
$rmsDb = if ($result.Rms -gt 0) { 20 * [Math]::Log10($result.Rms) } else { [double]::NegativeInfinity }

[pscustomobject]@{
    DurationSeconds = $DurationSeconds
    Role = $Role
    EndpointId = $result.EndpointId
    Channels = $result.Channels
    SampleRate = $result.SampleRate
    BitsPerSample = $result.BitsPerSample
    SampleFormat = $result.SampleFormat
    CapturedFrames = $result.Frames
    PeakLinear = $result.Peak
    PeakDbFs = $peakDb
    RmsLinear = $result.Rms
    RmsDbFs = $rmsDb
    HasOutput = ($result.Peak -gt 0.000001)
} | Format-List
