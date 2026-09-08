globalThis.shutdownAudioProbe = {
  async outputs() {
    return (await globalThis.navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "audiooutput").map(device => ({ deviceId: device.deviceId, label: device.label }));
  },
  async play({ source, ids }) {
    if (!ids.length || ids.some(id => !id || ["default", "communications"].includes(id))) throw new Error("Explicit sink IDs required");
    const players = ids.map(() => new globalThis.Audio(source));
    try {
      await Promise.all(players.map(async (player, index) => {
        player.volume = 0; // A second safeguard in addition to zero-valued PCM.
        await player.setSinkId(ids[index]);
        if (player.sinkId !== ids[index]) throw new Error("Sink selection did not match");
        let timer;
        const ended = new Promise((resolve, reject) => {
          player.onended = resolve;
          player.onerror = () => reject(new Error("Silent media failed"));
          timer = globalThis.setTimeout(() => reject(new Error("Silent media timed out")), 5000);
        });
        void ended.catch(() => {});
        try { await player.play(); await ended; }
        finally { globalThis.clearTimeout(timer); }
      }));
      return players.map(player => ({ sinkId: player.sinkId, volume: player.volume, ended: player.ended }));
    } finally {
      for (const player of players) { player.pause(); player.removeAttribute("src"); player.load(); }
    }
  }
};
