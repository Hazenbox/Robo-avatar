/** Where Robo's voice level comes from in the playground: a made-up voice, or the microphone. */

/** Syllables every 70 to 180 ms with a breath between phrases: a stand-in for a voice. Returns a function of time in seconds. */
export function createSynth() {
  let target = 0;
  let level = 0;
  let next = 0;
  let pauseUntil = 0;
  let phraseEnd = 0;
  return (n: number) => {
    if (n > next) {
      if (n > phraseEnd) {
        pauseUntil = n + 0.35 + Math.random() * 0.5;
        phraseEnd = pauseUntil + 1.2 + Math.random() * 2.2;
      }
      target = n < pauseUntil ? 0 : Math.random() < 0.18 ? 0.05 : 0.25 + Math.random() * 0.75;
      next = n + 0.07 + Math.random() * 0.11;
    }
    level += (target - level) * 0.35;
    return level;
  };
}

export interface Mic {
  /** 0 to 1, the loudness right now. */
  level: () => number;
  stop: () => void;
}

/** Opens the microphone (the browser asks first). Nothing is recorded or sent anywhere: only the loudness is read. */
export async function openMic(): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
  return {
    level: () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      return Math.min(1, Math.sqrt(sum / buf.length) * 9);
    },
    stop: () => {
      for (const t of stream.getTracks()) t.stop();
      void ctx.close().catch(() => undefined);
    },
  };
}
