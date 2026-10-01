using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Diagnostics.Tracing.Parsers;

namespace LocalMediaEtw;

// TraceEventSession.Stop resets the GLOBAL CPU sampling interval and heap flags.
// This tiny documented ControlTraceW adapter stops only the successfully created,
// unique named session. Its EnableKernelProvider also has a post-StartTrace failure
// gap before IsActive is set; direct StartTrace returns ownership immediately.
// All event decoding remains the maintained TraceEvent library.
internal static class OwnedSessionStop
{
    internal static bool LayoutValid => Marshal.SizeOf<Wnode>() == 48 && Marshal.SizeOf<Properties>() == 120 &&
        Marshal.OffsetOf<Properties>(nameof(Properties.LoggerThreadId)).ToInt32() == 104;
    [StructLayout(LayoutKind.Sequential)]
    private struct Wnode
    {
        public uint BufferSize, ProviderId;
        public ulong HistoricalContext;
        public long Timestamp;
        public Guid Guid;
        public uint ClientContext, Flags;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Properties
    {
        public Wnode Wnode;
        public uint BufferSize, MinimumBuffers, MaximumBuffers, MaximumFileSize, LogFileMode, FlushTimer, EnableFlags, AgeLimit;
        public uint NumberOfBuffers, FreeBuffers, EventsLost, BuffersWritten, LogBuffersLost, RealTimeBuffersLost;
        public IntPtr LoggerThreadId;
        public uint LogFileNameOffset, LoggerNameOffset;
    }
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint ControlTraceW(ulong handle, string name, IntPtr properties, uint controlCode);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint StartTraceW(out ulong handle, string name, IntPtr properties);

    public static ulong Start(string ownedName, string output)
    {
        if (!LayoutValid) throw new InvalidOperationException("Windows x64 ETW properties layout required.");
        if (output.Length >= 1024) throw new ArgumentException("ETL path exceeds bounded property storage.");
        var size = Marshal.SizeOf<Properties>();
        var memory = Marshal.AllocHGlobal(size + 4096);
        try
        {
            Marshal.Copy(new byte[size + 4096], 0, memory, size + 4096);
            var properties = new Properties
            {
                Wnode = new Wnode { BufferSize = (uint)(size + 4096), ClientContext = 1, Flags = 0x00020000 /* WNODE_FLAG_TRACED_GUID */ },
                BufferSize = 64, MinimumBuffers = 64, MaximumBuffers = 512,
                MaximumFileSize = 128, FlushTimer = 1,
                LogFileMode = 0x02000000 /* EVENT_TRACE_SYSTEM_LOGGER_MODE */ | 1 /* SEQUENTIAL */,
                // Process/thread starts and rundown let the parser map issuing threads to PIDs.
                EnableFlags = (uint)(KernelTraceEventParser.Keywords.Process | KernelTraceEventParser.Keywords.Thread |
                    KernelTraceEventParser.Keywords.DiskIO | KernelTraceEventParser.Keywords.DiskFileIO |
                    KernelTraceEventParser.Keywords.FileIO | KernelTraceEventParser.Keywords.FileIOInit),
                LoggerNameOffset = (uint)size, LogFileNameOffset = (uint)(size + 2048)
            };
            Marshal.StructureToPtr(properties, memory, false);
            Marshal.Copy((output + '\0').ToCharArray(), 0, IntPtr.Add(memory, size + 2048), output.Length + 1);
            var error = StartTraceW(out var ownedHandle, ownedName, memory);
            // ERROR_ALREADY_EXISTS does not create ownership and NEVER triggers a stop.
            if (error != 0) throw new Win32Exception((int)error, "Owned ETW session start failed.");
            return ownedHandle;
        }
        finally { Marshal.FreeHGlobal(memory); }
    }

    public static void Stop(ulong ownedHandle, string ownedName)
    {
        var size = Marshal.SizeOf<Properties>();
        var memory = Marshal.AllocHGlobal(size + 4096);
        try
        {
            Marshal.Copy(new byte[size + 4096], 0, memory, size + 4096);
            var properties = new Properties
            {
                Wnode = new Wnode { BufferSize = (uint)(size + 4096) },
                LoggerNameOffset = (uint)size, LogFileNameOffset = (uint)(size + 2048)
            };
            Marshal.StructureToPtr(properties, memory, false);
            // Only a handle returned from this invocation's successful StartTrace.
            var error = ControlTraceW(ownedHandle, ownedName, memory, 1 /* EVENT_TRACE_CONTROL_STOP */);
            if (error != 0) throw new Win32Exception((int)error, "Owned ETW session stop failed.");
        }
        finally { Marshal.FreeHGlobal(memory); }
    }
}
