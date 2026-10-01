namespace LocalMediaEtw;

internal static class SelfTests
{
    public static void Run()
    {
        var t = DateTimeOffset.Parse("2026-10-01T00:00:00Z");
        var path = Path.GetFullPath("fixture.mp4");
        var manifest = new Manifest(1, [new Fixture("target", path)],
            [new Window("control", "target", "positive-control", t, t.AddSeconds(1), [123]),
             new Window("read", "target", "measurement", t.AddSeconds(2), t.AddSeconds(3), [123])]);
        Analysis Create()
        {
            var value = new Analysis(manifest);
            value.Read(t.AddMilliseconds(1), path, 123, 4096, false);
            value.Read(t.AddSeconds(2.1), path, 123, 4096, false);
            return value;
        }
        void Check(bool value, string name) { if (!value) throw new InvalidOperationException("Self-test failed: " + name); }
        var clean = Create(); clean.Read(t.AddSeconds(2.2), path, 123, 8192, true);
        clean.Read(t.AddSeconds(4), path, 123, 9999, true);
        clean.Read(t.AddSeconds(2.3), path + ".other", 123, 9999, true);
        var result = clean.Finish(0, 0, true);
        Check(result.Status == "observed" && result.Windows[1].DiskReadBytes == 8192 && result.Windows[1].ProcessDiskReadCount == 1, "exact path, own PID, window, bytes");
        Check(clean.Finish(null, 0, true).Status == "inconclusive", "unknown event loss");
        Check(clean.Finish(0, null, true).Status == "inconclusive", "unknown buffer loss");
        Check(clean.Finish(1, 0, true).Status == "inconclusive", "lost events");
        Check(clean.Finish(0, 1, true).Status == "inconclusive", "lost buffers");
        Check(clean.Finish(0, 0, false).Status == "inconclusive", "trace bounds");
        var unmapped = Create(); unmapped.Read(t.AddSeconds(2.4), "", 123, 4096, true);
        Check(unmapped.Finish(0, 0, true).Status == "inconclusive", "unknown mapping");
        var other = Create(); other.Read(t.AddSeconds(2.4), path, 888, 4096, true);
        Check(other.Finish(0, 0, true).Status == "inconclusive", "other process attribution");
        var system = Create(); system.Read(t.AddSeconds(2.4), path, 4, 4096, true);
        Check(system.Finish(0, 0, true).Windows[1].SystemDiskReadCount == 1, "system process separately retained");
        var unknown = Create(); unknown.Read(t.AddSeconds(2.4), path, -1, 4096, true);
        Check(unknown.Finish(0, 0, true).Status == "inconclusive", "unknown process attribution");
        Check(new Analysis(manifest).Finish(0, 0, true).Status == "inconclusive", "missing FileIO positive control");
        Check(Create().Finish(0, 0, true).Windows[1].DiskReadCount == 0, "zero reads are observations, not cold proof");
        var rejected = false;
        try { _ = new Analysis(manifest with { Windows = [manifest.Windows[0] with { ProcessIds = [] }] }); }
        catch (ArgumentException) { rejected = true; }
        Check(rejected, "manifest invalid PID validation");
        var stops = 0;
        var lifetime = new OwnedLifetime(() => stops++);
        lifetime.StopOnce();
        Check(stops == 0, "collision/uncreated lifetime never stops");
        lifetime.MarkCreated(); lifetime.StopOnce();
        lifetime.MarkCreated(); lifetime.StopOnce();
        Check(stops == 1, "direct stop followed by stale library IsActive does not stop twice");
        Check(OwnedSessionStop.LayoutValid, "documented Windows x64 properties layout");
        var releases = 0;
        using (var guard = CaptureGuard.Acquire(() => true, () => releases++, () => ["UnrelatedSession"]))
        { guard.Dispose(); }
        Check(releases == 1, "capture coordination released once");
        var collision = false;
        try { _ = CaptureGuard.Acquire(() => false, () => releases++, () => []); }
        catch (InvalidOperationException) { collision = true; }
        Check(collision && releases == 1, "busy mutex never releases another owner");
        collision = false;
        try { _ = CaptureGuard.Acquire(() => true, () => releases++, () => ["streamjamsmedia-orphan"]); }
        catch (InvalidOperationException) { collision = true; }
        Check(collision && releases == 2, "orphan prefix blocks capture and releases own mutex");
        collision = false;
        try { _ = CaptureGuard.Acquire(() => throw new AbandonedMutexException(), () => releases++, () => []); }
        catch (InvalidOperationException) { collision = true; }
        Check(collision && releases == 3, "abandoned mutex fails closed and releases acquired ownership");
        collision = false;
        try { _ = CaptureGuard.Acquire(() => throw new UnauthorizedAccessException(), () => releases++, () => []); }
        catch (UnauthorizedAccessException) { collision = true; }
        Check(collision && releases == 3, "permission denial never changes or releases coordination");
        collision = false;
        try { _ = CaptureGuard.Acquire(() => true, () => releases++, () => throw new InvalidOperationException()); }
        catch (InvalidOperationException) { collision = true; }
        Check(collision && releases == 4, "unknown session inventory fails closed and releases own mutex");
    }
}
