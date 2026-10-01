using System.Text.Json;

namespace LocalMediaEtw;

public sealed record Fixture(string Id, string Path);
public sealed record Window(string Id, string FixtureId, string Kind, DateTimeOffset StartUtc, DateTimeOffset EndUtc, int[] ProcessIds);
public sealed record Manifest(int SchemaVersion, Fixture[] Fixtures, Window[] Windows);
public sealed record WindowResult(string Id, string FixtureId, string Kind, string Status, int FileReadCount, int DiskReadCount,
    long DiskReadBytes, int ProcessDiskReadCount, int OtherProcessDiskReadCount, int SystemDiskReadCount, int UnknownDiskReadCount);
public sealed record Summary(int SchemaVersion, string Status, int? LostEvents, int? LostBuffers, int UnmappedDiskReads,
    WindowResult[] Windows, string[] Limitations);

// Reduces already decoded library events. It never interprets ETW or PFN bytes.
public sealed class Analysis
{
    private readonly Manifest manifest;
    private readonly Dictionary<string, Fixture> fixtures;
    private readonly Dictionary<string, Counts> counts;
    private int unmapped;
    private sealed class Counts
    {
        public int FileReads, DiskReads, Own, Other, System, Unknown;
        public long Bytes;
    }
    public Analysis(Manifest value)
    {
        Validate(value);
        manifest = value;
        fixtures = value.Fixtures.ToDictionary(f => f.Id);
        counts = value.Windows.ToDictionary(w => w.Id, _ => new Counts());
    }
    public static void Validate(Manifest value)
    {
        if (value.SchemaVersion != 1 || value.Fixtures is not { Length: > 0 and <= 12 } || value.Windows is not { Length: > 0 and <= 64 })
            throw new ArgumentException("Invalid manifest schema or bounds.");
        if (value.Fixtures.Select(f => f.Id).Distinct().Count() != value.Fixtures.Length ||
            value.Windows.Select(w => w.Id).Distinct().Count() != value.Windows.Length ||
            value.Fixtures.Select(f => f.Path).Distinct(StringComparer.OrdinalIgnoreCase).Count() != value.Fixtures.Length)
            throw new ArgumentException("Manifest IDs and fixture paths must be unique.");
        foreach (var f in value.Fixtures)
            if (string.IsNullOrWhiteSpace(f.Id) || f.Id.Length > 80 || string.IsNullOrWhiteSpace(f.Path) || !System.IO.Path.IsPathFullyQualified(f.Path) ||
                !string.Equals(System.IO.Path.GetFullPath(f.Path), f.Path, StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("Fixture paths must be exact canonical absolute paths.");
        foreach (var w in value.Windows)
            if (string.IsNullOrWhiteSpace(w.Id) || w.Id.Length > 160 || !value.Fixtures.Any(f => f.Id == w.FixtureId) ||
                w.Kind is not ("positive-control" or "measurement") || w.StartUtc.Offset != TimeSpan.Zero || w.EndUtc.Offset != TimeSpan.Zero ||
                w.EndUtc <= w.StartUtc || w.EndUtc - w.StartUtc > TimeSpan.FromSeconds(180) ||
                w.ProcessIds is not { Length: > 0 and <= 64 } || w.ProcessIds.Any(p => p <= 0))
                throw new ArgumentException("Invalid UTC measurement window or process IDs.");
        var ordered = value.Windows.OrderBy(w => w.StartUtc).ToArray();
        for (var i = 1; i < ordered.Length; i++)
            if (ordered[i].StartUtc < ordered[i - 1].EndUtc) throw new ArgumentException("Measurement windows must not overlap.");
    }
    public void Read(DateTimeOffset timestamp, string? path, int pid, long bytes, bool disk)
    {
        // Missing names in any declared window make zero-read conclusions unsafe.
        var active = manifest.Windows.Where(w => timestamp >= w.StartUtc && timestamp < w.EndUtc).ToArray();
        if (disk && active.Length > 0 && string.IsNullOrEmpty(path)) { unmapped++; return; }
        foreach (var w in active)
        {
            if (!string.Equals(path, fixtures[w.FixtureId].Path, StringComparison.OrdinalIgnoreCase)) continue;
            var c = counts[w.Id];
            if (!disk) { if (w.ProcessIds.Contains(pid)) c.FileReads++; continue; }
            if (bytes <= 0) { c.Unknown++; continue; }
            c.DiskReads++; c.Bytes = checked(c.Bytes + bytes);
            if (w.ProcessIds.Contains(pid)) c.Own++;
            else if (pid == 4) c.System++;
            else if (pid <= 0) c.Unknown++;
            else c.Other++;
        }
    }
    public Summary Finish(int? lostEvents, int? lostBuffers, bool traceBoundsCoverWindows)
    {
        var clean = lostEvents == 0 && lostBuffers == 0 && unmapped == 0 && traceBoundsCoverWindows;
        var result = manifest.Windows.Select(w =>
        {
            var c = counts[w.Id];
            var control = manifest.Windows.Any(p => p.Kind == "positive-control" && p.FixtureId == w.FixtureId &&
                p.EndUtc <= w.StartUtc && counts[p.Id].FileReads > 0);
            var observed = clean && c.FileReads > 0 && c.Unknown == 0 && c.Other == 0 &&
                (w.Kind == "positive-control" || control);
            return new WindowResult(w.Id, w.FixtureId, w.Kind, observed ? "observed" : "inconclusive",
                c.FileReads, c.DiskReads, c.Bytes, c.Own, c.Other, c.System, c.Unknown);
        }).ToArray();
        return new Summary(1, result.All(w => w.Status == "observed") ? "observed" : "inconclusive", lostEvents, lostBuffers,
            unmapped, result, ["DiskIORead means completed storage-stack reads; disk offsets are not file offsets.",
                "System-process reads may be cache-manager work; same-window file reads do not establish causal ownership.",
                "No whole-file eviction, storage-controller cache, hardware-cold or full-file coverage claim.",
                "Zero disk reads alone cannot prove caching; missing mappings, losses or trace coverage fail closed."]);
    }
}
