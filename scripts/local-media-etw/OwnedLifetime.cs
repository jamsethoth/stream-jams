namespace LocalMediaEtw;

internal sealed class OwnedLifetime(Action stop)
{
    private readonly object gate = new();
    private bool created, stopped;
    public void MarkCreated() { lock (gate) { if (!stopped) created = true; } }
    public void StopOnce()
    {
        lock (gate)
        {
            if (!created || stopped) return;
            stop();
            stopped = true;
        }
    }
}
