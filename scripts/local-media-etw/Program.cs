using System.Security.Principal;
using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Diagnostics.Tracing;
using Microsoft.Diagnostics.Tracing.Parsers;
using Microsoft.Diagnostics.Tracing.Etlx;
using Microsoft.Diagnostics.Tracing.Session;
using LocalMediaEtw;

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { UnmappedMemberHandling = System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow };
void Emit(object value) { Console.WriteLine(JsonSerializer.Serialize(value, json)); Console.Out.Flush(); }
bool Elevated() => OperatingSystem.IsWindows() && new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
bool Supported() => OperatingSystem.IsWindowsVersionAtLeast(10) && Environment.Is64BitProcess;
try
{
    if (args.Length == 1 && args[0] is "preflight" or "help" or "--help")
    {
        Emit(new { schemaVersion = 1, status = "preflight", elevated = Elevated(), captureSupported = Supported() && Elevated(),
            windowsSupported = Supported(), library = "Microsoft.Diagnostics.Tracing.TraceEvent", libraryVersion = "3.2.8",
            commands = new[] { "preflight", "capture --session StreamJamsMedia-<UUID> --output NEW.etl --timeout-seconds 120", "analyze --trace FILE.etl --manifest FILE.json --output NEW.json", "self-test" },
            changes = "preflight reads capability only; capture requires an existing elevated terminal" });
        return 0;
    }
    if (args.Length == 1 && args[0] == "self-test") { SelfTests.Run(); Emit(new { status = "passed" }); return 0; }
    if (args.Length < 1) throw new ArgumentException("Specify preflight, capture, analyze or self-test.");
    var options = new Dictionary<string, string>();
    for (var i = 1; i < args.Length; i += 2)
        if (i + 1 >= args.Length || !args[i].StartsWith("--") || !options.TryAdd(args[i], args[i + 1])) throw new ArgumentException("Invalid or duplicate option.");
    string Required(string key) => options.TryGetValue(key, out var value) ? value : throw new ArgumentException("Missing option " + key);
    if (args[0] == "capture")
    {
        if (options.Count != 3) throw new ArgumentException("Capture requires exactly three options.");
        var name = Required("--session"); var output = Path.GetFullPath(Required("--output"));
        if (!Regex.IsMatch(name, "^StreamJamsMedia-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")) throw new ArgumentException("Session must use owned UUID prefix.");
        if (!int.TryParse(Required("--timeout-seconds"), out var seconds) || seconds is < 1 or > 180) throw new ArgumentException("Timeout must be 1-180 seconds.");
        if (!Supported() || !Elevated()) throw new InvalidOperationException("Existing elevated Windows x64 terminal required; no automatic elevation.");
        if (File.Exists(output) || !Directory.Exists(Path.GetDirectoryName(output))) throw new ArgumentException("Trace output must be new in an existing directory.");
        // Across accounts/worktrees; no ACL changes or abandoned-owner repair.
        using var mutex = new Mutex(false, CaptureGuard.MutexName);
        using var guard = CaptureGuard.Acquire(() => mutex.WaitOne(0), mutex.ReleaseMutex, TraceEventSession.GetActiveSessionNames);
        // Exclusive reservation makes the eventual ETW overwrite our own file only.
        using (var reservation = new FileStream(output, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { }
        using var cancel = new CancellationTokenSource();
        ConsoleCancelEventHandler handler = (_, e) => { e.Cancel = true; cancel.Cancel(); };
        Console.CancelKeyPress += handler;
        ulong ownedHandle = 0;
        var lifetime = new OwnedLifetime(() => OwnedSessionStop.Stop(ownedHandle, name));
        try
        {
            // No Profile, stack, registry, heap or sampled-counter keywords.
            ownedHandle = OwnedSessionStop.Start(name, output);
            lifetime.MarkCreated();
            Emit(new { schemaVersion = 1, status = "ready", sessionName = name, startedUtc = DateTimeOffset.UtcNow });
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(seconds));
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancel.Token, deadline.Token);
            string reason;
            // Console's synchronized reader can perform ReadLineAsync synchronously;
            // a background reader plus independent timer preserves the watchdog.
            var input = Task.Run(() => Console.In.ReadLine());
            var timeout = Task.Delay(Timeout.InfiniteTimeSpan, linked.Token);
            if (Task.WhenAny(input, timeout).GetAwaiter().GetResult() == input)
            {
                var line = input.GetAwaiter().GetResult();
                reason = line == "stop" ? "stop" : line == null ? "eof" : "invalid-input";
            }
            else reason = cancel.IsCancellationRequested ? "cancelled" : "watchdog";
            var stopStartedUtc = DateTimeOffset.UtcNow;
            Emit(new { schemaVersion = 1, status = "stop-started", sessionName = name, reason, stopStartedUtc });
            var stopClock = Stopwatch.StartNew();
            lifetime.StopOnce();
            Emit(new { schemaVersion = 1, status = "stopped", sessionName = name, reason, stopStartedUtc, endedUtc = DateTimeOffset.UtcNow, stopElapsedMs = stopClock.Elapsed.TotalMilliseconds });
            return reason == "stop" ? 0 : 2;
        }
        finally
        {
            lifetime.StopOnce();
            Console.CancelKeyPress -= handler;
        }
    }
    if (args[0] == "analyze")
    {
        if (options.Count != 3) throw new ArgumentException("Analyze requires exactly three options.");
        var output = Path.GetFullPath(Required("--output"));
        if (File.Exists(output)) throw new ArgumentException("Summary output must be new.");
        if (new FileInfo(Required("--manifest")).Length > 256 * 1024) throw new ArgumentException("Manifest exceeds bounded input size.");
        var manifest = JsonSerializer.Deserialize<Manifest>(File.ReadAllText(Required("--manifest")), json) ?? throw new ArgumentException("Missing manifest.");
        var analysis = new Analysis(manifest);
        var tracePath = Path.GetFullPath(Required("--trace"));
        if (new FileInfo(tracePath).Length > 129L * 1024 * 1024) throw new ArgumentException("ETL exceeds bounded capture size.");
        using var raw = new ETWTraceEventSource(tracePath);
        int? buffersLost = null;
        raw.Kernel.EventTraceHeader += data => buffersLost = data.BuffersLost;
        var etlxPath = tracePath + "." + Guid.NewGuid().ToString("N") + ".etlx";
        using (var reservation = new FileStream(etlxPath, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { }
        // TraceLog consumes complete rundown before reopening the maintained parser's
        // timestamp-aware mapping state. No homemade two-pass key/PFN joins.
        TraceLog.CreateFromEventTraceLogFile(raw, etlxPath, new TraceLogOptions
        {
            KeepAllEvents = true, MaxEventCount = 1_000_000, ContinueOnError = false,
            ConversionLog = TextWriter.Null, ShouldResolveSymbols = _ => false, LocalSymbolsOnly = true
        });
        using var trace = new TraceLog(etlxPath);
        using var source = trace.Events.GetSource();
        var parser = source.Kernel;
        parser.FileIORead += data => analysis.Read(new DateTimeOffset(data.TimeStamp.ToUniversalTime()), data.FileName, data.ProcessID, data.IoSize, false);
        parser.DiskIORead += data => analysis.Read(new DateTimeOffset(data.TimeStamp.ToUniversalTime()), data.FileName, data.ProcessID, data.TransferSize, true);
        source.Process();
        var covers = !trace.Truncated && trace.EventCount < 1_000_000 && trace.FirstTimeInversion == EventIndex.Invalid &&
            manifest.Windows.All(w => w.StartUtc >= new DateTimeOffset(trace.SessionStartTime.ToUniversalTime()) &&
            w.EndUtc <= new DateTimeOffset(trace.SessionEndTime.ToUniversalTime()));
        var summary = analysis.Finish(raw.EventsLost, buffersLost, covers);
        using (var file = new FileStream(output, FileMode.CreateNew, FileAccess.Write, FileShare.None)) JsonSerializer.Serialize(file, summary, json);
        Emit(summary); return 0;
    }
    throw new ArgumentException("Unknown command.");
}
catch (Exception error)
{
    // Exception text can contain unrelated paths, so do not copy it into JSON.
    Emit(new { schemaVersion = 1, status = "error", errorType = error.GetType().Name,
        nativeErrorCode = error is System.ComponentModel.Win32Exception native ? (int?)native.NativeErrorCode : null,
        reason = "Helper command failed; no successful trace evidence." });
    return 1;
}
