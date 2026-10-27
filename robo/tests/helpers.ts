/**
 * A canvas stand-in for tests: every drawing call is accepted and recorded,
 * gradients take colour stops, and `document.createElement("canvas")` makes
 * more of the same. Enough to run the whole engine without a browser.
 */
export interface FakeCtx {
  calls: number;
  [key: string]: unknown;
}

export function fakeContext(): CanvasRenderingContext2D & FakeCtx {
  const state: Record<string, unknown> = { calls: 0 };
  const gradient = () => ({ addColorStop: () => undefined });
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === "createLinearGradient" || prop === "createRadialGradient" || prop === "createConicGradient") {
        return () => {
          state.calls = (state.calls as number) + 1;
          return gradient();
        };
      }
      if (prop === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (prop === "measureText") return () => ({ width: 8 });
      if (prop === "getImageData") return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (prop === "createPattern") return () => ({ setTransform: () => undefined });
      if (prop === "canvas") return { width: 100, height: 100 };
      return (..._args: unknown[]) => {
        state.calls = (state.calls as number) + 1;
        return undefined;
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  };
  return new Proxy(state, handler) as unknown as CanvasRenderingContext2D & FakeCtx;
}

/** Makes `document.createElement("canvas")` return a canvas that hands out fake contexts. */
export function installFakeDocument() {
  const g = globalThis as Record<string, unknown>;
  // A Path2D that records nothing and accepts every path method.
  g.Path2D = class {
    constructor() {
      return new Proxy(this, { get: (t, p: string) => (p in t ? (t as never)[p] : () => undefined) });
    }
  };
  // A DOMMatrix whose transforms return itself.
  g.DOMMatrix = class {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    constructor() {
      return new Proxy(this, { get: (t, p: string) => (p in t ? (t as never)[p] : () => t) });
    }
  };
  g.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => fakeContext(), style: {} }),
  };
}
