/** Where Zoro's voice level comes from in the playground: a made-up voice. */

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
