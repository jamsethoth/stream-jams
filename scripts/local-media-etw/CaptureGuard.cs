namespace LocalMediaEtw;

// Mutex is thread-affine: capture stays on its acquiring controller thread.
internal sealed class CaptureGuard(Action release) : IDisposable
{
    internal const string MutexName = @"Global\StreamJamsMediaColdTiming";
    private bool released;
    public static CaptureGuard Acquire(Func<bool> tryAcquire, Action release, Func<IEnumerable<string>> sessions)
    {
        bool owned;
        try { owned = tryAcquire(); }
        catch (AbandonedMutexException)
        {
            // WaitOne acquired ownership before throwing. Reject, release it,
            // and never repair permissions or stop an orphaned trace.
            release();
            throw new InvalidOperationException("Abandoned capture coordination; no trace started.");
        }
        if (!owned) throw new InvalidOperationException("Another machine-wide capture owns coordination.");
        var guard = new CaptureGuard(release);
        try
        {
            if (sessions().Any(name => name.StartsWith("StreamJamsMedia-", StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException("Existing media trace; none started or stopped.");
            return guard;
        }
        catch { guard.Dispose(); throw; }
    }
    public void Dispose()
    {
        if (released) return;
        release();
        released = true;
    }
}
