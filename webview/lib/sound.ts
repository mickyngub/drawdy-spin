let audio: AudioContext | null = null;

/** Must run inside a click, which is what lets the browser start audio. */
export function unlockAudio(): void {
    try {
        audio ??= new AudioContext();
        if (audio.state === "suspended") void audio.resume();
    } catch {
        audio = null;
    }
}

function blip(at: number, frequency: number, peak: number, length: number) {
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "triangle";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + length + 0.02);
}

/** Plays ticks at the given ms offsets of a spin that is `elapsed` ms in, then a soft two-note chime when it lands. */
export function playSpin(ticks: number[], landAt: number, elapsed: number) {
    if (!audio) return;
    const now = audio.currentTime;
    for (const t of ticks) {
        if (t < elapsed) continue;
        blip(now + (t - elapsed) / 1000, 1900, 0.12, 0.035);
    }
    if (landAt >= elapsed) {
        const at = now + (landAt - elapsed) / 1000;
        blip(at, 660, 0.16, 0.25);
        blip(at + 0.11, 990, 0.14, 0.4);
    }
}
