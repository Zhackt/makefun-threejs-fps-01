// audio.js — every sound is procedural WebAudio: no audio files, no network.
// One shared noise buffer and one master gain; mute flips the gain to zero.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return !!ctx;
  }

  function noise(dur, filterFreq, gainValue, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, type, gainValue, slideTo = 0, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted() { return muted; },
    shot(id) {
      if (id === 'sr2') { noise(0.32, 900, 0.9); tone(140, 0.22, 'sawtooth', 0.35, 55); }
      else if (id === 'ss1') { noise(0.14, 1600, 0.7); tone(190, 0.09, 'square', 0.22, 90); }
      else { noise(0.11, 2000, 0.55); tone(240, 0.07, 'square', 0.18, 110); }
    },
    enemyShot() { noise(0.12, 1200, 0.28); },
    dry() { tone(1200, 0.04, 'square', 0.12); },
    reload() {
      tone(900, 0.05, 'square', 0.14);
      tone(650, 0.05, 'square', 0.14, 0, 0.16);
      tone(1100, 0.06, 'square', 0.16, 0, 0.38);
    },
    hit(kill) {
      tone(kill ? 1400 : 1050, 0.07, 'sine', 0.25);
      if (kill) tone(1750, 0.1, 'sine', 0.22, 0, 0.07);
    },
    hurt() { tone(180, 0.14, 'sawtooth', 0.3, 90); },
    step() { noise(0.05, 420, 0.10); },
    plantBeep() { tone(880, 0.09, 'sine', 0.3); },
    plantDone() { tone(660, 0.12, 'sine', 0.3); tone(990, 0.18, 'sine', 0.3, 0, 0.12); },
    defuseBeep() { tone(520, 0.09, 'sine', 0.25); },
    explosion() {
      noise(1.4, 320, 1.0);
      tone(70, 1.2, 'sine', 0.9, 28);
      noise(0.5, 2400, 0.4, 0.02);
    },
    throwSmoke() { noise(0.18, 700, 0.3); },
    roundWin() { tone(523, 0.14, 'sine', 0.28); tone(659, 0.14, 'sine', 0.28, 0, 0.14); tone(784, 0.24, 'sine', 0.3, 0, 0.28); },
    roundLose() { tone(392, 0.16, 'sine', 0.25); tone(330, 0.16, 'sine', 0.25, 0, 0.16); tone(262, 0.3, 'sine', 0.25, 0, 0.32); },
    buy() { tone(1180, 0.06, 'sine', 0.2); tone(1560, 0.08, 'sine', 0.18, 0, 0.06); },
  };
}
