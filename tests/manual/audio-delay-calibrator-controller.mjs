export function createAudioDelayCalibrator({
  schedule,
  cancelScheduled,
  createPlayer,
  onActiveCountChange = () => {}
}) {
  const activePlayers = new Set();
  const pendingStarts = new Set();

  function notifyActiveCount() {
    onActiveCountChange(activePlayers.size);
  }

  function start(channel, volume) {
    let player;
    const onEnded = () => {
      if (player !== undefined && activePlayers.delete(player)) notifyActiveCount();
    };
    player = createPlayer({ channel, volume, onEnded });
    activePlayers.add(player);
    notifyActiveCount();
    player.start();
  }

  function startAfter(channel, volume, delayMs) {
    const normalizedDelay = Math.min(500, Math.max(0, Math.round(Number(delayMs) || 0)));
    if (normalizedDelay === 0) {
      start(channel, volume);
      return;
    }
    let scheduledStart;
    scheduledStart = schedule(() => {
      pendingStarts.delete(scheduledStart);
      start(channel, volume);
    }, normalizedDelay);
    pendingStarts.add(scheduledStart);
  }

  return {
    get activeCount() { return activePlayers.size; },
    playPair({ delayMs, referenceVolume, comparisonVolume }) {
      start("reference", referenceVolume);
      startAfter("comparison", comparisonVolume, delayMs);
    },
    playReference(volume) {
      start("reference", volume);
    },
    playDelayed({ delayMs, volume }) {
      startAfter("comparison", volume, delayMs);
    },
    stopAll() {
      for (const scheduledStart of pendingStarts) cancelScheduled(scheduledStart);
      pendingStarts.clear();
      for (const player of activePlayers) player.stop();
      if (activePlayers.size > 0) {
        activePlayers.clear();
        notifyActiveCount();
      }
    }
  };
}
