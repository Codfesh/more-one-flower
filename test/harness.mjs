/* 测试骨架：桩化 DOM / Canvas / WebAudio，在 Node 里驱动 game.js 的真实帧循环。
   被 smoke.mjs（冒烟）与 balance.mjs（平衡测量）共用。                                */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));

export const HIVE = { x: 0, y: 0 };   // 由 loadGame() 从 game.js 读入，避免和常量表脱节

export function loadGame() {
  const code = readFileSync(path.join(here, '..', 'game.js'), 'utf8');

  /* ---------- 桩：Canvas 2D ---------- */
  const ctxProps = Object.create(null);
  const gradient = () => ({ addColorStop() {} });
  const noopCall = () => ({ addColorStop() {}, width: 0, data: [] });
  const ctx = new Proxy(
    {
      canvas: { width: 1920, height: 1080 },
      measureText: () => ({ width: 10 }),
      createLinearGradient: gradient,
      createRadialGradient: gradient,
    },
    {
      get(t, k) {
        if (k in ctxProps) return ctxProps[k];
        if (k in t) return t[k];
        if (k === 'then' || k === 'toJSON') return undefined;
        return noopCall;
      },
      set(t, k, v) { ctxProps[k] = v; return true; },
    },
  );

  const canvasListeners = Object.create(null);
  const canvasEl = {
    width: 0, height: 0, style: {},
    getContext: () => ctx,
    addEventListener: (t, f) => { canvasListeners[t] = f; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
  };

  /* ---------- 桩：WebAudio ---------- */
  class FakeParam {
    constructor() { this.value = 0; }
    setValueAtTime() { return this; }
    exponentialRampToValueAtTime() { return this; }
    linearRampToValueAtTime() { return this; }
  }
  class FakeNode {
    constructor() {
      this.gain = new FakeParam(); this.frequency = new FakeParam();
      this.Q = new FakeParam(); this.type = 'sine'; this.buffer = null;
      this.playbackRate = new FakeParam(); this.detune = new FakeParam();
      this.loop = false;
    }
    connect() { return this; } disconnect() { return this; } start() {} stop() {}
  }
  class FakeAudioContext {
    constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = new FakeNode(); }
    createGain() { return new FakeNode(); }
    createOscillator() { return new FakeNode(); }
    createBiquadFilter() { return new FakeNode(); }
    createBufferSource() { return new FakeNode(); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    resume() { this.state = 'running'; }
  }

  /* ---------- 桩：window / document / rAF ---------- */
  const winListeners = Object.create(null);
  const clock = { t: 0 };
  const queue = [];

  const sandbox = {
    console,
    document: {
      readyState: 'complete',
      getElementById: () => canvasEl,
      addEventListener() {},
    },
    performance: { now: () => clock.t },
    innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1,
    AudioContext: FakeAudioContext,
    addEventListener: (t, f) => { winListeners[t] = f; },
    requestAnimationFrame: (cb) => { queue.push(cb); return queue.length; },
    cancelAnimationFrame() {},
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'game.js' });

  const BEE = sandbox.__BEE__;
  assert.ok(BEE, '调试接口 __BEE__ 未挂载');

  // 从游戏里读取世界中心，测试脚本不再硬编码坐标
  const h = BEE.api.hive();
  HIVE.x = h.x; HIVE.y = h.y;

  /* ---------- 驱动工具 ---------- */
  function step(ms = 16.6667, n = 1) {
    for (let i = 0; i < n; i++) {
      clock.t += ms;
      const cb = queue.shift();
      assert.ok(cb, 'rAF 队列为空，帧循环中断');
      cb(clock.t);
    }
  }
  const key = (code) => { winListeners.keydown({ code, preventDefault() {} }); winListeners.keyup({ code }); };
  const keyDown = (code) => winListeners.keydown({ code, preventDefault() {} });
  const keyUp = (code) => winListeners.keyup({ code });
  function movePointerTo(worldX, worldY) {
    const cam = BEE.api.camera();
    winListeners.pointermove({
      clientX: worldX - cam.x + 960,
      clientY: worldY - cam.y + 540,
      pointerType: 'mouse',
    });
  }

  return { sandbox, BEE, api: BEE.api, step, key, keyDown, keyUp, movePointerTo, HIVE, canvasEl, clock };
}
