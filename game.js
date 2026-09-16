/* =============================================================================
   再采一朵 · Demo
   反应 / 风险决策 / 休闲  —  纯 Web（Canvas 2D，无依赖，双击 index.html 即玩）
   核心循环：出巢 → 采蜜 → 负重减速 → 黄蜂追击 → 回巢卸蜜 → 升级 → 再出巢
   核心决策：再采一朵，还是现在回巢？
   ============================================================================= */
(function () {
'use strict';

/* ===================== 1. 常量与数值表 ===================== */

const VIEW_W = 1920, VIEW_H = 1080;         // 逻辑分辨率（16:9）
const WORLD_W = 2300, WORLD_H = 1650;       // 世界尺寸（相机跟随蜜蜂）
const HIVE = { x: WORLD_W / 2, y: WORLD_H / 2, r: 64 };

const SAFE_R = 80;                          // 蜂巢安全区：黄蜂不追
const DEFENSE_R0 = 150, DEFENSE_R1 = 250;   // 防御圈（升级后扩大）
const BEE_R = 14;
const WASP_R = 16;
const BUSH_R = 92;
const BUSH_COUNT = 4;

const SPEED_EMPTY = 300, SPEED_FULL = 150;  // 空载 / 满载速度
const DASH_SPEED = 400, DASH_TIME = 0.5, DASH_COST = 30, DASH_MAX = 3;
const CAP_BASE = 100, CAP_STEP = 25;
const COLLECT_TIME = 0.5;                   // 采蜜耗时（期间不能移动）
const FULL_RATIO = 0.8;                     // 满载阈值（≥80%）
const DROP_RATIO = 0.5, DROP_TTL = 5;       // 舍蜜逃生：丢 50%，蜜滴存在 5 秒

const UNLOAD_PER = 20;                      // 每 20 蜜 = 10 分 + 1 经验
const UNLOAD_RATE = 320;                    // 卸蜜速率（蜜/秒）
const SCORE_PER_UNLOAD = 10;
const OVERLOAD_MULT = 3;                    // 过载蜜囊：超出容量的蜜按 3 倍价值结算

/* 升级曲线：策划案的"每 100 经验升 1 级"实测是 2000 蜜/级 ——
   一局 3~5 分钟根本看不到一次升级，整个升级系统等于不存在。
   改为递增曲线：10 / 15 / 20 / 25 …，并把"安全回巢"计入经验。 */
const EXP_TRIP = 2;                         // 每完成一趟回巢
function expNeed(level) { return 25 + (level - 1) * 10; }

const FLOWER_TTL = 15, FLOWER_RESPAWN = 5;
const FLOWER_MAX = 12, FLOWER_MIN = 5;
const GOLD_PROB = 0.05, POISON_PROB = 0.05, GOLD_MAX = 2, POISON_MAX = 2;
const RING_RANGE = { inner: [100, 250], mid: [250, 450], outer: [450, 700] };
const RING_WEIGHT = { inner: 40, mid: 35, outer: 20 };
const FLOWER_R = { inner: 20, mid: 24, outer: 28, gold: 30, poison: 26 };
const FLOWER_COLOR = {
  inner: '#f4f7ff', mid: '#ffd447', outer: '#ff6b5e',
  gold: '#ffe066', poison: '#7b3fa0',
};
const HONEY = { inner: 20, mid: 30, outer: 50, gold: 60 };

const RAIN_PERIOD = 60, RAIN_TIME = 10, RAIN_MUL = 1.5;   // 花蜜雨

/* 冬季模式：给一局一个明确目标与终点（详见 README 第五轮迭代）
   —— 每个冬天要囤够配额，时间到没囤够 = 蜂巢饿死（失败）；囤够了可以随时收工，
   剩余时间换成奖励分（早收工少冒险 vs 继续贪多赚分）。 */
const WINTER_TIME = 120;              // 每个冬天的时限（秒）
const WINTER_QUOTA0 = 500;            // 首冬配额（实测机器人约 11 蜜/秒 → 约 45 秒清）
const WINTER_QUOTA_STEP = 110;        // 每冬配额递增
const WINTER_RAMP = 4;                // 每个冬天给难度爬坡的"等效回巢次数"起点
const WINTER_MET_BONUS = 500;         // 囤够配额的一次性奖励
const WINTER_FINISH_PER_SEC = 3;      // 提前完成：每剩余 1 秒的奖励分
const WINTER_END_HOLD = 2.4;          // 过冬小结自动停留时长（秒），点击 / 按键可跳过
function winterQuota(n) { return WINTER_QUOTA0 + (n - 1) * WINTER_QUOTA_STEP; }

/* 主动技能：蜜香诱饵 */
const BAIT_CD = 12, BAIT_R = 400, BAIT_TIME = 4.5;

/* 金花经济：策划案里金花只是"蜜量×3"，但蜜囊容量才是瓶颈 ——
   装满后多采的蜜全部溢出，于是"跑很远拿金花"永远不如"就近摘几朵小花"。
   改为：金花额外给一笔**不占负重**的金蜜，回巢按 3 倍价值结算，
   并且被抓会全部丢失（跑远路的风险也就真实了）。 */
const GOLD_HONEY = 40;          // 每次金花获得的"金蜜"，独立于蜜囊
const GOLD_CAP = 120;
const GOLD_OVERFLOW = 0.75;     // 蜜囊装不下的部分按 75% 折成金蜜（金花永远不白跑）
const GOLD_PER = 20;            // 每 20 金蜜
const GOLD_SCORE = 30;          // = 30 分（普通蜜的 3 倍）
const GOLD_EXP = 3;             // + 3 经验

const WASP_CFG = { alertR: 200, chaseR: 160, loseR: 300, hiveAvoid: 170, cooldown: 3, catchR: 4 };

/* 威胁分布：把危险推到外围，让"出门/回家"有跑道，"去外环"才是真冒险。
   —— 巡逻锚点最小半径、守花的最小离巢距离、以及"跟随玩家"的生效距离。 */
const PATROL_MIN_R = 420;       // 巡逻锚点不进入蜂巢 420px 内
const GUARD_MIN_R = 300;        // 只守中/外环与金花（内环低收益花留作喘息）
const FOLLOW_MIN_R = 480;       // 玩家离巢超过这个距离，黄蜂才会往他那边压

/* 威胁预警（状态驱动，取代"离得远也一直响"的距离驱动） */
const WARN_PATROL = 250;        // 巡逻黄蜂进入这个距离才给"邻近"提示
const CHASE_CAP = 2;            // 同时追击上限：其余黄蜂维持警觉，避免围殴
const GREED_R = 260;            // 被追击时在该距离内采蜜 → 胆大包天奖励
const SPAWN_SAFE = 600;         // 新黄蜂不在玩家这个距离内刷新
const SPAWN_TELEGRAPH = 2.5;    // 入场预告时长（秒），期间不行动、不抓人
const GOLD_LURE = 700;          // 金花金光吸引黄蜂的半径（高收益=高风险）

/* 连采里程碑（策划案有 3/5，向后补 8/12 强化"越贪越爽"） */
const COMBO_STEPS = [
  { n: 3, score: 20, label: '连采3' },
  { n: 5, score: 50, label: '连采5' },
  { n: 8, score: 100, label: '连采8' },
  { n: 12, score: 200, label: '连采12' },
];
const COMBO_TOP = 12;
const WARN_FAR = 400, WARN_MID = 250, WARN_NEAR = 120;

/* 难度阶段表：按回巢次数推进 */
const PHASES = [
  { name: '教学', min: 0,  wasps: 1, speed: 150, rings: ['inner'],                 poison: false, goldMul: 1, outerBias: 1, tip: '熟悉飞行与采蜜，黄蜂只巡逻' },
  { name: '初压', min: 3,  wasps: 2, speed: 220, rings: ['inner', 'mid'],          poison: true,  goldMul: 1, outerBias: 1, tip: '毒花出现，黄蜂开始警觉' },
  { name: '成长', min: 6,  wasps: 3, speed: 230, rings: ['inner', 'mid', 'outer'], poison: true,  goldMul: 1, outerBias: 1, tip: '外环高蜜出现，留意花蜜雨' },
  { name: '贪心', min: 9,  wasps: 4, speed: 240, rings: ['mid', 'outer'],          poison: true,  goldMul: 2, outerBias: 2, tip: '金花概率翻倍，赌一把？' },
  { name: '高压', min: 12, wasps: 5, speed: 250, rings: ['mid', 'outer'],          poison: true,  goldMul: 2, outerBias: 2, tip: '黄蜂编队，防御圈是你的生命线' },
  { name: '极限', min: 15, wasps: 6, speed: 260, rings: ['inner', 'mid', 'outer'], poison: true,  goldMul: 2, outerBias: 2, tip: '全图高压，只求活着回巢' },
];

/* 蜂巢升级三选一 */
const UPGRADES = [
  { id: 'cap',      name: '蜜囊 +25',   desc: '蜜囊容量 +25',                     max: 5, tag: '成长' },
  { id: 'wing',     name: '蜂翼 +10%',  desc: '空载与满载速度都 +10%',            max: 5, tag: '成长' },
  { id: 'defense',  name: '蜂巢防御',   desc: '防御圈 150→250，减速 50%→65%',     max: 1, tag: '防御' },
  { id: 'playdead', name: '装死',       desc: '被抓时免疫一次（每局 1 次）',       max: 1, tag: '保命', minLevel: 2 },
  { id: 'scent',    name: '蜜香',       desc: '花朵刷新更快（冷却 -30%）',         max: 2, tag: '经济' },
  { id: 'sting',    name: '毒刺',       desc: '每趟 1 次：被抓时反杀黄蜂且不受伤害', max: 1, tag: '反击', minLevel: 3 },
  { id: 'fastleg',  name: '快腿',       desc: '朝蜂巢方向速度 +20%',              max: 2, tag: '成长' },
  { id: 'jelly',    name: '蜂王浆',     desc: '生命 +1（上限 5）',                max: 2, tag: '保命' },
  { id: 'bait',     name: '蜜香诱饵',   desc: '按 E 丢诱饵：400px 内巡逻/警觉的黄蜂被吸引 4.5 秒（冷却 12s）', max: 1, tag: '主动', minLevel: 2 },
  { id: 'gale',     name: '逆风冲刺',   desc: '冲刺不再消耗蜜，且冲刺途中免疫抓取', max: 1, tag: '主动', minLevel: 2 },
  { id: 'overload', name: '过载蜜囊',   desc: '可超载 30%：超出的蜜回巢按 3 倍计分，但飞得更慢', max: 1, tag: '玩法', minLevel: 3 },
];

/* ===================== 2. 小工具 ===================== */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const dirTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

/* ===================== 3. 音效（WebAudio 合成，无外部资源） ===================== */

const Sfx = (function () {
  let ac = null, master = null;
  let alarm = null, alarmGain = null, alarmFilter = null;
  let smAlarm = 0, alarmPhase = 0;
  let ready = false, muted = false, noiseBuf = null;

  function init() {
    if (ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ready = true;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    master = ac.createGain();
    master.gain.value = 0.45;
    master.connect(ac.destination);

    // 威胁层：只有被警觉/追击时才出现，安全与蜂巢内完全静音
    alarm = ac.createOscillator();
    alarm.type = 'triangle';
    alarm.frequency.value = 150;
    alarmFilter = ac.createBiquadFilter();
    alarmFilter.type = 'lowpass';
    alarmFilter.frequency.value = 900;
    alarmGain = ac.createGain();
    alarmGain.gain.value = 0;
    alarm.connect(alarmFilter); alarmFilter.connect(alarmGain); alarmGain.connect(master);
    alarm.start();

    // 噪声缓冲：用于被抓 / 死亡的低频闷响
    const len = Math.floor(ac.sampleRate * 0.5);
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  function resume() { if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) {} } }
  function on() { return ready && ac && !muted; }

  function tone(freq, dur, type, gain, slideTo, delay) {
    if (!on()) return;
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain == null ? 0.2 : gain), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, gain, cutoff) {
    if (!on() || !noiseBuf) return;
    const t0 = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 400;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain == null ? 0.5 : gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur);
  }

  /** 每帧更新威胁音：只有被警觉/追击时才出声，安全与蜂巢内完全静音。
      负载不再有任何持续音效（试玩反馈：持续的低频嗡鸣听感像"被追赶"，不舒服）。 */
  function threatTick(threat, hunting, inHive, dt) {
    if (!ready || !alarmGain) return;
    dt = dt || 1 / 60;
    const k = 1 - Math.pow(0.015, dt);          // 约 0.25 秒收敛，避免边界爆音
    const alarmTarget = (!hunting || inHive || muted) ? 0 : clamp(threat, 0, 1);
    smAlarm = lerp(smAlarm, alarmTarget, k);

    alarmPhase += dt * (4.5 + smAlarm * 7);
    const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(alarmPhase));
    alarmGain.gain.value = muted ? 0 : smAlarm * 0.055 * pulse;
    alarm.frequency.value = 132 + smAlarm * 235;
    alarmFilter.frequency.value = 700 + smAlarm * 900;
  }

  return {
    init: init, resume: resume, threatTick: threatTick,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.45;
      if (muted) { smAlarm = 0; if (alarmGain) alarmGain.gain.value = 0; }
      return muted;
    },
    isMuted() { return muted; },
    /** 连采音阶：第 n 朵音高递增（五声音阶），连采越高越亮 */
    collect(n) {
      const ladder = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
      const i = clamp((n || 1) - 1, 0, ladder.length - 1);
      const f = 620 * Math.pow(2, ladder[i] / 12);
      tone(f, 0.09, 'sine', 0.2);
      tone(f * 1.5, 0.07, 'sine', 0.12, null, 0.05);
      if (n >= 5) tone(f * 2, 0.1, 'triangle', 0.08, null, 0.1);
    },
    gold()      { [980, 1320, 1760, 2340].forEach((f, i) => tone(f, 0.11, 'triangle', 0.2, null, i * 0.06)); },
    /** 胆大包天：被追击时采蜜 */
    greed()     { [880, 1180, 1560].forEach((f, i) => tone(f, 0.1, 'square', 0.11, null, i * 0.05)); noise(0.12, 0.12, 2600); },
    unload()    { tone(523, 0.11, 'sine', 0.2); tone(659, 0.11, 'sine', 0.18, null, 0.08); tone(784, 0.16, 'sine', 0.16, null, 0.16); },
    safe()      { tone(392, 0.22, 'sine', 0.16); tone(523, 0.28, 'sine', 0.13, null, 0.1); },
    full()      { tone(300, 0.18, 'triangle', 0.13, 235); tone(210, 0.24, 'triangle', 0.1, null, 0.1); },
    alert()     { tone(620, 0.07, 'square', 0.075); tone(830, 0.09, 'square', 0.075, null, 0.08); },
    chase()     { tone(170, 0.45, 'sawtooth', 0.085, 300); },
    heartbeat() { tone(58, 0.1, 'sine', 0.26, 44); },
    drop()      { tone(400, 0.16, 'sine', 0.16, 160); },
    dash()      { noise(0.18, 0.18, 1600); tone(300, 0.18, 'sawtooth', 0.08, 700); },
    levelup()   { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.16, 'triangle', 0.18, null, i * 0.085)); },
    rain()      { [880, 1170, 1480].forEach((f, i) => tone(f, 0.14, 'sine', 0.14, null, i * 0.12)); },
    catch_()    { noise(0.4, 0.5, 320); tone(110, 0.4, 'sawtooth', 0.2, 55); },
    death()     { noise(0.7, 0.5, 240); tone(160, 0.9, 'sawtooth', 0.2, 45); },
    click()     { tone(700, 0.05, 'square', 0.1); },
  };
})();

/* ===================== 4. 输入 ===================== */

const Input = {
  keys: Object.create(null),
  pressedSet: Object.create(null),
  pointer: { x: HIVE.x, y: HIVE.y, sx: 0, sy: 0, active: false, touch: false },
  clicks: [],
  _clear() {
    this.pressedSet = Object.create(null);
    this.clicks.length = 0;
  },
  down(code) { return !!this.keys[code]; },
  pressed(code) { return !!this.pressedSet[code]; },
  setKey(code, v) {
    if (v && !this.keys[code]) this.pressedSet[code] = true;
    this.keys[code] = v;
  },
};

/* ===================== 5. 画布 / 相机 ===================== */

let canvas = null, ctx = null, viewScale = 1;

function setupCanvas() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);

  function toLogical(cx, cy) {
    const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: VIEW_W, height: VIEW_H };
    const w = r.width || VIEW_W, h = r.height || VIEW_H;
    return { x: (cx - r.left) / w * VIEW_W, y: (cy - r.top) / h * VIEW_H };
  }
  function pointMove(cx, cy) {
    const p = toLogical(cx, cy);
    Input.pointer.sx = p.x; Input.pointer.sy = p.y;
    Input.pointer.active = true;
    Input.pointer.x = p.x + cam.x - VIEW_W / 2;
    Input.pointer.y = p.y + cam.y - VIEW_H / 2;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') Input.pointer.touch = true;
    Sfx.init(); Sfx.resume();
    const p = toLogical(e.clientX, e.clientY);
    pointerDownAt(p.x, p.y);
    pointMove(e.clientX, e.clientY);
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') Input.pointer.touch = true;
    pointMove(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', () => { /* 保持跟随，不做抬起停止 */ });
  window.addEventListener('keydown', (e) => {
    Sfx.init(); Sfx.resume();
    Input.setKey(e.code, true);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) {
      if (e.preventDefault) e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => Input.setKey(e.code, false));
  window.addEventListener('blur', () => { Input.keys = Object.create(null); });
}

function resize() {
  if (!canvas) return;
  const iw = window.innerWidth || VIEW_W, ih = window.innerHeight || VIEW_H;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const s = Math.min(iw / VIEW_W, ih / VIEW_H);
  viewScale = s * dpr;
  canvas.style.width = Math.floor(VIEW_W * s) + 'px';
  canvas.style.height = Math.floor(VIEW_H * s) + 'px';
  canvas.width = Math.max(2, Math.floor(VIEW_W * viewScale));
  canvas.height = Math.max(2, Math.floor(VIEW_H * viewScale));
  if (ctx && ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = true;
}

const cam = { x: HIVE.x, y: HIVE.y, shake: 0, shakeA: 0, sx: 0, sy: 0 };

function camUpdate(dt) {
  const tx = clamp(bee.x, VIEW_W / 2, WORLD_W - VIEW_W / 2);
  const ty = clamp(bee.y, VIEW_H / 2, WORLD_H - VIEW_H / 2);
  const k = 1 - Math.pow(0.0016, dt);
  cam.x = lerp(cam.x, tx, k);
  cam.y = lerp(cam.y, ty, k);
  cam.shake = Math.max(0, cam.shake - dt * 2.6);
  if (cam.shake > 0) {
    cam.shakeA += dt * 42;
    const m = cam.shake * 16;
    cam.sx = Math.cos(cam.shakeA * 1.7) * m;
    cam.sy = Math.sin(cam.shakeA * 2.3) * m;
  } else { cam.sx = 0; cam.sy = 0; }
}

/* ===================== 6. 游戏状态 ===================== */

let G = null, bee = null;
let flowers = [], wasps = [], bushes = [], particles = [], drops = [], floaters = [], pending = [];
let bgDots = [];

/* 最佳记录：localStorage（file:// 下可能被禁用，全部包在 try 里降级） */
const Best = {
  data: { endless: 0, winter: 0, winters: 0 },
  key: 'bee-demo-best-v1',
  load: function () {
    try {
      if (typeof localStorage === 'undefined') return;
      const s = localStorage.getItem(this.key);
      if (s) {
        const d = JSON.parse(s);
        if (d && typeof d === 'object') this.data = { endless: d.endless | 0, winter: d.winter | 0, winters: d.winters | 0 };
      }
    } catch (e) {}
  },
  save: function () {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch (e) {}
  },
  /** 返回本次是否刷新了记录 */
  submit: function (gameType, score, winters) {
    let rec = false;
    if (gameType === 'winter') {
      if (winters > this.data.winters) { this.data.winters = winters; rec = true; }
      if (score > this.data.winter) { this.data.winter = Math.round(score); rec = true; }
    } else if (score > this.data.endless) {
      this.data.endless = Math.round(score);
      rec = true;
    }
    if (rec) this.save();
    return rec;
  },
};

function makeBee() {
  return {
    x: HIVE.x, y: HIVE.y - 40, vx: 0, vy: 0, ang: -Math.PI / 2,
    honey: 0, gold: 0, wingPhase: 0, collect: null, buzz: 0,
  };
}

function newGame() {
  G = {
    mode: 'title',                    // title | play | levelup | paused | dying | over
    t: 0, worldT: 0, timeScale: 1, deathT: 0, frames: 0,
    score: 0, exp: 0, level: 1,
    returns: 0, trips: 0, ratioSum: 0, honeyTotal: 0, flowerPicks: 0,
    combo: 0, maxCombo: 0,
    lives: 3, maxLives: 5, invuln: 0,
    dashCharges: DASH_MAX, dashT: 0, dashCD: 0,
    returnStreak: 0, catchStreak: 0,
    unloadAcc: 0, arrive: 0, flowerTimer: 0, goldAcc: 0, goldTotal: 0,
    ddt: { speed: 0, chase: 0, waspExtra: 0, honeyMul: 1 },
    upg: Object.create(null),
    rainT: RAIN_PERIOD, rainLeft: 0, rainCount: 0,
    aliveT: 0, scoreTick: 30, phaseName: '',
    banner: '', bannerSub: '', bannerT: 0,
    choices: [], choiceRects: [], hover: -1,
    playDeadUsed: false, muted: false, hintT: 14, paused: false,
    stingReady: true, autopilot: false, showcase: false, showcaseT: 1.6,
    greedCount: 0, greedScore: 0, greedFlash: 0, comboFlash: 0,
    lastWarn: '',
    /* 模式与冬季 */
    gameType: 'endless',              // endless = 纯刷分；winter = 囤蜜过冬
    winter: 1, winterT: WINTER_TIME, store: 0, quota: winterQuota(1),
    quotaMet: false, wintersCleared: 0, winterStat: null, pendingBanner: null, winterEndT: 0,
    baitT: 0, decoy: null, titleCards: [],
    menuIndex: 0, menuHelp: false, menuRects: [],
  };
  bee = makeBee();
  cam.x = HIVE.x; cam.y = HIVE.y; cam.shake = 0;
  flowers = []; wasps = []; particles = []; drops = []; floaters = []; pending = [];
  bushes = [];
  bgDots = [];
  for (let i = 0; i < 260; i++) {
    bgDots.push({ x: rand(0, WORLD_W), y: rand(0, WORLD_H), r: rand(1.2, 4.2), a: rand(0.04, 0.16) });
  }
  for (let i = 0; i < randi(3, 5); i++) spawnBush();   // 花丛 3~5 个
  for (let i = 0; i < FLOWER_MIN; i++) spawnFlower();
  spawnWasp();
  G.phaseName = phase().name;
}

/** 难度爬坡用的等效回巢次数：冬季模式里每个冬天会重置回巢数，
    再用"冬天序号 × WINTER_RAMP"给出跨冬的长期抬升（无尽模式 winter 恒为 1，行为不变） */
function phaseReturns() { return G.returns + (G.winter - 1) * WINTER_RAMP; }

function phase() {
  let p = PHASES[0];
  const r = phaseReturns();
  for (let i = 0; i < PHASES.length; i++) if (r >= PHASES[i].min) p = PHASES[i];
  return p;
}
function up(id) { return G.upg[id] || 0; }
function beeCap() { return CAP_BASE + up('cap') * CAP_STEP; }
/** 蜜囊上限：过载蜜囊允许超出 30% */
function beeCapMax() { return beeCap() * (up('overload') ? 1.3 : 1); }
function wingMul() { return 1 + up('wing') * 0.10; }
function defenseR() { return up('defense') ? DEFENSE_R1 : DEFENSE_R0; }
function defenseSlow() { return up('defense') ? 0.35 : 0.5; }
function waspCount() { return Math.min(6, 1 + Math.floor(phaseReturns() / 3) + G.ddt.waspExtra); }
function waspSpeed() { return phase().speed + G.ddt.speed; }
function alertR() {
  const r = phaseReturns();
  if (r < 3) return 0;                             // 教学：只巡逻
  if (r < 6) return 180;                           // 初压：更早察觉
  return WASP_CFG.alertR;
}
function chaseR() {
  const r = phaseReturns();
  if (r < 3) return 0;
  if (r < 6) return 150;
  return Math.max(90, WASP_CFG.chaseR + G.ddt.chase);
}
function flowerTarget() { return Math.min(FLOWER_MAX, FLOWER_MIN + Math.floor(phaseReturns() / 3)); }
function respawnDelay() { return FLOWER_RESPAWN * (1 - 0.3 * up('scent')); }
function honeyMul() {
  return (G.rainLeft > 0 ? RAIN_MUL : 1) * G.ddt.honeyMul;
}
/** 当前速度：越贪越慢（核心张力）；过载时额外惩罚 */
function beeSpeedNow() {
  const cap = beeCap();
  const load = cap > 0 ? bee.honey / cap : 0;
  let s = lerp(SPEED_EMPTY, SPEED_FULL, Math.min(load, 1)) * wingMul();
  if (load > 1) s *= 1 - 0.20 * Math.min((load - 1) / 0.3, 1);     // 过载：最多再 -20%
  if (up('fastleg')) {
    // 快腿：当前飞行方向指向蜂巢（±60°）时加速
    const sp = Math.hypot(bee.vx, bee.vy);
    if (sp > 20) {
      const a = Math.atan2(bee.vy, bee.vx);
      const ah = Math.atan2(HIVE.y - bee.y, HIVE.x - bee.x);
      let d = Math.abs((((a - ah + Math.PI) % TAU) + TAU) % TAU - Math.PI);
      if (d < Math.PI / 3) s *= 1 + 0.20 * up('fastleg');
    }
  }
  return s;
}

/* ===================== 7. 生成器 ===================== */

function edgePos(margin) {
  margin = margin || 140;
  for (let i = 0; i < 24; i++) {
    const x = rand(margin, WORLD_W - margin), y = rand(margin, WORLD_H - margin);
    if (dist(x, y, HIVE.x, HIVE.y) < 160) continue;
    if (tooCloseToFlower(x, y, 60)) continue;
    return { x: x, y: y };
  }
  return { x: rand(margin, WORLD_W - margin), y: rand(margin, WORLD_H - margin) };
}
function tooCloseToFlower(x, y, min) {
  for (let i = 0; i < flowers.length; i++) {
    if (dist(x, y, flowers[i].x, flowers[i].y) < min) return true;
  }
  return false;
}
function pickRing() {
  const p = phase();
  const rings = p.rings;
  let total = 0;
  const w = rings.map((r) => {
    const v = RING_WEIGHT[r] * (r === 'outer' ? p.outerBias : 1);
    total += v; return v;
  });
  let r = Math.random() * total;
  for (let i = 0; i < rings.length; i++) { r -= w[i]; if (r <= 0) return rings[i]; }
  return rings[rings.length - 1];
}
function countType(t) { let n = 0; for (let i = 0; i < flowers.length; i++) if (flowers[i].type === t) n++; return n; }

function spawnFlower(forcedType) {
  const p = phase();
  let type = forcedType || null;
  if (!type) {
    const r = Math.random();
    const goldP = GOLD_PROB * p.goldMul;
    const goldOK = countType('gold') < GOLD_MAX;
    const poisonOK = p.poison && countType('poison') < POISON_MAX;
    if (goldOK && r < goldP) type = 'gold';
    else if (poisonOK && r < goldP + POISON_PROB) type = 'poison';
    else type = pickRing();
  }
  let x, y;
  if (type === 'gold' || type === 'poison') {
    const e = edgePos(150); x = e.x; y = e.y;
  } else {
    const rg = RING_RANGE[type];
    let placed = null;
    for (let i = 0; i < 18; i++) {
      const a = rand(0, TAU), rr = rand(rg[0], rg[1]);
      const px = HIVE.x + Math.cos(a) * rr, py = HIVE.y + Math.sin(a) * rr;
      if (px < 90 || px > WORLD_W - 90 || py < 90 || py > WORLD_H - 90) continue;
      if (tooCloseToFlower(px, py, 78)) continue;
      placed = { x: px, y: py }; break;
    }
    if (!placed) { const e = edgePos(150); placed = e; }
    x = placed.x; y = placed.y;
  }
  const base = HONEY[type === 'gold' ? 'gold' : type === 'poison' ? 'mid' : type];
  const f = {
    x: x, y: y, type: type, ring: (type === 'gold' || type === 'poison') ? 'any' : type,
    r: FLOWER_R[type], baseHoney: base, honey: Math.round(base * honeyMul()),
    ttl: FLOWER_TTL, age: 0, phase: rand(0, TAU), spawnFade: 0.35, dead: false,
  };
  flowers.push(f);
  if (type === 'gold') {
    G.banner = '金花出现！'; G.bannerSub = '蜜量 ×3 + 金蜜　但金光会招来黄蜂'; G.bannerT = 2.4;
    burst(f.x, f.y, '#ffe066', 26, 220);
    Sfx.gold();
    lureWasps(f);                                   // 金光是双刃剑
  }
  if (type === 'poison') { burst(f.x, f.y, '#8e44ad', 16, 130); }
  return f;
}

/** 金光吸引：附近巡逻中的黄蜂会被金花拉过去 —— 高收益必然伴随高风险 */
function lureWasps(gf) {
  for (let i = 0; i < wasps.length; i++) {
    const w = wasps[i];
    if (w.readyT > 0 || w.state === 'chase' || w.state === 'investigate') continue;
    if (dist(w.x, w.y, gf.x, gf.y) <= GOLD_LURE) { w.lureT = 5.5; w.lureSrc = 'gold'; }
  }
}
function removeFlower(f) {
  for (let i = 0; i < flowers.length; i++) if (flowers[i] === f) { flowers.splice(i, 1); break; }
  pending.push({ t: respawnDelay() });
}

function spawnBush() {
  const rg = [RING_RANGE.mid[0] * 0.7, RING_RANGE.mid[1]];
  for (let i = 0; i < 30; i++) {
    const a = rand(0, TAU), rr = rand(rg[0], rg[1]);
    const x = HIVE.x + Math.cos(a) * rr, y = HIVE.y + Math.sin(a) * rr;
    if (x < 130 || x > WORLD_W - 130 || y < 130 || y > WORLD_H - 130) continue;
    let ok = true;
    for (let j = 0; j < bushes.length; j++) if (dist(x, y, bushes[j].x, bushes[j].y) < BUSH_R * 2.4) { ok = false; break; }
    if (!ok) continue;
    bushes.push({ x: x, y: y, r: BUSH_R, phase: rand(0, TAU), blobs: makeBlobs() });
    return;
  }
  bushes.push({ x: rand(300, WORLD_W - 300), y: rand(300, WORLD_H - 300), r: BUSH_R, phase: rand(0, TAU), blobs: makeBlobs() });
}
function makeBlobs() {
  const b = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rand(-0.3, 0.3), rr = rand(0.28, 0.68);
    b.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr * 0.85, r: rand(0.34, 0.5) });
  }
  return b;
}

/** 丢失目标 → 转入"调查最后目击点"（冷却期内不会重新追击） */
function loseTarget(w, cool) {
  w.state = 'investigate';
  w.investX = bee.x;
  w.investY = bee.y;
  w.investT = Math.max(1.2, cool);
  w.cool = Math.max(w.cool, cool);
}

function spawnWasp(x, y) {
  let px = x, py = y;
  if (px == null) {
    // 公平性：不在玩家附近刷新，宁可多试几次
    let bestD = -1, bx = 0, by = 0;
    for (let i = 0; i < 60; i++) {
      const e = edgePos(120);
      const dd = dist(e.x, e.y, bee.x, bee.y);
      if (dd > bestD) { bestD = dd; bx = e.x; by = e.y; }
      if (dd > SPAWN_SAFE) { bx = e.x; by = e.y; bestD = dd; break; }
    }
    px = bx; py = by;
  }
  const w = {
    x: px, y: py, vx: 0, vy: 0, ang: 0, state: 'patrol', timer: 0,
    cool: 0, target: { x: px, y: py }, investX: px, investY: py, investT: 0, lureT: 0,
    warnT: 0, wingPhase: rand(0, TAU), spawned: 0, readyT: SPAWN_TELEGRAPH,
  };
  wasps.push(w);
  w.target = pickPatrolTarget(w);
  return w;
}

/* ===================== 8. 特效对象 ===================== */

function burst(x, y, color, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(spd * 0.25, spd);
    particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.35, 0.9), t: 0, color: color, r: rand(2, 5), kind: 'dot' });
  }
}
function petalRain(n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x: bee.x + rand(-VIEW_W / 2, VIEW_W / 2), y: bee.y - VIEW_H / 2 - rand(0, 200),
      vx: rand(-30, 30), vy: rand(70, 130), life: rand(1.4, 2.6), t: 0,
      color: pick(['#ffd447', '#ff9ad5', '#fff1a8']), r: rand(3, 7), kind: 'petal', rot: rand(0, TAU), spin: rand(-3, 3),
    });
  }
}
function floater(x, y, text, color, size) {
  floaters.push({ x: x, y: y, text: text, color: color || '#ffe9a8', t: 0, life: 1.0, size: size || 26 });
}

/* ===================== 9. 计分 / 经验 / 升级 ===================== */

function addScore(n, x, y, label) {
  G.score += n;
  if (x != null) floater(x, y, '+' + n + (label ? ' ' + label : ''), '#ffe066', label === '金花' ? 40 : 28);
}
function popup(text, x, y, color, size) { floater(x, y, text, color, size); }

function gainExp(n) {
  G.exp += n;
  let ups = 0;
  while (G.exp >= expNeed(G.level)) {
    G.exp -= expNeed(G.level);
    G.level++;
    ups++;
  }
  if (ups > 0 && G.mode === 'play') openLevelUp();
}

function openLevelUp() {
  const lv = G.level;
  const pool = UPGRADES.filter((u) => {
    if ((G.upg[u.id] || 0) >= u.max) return false;
    if (u.minLevel && lv < u.minLevel) return false;
    return true;
  });
  const chosen = [];
  const tmp = pool.slice();
  while (chosen.length < 3 && tmp.length) chosen.push(tmp.splice(Math.floor(Math.random() * tmp.length), 1)[0]);
  const filler = UPGRADES.filter((u) => chosen.indexOf(u) < 0 && (G.upg[u.id] || 0) < u.max);
  while (chosen.length < 3 && filler.length) chosen.push(filler.splice(Math.floor(Math.random() * filler.length), 1)[0]);
  if (!chosen.length) return;              // 所有强化都拿满了：静默升级，不要卡住玩家
  G.choices = chosen.slice(0, 3);
  G.mode = 'levelup';
  cam.shake = Math.max(cam.shake, 0.5);
  Sfx.levelup();
}

function applyUpgrade(u) {
  G.upg[u.id] = (G.upg[u.id] || 0) + 1;
  if (u.id === 'jelly') G.lives = Math.min(G.maxLives, G.lives + 1);
  G.mode = 'play';
  G.choices = [];
  popup('获得：' + u.name, bee.x, bee.y - 60, '#9be7ff', 34);
  burst(bee.x, bee.y, '#9be7ff', 30, 260);
  cam.shake = Math.max(cam.shake, 0.7);
  Sfx.unload();
  if (G.pendingBanner) {                 // 冬季切换横幅：等强化选完再显示
    G.banner = G.pendingBanner.banner;
    G.bannerSub = G.pendingBanner.sub;
    G.bannerT = G.pendingBanner.t;
    G.pendingBanner = null;
  }
  if (G.exp >= expNeed(G.level)) openLevelUp();          // 连续升级：接着弹下一次
}

/* ===================== 10. 事件：采蜜 / 卸蜜 / 被抓 / 舍蜜 ===================== */

function startCollect(f) {
  if (bee.collect) return;
  bee.collect = { f: f, t: 0 };
  bee.vx = 0; bee.vy = 0;
}

function finishCollect(f) {
  const cap = beeCapMax();
  const gain = Math.min(f.honey, Math.max(0, cap - bee.honey));
  const wasted = f.honey - gain;
  bee.honey += gain;
  G.flowerPicks++;
  G.combo++;
  if (G.combo > G.maxCombo) G.maxCombo = G.combo;
  if (G.combo > 1) G.comboFlash = 0.5;

  const cap0 = beeCap();
  if (cap0 > 0 && bee.honey / cap0 >= FULL_RATIO && bee.honey - gain < cap0 * FULL_RATIO) Sfx.full();
  popup('+' + gain + ' 蜜' + (wasted > 0 ? '（溢出 ' + wasted + '）' : ''), f.x, f.y - 30, f.type === 'gold' ? '#ffe066' : '#ffd447', f.type === 'gold' ? 34 : 26);
  burst(f.x, f.y, f.type === 'gold' ? '#ffe066' : '#ffd447', 18, 170);
  Sfx.collect(G.combo);                                   // 连采音阶：第 N 朵音高递增

  // 连采里程碑
  for (let i = 0; i < COMBO_STEPS.length; i++) {
    const step = COMBO_STEPS[i];
    if (G.combo === step.n) {
      addScore(step.score, bee.x, bee.y - 62, step.label);
      burst(bee.x, bee.y, '#ffe066', 22, 230);
      cam.shake = Math.max(cam.shake, 0.28);
      if (step.n >= 8) { G.banner = '连采 ×' + step.n + '！'; G.bannerSub = '+' + step.score + ' 分'; G.bannerT = 1.8; }
    }
  }

  // 贪心奖励：被追击时还敢采蜜（越近越赚）
  if (THREAT.chasing > 0 && THREAT.nearest < GREED_R) {
    const bonus = Math.round(10 + clamp(1 - THREAT.nearest / GREED_R, 0, 1) * 40);
    G.greedCount++;
    G.greedScore += bonus;
    G.greedFlash = 0.6;
    addScore(bonus, f.x, f.y - 78, '胆大包天');
    burst(f.x, f.y - 20, '#ff9f43', 20, 260);
    Sfx.greed();
  }

  // 金花：不占负重的金蜜 —— 而且蜜囊装不下的部分会转成金蜜，所以任何载重下都不亏
  if (f.type === 'gold') {
    let goldGain = GOLD_HONEY + Math.round(wasted * GOLD_OVERFLOW);   // 溢出部分折价转为金蜜
    goldGain = Math.min(goldGain, GOLD_CAP - bee.gold);
    if (goldGain > 0) {
      bee.gold += goldGain;
      G.goldTotal += goldGain;
      popup('+' + goldGain + ' 金蜜（不占负重）', f.x, f.y - 104, '#fff3b0', 28);
    }
    addScore(200, f.x, f.y - 50, '金花');
  }
  removeFlower(f);
  bee.collect = null;
}

function unloadTick(dt) {
  const inHive = dist(bee.x, bee.y, HIVE.x, HIVE.y) <= SAFE_R;

  /* --- 金蜜：独立于蜜囊，按 3 倍价值结算 --- */
  if (inHive && bee.gold > 0) {
    const gAmt = Math.min(bee.gold, UNLOAD_RATE * dt);
    bee.gold -= gAmt;
    G.goldAcc += gAmt;
    while (G.goldAcc >= GOLD_PER) {
      G.goldAcc -= GOLD_PER;
      addScore(GOLD_SCORE, bee.x + rand(-20, 20), bee.y - 46, '金蜜');
      gainExp(GOLD_EXP);
    }
    if (bee.gold <= 0.0001) { bee.gold = 0; G.goldAcc = 0; }
  } else if (!inHive) {
    G.goldAcc = 0;
  }

  if (bee.honey <= 0) { G.unloadAcc = 0; G.arrive = 0; return; }
  if (!inHive) { G.arrive = 0; return; }
  const cap = beeCap();
  if (!G.arrive) G.arrive = bee.honey;                 // 本趟进巢时的蜜量（评分基准）
  const ratio = cap > 0 ? G.arrive / cap : 0;
  const eff = ratio < FULL_RATIO ? 0.8 : 1;            // 未满 80% 回巢：卸蜜效率 -20%

  const amount = Math.min(bee.honey, UNLOAD_RATE * dt);
  bee.honey -= amount;
  G.honeyTotal += amount;
  // 冬季模式：卸下来的蜜进入蜂巢蜜仓
  if (G.gameType === 'winter') {
    G.store += amount;
    if (!G.quotaMet && G.store >= G.quota) quotaReached();
  }
  // 过载蜜囊：超出容量的那部分蜜按 3 倍价值结算（这才是值得咬牙多背的理由）
  const beforeHoney = bee.honey + amount;
  const overAmt = Math.min(amount, Math.max(0, beforeHoney - cap));
  G.unloadAcc += (amount - overAmt) + overAmt * OVERLOAD_MULT;
  while (G.unloadAcc >= UNLOAD_PER) {
    G.unloadAcc -= UNLOAD_PER;
    G.score += SCORE_PER_UNLOAD * eff;
    gainExp(1 * eff);
  }
  if (Math.random() < dt * 22) burst(bee.x + rand(-16, 16), bee.y + rand(-16, 16), '#ffe066', 1, 80);

  if (bee.honey <= 0.0001) {                           // 一趟结束：结算 + 难度推进
    bee.honey = 0;
    G.unloadAcc = 0;
    G.arrive = 0;
    G.returns++;
    G.trips++;
    G.ratioSum += clamp(ratio, 0, 1);
    G.combo = 0;                                         // 回巢：连采中断
    G.dashCharges = Math.min(DASH_MAX, G.dashCharges + 1);
    G.returnStreak++; G.catchStreak = 0;
    G.stingReady = true;                                 // 毒刺就绪
    if (G.returnStreak >= 3) { G.returnStreak = 0; G.ddt.speed += 5; }   // 连续 3 次安全回巢：黄蜂提速
    if (ratio >= 0.9 && ratio < 0.999) addScore(50, HIVE.x, HIVE.y - 100, '满囊回巢');
    if (ratio >= 0.999) addScore(100, HIVE.x, HIVE.y - 100, '完美回巢');
    if (ratio >= 0.9) gainExp(2);
    gainExp(EXP_TRIP);                                   // 安全回巢本身也是进度
    popup('卸蜜完成 ' + Math.round(ratio * 100) + '%', HIVE.x, HIVE.y - 66, '#ffe066', 32);
    Sfx.unload();
    burst(HIVE.x, HIVE.y, '#ffe066', 22, 200);
    const avg = G.ratioSum / Math.max(1, G.trips);
    G.ddt.honeyMul = avg < 0.35 ? 1.2 : 1.0;           // 常空载回巢：花朵蜜量 +20%
    G.ddt.waspExtra = (G.trips >= 3 && avg > 0.8) ? 1 : 0;   // 蜜囊常满：黄蜂更频繁出现
    const p = phase();
    if (p.name !== G.phaseName) {
      G.phaseName = p.name;
      G.banner = '阶段：' + p.name; G.bannerSub = p.tip; G.bannerT = 3.2;
      cam.shake = Math.max(cam.shake, 0.5);
    }
    while (wasps.length < waspCount()) spawnWasp();
  }
}

function dropHoney() {
  if (bee.honey <= 0) return;
  const amt = Math.floor(bee.honey * DROP_RATIO);
  if (amt <= 0) return;
  bee.honey -= amt;
  // 掉在身后，并延迟 0.8 秒才可捡回：必须真的飞开再回头
  const ang = bee.ang + Math.PI;
  drops.push({ x: bee.x + Math.cos(ang) * 34, y: bee.y + Math.sin(ang) * 34, amount: amt, ttl: DROP_TTL, arm: 0.8 });
  G.combo = 0;
  popup('舍蜜 ' + amt, bee.x, bee.y - 40, '#ffb3c1', 30);
  burst(bee.x, bee.y, '#ffb3c1', 16, 140);
  Sfx.drop();
}

function tryDash() {
  if (G.dashT > 0 || G.dashCD > 0) return;
  if (G.dashCharges <= 0) { popup('没有冲刺次数', bee.x, bee.y - 40, '#ff8f8f', 24); return; }
  const gale = up('gale') > 0;
  if (!gale && bee.honey < DASH_COST) { popup('蜜不足 30', bee.x, bee.y - 40, '#ff8f8f', 24); return; }
  if (!gale) bee.honey -= DASH_COST;              // 逆风冲刺：不耗蜜，只耗次数
  G.dashCharges--;
  G.dashT = DASH_TIME;
  G.dashCD = 0.25;
  bee.collect = null;                             // 冲刺可中断采蜜
  burst(bee.x, bee.y, gale ? '#9be7ff' : '#ffffff', 14, 200);
  Sfx.dash();
}

/* --- 主动技能：蜜香诱饵 --- */
function useBait() {
  if (!up('bait')) return;
  if (G.baitT > 0) { popup('诱饵冷却中 ' + G.baitT.toFixed(1) + 's', bee.x, bee.y - 40, '#ff8f8f', 22); return; }
  G.baitT = BAIT_CD;
  G.decoy = { x: bee.x, y: bee.y, ttl: BAIT_TIME + 0.5 };
  let n = 0;
  for (let i = 0; i < wasps.length; i++) {
    const w = wasps[i];
    if (w.readyT > 0 || w.state === 'chase' || w.state === 'investigate') continue;
    if (dist(w.x, w.y, G.decoy.x, G.decoy.y) <= BAIT_R) { w.lureT = BAIT_TIME; w.lureSrc = 'decoy'; n++; }
  }
  popup('蜜香诱饵！吸引 ' + n + ' 只黄蜂', bee.x, bee.y - 60, '#ffd447', 30);
  burst(G.decoy.x, G.decoy.y, '#ffd447', 24, 200);
  cam.shake = Math.max(cam.shake, 0.25);
  Sfx.greed();
}

function caught(by) {
  if (G.invuln > 0) return;
  if (up('playdead') && !G.playDeadUsed) {
    G.playDeadUsed = true;
    G.invuln = 2.5;
    popup('装死！免疫一次', bee.x, bee.y - 60, '#9be7ff', 36);
    burst(bee.x, bee.y, '#9be7ff', 34, 240);
    Sfx.unload();
    return;
  }
  if (up('sting') && G.stingReady) {
    G.stingReady = false;                   // 每趟仅 1 次，回巢卸蜜后重新就绪
    for (let i = 0; i < wasps.length; i++) if (wasps[i] === by) { wasps.splice(i, 1); break; }
    burst(by.x, by.y, '#ff6b5e', 40, 320);
    popup('毒刺反杀！', bee.x, bee.y - 60, '#ff9f6b', 36);
    cam.shake = Math.max(cam.shake, 0.9);
    G.invuln = 1.0;
    Sfx.catch_();
    return;
  }
  G.lives = Math.max(0, G.lives - 1);
  G.invuln = 2.0;
  G.catchStreak++; G.returnStreak = 0;
  if (G.catchStreak >= 2) { G.catchStreak = 0; G.ddt.speed -= 10; G.ddt.chase -= 20; }
  const lost = Math.round(bee.honey);
  const lostGold = Math.round(bee.gold);
  bee.honey = 0; bee.gold = 0; G.unloadAcc = 0; G.goldAcc = 0; G.combo = 0;
  popup('被抓！-' + lost + ' 蜜' + (lostGold > 0 ? ' -' + lostGold + ' 金蜜' : ''), bee.x, bee.y - 60, '#ff6b5e', 36);
  burst(bee.x, bee.y, '#ffd447', 40, 320);
  burst(bee.x, bee.y, '#ff6b5e', 16, 180);
  cam.shake = 1.0;
  Sfx.catch_();
  if (G.lives <= 0) {
    G.mode = 'dying';
    G.deathT = 0;
    Sfx.death();
    cam.shake = 1.4;
  }
}

/* ===================== 11. 世界更新 ===================== */

function nearestWaspInfo() {
  let best = null, bd = 1e9;
  for (let i = 0; i < wasps.length; i++) {
    const d = dist(wasps[i].x, wasps[i].y, bee.x, bee.y);
    if (d < bd) { bd = d; best = wasps[i]; }
  }
  return { w: best, d: bd };
}

/* --- 威胁模型：状态驱动 ---
   安全=静音；巡逻邻近=极轻提示；警觉=黄圈+提示音；追击=红圈+心跳+暗角。
   距离只在"已被盯上"之后调制强度，不再"离得远也一直响"。 */
const TIER_NAME = ['安全', '巡逻邻近', '警觉', '追击'];
const TIER_COLOR = ['#8fa6bd', '#ffe066', '#ffd447', '#ff4d4d'];
let THREAT = { tier: 0, inSafe: true, nearest: 1e9, nearestW: null, chasing: 0, alerting: 0, intensity: 0 };
let threatSmooth = 0, heartT = 0, alertCd = 0, chaseCd = 0, wasInSafe = true;

function computeThreat(dt) {
  const inSafe = dist(bee.x, bee.y, HIVE.x, HIVE.y) < SAFE_R;
  let tier = 0, nearest = 1e9, nearestW = null, chasing = 0, alerting = 0;
  for (let i = 0; i < wasps.length; i++) {
    const w = wasps[i];
    if (w.readyT > 0) continue;                       // 入场预告中的黄蜂还不算威胁
    const d = dist(w.x, w.y, bee.x, bee.y);
    if (d < nearest) { nearest = d; nearestW = w; }
    if (w.state === 'chase') { chasing++; if (tier < 3) tier = 3; }
    else if (w.state === 'alert') { alerting++; if (tier < 2) tier = 2; }
    else if (tier < 1 && d < WARN_PATROL) tier = 1;
  }

  if (inSafe) tier = 0;                               // 蜂巢内：绝对安全
  let intensity = 0;
  if (tier === 3) intensity = clamp((WARN_FAR - nearest) / (WARN_FAR - WARN_NEAR), 0.45, 1);
  else if (tier === 2) intensity = 0.5 * clamp((WARN_FAR - nearest) / (WARN_FAR - WARN_NEAR), 0.5, 1);
  else if (tier === 1) intensity = 0.16;
  if (inSafe) intensity = 0;

  // 上升快、回落慢 → 天然的迟滞，边界不闪断
  const k = 1 - Math.pow(intensity > threatSmooth ? 0.02 : 0.12, dt || 1 / 60);
  threatSmooth = lerp(threatSmooth, intensity, k);

  THREAT = { tier: tier, inSafe: inSafe, nearest: nearest, nearestW: nearestW, chasing: chasing, alerting: alerting, intensity: intensity };

  // 进入蜂巢：给一个"到家了"的反馈，并让威胁音效立刻退场
  if (inSafe && !wasInSafe) { Sfx.safe(); popup('安全区 · 卸蜜', HIVE.x, HIVE.y - 120, '#ffe9a8', 30); }
  wasInSafe = inSafe;
  return THREAT;
}
function dangerLevel() { return threatSmooth; }

/** 事件音效节流：避免 6 只黄蜂各叫一次 */
function sfxAlert(w) {
  if (alertCd > 0 || THREAT.inSafe) return;
  if (dist(w.x, w.y, bee.x, bee.y) > 460) return;
  alertCd = 0.5;
  Sfx.alert();
}
function sfxChase(w) {
  if (chaseCd > 0 || THREAT.inSafe) return;
  if (dist(w.x, w.y, bee.x, bee.y) > 620) return;
  chaseCd = 1.6;
  Sfx.chase();
}
function chaserCount() {
  let n = 0;
  for (let i = 0; i < wasps.length; i++) if (wasps[i].state === 'chase' && wasps[i].readyT <= 0) n++;
  return n;
}
function beeInBush() {
  for (let i = 0; i < bushes.length; i++) if (dist(bee.x, bee.y, bushes[i].x, bushes[i].y) < bushes[i].r) return true;
  return false;
}

function updateWorld(dt) {
  G.worldT += dt;
  if (G.mode === 'play') G.aliveT += dt;

  /* --- 存活计分 --- */
  if (G.mode === 'play') {
    G.scoreTick -= dt;
    if (G.scoreTick <= 0) { G.scoreTick = 30; addScore(10, bee.x, bee.y - 70, '存活30秒'); }
    G.hintT -= dt;
  }

  /* --- 冬季倒计时 --- */
  if (G.gameType === 'winter' && G.mode === 'play') {
    G.winterT -= dt;
    if (G.winterT <= 0) {
      G.winterT = 0;
      if (G.quotaMet) finishWinter(); else winterFail();
      return;
    }
  }
  if (G.baitT > 0) G.baitT -= dt;
  if (G.decoy) { G.decoy.ttl -= dt; if (G.decoy.ttl <= 0) G.decoy = null; }

  /* --- 花蜜雨 --- */
  if (G.mode === 'play') {
    G.rainT -= dt;
    if (G.rainT <= 0) {
      G.rainT = RAIN_PERIOD;
      G.rainLeft = RAIN_TIME;
      G.rainCount++;
      G.banner = '花蜜雨！'; G.bannerSub = '全图花朵蜜量 +50%'; G.bannerT = 2.6;
      Sfx.rain();
    }
    if (G.rainLeft > 0) {
      G.rainLeft -= dt;
      if (Math.random() < dt * 26) petalRain(1);
    }
  }

  updateBee(dt);
  updateWasps(dt);
  updateFlowers(dt);
  updateDrops(dt);
  updateParticles(dt);

  if (G.bannerT > 0) G.bannerT -= dt;
  if (G.comboFlash > 0) G.comboFlash -= dt;
  if (G.greedFlash > 0) G.greedFlash -= dt;

  /* --- 音效：只剩威胁层（被警觉/追击才出声）；负载不再有持续音 --- */
  Sfx.threatTick(THREAT.intensity, THREAT.chasing > 0, THREAT.inSafe, dt);

  /* --- 心跳：只在"正在被追"且贴得近时，越近越快 --- */
  if (alertCd > 0) alertCd -= dt;
  if (chaseCd > 0) chaseCd -= dt;
  heartT -= dt;
  if (THREAT.chasing > 0 && !THREAT.inSafe && THREAT.nearest < 220 && heartT <= 0) {
    heartT = lerp(0.6, 0.3, clamp(1 - THREAT.nearest / 220, 0, 1));
    Sfx.heartbeat();
  }
}

function updateBee(dt) {
  const cap = beeCapMax();                 // 采蜜上限（过载蜜囊可超载）
  if (G.dashCD > 0) G.dashCD -= dt;
  if (G.invuln > 0) G.invuln -= dt;

  /* 冲刺计时 */
  if (G.dashT > 0) {
    G.dashT -= dt;
    if (Math.random() < dt * 60) particles.push({ x: bee.x, y: bee.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.3, t: 0, color: '#ffffff', r: rand(2, 4), kind: 'dot' });
  }

  /* 采蜜中：不能移动 */
  if (bee.collect) {
    const f = bee.collect.f;
    bee.vx = bee.vy = 0;
    bee.collect.t += dt;
    if (f.dead) bee.collect = null;
    else if (bee.collect.t >= COLLECT_TIME) finishCollect(f);
    if (bee.collect) {
      // 吸附到花心
      bee.x = lerp(bee.x, f.x, clamp(dt * 10, 0, 1));
      bee.y = lerp(bee.y, f.y - f.r - 2, clamp(dt * 10, 0, 1));
      if (Math.random() < dt * 26) { particles.push({ x: f.x + rand(-8, 8), y: f.y + rand(-8, 8), vx: rand(-16, 16), vy: rand(-46, -14), life: 0.5, t: 0, color: '#ffe066', r: rand(2, 4), kind: 'dot' }); }
      bee.wingPhase += dt * 26;
      return;
    }
  }

  /* 跟随指针 / 手指 / WASD */
  let tx = Input.pointer.x, ty = Input.pointer.y;
  let kx = 0, ky = 0;
  if (Input.down('KeyW') || Input.down('ArrowUp')) ky -= 1;
  if (Input.down('KeyS') || Input.down('ArrowDown')) ky += 1;
  if (Input.down('KeyA') || Input.down('ArrowLeft')) kx -= 1;
  if (Input.down('KeyD') || Input.down('ArrowRight')) kx += 1;
  const useKeys = kx !== 0 || ky !== 0;

  const speed = G.dashT > 0 ? DASH_SPEED : beeSpeedNow();
  let wantVx = 0, wantVy = 0;
  if (useKeys) {
    const m = Math.hypot(kx, ky) || 1;
    wantVx = kx / m * speed; wantVy = ky / m * speed;
    Input.pointer.x = bee.x; Input.pointer.y = bee.y;      // 键鼠互不打架
  } else if (Input.pointer.active) {
    const dx = tx - bee.x, dy = ty - bee.y;
    const d = Math.hypot(dx, dy);
    if (d > 3) {
      const a = Math.atan2(dy, dx);
      const sp = G.dashT > 0 ? speed : Math.min(speed, d / Math.max(dt, 1 / 240));
      wantVx = Math.cos(a) * sp; wantVy = Math.sin(a) * sp;
    }
  }
  const k = clamp(dt * 20, 0, 1);
  bee.vx = lerp(bee.vx, wantVx, k);
  bee.vy = lerp(bee.vy, wantVy, k);
  bee.x = clamp(bee.x + bee.vx * dt, BEE_R, WORLD_W - BEE_R);
  bee.y = clamp(bee.y + bee.vy * dt, BEE_R, WORLD_H - BEE_R);
  const sp = Math.hypot(bee.vx, bee.vy);
  if (sp > 8) bee.ang = Math.atan2(bee.vy, bee.vx);
  bee.wingPhase += dt * (12 + sp / 26);

  /* 自动采蜜 / 毒花碰撞 */
  for (let i = flowers.length - 1; i >= 0; i--) {
    const f = flowers[i];
    const d = dist(bee.x, bee.y, f.x, f.y);
    const reach = f.r + BEE_R + 6;
    if (d > reach) continue;
    if (f.type === 'poison') { hitPoison(f); return; }
    if (!bee.collect) { startCollect(f); break; }
  }

  unloadTick(dt);
}

function hitPoison(f) {
  if (G.invuln > 0) return;
  removeFlower(f);
  burst(f.x, f.y, '#8e44ad', 26, 200);
  cam.shake = Math.max(cam.shake, 0.8);
  if (up('playdead') && !G.playDeadUsed) {
    G.playDeadUsed = true;
    G.invuln = 2.5;
    popup('装死躲过中毒', bee.x, bee.y - 60, '#9be7ff', 30);
    Sfx.unload();
    return;
  }
  G.lives--;
  G.invuln = 1.6;
  G.combo = 0;
  popup('中毒！-1 命', f.x, f.y - 40, '#c39bd3', 34);
  Sfx.catch_();
  if (G.lives <= 0) { G.mode = 'dying'; G.deathT = 0; Sfx.death(); cam.shake = 1.4; }
}

/** 巡逻锚点：守外围高价值资源，别在蜂巢门口堵人。
    风险梯度目标：内环（低收益）安全 → 中环有压力 → 外环/金花最危险。 */
function pickPatrolTarget(w) {
  const p = phase();
  const r = Math.random();
  const playerBias = p.name === '教学' ? 0 : p.name === '初压' ? 0.12 : 0.22;
  const beeHiveD = dist(bee.x, bee.y, HIVE.x, HIVE.y);

  // 40%：守花 —— 只守中/外环与金花，锚点紧贴花朵（60~150px），真正"守"住它
  if (r < 0.40 && flowers.length) {
    let best = null, bs = -1;
    for (let i = 0; i < 6; i++) {
      const f = pick(flowers);
      if (!f || f.type === 'poison') continue;
      const hiveD = dist(f.x, f.y, HIVE.x, HIVE.y);
      if (hiveD < GUARD_MIN_R) continue;                 // 内环花不守
      let s = Math.random() * 0.6 + f.baseHoney / 120 + (f.type === 'gold' ? 0.6 : 0);
      for (let j = 0; j < wasps.length; j++) {
        const o = wasps[j];
        if (o !== w && o.target && dist(o.target.x, o.target.y, f.x, f.y) < 170) s -= 0.7;
      }
      if (s > bs) { bs = s; best = f; }
    }
    if (best) {
      const a = rand(0, TAU), rr = rand(60, 150);
      const tx = best.x + Math.cos(a) * rr, ty = best.y + Math.sin(a) * rr;
      if (dist(tx, ty, HIVE.x, HIVE.y) > PATROL_MIN_R - 40) {
        return { x: clamp(tx, 100, WORLD_W - 100), y: clamp(ty, 100, WORLD_H - 100) };
      }
    }
  }
  // 其余：守回巢走廊（在外环一带）/ 玩家深入外围时才往他那边压
  if (beeHiveD > FOLLOW_MIN_R && r >= 1 - playerBias) {
    const px = bee.x + rand(-260, 260), py = bee.y + rand(-260, 260);
    if (dist(px, py, HIVE.x, HIVE.y) > PATROL_MIN_R) {
      return { x: clamp(px, 100, WORLD_W - 100), y: clamp(py, 100, WORLD_H - 100) };
    }
  }
  const a = rand(0, TAU), rr = rand(PATROL_MIN_R, Math.min(760, WORLD_W / 2 - 120));
  return {
    x: clamp(HIVE.x + Math.cos(a) * rr, 100, WORLD_W - 100),
    y: clamp(HIVE.y + Math.sin(a) * rr, 100, WORLD_H - 100),
  };
}

function updateWasps(dt) {
  const hidden = beeInBush();
  const beeInSafe = dist(bee.x, bee.y, HIVE.x, HIVE.y) < SAFE_R;
  const chaseSpd = waspSpeed();
  const alertSpd = Math.min(180, chaseSpd * 0.85);
  const patrolSpd = Math.min(150, chaseSpd * 0.7);

  for (let i = 0; i < wasps.length; i++) {
    const w = wasps[i];
    if (G.mode === 'dying') break;
    w.spawned += dt;

    /* ---- 入场预告：不行动、不抓人，只给玩家预警 ---- */
    if (w.readyT > 0) {
      w.readyT -= dt;
      w.wingPhase += dt * 26;
      if (w.readyT <= 0) { w.state = 'patrol'; if (dist(w.x, w.y, bee.x, bee.y) < 800) Sfx.alert(); }
      continue;
    }

    if (w.cool > 0) w.cool -= dt;
    const d = dist(w.x, w.y, bee.x, bee.y);
    const hiveD = dist(w.x, w.y, HIVE.x, HIVE.y);
    const ar = alertR(), cr = chaseR();

    /* ---- 状态机：patrol → alert → chase → investigate(冷却) → patrol ---- */
    switch (w.state) {
      case 'patrol':
        if (w.cool <= 0 && ar > 0 && !hidden && d < ar) { w.state = 'alert'; w.warnT = 0; sfxAlert(w); }
        break;
      case 'alert':
        if (hidden || beeInSafe) { loseTarget(w, beeInSafe ? 1.5 : 2.4); }
        else if (d < cr && chaserCount() < CHASE_CAP) { w.state = 'chase'; sfxChase(w); }
        else if (d > WASP_CFG.loseR) { loseTarget(w, WASP_CFG.cooldown); }
        break;
      case 'chase':
        if (hidden) { loseTarget(w, 2.4); popup('失去目标', w.x, w.y - 30, '#9be7ff', 24); }
        else if (beeInSafe || d > WASP_CFG.loseR) { loseTarget(w, WASP_CFG.cooldown); }
        break;
      case 'investigate':
        // 冷却期：飞向"最后目击点"搜索，但不会进入追击（策划案的 3 秒冷却）
        if (w.cool <= 0 || w.investT <= 0) { w.state = 'patrol'; w.target = pickPatrolTarget(w); }
        break;
    }
    if (w.state === 'investigate') w.investT -= dt;

    /* ---- 目标点 ---- */
    let spd = patrolSpd;
    let goalX, goalY;
    if (w.state === 'chase') {
      spd = chaseSpd;
      const lead = w.spawned > 12 ? 0.16 : 0.08;      // 后期带预判，更凶
      goalX = bee.x + bee.vx * lead; goalY = bee.y + bee.vy * lead;
    } else if (w.state === 'alert') {
      spd = alertSpd; goalX = bee.x; goalY = bee.y;
    } else if (w.state === 'investigate') {
      spd = alertSpd * 0.9;
      goalX = w.investX; goalY = w.investY;
      if (dist(w.x, w.y, goalX, goalY) < 70) {
        w.investT = Math.min(w.investT, 0.6);          // 到达最后目击点后原地搜寻
        goalX = w.x + Math.cos(w.spawned * 2) * 60;
        goalY = w.y + Math.sin(w.spawned * 2) * 60;
      }
    } else {
      goalX = w.target.x; goalY = w.target.y;
      // 诱饵吸引：金花金光 / 蜜香诱饵
      if (w.lureT > 0) {
        w.lureT -= dt;
        let lx = null, ly = null;
        if (w.lureSrc === 'gold' && G.goldLure && !G.goldLure.dead) { lx = G.goldLure.x; ly = G.goldLure.y; }
        else if (w.lureSrc === 'decoy' && G.decoy && G.decoy.ttl > 0) { lx = G.decoy.x; ly = G.decoy.y; }
        if (lx != null) {
          const a = w.spawned * 0.7 + w.wingPhase * 0.05;
          goalX = lx + Math.cos(a) * 100;
          goalY = ly + Math.sin(a) * 100;
        } else {
          w.lureT = 0;
        }
      } else if (dist(w.x, w.y, goalX, goalY) < 50) {
        w.target = pickPatrolTarget(w);                // 到点后重新"守"一个资源点
        goalX = w.target.x; goalY = w.target.y;
      }
    }

    /* ---- 蜂巢回避 + 防御圈减速 ---- */
    let vx = goalX - w.x, vy = goalY - w.y;
    const vl = Math.hypot(vx, vy) || 1;
    vx /= vl; vy /= vl;
    if (hiveD < WASP_CFG.hiveAvoid + 40) {
      const ax = (w.x - HIVE.x) / (hiveD || 1), ay = (w.y - HIVE.y) / (hiveD || 1);
      const push = clamp((WASP_CFG.hiveAvoid + 40 - hiveD) / 60, 0, 1.4);
      vx += ax * push * 2.2; vy += ay * push * 2.2;
      const l2 = Math.hypot(vx, vy) || 1; vx /= l2; vy /= l2;
    }
    if (hiveD < defenseR()) spd *= defenseSlow();

    w.vx = lerp(w.vx, vx * spd, clamp(dt * 3.2, 0, 1));
    w.vy = lerp(w.vy, vy * spd, clamp(dt * 3.2, 0, 1));
    let nx = w.x + w.vx * dt, ny = w.y + w.vy * dt;
    nx = clamp(nx, 60, WORLD_W - 60); ny = clamp(ny, 60, WORLD_H - 60);
    w.x = nx; w.y = ny;
    if (Math.hypot(w.vx, w.vy) > 6) w.ang = Math.atan2(w.vy, w.vx);
    w.wingPhase += dt * 40;

    /* ---- 抓到玩家 ---- */
    if (!beeInSafe && G.invuln <= 0 && dist(w.x, w.y, bee.x, bee.y) < BEE_R + WASP_R + WASP_CFG.catchR) {
      if (G.dashT > 0 && up('gale')) continue;        // 逆风冲刺途中免疫抓取
      caught(w);
    }
  }

  /* ---- 黄蜂互相避让 ---- */
  for (let i = 0; i < wasps.length; i++) {
    for (let j = i + 1; j < wasps.length; j++) {
      const a = wasps[i], b = wasps[j];
      const d = dist(a.x, a.y, b.x, b.y);
      const min = WASP_R * 3.2;
      if (d > 0 && d < min) {
        const push = (min - d) / 2;
        const ax = (a.x - b.x) / d, ay = (a.y - b.y) / d;
        a.x += ax * push; a.y += ay * push;
        b.x -= ax * push; b.y -= ay * push;
      }
    }
  }
}

function updateFlowers(dt) {
  const hm = honeyMul();
  G.goldLure = null;
  for (let i = flowers.length - 1; i >= 0; i--) {
    const f = flowers[i];
    f.age += dt;
    f.ttl -= dt;
    f.spawnFade -= dt;
    f.honey = Math.round(f.baseHoney * hm);
    if (f.type === 'gold') {
      if (!G.goldLure || (bee && dist(f.x, f.y, bee.x, bee.y) < dist(G.goldLure.x, G.goldLure.y, bee.x, bee.y))) G.goldLure = f;
      if (Math.random() < dt * 14) { burst(f.x, f.y, '#ffe066', 1, 90); }
    }
    if (f.ttl <= 0) {
      f.dead = true;
      burst(f.x, f.y, f.type === 'poison' ? '#8e44ad' : '#8d99ae', 8, 70);
      removeFlower(f);
    }
  }
  for (let i = pending.length - 1; i >= 0; i--) {
    pending[i].t -= dt;
    if (pending[i].t <= 0) { pending.splice(i, 1); spawnFlower(); }
  }
  const target = flowerTarget();
  G.flowerTimer -= dt;
  if (G.flowerTimer <= 0 && flowers.length + pending.length < target) {
    G.flowerTimer = 1.2;
    pending.push({ t: 0.35 });
  }
  if (wasps.length < waspCount()) spawnWasp();
}

function updateDrops(dt) {
  const cap = beeCapMax();
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.ttl -= dt;
    if (d.arm > 0) d.arm -= dt;
    if (d.ttl <= 0) { drops.splice(i, 1); continue; }
    if (d.arm <= 0 && dist(d.x, d.y, bee.x, bee.y) < 36 && bee.honey < cap) {
      const g = Math.min(d.amount, cap - bee.honey);
      bee.honey += g;
      popup('捡回 ' + Math.round(g), d.x, d.y - 20, '#ffd447', 26);
      burst(d.x, d.y, '#ffd447', 10, 110);
      drops.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t >= p.life) { particles.splice(i, 1); continue; }
    if (p.kind === 'petal') { p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt; }
    else {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - dt * 2.4; p.vy *= 1 - dt * 2.4;
    }
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt; f.y -= dt * 42;
    if (f.t >= f.life) floaters.splice(i, 1);
  }
}

/* ===================== 12. 渲染 ===================== */

const FONT = "'Segoe UI', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif";

function text(s, x, y, size, color, align, weight, alpha) {
  ctx.save();
  if (alpha != null) ctx.globalAlpha *= alpha;
  ctx.font = (weight || '700') + ' ' + size + 'px ' + FONT;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color || '#fff';
  ctx.fillText(s, x, y);
  ctx.restore();
}
function measure(s, size, weight) {
  ctx.save();
  ctx.font = (weight || '700') + ' ' + size + 'px ' + FONT;
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}
/** 按实测宽度依次排布一行"文本块"，放不下就整体缩字号 —— 从根上避免文字重叠与出框 */
function textRow(items, x, y, gap, rightEdge) {
  gap = gap == null ? 22 : gap;
  const n = items.length;
  if (!n) return x;
  const baseSize = items[0].size || 24;
  const weight = items[0].weight || '700';
  const avail = rightEdge != null ? rightEdge - x : Infinity;
  let size = baseSize;
  const totalFor = (s) => {
    let t = 0;
    for (let i = 0; i < n; i++) t += measure(items[i].text, s, items[i].weight || weight) + (i ? gap : 0);
    return t;
  };
  let total = totalFor(size);
  let guard = 0;
  while (total > avail && size > 15 && guard++ < 40) { size -= 1; total = totalFor(size); }
  let cx = x;
  if (rightEdge != null) cx = Math.max(x, rightEdge - total);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    const w = measure(it.text, size, it.weight || weight);
    text(it.text, cx, y, size, it.color, 'left', it.weight || weight, it.alpha);
    cx += w + gap;
  }
  return cx - gap;
}
/* 排版告警：任何"为了塞进框而缩字号 / 截断"都会记一笔，
   浏览器自检会断言这份清单为空 —— 这样"字一多就出框"就没法悄悄回来。 */
let fitWarnings = [];
function noteFit(kind, s, want, got) {
  if (fitWarnings.length < 30) fitWarnings.push({ kind: kind, text: String(s == null ? '' : s).slice(0, 36), want: want, got: got });
}

/** 按最大宽度折行：逐字符测量（中英混排都准），优先在空格 / 标点处断行 */
function wrapLines(s, maxW, size, weight) {
  const str = String(s == null ? '' : s);
  const lines = [];
  let cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (cur && measure(cur + ch, size, weight) > maxW) {
      let cut = -1;
      for (let k = cur.length - 1; k >= 0 && k > cur.length - 10; k--) {
        if (' \u3000，。、；：！？）】」·%'.indexOf(cur[k]) >= 0) { cut = k; break; }
      }
      if (cut > 0) {
        lines.push(cur.slice(0, cut + 1));
        cur = cur.slice(cut + 1) + ch;
      } else {
        lines.push(cur);
        cur = ch;
      }
    } else {
      cur += ch;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/** 文本块：按宽度折行，行数超限自动缩字号（最低 60%），返回占用高度
    —— 所有"文字长度不固定"的地方都用它，避免字多就出框 */
function textBlock(s, x, y, maxW, size, color, opts) {
  opts = opts || {};
  const align = opts.align || 'left';
  const weight = opts.weight || '700';
  const lineH = opts.lineH || 1.32;
  const maxLines = opts.maxLines || 99;
  let sz = size;
  let lines = wrapLines(s, maxW, sz, weight);
  let guard = 0;
  while ((lines.length > maxLines || lines[0] === undefined) && sz > size * 0.6 && guard++ < 24) {
    sz -= 1;
    lines = wrapLines(s, maxW, sz, weight);
  }
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); noteFit('truncate', s, maxLines, lines.length); }
  if (sz < size) noteFit('block-shrink', s, size, sz);
  const total = lines.length * sz * lineH;
  let cy = opts.middle ? y - total / 2 + sz * lineH / 2 : y + sz * lineH / 2;
  for (let i = 0; i < lines.length; i++) {
    text(lines[i], x, cy, sz, color, align, weight, opts.alpha);
    cy += sz * lineH;
  }
  return total;
}

/** 单行自动缩字号：保证不超出 maxW（返回实际使用的字号） */
function fitSize(s, maxW, size, weight, minSize) {
  let sz = size;
  const min = minSize == null ? size * 0.6 : minSize;
  let guard = 0;
  while (measure(s, sz, weight) > maxW && sz > min && guard++ < 40) sz -= 1;
  return sz;
}

/** 单行文本，自动缩到 maxW 内 */
function textFit(s, x, y, maxW, size, color, align, weight, alpha) {
  const sz = fitSize(s, maxW, size, weight);
  if (sz < size) noteFit('fit-shrink', s, size, sz);
  text(s, x, y, sz, color, align, weight, alpha);
  return sz;
}

function roundRect(x, y, w, h, r) {  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function hexPath(x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (rot || 0) + i / 6 * TAU;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function glowCircle(x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha *= alpha == null ? 1 : alpha;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}
function worldToScreen(x, y) {
  return { x: x - cam.x + VIEW_W / 2 + cam.sx, y: y - cam.y + VIEW_H / 2 + cam.sy };
}

function render() {
  fitWarnings = [];
  const t = G ? G.worldT : 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
  G.renderStage = 'bg';

  /* --- 屏幕空间底 --- */
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#0a1018');
  g.addColorStop(1, '#0c1512');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.translate(VIEW_W / 2 - cam.x + cam.sx, VIEW_H / 2 - cam.y + cam.sy);
  drawGround(t);
  drawBushes(t);
  drawDrops(t);
  drawHive(t);
  drawFlowers(t);
  drawWasps(t);
  drawBee(t);
  drawComboMeter();
  drawParticles();
  drawFloaters();
  ctx.restore();

  G.renderStage = 'world-done';
  drawEdgeMarkers();
  drawVignette();
  drawHUD();
  drawMinimap();
  drawBanner();
  G.renderStage = 'hud-done';
  drawScreens();
  G.renderStage = 'done';
}

function drawGround(t) {
  ctx.fillStyle = '#101a17';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  glowCircle(HIVE.x, HIVE.y, 900, 'rgba(255,214,90,0.055)', 1);

  ctx.save();
  for (let i = 0; i < bgDots.length; i++) {
    const d = bgDots[i];
    ctx.globalAlpha = d.a;
    ctx.fillStyle = i % 5 === 0 ? '#6fbf73' : '#3d5c4a';
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // 世界边界
  ctx.save();
  ctx.strokeStyle = 'rgba(120,180,140,0.35)';
  ctx.lineWidth = 6;
  ctx.setLineDash([28, 20]);
  ctx.strokeRect(3, 3, WORLD_W - 6, WORLD_H - 6);
  ctx.restore();
}

function drawHive(t) {
  // 防御圈
  ctx.save();
  ctx.beginPath(); ctx.arc(HIVE.x, HIVE.y, defenseR(), 0, TAU);
  ctx.fillStyle = 'rgba(90,170,255,0.06)';
  ctx.fill();
  ctx.setLineDash([14, 12]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(120,200,255,0.35)';
  ctx.stroke();
  ctx.restore();

  // 安全区
  ctx.save();
  ctx.beginPath(); ctx.arc(HIVE.x, HIVE.y, SAFE_R, 0, TAU);
  ctx.fillStyle = 'rgba(255,225,120,0.07)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,225,120,0.55)';
  ctx.stroke();
  ctx.restore();

  const pulse = 1 + Math.sin(t * 2.2) * 0.03;
  glowCircle(HIVE.x, HIVE.y, 190 * pulse, 'rgba(255,190,60,0.22)', 1);

  // 巢体
  ctx.save();
  ctx.translate(HIVE.x, HIVE.y);
  hexPath(0, 0, HIVE.r, Math.PI / 6);
  const hg = ctx.createRadialGradient(0, -10, 6, 0, 0, HIVE.r);
  hg.addColorStop(0, '#ffe082');
  hg.addColorStop(0.6, '#e8a020');
  hg.addColorStop(1, '#8a5a10');
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#5b3a08'; ctx.stroke();

  // 蜂巢纹路
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#6b4408'; ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU;
    hexPath(Math.cos(a) * 26, Math.sin(a) * 26, 13, Math.PI / 6);
    ctx.stroke();
  }
  hexPath(0, 0, 15, Math.PI / 6);
  ctx.stroke();
  ctx.restore();

  // 卸蜜提示
  const near = dist(bee.x, bee.y, HIVE.x, HIVE.y) < SAFE_R + 60;
  if (near && bee.honey > 0) {
    text('卸蜜中…', HIVE.x, HIVE.y - HIVE.r - 26, 26, '#ffe9a8', 'center', '700', 0.9);
  }
}

function drawFlowers(t) {
  for (let i = 0; i < flowers.length; i++) {
    const f = flowers[i];
    const fade = f.spawnFade > 0 ? clamp(1 - f.spawnFade / 0.35, 0, 1) : 1;
    const ttlF = f.ttl < 4 ? 0.35 + 0.65 * Math.abs(Math.sin(f.ttl * 6)) : 1;
    const pulse = 0.9 + Math.sin(t * 3 + f.phase) * 0.1;
    ctx.save();
    ctx.globalAlpha = fade * ttlF;

    if (f.type === 'gold') {   // 金色光柱
      const pg = ctx.createLinearGradient(0, f.y - 340, 0, f.y);
      pg.addColorStop(0, 'rgba(255,224,102,0)');
      pg.addColorStop(1, 'rgba(255,224,102,0.42)');
      ctx.fillStyle = pg;
      ctx.fillRect(f.x - f.r * 1.3, f.y - 340, f.r * 2.6, 340);
      glowCircle(f.x, f.y, 130 * pulse, 'rgba(255,224,102,0.35)', 1);
    }
    if (f.type === 'poison') glowCircle(f.x, f.y, 90 * pulse, 'rgba(150,60,200,0.3)', 1);

    // 花瓣
    const col = FLOWER_COLOR[f.type];
    for (let p = 0; p < 6; p++) {
      const a = t * 0.4 + f.phase + p / 6 * TAU;
      ctx.fillStyle = col;
      ctx.globalAlpha = fade * ttlF * 0.95;
      ctx.beginPath();
      ctx.arc(f.x + Math.cos(a) * f.r * 0.62, f.y + Math.sin(a) * f.r * 0.62, f.r * 0.55, 0, TAU);
      ctx.fill();
    }
    // 花心
    ctx.globalAlpha = fade * ttlF;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.52, 0, TAU);
    ctx.fillStyle = f.type === 'poison' ? '#3b1052' : f.type === 'gold' ? '#fff3b0' : '#7a5000';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = f.type === 'gold' ? '#fff' : 'rgba(255,255,255,0.55)';
    ctx.stroke();

    if (f.type === 'poison') {   // 骷髅标记
      ctx.strokeStyle = '#e8d7ff'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(f.x - 6, f.y - 6); ctx.lineTo(f.x + 6, f.y + 6);
      ctx.moveTo(f.x + 6, f.y - 6); ctx.lineTo(f.x - 6, f.y + 6);
      ctx.stroke();
    }

    // 采蜜进度环
    if (bee.collect && bee.collect.f === f) {
      const pr = clamp(bee.collect.t / COLLECT_TIME, 0, 1);
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r + 12, -Math.PI / 2, -Math.PI / 2 + pr * TAU);
      ctx.lineWidth = 6; ctx.strokeStyle = '#ffe066';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r + 12, 0, TAU);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.stroke();
    }
    ctx.restore();

    // 蜜量数字（近处才显示，减少视觉噪音）
    if (dist(bee.x, bee.y, f.x, f.y) < 300) {
      text('+' + f.honey, f.x, f.y - f.r - 18, 22, f.type === 'poison' ? '#d2a8ff' : '#ffe9a8', 'center', '700', 0.85);
    }
  }
}

function drawBushes(t) {
  for (let i = 0; i < bushes.length; i++) {
    const b = bushes[i];
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#2f7d4f';
    for (let j = 0; j < b.blobs.length; j++) {
      const bl = b.blobs[j];
      const wob = Math.sin(t * 1.4 + b.phase + j) * 3;
      ctx.beginPath();
      ctx.arc(b.x + bl.x * b.r + wob, b.y + bl.y * b.r, bl.r * b.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(120,220,150,0.5)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

function drawDrops(t) {
  if (G.decoy) {   // 蜜香诱饵：明显的金色诱饵 + 吸引范围
    const dc = G.decoy;
    const p = 1 + Math.sin(t * 8) * 0.08;
    ctx.save();
    ctx.globalAlpha = clamp(dc.ttl / BAIT_TIME, 0.15, 1);
    ctx.beginPath(); ctx.arc(dc.x, dc.y, BAIT_R, 0, TAU);
    ctx.fillStyle = 'rgba(255,212,71,0.05)'; ctx.fill();
    ctx.setLineDash([14, 12]); ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,212,71,0.4)'; ctx.stroke();
    ctx.restore();
    glowCircle(dc.x, dc.y, 60 * p, 'rgba(255,212,71,0.5)', 1);
    ctx.save();
    ctx.fillStyle = '#ffd447';
    ctx.beginPath(); ctx.arc(dc.x, dc.y, 13 * p, 0, TAU); ctx.fill();
    ctx.restore();
    text('诱饵', dc.x, dc.y - 30, 22, '#ffe9a8', 'center', '800', 0.9);
  }
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    const a = clamp(d.ttl / DROP_TTL, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * a;
    glowCircle(d.x, d.y, 34, 'rgba(255,212,71,0.5)', 1);
    ctx.fillStyle = '#ffd447';
    ctx.beginPath(); ctx.arc(d.x, d.y, 10, 0, TAU); ctx.fill();
    text('×' + Math.round(d.amount), d.x, d.y - 24, 20, '#ffe9a8', 'center', '700', 0.9);
    ctx.restore();
  }
}

/** 状态徽标：让玩家一眼看出黄蜂在干什么 */
function threatBadge(x, y, glyph, color) {
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
  ctx.restore();
  text(glyph, x, y + 1, 21, '#141a22', 'center', '800');
}

/** 画黄蜂的"真实侦测半径" —— 之前画的是 34px 装饰圈，和 200px 的实际判定完全不符 */
function drawWaspAwareness(w, t, d) {
  if (w.readyT > 0) {                                  // 入场预告
    const p = 1 - w.readyT / SPAWN_TELEGRAPH;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(t * 6));
    ctx.beginPath(); ctx.arc(w.x, w.y, 26 + p * 90, 0, TAU);
    ctx.setLineDash([12, 10]); ctx.lineWidth = 4; ctx.strokeStyle = '#ff4d4d'; ctx.stroke();
    ctx.restore();
    text('黄蜂来袭 ' + w.readyT.toFixed(1), w.x, w.y - 48, 24, '#ff9f9f', 'center', '800', 0.95);
    return;
  }
  if (w.state === 'alert') {
    const r = alertR();
    if (d < r + 320) {
      ctx.save();
      ctx.beginPath(); ctx.arc(w.x, w.y, r, 0, TAU);
      ctx.fillStyle = 'rgba(255,212,71,0.05)'; ctx.fill();
      ctx.setLineDash([16, 14]); ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,212,71,0.45)'; ctx.stroke();
      ctx.restore();
      threatBadge(w.x, w.y - r * 0.62, '!', '#ffd447');
    }
  } else if (w.state === 'chase') {
    const r = chaseR();
    const p = 1 + Math.sin(t * 12) * 0.06;
    ctx.save();
    ctx.beginPath(); ctx.arc(w.x, w.y, r * p, 0, TAU);
    ctx.fillStyle = 'rgba(255,60,60,0.10)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,77,77,0.7)'; ctx.stroke();
    ctx.setLineDash([12, 10]); ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(bee.x, bee.y); ctx.stroke();
    ctx.restore();
    glowCircle(w.x, w.y, 90, 'rgba(255,60,60,0.26)', 1);
    threatBadge(w.x, w.y - r * 0.72, '!', '#ff4d4d');
  } else if (w.state === 'investigate') {
    // 冷却 / 搜寻：它不知道你在哪，但会去最后目击点找（策划案的 3 秒冷却可视化）
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([8, 10]); ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(120,220,255,0.55)';
    ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.investX, w.investY); ctx.stroke();
    ctx.beginPath(); ctx.arc(w.investX, w.investY, 60, 0, TAU); ctx.stroke();
    ctx.restore();
    threatBadge(w.x, w.y - 46, '?', '#78dcff');
  } else if (w.lureT > 0) {
    // 被金花金光吸引的巡逻黄蜂：给个金色标记，让"金光招蜂"这件事可读
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.3 * Math.abs(Math.sin(t * 5));
    ctx.fillStyle = '#ffe066';
    ctx.translate(w.x, w.y - 46);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
  }
}

function drawWasps(t) {
  for (let i = 0; i < wasps.length; i++) {
    const w = wasps[i];
    const d = dist(w.x, w.y, bee.x, bee.y);
    drawWaspAwareness(w, t, d);

    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 14, 16, 6, 0, 0, TAU); ctx.fill();
    if (w.readyT > 0) ctx.globalAlpha = 0.35;           // 预告中只显示阴影
    ctx.rotate(w.ang + Math.PI / 2);

    const flap = Math.sin(w.wingPhase) * 0.55;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#dfe9ff';
    ctx.beginPath(); ctx.ellipse(-11, -2, 9, 5 + flap * 4, -0.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(11, -2, 9, 5 + flap * 4, 0.5, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.beginPath(); ctx.ellipse(0, 0, 12, 17, 0, 0, TAU);
    const bg = ctx.createLinearGradient(0, -17, 0, 17);
    bg.addColorStop(0, w.state === 'chase' ? '#ff5a4d' : '#e8503f');
    bg.addColorStop(1, '#5b1410');
    ctx.fillStyle = bg; ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#241010';
    for (let s = -1; s <= 1; s++) ctx.fillRect(-14, s * 9 - 3, 28, 6);
    ctx.restore();
    // 头 + 尾刺
    ctx.fillStyle = '#2b1a1a';
    ctx.beginPath(); ctx.arc(0, -17, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd447';
    ctx.beginPath(); ctx.arc(-2.6, -18, 1.7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(2.6, -18, 1.7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a0f0f';
    ctx.beginPath(); ctx.moveTo(-4, 16); ctx.lineTo(4, 16); ctx.lineTo(0, 27); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawBee(t) {
  const cap = beeCap();
  const load = cap > 0 ? bee.honey / cap : 0;
  const full = load >= FULL_RATIO;
  const dashing = G.dashT > 0;

  ctx.save();
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(bee.x, bee.y + 18, 17, 6, 0, 0, TAU); ctx.fill();

  if (dashing) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a = bee.ang + Math.PI + rand(-0.25, 0.25);
      ctx.beginPath();
      ctx.moveTo(bee.x + Math.cos(a) * 18, bee.y + Math.sin(a) * 18);
      ctx.lineTo(bee.x + Math.cos(a) * rand(40, 70), bee.y + Math.sin(a) * rand(40, 70));
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.translate(bee.x, bee.y);
  if (G.invuln > 0) ctx.globalAlpha = 0.45 + 0.45 * Math.abs(Math.sin(G.worldT * 24));
  ctx.rotate(bee.ang + Math.PI / 2);

  // 翅膀
  const flap = Math.sin(bee.wingPhase) * 0.6;
  ctx.save();
  ctx.globalAlpha *= 0.55;
  ctx.fillStyle = '#e8f4ff';
  ctx.beginPath(); ctx.ellipse(-12, -3, 11, 6 + flap * 5, -0.55, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(12, -3, 11, 6 + flap * 5, 0.55, 0, TAU); ctx.fill();
  ctx.restore();

  // 身体（随负载变琥珀色）
  const bodyR = 14 + load * 3;
  ctx.beginPath(); ctx.ellipse(0, 0, bodyR, bodyR + 5, 0, 0, TAU);
  const bgr = ctx.createLinearGradient(0, -bodyR, 0, bodyR);
  bgr.addColorStop(0, full ? '#ff8a3d' : '#ffdd55');
  bgr.addColorStop(1, full ? '#a8341a' : (load > 0.5 ? '#d9a021' : '#a87c12'));
  ctx.fillStyle = bgr; ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#231a08';
  for (let s = -1; s <= 1; s++) ctx.fillRect(-20, s * 8 - 2.5, 40, 5.5);
  ctx.restore();

  // 蜜囊
  if (load > 0.15) {
    ctx.globalAlpha *= 1;
    ctx.fillStyle = 'rgba(255,196,60,' + (0.35 + load * 0.45) + ')';
    ctx.beginPath(); ctx.arc(0, 9, 5 + load * 7, 0, TAU); ctx.fill();
  }

  // 头 / 眼 / 触角
  ctx.fillStyle = '#2a2109';
  ctx.beginPath(); ctx.arc(0, -bodyR - 3, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-3.2, -bodyR - 5, 2.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(3.2, -bodyR - 5, 2.4, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2a2109'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, -bodyR - 9); ctx.lineTo(-8, -bodyR - 17);
  ctx.moveTo(4, -bodyR - 9); ctx.lineTo(8, -bodyR - 17);
  ctx.stroke();

  // 满载警告
  if (full) {
    const p = 1 + Math.sin(t * 10) * 0.08;
    ctx.strokeStyle = 'rgba(255,70,70,' + (0.5 + 0.4 * Math.abs(Math.sin(t * 6))) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, (bodyR + 12) * p, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

/** 连采进度条：贴在蜜蜂上方，让"还能再贪几朵"变成看得见的进度 */
function drawComboMeter() {
  if (G.combo < 2) return;
  let prevN = 0, nextN = COMBO_TOP;
  for (let i = 0; i < COMBO_STEPS.length; i++) {
    if (COMBO_STEPS[i].n <= G.combo) prevN = COMBO_STEPS[i].n;
    else { nextN = COMBO_STEPS[i].n; break; }
  }
  const prog = clamp((G.combo - prevN) / Math.max(1, nextN - prevN), 0, 1);
  const w = 156, h = 13, x = bee.x - w / 2, y = bee.y - 78;
  const pop = G.comboFlash > 0 ? 1 + G.comboFlash * 0.5 : 1;

  ctx.save();
  ctx.globalAlpha = 0.92;
  roundRect(x, y, w, h, 7);
  ctx.fillStyle = 'rgba(8,14,20,0.66)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,224,102,0.35)'; ctx.stroke();
  if (prog > 0) {
    roundRect(x, y, Math.max(4, w * prog), h, 7);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#ffe066'); g.addColorStop(1, '#ff9f43');
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.restore();

  text('连采 ×' + G.combo, bee.x, y - 17, 22 * pop, '#ffe066', 'center', '800', 0.98);
  text('→' + nextN, x + w + 24, y + h / 2, 18, '#cfe3f5', 'center', '700', 0.75);
}

function drawParticles() {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const a = 1 - p.t / p.life;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1) * (p.kind === 'petal' ? 0.85 : 1);
    ctx.fillStyle = p.color;
    if (p.kind === 'petal') {
      ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, TAU); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + a * 0.6), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

function drawFloaters() {
  for (let i = 0; i < floaters.length; i++) {
    const f = floaters[i];
    const a = 1 - f.t / f.life;
    text(f.text, f.x, f.y, f.size, f.color, 'center', '800', clamp(a * 1.4, 0, 1));
  }
}

/* --- 屏幕空间：边缘预警 / 暗角 --- */

function drawEdgeMarkers() {
  const inset = 46;
  const cxs = VIEW_W / 2, cys = VIEW_H / 2;

  function edgeAt(sx, sy, color, size, alpha, label) {
    const dx = sx - cxs, dy = sy - cys;
    const a = Math.atan2(dy, dx);
    const px = clamp(sx, inset, VIEW_W - inset);
    const py = clamp(sy, inset, VIEW_H - inset);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size, 0); ctx.lineTo(-size * 0.8, -size * 0.75); ctx.lineTo(-size * 0.8, size * 0.75);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    if (label) text(label, px, py + size + 14, 18, color, 'center', '700', alpha);
  }

  // 黄蜂：颜色与优先级完全跟随状态，而不是单纯的距离
  for (let i = 0; i < wasps.length; i++) {
    const w = wasps[i];
    if (w.readyT > 0) {                                   // 入场预告：给出明确来袭方向
      const s0 = worldToScreen(w.x, w.y);
      const off0 = s0.x < 0 || s0.x > VIEW_W || s0.y < 0 || s0.y > VIEW_H;
      if (off0) edgeAt(s0.x, s0.y, '#ff4d4d', 20, 0.5 + 0.35 * Math.abs(Math.sin(G.worldT * 7)), '来袭');
      continue;
    }
    const d = dist(w.x, w.y, bee.x, bee.y);
    if (d > WARN_FAR + 200) continue;
    const s = worldToScreen(w.x, w.y);
    const off = s.x < 0 || s.x > VIEW_W || s.y < 0 || s.y > VIEW_H;
    let tier = 0, col, size, alpha;
    if (w.state === 'chase') { tier = 3; col = '#ff4d4d'; size = 24; alpha = 0.6 + 0.4 * Math.abs(Math.sin(G.worldT * 8)); }
    else if (w.state === 'alert') { tier = 2; col = '#ffd447'; size = 18; alpha = 0.6; }
    else if (w.state === 'investigate') { tier = 1; col = '#78dcff'; size = 13; alpha = 0.35; }
    else { tier = 0; col = '#ffd447'; size = 10; alpha = 0.22; }   // 巡逻：很淡，不制造噪音
    if (off) edgeAt(s.x, s.y, col, size, alpha, tier >= 2 ? Math.round(d) + '' : null);
    else if (tier === 3) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(s.x, s.y, 56 + Math.sin(G.worldT * 10) * 6, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  // 花朵方向（同类中距离内）
  for (let i = 0; i < flowers.length; i++) {
    const f = flowers[i];
    const d = dist(bee.x, bee.y, f.x, f.y);
    if (d > 1100) continue;
    const s = worldToScreen(f.x, f.y);
    const off = s.x < 0 || s.x > VIEW_W || s.y < 0 || s.y > VIEW_H;
    if (!off) continue;
    const col = f.type === 'gold' ? '#ffe066' : FLOWER_COLOR[f.type];
    const alpha = f.type === 'gold' ? 0.95 : clamp(1 - d / 1100, 0.15, 0.55);
    edgeAt(s.x, s.y, col, f.type === 'gold' ? 15 : 9, alpha);
  }

  // 蜂巢方向
  const hs = worldToScreen(HIVE.x, HIVE.y);
  const hiveOff = hs.x < 0 || hs.x > VIEW_W || hs.y < 0 || hs.y > VIEW_H;
  if (hiveOff) {
    const dh = dist(bee.x, bee.y, HIVE.x, HIVE.y);
    edgeAt(hs.x, hs.y, '#ffc93c', 14, 0.75, '巢 ' + Math.round(dh));
  }
}

function drawVignette() {
  const threat = threatSmooth;                     // 状态驱动：蜂巢内/安全档为 0
  const cap = beeCap();
  const load = cap > 0 ? bee.honey / cap : 0;
  const full = load >= FULL_RATIO;

  // 贪心奖励：金色闪耀
  if (G.greedFlash > 0) {
    const a = clamp(G.greedFlash / 0.6, 0, 1);
    const gg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.8);
    gg.addColorStop(0, 'rgba(255,224,102,0)');
    gg.addColorStop(1, 'rgba(255,224,102,' + (0.4 * a).toFixed(3) + ')');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  const strength = Math.max(threat * 0.9, full ? 0.45 + 0.2 * Math.abs(Math.sin(G.worldT * 5)) : 0);
  if (strength <= 0.01) return;
  const col = threat > 0.5 ? '255,60,60' : full ? '255,140,40' : '255,210,70';
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.34, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.78);
  g.addColorStop(0, 'rgba(' + col + ',0)');
  g.addColorStop(1, 'rgba(' + col + ',' + (0.5 * strength).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

/* ===================== 13. HUD / 小地图 / 界面 ===================== */

/** 蜜囊条：普通段金色、过载段橙色（过载蜜囊强化时才有） */
function renderBar(bx, by, bw, bh, load, capMax) {
  const normal = Math.min(load, 1);
  roundRect(bx, by, bw, bh, 15);
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
  if (load > 0) {
    roundRect(bx, by, Math.max(6, bw * normal), bh, 15);
    const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    if (load >= FULL_RATIO) { bg.addColorStop(0, '#ff9f43'); bg.addColorStop(1, '#ff4d4d'); }
    else { bg.addColorStop(0, '#ffe066'); bg.addColorStop(1, '#ffb703'); }
    ctx.fillStyle = bg; ctx.fill();
  }
  if (load > 1) {                                   // 过载段
    roundRect(bx + bw * normal, by, Math.max(4, bw * (load - 1)), bh, 8);
    ctx.fillStyle = '#fff3b0'; ctx.fill();
  }
  if (capMax > 0 && load > 1) {                     // 容量刻度
    ctx.save();
    ctx.beginPath(); ctx.moveTo(bx + bw, by - 4); ctx.lineTo(bx + bw, by + bh + 4);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,243,176,0.9)'; ctx.stroke();
    ctx.restore();
  }
}

/** 实时评级预测：把结算才看到的隐性评价变成过程目标 */
function projectedRating() {
  const avg = G.trips ? G.ratioSum / G.trips : 0;
  if (avg >= 0.8 && G.aliveT > 180) return 'S';
  if (avg >= 0.6) return 'A';
  if (avg >= 0.4) return 'B';
  return 'C';
}
function ratingColor(r) {
  return r === 'S' ? '#ffd447' : r === 'A' ? '#9be7ff' : r === 'B' ? '#a5e887' : '#cfe3f5';
}

function drawHUD() {
  const cap = beeCapMax();                 // 过载蜜囊时上限更高（条上升过载段）
  const load = cap > 0 ? clamp(bee.honey / cap, 0, 1.35) : 0;
  const full = bee.honey / beeCap() >= FULL_RATIO;

  /* --- 左上：状态面板 --- */
  ctx.save();
  roundRect(28, 24, 620, 204, 18);
  ctx.fillStyle = 'rgba(8,14,20,0.58)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.stroke();
  ctx.restore();

  const bx = 52, by = 48, bw = 400, bh = 30;
  renderBar(bx, by, bw, bh, load, cap);
  ctx.save();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  roundRect(bx, by, bw, bh, 15); ctx.stroke();
  // 满载阈值刻度
  ctx.beginPath(); ctx.moveTo(bx + bw * FULL_RATIO, by - 4); ctx.lineTo(bx + bw * FULL_RATIO, by + bh + 4);
  ctx.strokeStyle = 'rgba(255,90,90,0.85)'; ctx.stroke();
  ctx.restore();

  text('蜜囊', 52, by + bh + 32, 24, '#ffe9a8', 'left', '700', 0.9);
  text(Math.round(bee.honey) + ' / ' + Math.round(cap), bx + bw + 14, by + bh / 2, 26, full ? '#ff8a5c' : '#ffe066', 'left', '800', 1);
  if (bee.honey > beeCap() + 0.01) {
    text('过载 ×2', 262, by + bh + 32, 24, '#ff9f43', 'left', '800', 0.7 + 0.3 * Math.abs(Math.sin(G.worldT * 7)));
  }
  if (full) {
    text('满载！速度 ' + Math.round(beeSpeedNow()) + ' px/s', 150, by + bh + 32, 24, '#ff7a7a', 'left', '800', 0.6 + 0.4 * Math.abs(Math.sin(G.worldT * 6)));
  } else {
    text('速度 ' + Math.round(beeSpeedNow()) + ' px/s', 150, by + bh + 32, 24, '#9fb3c8', 'left', '700', 0.8);
  }
  if (bee.gold > 0) {   // 金蜜：不占负重，被抓会全丢
    ctx.save();
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath(); ctx.arc(462, by + bh + 32, 7, 0, TAU); ctx.fill();
    ctx.restore();
    text('金蜜 ' + Math.round(bee.gold), 570, by + bh + 32, 24, '#fff3b0', 'right', '800', 0.95);
  }

  // 生命
  for (let i = 0; i < G.maxLives; i++) {
    const x = 60 + i * 34, y = by + bh + 70;
    const alive = i < G.lives;
    ctx.save();
    ctx.globalAlpha = alive ? 1 : 0.22;
    ctx.fillStyle = alive ? '#ff6b6b' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.bezierCurveTo(x - 14, y - 6, x - 6, y - 16, x, y - 8);
    ctx.bezierCurveTo(x + 6, y - 16, x + 14, y - 6, x, y + 6);
    ctx.fill();
    ctx.restore();
  }

  // 等级 + 经验
  text('Lv.' + G.level, 260, by + bh + 70, 26, '#9be7ff', 'left', '800');
  const ex = 330, ey = by + bh + 60, ew = 230, eh = 16;
  roundRect(ex, ey, ew, eh, 8); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  roundRect(ex, ey, Math.max(3, ew * clamp(G.exp / expNeed(G.level), 0, 1)), eh, 8);
  ctx.fillStyle = '#9be7ff'; ctx.fill();

  // 状态行：按实测宽度依次排布，任何文字长度（阶段名/两位数回巢/分钟数）都不会重叠
  const rowItems = [
    { text: '回巢 ' + G.returns + ' 次', size: 24, color: '#cfe3f5', weight: '700', alpha: 0.9 },
    { text: '连采 ' + G.combo, size: 24, color: G.combo >= 3 ? '#ffe066' : '#cfe3f5', weight: '700', alpha: 0.95 },
    { text: '阶段 ' + G.phaseName, size: 24, color: '#ffb3c1', weight: '700', alpha: 0.95 },
  ];
  if (G.gameType === 'winter') {
    rowItems.push({ text: '活过 ' + G.wintersCleared + ' 冬', size: 24, color: '#9be7ff', weight: '800', alpha: 0.95 });
  } else {
    const pr = projectedRating();
    rowItems.push({ text: '评级 ' + pr, size: 24, color: ratingColor(pr), weight: '800', alpha: 0.6 + 0.4 * Math.abs(Math.sin(G.worldT * 2)) });
  }
  rowItems.push({ text: '时间 ' + Math.floor(G.aliveT / 60) + ':' + ('0' + Math.floor(G.aliveT % 60)).slice(-2), size: 24, color: '#cfe3f5', weight: '700', alpha: 0.9 });
  G.hudRowEnd = textRow(rowItems, 52, by + bh + 112, 20, 622);

  /* --- 冬季模式：顶部目标面板（进度条 + 倒计时） --- */
  if (G.gameType === 'winter') {
    const w = 760, h = 96, x = VIEW_W / 2 - w / 2, y = 20;
    const prog = clamp(G.store / G.quota, 0, 1);
    ctx.save();
    roundRect(x, y, w, h, 18);
    ctx.fillStyle = 'rgba(8,14,20,0.66)'; ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = G.quotaMet ? '#ffe066' : 'rgba(255,255,255,0.14)';
    if (G.quotaMet) ctx.globalAlpha = 0.7 + 0.3 * Math.abs(Math.sin(G.worldT * 5));
    ctx.stroke();
    ctx.restore();

    text('冬季 ' + G.winter, x + 26, y + 32, 28, '#9be7ff', 'left', '800');
    const tb = Math.max(0, G.winterT);
    const urgent = tb < 30 && !G.quotaMet;
    text('T-' + Math.floor(tb / 60) + ':' + ('0' + Math.floor(tb % 60)).slice(-2), x + w - 26, y + 32, 30,
      urgent ? '#ff6b5e' : '#cfe3f5', 'right', '800', urgent ? 0.6 + 0.4 * Math.abs(Math.sin(G.worldT * 8)) : 0.95);

    const pbarX = x + 26, pbarY = y + 52, pbarW = w - 52, pbarH = 24;
    roundRect(pbarX, pbarY, pbarW, pbarH, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
    if (prog > 0) {
      roundRect(pbarX, pbarY, Math.max(6, pbarW * prog), pbarH, 12);
      const bg = ctx.createLinearGradient(pbarX, 0, pbarX + pbarW, 0);
      bg.addColorStop(0, '#9be7ff'); bg.addColorStop(1, G.quotaMet ? '#ffe066' : '#5fa8d3');
      ctx.fillStyle = bg; ctx.fill();
    }
    text('蜜仓 ' + Math.round(G.store) + ' / ' + G.quota, pbarX + pbarW / 2, pbarY + pbarH / 2, 20, '#0d141c', 'center', '800');
  }

  /* --- 右上：分数 / 冲刺 --- */
  ctx.save();
  roundRect(VIEW_W - 430, 24, 402, 168, 18);
  ctx.fillStyle = 'rgba(8,14,20,0.58)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.stroke();
  ctx.restore();
  text('分数', VIEW_W - 56, 58, 24, '#9fb3c8', 'right', '700', 0.9);
  const bestVal = G.gameType === 'winter'
    ? (Best.data.winters > 0 ? '最佳 活过 ' + Best.data.winters + ' 冬' : '最佳 —')
    : (Best.data.endless > 0 ? '最佳 ' + fmt(Best.data.endless) : '最佳 —');
  text(bestVal, VIEW_W - 404, 58, 22, '#8fa6bd', 'left', '700', 0.9);
  text(fmt(G.score), VIEW_W - 56, 100, 52, '#ffe066', 'right', '800');
  const ravg = G.trips ? Math.round(G.ratioSum / G.trips * 100) : 0;
  text('平均每趟 ' + ravg + '%', VIEW_W - 56, 146, 24, '#cfe3f5', 'right', '700', 0.9);

  const px0 = VIEW_W - 404;
  text('冲刺', px0, 148, 24, '#cfe3f5', 'left', '700', 0.9);
  for (let i = 0; i < DASH_MAX; i++) {
    ctx.save();
    ctx.globalAlpha = i < G.dashCharges ? 1 : 0.2;
    ctx.fillStyle = i < G.dashCharges ? '#9be7ff' : '#ffffff';
    ctx.beginPath(); ctx.arc(px0 + 60 + i * 26, 148, 9, 0, TAU); ctx.fill();
    ctx.restore();
  }
  if (G.rainLeft > 0) {
    text('花蜜雨 ' + G.rainLeft.toFixed(1) + 's', VIEW_W - 56, 178, 22, '#ffb3d9', 'right', '800', 0.95);
  } else {
    text('下次花蜜雨 ' + Math.max(0, G.rainT).toFixed(0) + 's', VIEW_W - 56, 178, 22, '#8fa6bd', 'right', '700', 0.75);
  }

  /* --- 威胁状态读数：让玩家学会这套预警 --- */
  const tier = THREAT.tier;
  ctx.save();
  roundRect(VIEW_W - 430, 204, 402, 54, 14);
  ctx.fillStyle = 'rgba(8,14,20,0.58)'; ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = tier >= 2 ? TIER_COLOR[tier] : 'rgba(255,255,255,0.10)';
  ctx.globalAlpha = tier >= 3 ? 0.6 + 0.4 * Math.abs(Math.sin(G.worldT * 7)) : 1;
  ctx.stroke();
  ctx.restore();
  const tcol = TIER_COLOR[tier];
  const tmsg = THREAT.inSafe ? '蜂巢内 · 绝对安全（音效已静音）'
    : tier === 0 ? '威胁：安全　最近黄蜂 ' + (THREAT.nearest < 9000 ? Math.round(THREAT.nearest) + 'px' : '—')
      : '威胁：' + TIER_NAME[tier] + '　最近 ' + Math.round(THREAT.nearest) + 'px';
  textFit(tmsg, VIEW_W - 56, 231, 370, 24, THREAT.inSafe ? '#ffe9a8' : tcol, 'right', '800',
    THREAT.inSafe ? 0.95 : (tier === 0 ? 0.85 : 0.98));
  text(Sfx.isMuted() ? 'M 音效：关' : 'M 音效：开', VIEW_W - 56, 40, 20, '#8fa6bd', 'right', '700', 0.6);
  if (up('playdead') || up('sting')) {
    let s = '';
    if (up('playdead')) s += '装死 ' + (G.playDeadUsed ? '已用' : '就绪');
    if (up('sting')) s += (s ? '　' : '') + '毒刺 ' + (G.stingReady ? '就绪' : '已用');
    text(s, px0, 178, 20, '#a5e887', 'left', '700', 0.85);
  }

  /* --- 右下：操作提示 --- */
  const hintA = G.hintT > 0 ? 0.9 : 0.3;
  const lines = [
    '鼠标 / 手指 移动　蜜蜂跟随　靠近花朵自动采蜜 0.5s',
    '空格 过载冲刺（耗 30 蜜 + 1 次，回巢恢复）　Q 舍蜜逃生（丢 50%）',
    'E 蜜香诱饵（强化后）　F 收工过冬　WASD 也可操控　P 暂停　M 静音',
    '钻进绿色花丛，黄蜂会失去目标 2 秒',
  ];
  for (let i = 0; i < lines.length; i++) {
    textFit(lines[i], VIEW_W - 40, VIEW_H - 40 - (lines.length - 1 - i) * 30, 900, 22, '#cfe3f5', 'right', '700', hintA * (i === 3 ? 0.85 : 1));
  }

  if (Input.pointer.touch) drawTouchButtons();
}

function touchButtons() {
  const bs = [
    { id: 'dash', label: '冲刺', x: VIEW_W / 2 - 210, y: VIEW_H - 176, w: 180, h: 120 },
    { id: 'drop', label: '舍蜜', x: VIEW_W / 2 + 30, y: VIEW_H - 176, w: 180, h: 120 },
  ];
  if (G && up('bait')) bs.push({ id: 'bait', label: '诱饵', x: VIEW_W / 2 + 270, y: VIEW_H - 176, w: 160, h: 120 });
  return bs;
}
function drawTouchButtons() {
  const bs = touchButtons();
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    ctx.save();
    ctx.globalAlpha = 0.75;
    roundRect(b.x, b.y, b.w, b.h, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
    ctx.restore();
    text(b.label, b.x + b.w / 2, b.y + b.h / 2, 30, '#eaf6ff', 'center', '800', 0.9);
  }
}

function drawMinimap() {
  const mw = 330, mh = 236, mx = 28, my = VIEW_H - mh - 28;
  const sx = mw / WORLD_W, sy = mh / WORLD_H;
  ctx.save();
  roundRect(mx, my, mw, mh, 14);
  ctx.fillStyle = 'rgba(8,14,20,0.62)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke();
  ctx.clip();
  // 视口
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
  ctx.strokeRect(mx + (cam.x - VIEW_W / 2) * sx, my + (cam.y - VIEW_H / 2) * sy, VIEW_W * sx, VIEW_H * sy);
  // 花丛
  ctx.fillStyle = 'rgba(90,200,130,0.35)';
  for (let i = 0; i < bushes.length; i++) {
    ctx.beginPath(); ctx.arc(mx + bushes[i].x * sx, my + bushes[i].y * sy, 5, 0, TAU); ctx.fill();
  }
  // 花
  for (let i = 0; i < flowers.length; i++) {
    const f = flowers[i];
    ctx.fillStyle = FLOWER_COLOR[f.type];
    ctx.globalAlpha = f.type === 'poison' ? 0.75 : 0.95;
    ctx.beginPath(); ctx.arc(mx + f.x * sx, my + f.y * sy, f.type === 'gold' ? 5 : 3.4, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 蜜滴
  ctx.fillStyle = '#ffd447';
  for (let i = 0; i < drops.length; i++) {
    ctx.beginPath(); ctx.arc(mx + drops[i].x * sx, my + drops[i].y * sy, 2.6, 0, TAU); ctx.fill();
  }
  // 蜂巢
  ctx.fillStyle = '#ffb703';
  ctx.beginPath(); ctx.arc(mx + HIVE.x * sx, my + HIVE.y * sy, 7, 0, TAU); ctx.fill();
  // 黄蜂
  for (let i = 0; i < wasps.length; i++) {
    const w = wasps[i];
    ctx.fillStyle = w.state === 'chase' ? '#ff4d4d' : w.state === 'alert' ? '#ff8a3d' : '#c85a4a';
    ctx.beginPath(); ctx.arc(mx + w.x * sx, my + w.y * sy, 4.2, 0, TAU); ctx.fill();
  }
  // 蜜蜂
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(mx + bee.x * sx, my + bee.y * sy, 4, 0, TAU); ctx.fill();
  ctx.restore();
  text('小地图', mx + 14, my + 18, 18, '#8fa6bd', 'left', '700', 0.8);
}

function drawBanner() {
  if (G.bannerT <= 0) return;
  const a = clamp(G.bannerT, 0, 1);
  const maxW = 1040;
  const mainSize = fitSize(G.banner, maxW, 38, '800');
  const subLines = G.bannerSub ? wrapLines(G.bannerSub, maxW, 24, '700') : [];
  const h = 58 + mainSize * 0.6 + (subLines.length ? subLines.length * 32 : 0);
  const w = Math.min(1200, Math.max(560,
    Math.max(measure(G.banner, mainSize, '800'), 0) + 80));
  ctx.save();
  ctx.globalAlpha = a;
  roundRect(VIEW_W / 2 - w / 2, 120, w, h, 16);
  ctx.fillStyle = 'rgba(10,16,24,0.72)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,224,102,0.45)'; ctx.stroke();
  ctx.restore();
  text(G.banner, VIEW_W / 2, 120 + 40, mainSize, '#ffe066', 'center', '800', a);
  for (let i = 0; i < subLines.length; i++) {
    text(subLines[i], VIEW_W / 2, 120 + 76 + i * 32, 24, '#cfe3f5', 'center', '700', a * 0.9);
  }
}

function drawScreens() {
  if (G.mode === 'title') return G.menuHelp ? drawHelp() : drawTitle();
  if (G.mode === 'levelup') return drawLevelUp();
  if (G.mode === 'winterend') return drawWinterEnd();
  if (G.mode === 'paused') return drawPaused();
  if (G.mode === 'over') return drawOver();
  if (G.mode === 'dying') {
    ctx.fillStyle = 'rgba(0,0,0,' + clamp(G.deathT * 1.2, 0, 0.55) + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

/** 过冬小结：自动停留一小会儿就进下一个冬天，点击 / 按键可跳过 */
function drawWinterEnd() {
  const s = G.winterStat || { n: 1, quota: 0, store: 0, timeLeft: 0, bonus: 0, score: 0 };
  ctx.fillStyle = 'rgba(4,8,14,0.8)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const w = 900, h = 460, x = VIEW_W / 2 - w / 2, y = 250;
  ctx.save();
  roundRect(x, y, w, h, 22);
  ctx.fillStyle = 'rgba(10,16,24,0.94)'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,224,102,0.45)'; ctx.stroke();
  ctx.restore();

  text('过冬成功', x + w / 2, y + 70, 56, '#ffe066', 'center', '800');
  textFit('冬季 ' + s.n + '　蜜仓 ' + Math.round(s.store) + ' / ' + s.quota,
    x + w / 2, y + 128, w - 120, 28, '#9fb3c8', 'center', '700');
  const rows = [
    ['剩余时间', s.timeLeft + ' 秒'],
    ['提前完成奖励', '+' + s.bonus + ' 分'],
    ['当前总分', fmt(s.score)],
  ];
  for (let i = 0; i < rows.length; i++) {
    const ry = y + 190 + i * 52;
    const labelW = measure(rows[i][0], 26, '700');
    text(rows[i][0], x + 80, ry, 26, '#9fb3c8', 'left', '700');
    textFit(rows[i][1], x + w - 80, ry, w - 160 - labelW - 30, 28, i === rows.length - 1 ? '#ffe066' : '#eaf6ff', 'right', '800');
  }

  // 自动进入下一个冬天的进度条
  const pw = w - 160, px = x + 80, py = y + h - 62;
  const prog = 1 - clamp(G.winterEndT / WINTER_END_HOLD, 0, 1);
  roundRect(px, py, pw, 10, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  roundRect(px, py, Math.max(3, pw * prog), 10, 5);
  ctx.fillStyle = '#9be7ff'; ctx.fill();
  textFit('冬季 ' + (s.n + 1) + ' 即将开始（配额 ' + winterQuota(s.n + 1) + '）· 点击可跳过',
    x + w / 2, y + h - 32, w - 120, 22, '#8fa6bd', 'center', '700', 0.9);
}

function drawTitle() {
  ctx.fillStyle = 'rgba(4,8,14,0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  textFit('再采一朵', VIEW_W / 2, 330, 1200, 104, '#ffe066', 'center', '800');
  textFit('冬季 ' + 1 + '　配额 ' + winterQuota(1) + ' 蜜　时限 ' + WINTER_TIME + ' 秒',
    VIEW_W / 2, 412, 900, 28, '#9fb3c8', 'center', '700');

  const items = [
    { label: '开始过冬', act: 'start' },
    { label: '操作说明', act: 'help' },
  ];
  G.menuRects = [];
  const iw = 420, ih = 70, gap = 18;
  const y0 = 500;
  for (let i = 0; i < items.length; i++) {
    const x = VIEW_W / 2 - iw / 2, y = y0 + i * (ih + gap);
    G.menuRects.push({ x: x, y: y, w: iw, h: ih, act: items[i].act });
    const sel = G.menuIndex === i;
    const hov = Input.pointer.sx > x && Input.pointer.sx < x + iw && Input.pointer.sy > y && Input.pointer.sy < y + ih;
    if (hov) G.menuIndex = i;
    ctx.save();
    roundRect(x, y, iw, ih, 16);
    ctx.fillStyle = sel ? 'rgba(40,70,100,0.95)' : 'rgba(12,20,30,0.9)';
    ctx.fill();
    ctx.lineWidth = sel ? 4 : 2;
    ctx.strokeStyle = sel ? '#9be7ff' : 'rgba(255,255,255,0.16)';
    ctx.stroke();
    ctx.restore();
    text(items[i].label, VIEW_W / 2, y + ih / 2, 30, sel ? '#ffffff' : '#cfe3f5', 'center', '800');
  }

  const best = Best.data.winters > 0
    ? '最佳　活过 ' + Best.data.winters + ' 个冬天　' + fmt(Best.data.winter) + ' 分'
    : '还没有记录，这一局就是第一次';
  textFit(best, VIEW_W / 2, 690, 1000, 24, '#ffe066', 'center', '800', 0.9);
  textFit('↑ ↓ 选择　回车确认', VIEW_W / 2, 760, 600, 22, '#7f93a8', 'center', '700', 0.85);
}

/** 操作说明：独立一页，别把主菜单塞满 */
function drawHelp() {
  ctx.fillStyle = 'rgba(4,8,14,0.9)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const w = 900, h = 620, x = VIEW_W / 2 - w / 2, y = 200;
  ctx.save();
  roundRect(x, y, w, h, 20);
  ctx.fillStyle = 'rgba(12,20,30,0.95)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.stroke();
  ctx.restore();
  text('操作说明', x + w / 2, y + 58, 40, '#ffe066', 'center', '800');

  const rows = [
    ['移动', '鼠标 / 手指 / WASD'],
    ['采蜜', '靠近花朵自动采，0.5 秒（期间不能动）'],
    ['卸蜜', '飞进蜂巢 80px 内自动卸'],
    ['空格', '过载冲刺（耗 30 蜜 + 1 次，回巢恢复）'],
    ['Q', '舍蜜逃生：丢 50% 蜜立刻变快'],
    ['E', '蜜香诱饵（需要强化）'],
    ['1 2 3', '升级时选择强化'],
    ['P / M', '暂停 / 静音'],
    ['目标', '每个冬天把蜜仓囤够配额，囤够即过冬'],
  ];
  for (let i = 0; i < rows.length; i++) {
    const ry = y + 130 + i * 48;
    text(rows[i][0], x + 60, ry, 24, '#9be7ff', 'left', '800');
    textFit(rows[i][1], x + 260, ry, w - 320, 24, '#cfe3f5', 'left', '700', 0.95);
  }
  textFit('Esc / 回车 返回', VIEW_W / 2, y + h + 56, 600, 24, '#9be7ff', 'center', '800', 0.6 + 0.4 * Math.abs(Math.sin(G.worldT * 3)));
}

function drawLevelUp() {
  ctx.fillStyle = 'rgba(4,8,14,0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text('蜂巢升级！', VIEW_W / 2, 250, 64, '#ffe066', 'center', '800');
  text('Lv.' + G.level + '　选择一项强化（点击卡片 或 按 1 / 2 / 3）', VIEW_W / 2, 320, 30, '#9fb3c8', 'center', '700');

  const cw = 400, ch = 320, gap = 50;
  const total = G.choices.length * cw + (G.choices.length - 1) * gap;
  const x0 = VIEW_W / 2 - total / 2, y0 = 400;
  G.choiceRects = [];
  for (let i = 0; i < G.choices.length; i++) {
    const u = G.choices[i];
    const x = x0 + i * (cw + gap);
    G.choiceRects.push({ x: x, y: y0, w: cw, h: ch, i: i });
    const hov = Input.pointer.sx > x && Input.pointer.sx < x + cw && Input.pointer.sy > y0 && Input.pointer.sy < y0 + ch;
    ctx.save();
    roundRect(x, y0, cw, ch, 20);
    ctx.fillStyle = hov ? 'rgba(40,70,100,0.92)' : 'rgba(14,24,34,0.9)'; ctx.fill();
    ctx.lineWidth = hov ? 5 : 2;
    ctx.strokeStyle = hov ? '#9be7ff' : 'rgba(255,255,255,0.16)';
    ctx.stroke();
    ctx.restore();

    roundRect(x + 24, y0 + 24, 96, 34, 10);
    ctx.fillStyle = 'rgba(155,231,255,0.16)'; ctx.fill();
    textFit(u.tag, x + 72, y0 + 41, 88, 20, '#9be7ff', 'center', '800');
    textBlock(u.name, x + cw / 2, y0 + 132, cw - 48, 40, '#ffe066', { align: 'center', weight: '800', maxLines: 1, middle: true });
    // 描述可能是长句（如"按 E 丢诱饵：400px 内巡逻/警觉的黄蜂被吸引 4.5 秒（冷却 12s）"）→ 折行 + 自动缩字号
    textBlock(u.desc, x + cw / 2, y0 + 196, cw - 64, 23, '#cfe3f5', { align: 'center', maxLines: 4, middle: true, alpha: 0.95, lineH: 1.42 });
    textFit('按 ' + (i + 1), x + cw / 2, y0 + ch - 40, cw - 80, 26, hov ? '#ffffff' : '#8fa6bd', 'center', '800', 0.95);
  }
}

function drawPaused() {
  ctx.fillStyle = 'rgba(4,8,14,0.7)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text('已暂停', VIEW_W / 2, VIEW_H / 2 - 40, 72, '#ffe066', 'center', '800');
  text('P / 空格 继续　R 重新开始　M 静音', VIEW_W / 2, VIEW_H / 2 + 40, 30, '#9fb3c8', 'center', '700');
}

function drawOver() {
  const r = G.result || { rating: 'C', avg: 0 };
  const winter = G.gameType === 'winter';
  ctx.fillStyle = 'rgba(4,8,14,0.82)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const w = 940, h = 700, x = VIEW_W / 2 - w / 2, y = 130;
  ctx.save();
  roundRect(x, y, w, h, 22);
  ctx.fillStyle = 'rgba(10,16,24,0.92)'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,224,102,0.35)'; ctx.stroke();
  ctx.restore();

  text(winter ? (r.reason === 'winter' ? '蜂巢没能熬过这个冬天' : '你没能飞回蜂巢') : '采蜜结束',
    x + 48, y + 62, 40, '#ffe066', 'left', '800');
  if (!winter) {
    const rc = r.rating === 'S' ? '#ffd447' : r.rating === 'A' ? '#9be7ff' : r.rating === 'B' ? '#a5e887' : '#cfe3f5';
    text(r.rating, x + w - 120, y + 80, 120, rc, 'center', '800');
  } else {
    text('活过 ' + (r.winters || 0) + ' 个冬天', x + w - 60, y + 74, 34, '#9be7ff', 'right', '800');
  }
  if (r.record) text('★ 新纪录', x + 48, y + 104, 26, '#ffb3c1', 'left', '800', 0.6 + 0.4 * Math.abs(Math.sin(G.worldT * 5)));

  const rows = winter ? [
    ['本冬蜜仓', Math.round(r.store || 0) + ' / ' + (r.quota || 0) + ' 蜜'],
    ['活过冬天', (r.winters || 0) + ' 个'],
    ['蜂巢等级', 'Lv.' + G.level],
    ['最高连采', G.maxCombo + ' 朵'],
    ['贪心采蜜', G.greedCount + ' 次（+' + G.greedScore + ' 分）'],
    ['采蜜总量', Math.round(G.honeyTotal) + ' 蜜' + (G.goldTotal > 0 ? ' + ' + Math.round(G.goldTotal) + ' 金蜜' : '')],
    ['存活时间', Math.floor(G.aliveT / 60) + ' 分 ' + Math.floor(G.aliveT % 60) + ' 秒'],
    ['总分', fmt(G.score)],
  ] : [
    ['采蜜总量', Math.round(G.honeyTotal) + ' 蜜' + (G.goldTotal > 0 ? ' + ' + Math.round(G.goldTotal) + ' 金蜜' : '')],
    ['回巢次数', G.returns + ' 次'],
    ['蜂巢等级', 'Lv.' + G.level],
    ['最高连采', G.maxCombo + ' 朵'],
    ['贪心采蜜', G.greedCount + ' 次（+' + G.greedScore + ' 分）'],
    ['平均每趟', Math.round((r.avg || 0) * 100) + '% 蜜囊'],
    ['存活时间', Math.floor(G.aliveT / 60) + ' 分 ' + Math.floor(G.aliveT % 60) + ' 秒'],
    ['阶段', G.phaseName],
    ['总分', fmt(G.score)],
  ];
  for (let i = 0; i < rows.length; i++) {
    const ry = y + 160 + i * 52;
    // 标签与数值各自限宽，避免长数值（金蜜总量）压到标签上
    const labelW = measure(rows[i][0], 28, '700');
    text(rows[i][0], x + 60, ry, 28, '#9fb3c8', 'left', '700');
    textFit(rows[i][1], x + w - 60, ry, w - 120 - labelW - 30, 30,
      i === rows.length - 1 ? '#ffe066' : '#eaf6ff', 'right', '800');
    ctx.save();
    ctx.globalAlpha = 0.10; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 56, ry + 26); ctx.lineTo(x + w - 56, ry + 26); ctx.stroke();
    ctx.restore();
  }
  if (!winter) {
    textFit('评级说明　S：平均 ≥80% 且存活 >3 分钟　A：≥60%　B：≥40%　C：其它', VIEW_W / 2, y + h - 52, w - 80, 22, '#8fa6bd', 'center', '700', 0.9);
  }
  text('点击屏幕 或 按 R 重新开始', VIEW_W / 2, y + h + 62, 34, '#9be7ff', 'center', '800', 0.6 + 0.4 * Math.abs(Math.sin(G.worldT * 3)));
}

/* ===================== 14. 结果 / 流程控制 ===================== */

function computeResult() {
  const avg = G.trips ? G.ratioSum / G.trips : 0;
  let rating = 'C';
  if (avg >= 0.8 && G.aliveT > 180) rating = 'S';
  else if (avg >= 0.6) rating = 'A';
  else if (avg >= 0.4) rating = 'B';
  const record = Best.submit(G.gameType, G.score, G.wintersCleared);
  G.result = { avg: avg, rating: rating, reason: 'dead', winters: G.wintersCleared, record: record };
  return G.result;
}

function startRun(type) {
  newGame();
  G.gameType = (type === 'winter' || type === 'endless') ? type : G.lastType || 'endless';
  G.lastType = G.gameType;
  if (G.gameType === 'winter') {
    G.winter = 1;
    G.winterT = WINTER_TIME;
    G.quota = winterQuota(1);
    G.store = 0;
    G.quotaMet = false;
  }
  G.mode = 'play';
  G.hintT = 14;
  G.banner = G.gameType === 'winter' ? '冬季 1 · 囤够 ' + G.quota + ' 蜜' : '出巢采蜜！';
  G.bannerSub = G.gameType === 'winter'
    ? WINTER_TIME + ' 秒内把蜜仓填满，蜂巢才能过冬'
    : phase().tip;
  G.bannerT = 3;
  Sfx.init(); Sfx.resume();
}

/* --- 冬季模式流程 --- */

/** 囤够配额 → 立刻进入过冬小结（自动进入下一个冬天，不需要手动结算） */
function quotaReached() {
  G.quotaMet = true;
  addScore(WINTER_MET_BONUS, HIVE.x, HIVE.y - 130, '过冬成功');
  burst(HIVE.x, HIVE.y, '#ffe066', 44, 300);
  cam.shake = Math.max(cam.shake, 0.6);
  Sfx.levelup();
  finishWinter();
}

function finishWinter() {
  const timeBonus = Math.round(G.winterT * WINTER_FINISH_PER_SEC);
  if (timeBonus > 0) addScore(timeBonus, HIVE.x, HIVE.y - 130, '提前完成');
  G.wintersCleared++;
  G.winterStat = {
    n: G.winter, quota: G.quota, store: Math.round(G.store),
    timeLeft: Math.round(G.winterT), bonus: timeBonus, score: Math.round(G.score),
  };
  G.mode = 'winterend';
  G.winterEndT = WINTER_END_HOLD;
  burst(HIVE.x, HIVE.y, '#ffe066', 50, 320);
  cam.shake = Math.max(cam.shake, 0.7);
  Sfx.unload();
}

function nextWinter() {
  G.winter++;
  G.winterT = WINTER_TIME;
  G.quota = winterQuota(G.winter);
  G.store = 0;
  G.quotaMet = false;
  G.returns = 0;                        // 难度爬坡按"本冬回巢数"重算，长期抬升由 WINTER_RAMP 给
  G.ddt.speed = Math.round(G.ddt.speed * 0.5);   // 跨冬只保留一半的动态难度加成，避免第二个冬天就撞墙
  G.mode = 'play';
  G.pendingBanner = { banner: '冬季 ' + G.winter, sub: '配额提升到 ' + G.quota + ' 蜜', t: 3 };
  openLevelUp();                      // 每活过一个冬天，蜂巢强化一次（没有可选项时会保持 play）
}

function winterFail() {
  G.mode = 'over';
  G.result = {
    avg: G.trips ? G.ratioSum / G.trips : 0,
    rating: 'C',
    reason: 'winter',
    winters: G.wintersCleared,
    store: Math.round(G.store),
    quota: G.quota,
    record: Best.submit('winter', G.score, G.wintersCleared),
  };
}

function pointerDownAt(lx, ly) {
  if (G.mode === 'title') {
    if (G.menuHelp) { G.menuHelp = false; return; }
    for (let i = 0; i < G.menuRects.length; i++) {
      const r = G.menuRects[i];
      if (lx > r.x && lx < r.x + r.w && ly > r.y && ly < r.y + r.h) {
        Sfx.init(); Sfx.resume(); Sfx.click();
        if (r.act === 'start') startRun('winter'); else G.menuHelp = true;
        return;
      }
    }
    return;
  }
  if (G.mode === 'winterend') { Sfx.click(); nextWinter(); return; }
  if (G.mode === 'over') { startRun(G.gameType); return; }
  if (G.mode === 'paused') { G.mode = 'play'; return; }
  if (G.mode === 'levelup') {
    for (let i = 0; i < G.choiceRects.length; i++) {
      const r = G.choiceRects[i];
      if (lx > r.x && lx < r.x + r.w && ly > r.y && ly < r.y + r.h) { Sfx.click(); applyUpgrade(G.choices[r.i]); return; }
    }
    return;
  }
  if (G.mode === 'play' && Input.pointer.touch) {
    const bs = touchButtons();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (lx > b.x && lx < b.x + b.w && ly > b.y && ly < b.y + b.h) {
        if (b.id === 'dash') tryDash();
        else if (b.id === 'bait') useBait();
        else dropHoney();
        return;
      }
    }
  }
}

function handleKeys() {
  if (Input.pressed('KeyM')) { Sfx.init(); Sfx.toggleMute(); }
  const startKey = Input.pressed('Space') || Input.pressed('Enter');

  if (G.mode === 'title') {
    if (G.menuHelp) {
      if (startKey || Input.pressed('Escape') || Input.pressed('KeyQ') || Input.pressed('Backspace')) G.menuHelp = false;
      return;
    }
    const up = Input.pressed('ArrowUp') || Input.pressed('KeyW');
    const down = Input.pressed('ArrowDown') || Input.pressed('KeyS');
    if (up) G.menuIndex = (G.menuIndex + 1) % 2;
    if (down) G.menuIndex = (G.menuIndex + 1) % 2;
    if (Input.pressed('Digit1')) { startRun('winter'); return; }
    if (Input.pressed('Digit2')) { G.menuHelp = true; return; }
    if (startKey) {
      if (G.menuIndex === 0) startRun('winter'); else G.menuHelp = true;
    }
    return;
  }
  if (G.mode === 'winterend') {
    if (startKey || Input.pressed('Escape') || Input.pressed('Digit1')) nextWinter();
    return;
  }
  if (G.mode === 'over') {
    if (startKey || Input.pressed('KeyR')) startRun(G.gameType);
    else if (Input.pressed('Digit1')) startRun('winter');
    else if (Input.pressed('Digit2')) startRun('endless');
    return;
  }
  if (G.mode === 'dying') { return; }
  if (G.mode === 'paused') {
    if (Input.pressed('KeyP') || Input.pressed('Escape') || startKey) G.mode = 'play';
    else if (Input.pressed('KeyR')) startRun(G.gameType);
    return;
  }
  if (G.mode === 'levelup') {
    for (let i = 0; i < G.choices.length; i++) {
      if (Input.pressed('Digit' + (i + 1)) || Input.pressed('Numpad' + (i + 1))) { applyUpgrade(G.choices[i]); return; }
    }
    return;
  }
  if (G.mode === 'play') {
    if (Input.pressed('Space')) tryDash();
    if (Input.pressed('KeyQ')) dropHoney();
    if (Input.pressed('KeyE')) useBait();
    if (Input.pressed('KeyP') || Input.pressed('Escape')) G.mode = 'paused';
  }
}

/* ===================== 15. 主循环 ===================== */

/** 自动演示 / 截图用：index.html?auto=1（会规避黄蜂、被追时舍蜜冲刺、满载回巢） */
function autopilot() {
  const cap = beeCap();
  const load = cap > 0 ? bee.honey / cap : 0;
  let chase = null, chaseD = 1e9;
  for (let i = 0; i < wasps.length; i++) {
    const w = wasps[i];
    if (w.readyT > 0 || w.state !== 'chase') continue;
    const d = dist(w.x, w.y, bee.x, bee.y);
    if (d < chaseD) { chaseD = d; chase = w; }
  }

  if (chaseD < 170 && bee.honey > cap * 0.3) dropHoney();
  if (chaseD < 240 && G.dashCharges > 0 && bee.honey >= DASH_COST) tryDash();

  let tx, ty;
  if (chaseD < Math.max(300, 180 + load * 260)) {
    // 优先钻花丛断视线，否则回巢
    let bush = null, bd = 1e9;
    for (let i = 0; i < bushes.length; i++) {
      const d = dist(bushes[i].x, bushes[i].y, bee.x, bee.y);
      if (d < bd) { bd = d; bush = bushes[i]; }
    }
    const hiveD = dist(HIVE.x, HIVE.y, bee.x, bee.y);
    if (bush && bd < hiveD * 0.8) { tx = bush.x; ty = bush.y; }
    else { tx = HIVE.x; ty = HIVE.y; }
  } else {
    let best = null, bs = -1e9;
    for (let i = 0; i < flowers.length; i++) {
      const f = flowers[i];
      if (f.type === 'poison') continue;
      const d = dist(bee.x, bee.y, f.x, f.y);
      let s = 260 - d + f.honey * 6 + (f.type === 'gold' ? 260 : 0);
      for (let j = 0; j < wasps.length; j++) {
        const w = wasps[j];
        if (w.readyT > 0) continue;
        const wd = dist(w.x, w.y, f.x, f.y);
        if (wd < 300) s -= (300 - wd) * (w.state === 'patrol' ? 1.6 : 3);
      }
      if (s > bs) { bs = s; best = f; }
    }
    if (load >= 0.7 || !best) { tx = HIVE.x; ty = HIVE.y; }
    else { tx = best.x; ty = best.y; }
  }

  Input.pointer.x = tx; Input.pointer.y = ty;
  Input.pointer.sx = tx - cam.x + VIEW_W / 2;
  Input.pointer.sy = ty - cam.y + VIEW_H / 2;
  Input.pointer.active = true;
}

let lastT = 0;

/** 单帧推进（与 rAF 解耦，便于预热 / 自动化测试） */
function stepOnce(dtReal) {
  computeThreat(dtReal);
  handleKeys();

  // 过冬小结：自动计时进入下一个冬天（点在 updateWorld 之外，因为小结期间世界是暂停的）
  if (G.mode === 'winterend') {
    G.winterEndT -= dtReal;
    if (G.winterEndT <= 0) nextWinter();
  }
  // 演示模式：死亡自动重开、升级自动选择，方便截图与观赏（index.html?showcase=1）
  if (G.showcase) {
    if (G.mode === 'over') { startRun(G.gameType === 'winter' ? 'winter' : 'endless'); G.showcase = true; G.autopilot = true; }
    else if (G.mode === 'levelup') {
      G.showcaseT -= dtReal;
      if (G.showcaseT <= 0) applyUpgrade(G.choices[Math.floor(Math.random() * G.choices.length)]);
    }
    // winterend 不需要特殊处理：过冬小结会自动进入下一个冬天
  }
  if (G.autopilot && G.mode === 'play') autopilot();

  if (G.mode === 'play' || G.mode === 'dying') {
    const scale = G.mode === 'dying' ? 0.25 : 1;
    updateWorld(dtReal * scale);
    G.t += dtReal;
    if (G.mode === 'dying') {
      G.deathT += dtReal;
      if (G.deathT > 0.55) { G.mode = 'over'; computeResult(); }
    }
  } else {
    G.worldT += dtReal;
    G.t += dtReal;
    if (G.mode === 'title') {   // 标题：绕巢盘旋演示
      const a = G.t * 0.6;
      bee.x = HIVE.x + Math.cos(a) * 200;
      bee.y = HIVE.y + Math.sin(a) * 150;
      bee.ang = a + Math.PI / 2;
      bee.wingPhase += dtReal * 22;
    }
    for (let i = 0; i < wasps.length; i++) wasps[i].wingPhase += dtReal * 18;
  }

  camUpdate(dtReal);
  render();
  Input._clear();
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!lastT) lastT = now;
  const dtReal = clamp((now - lastT) / 1000, 0, 1 / 20);
  lastT = now;
  G.frames++;
  stepOnce(dtReal);
}

function boot() {
  setupCanvas();
  newGame();
  // ?auto=1 → 自动演示（截图 / 观赏）；?warm=N → 启动时先离线推进 N 帧
  if (typeof location !== 'undefined' && location.search) {
    const q = location.search;
    const wantWinter = q.indexOf('mode=winter') >= 0;
    if (q.indexOf('auto=1') >= 0) { startRun(wantWinter ? 'winter' : 'endless'); G.autopilot = true; }
    if (q.indexOf('showcase=1') >= 0) {
      startRun(wantWinter ? 'winter' : 'endless');
      G.autopilot = true; G.showcase = true; G.showcaseT = 1.6;
    }
    const m = /[?&]warm=(\d+)/.exec(q);
    if (m) {
      const n = Math.min(20000, parseInt(m[1], 10) || 0);
      for (let i = 0; i < n; i++) { G.frames++; stepOnce(1 / 60); }
    }
  }
  requestAnimationFrame(function (t) { lastT = t; requestAnimationFrame(frame); });
}

/* 调试接口（自动化冒烟测试 / 调参用） */
if (typeof window !== 'undefined') {
  window.__BEE__ = {
    state: function () {
      const n = nearestWaspInfo();
      let chasing = 0, alerting = 0, patrolling = 0;
      for (let i = 0; i < wasps.length; i++) {
        const s = wasps[i].state;
        if (s === 'chase') chasing++;
        else if (s === 'alert') alerting++;
        else if (s === 'patrol') patrolling++;
      }
      return {
        mode: G.mode, score: Math.round(G.score), honey: bee.honey, cap: beeCap(),
        lives: G.lives, returns: G.returns, trips: G.trips, level: G.level, exp: G.exp,
        flowers: flowers.length, wasps: wasps.length, phase: phase().name,
        bee: { x: bee.x, y: bee.y, vx: bee.vx, vy: bee.vy },
        threat: {
          tier: THREAT.tier, tierName: TIER_NAME[THREAT.tier], intensity: +THREAT.intensity.toFixed(3),
          nearest: n.w ? +n.d.toFixed(1) : -1,
          nearestState: n.w ? n.w.state : 'none',
          danger: +dangerLevel().toFixed(3),
          chasing: chasing, alerting: alerting, patrolling: patrolling,
          inSafe: dist(bee.x, bee.y, HIVE.x, HIVE.y) < SAFE_R,
        },
        rainLeft: G.rainLeft, combo: G.combo, ratioSum: G.ratioSum, honeyTotal: G.honeyTotal,
        gold: bee.gold, goldTotal: G.goldTotal,
        gameType: G.gameType, winter: G.winter, winterT: +G.winterT.toFixed(2), store: Math.round(G.store),
        quota: G.quota, quotaMet: G.quotaMet, wintersCleared: G.wintersCleared,
        baitT: +G.baitT.toFixed(2), decoy: !!G.decoy, baitReady: !!G.decoy,
        drops: drops.length, dashCharges: G.dashCharges, ddt: JSON.parse(JSON.stringify(G.ddt)),
        speed: +beeSpeedNow().toFixed(1),
        result: G.result || null, choices: G.choices.map(function (u) { return u.id; }),
        frames: G.frames, aliveT: G.aliveT, worldT: G.worldT, autopilot: G.autopilot,
        hudRowEnd: G.hudRowEnd || 0,
        fitWarnings: fitWarnings.slice(0, 8), fitWarnCount: fitWarnings.length,
        renderStage: G.renderStage || '?',
        upg: JSON.parse(JSON.stringify(G.upg)),
      };
    },
    api: {
      newGame: newGame, startRun: startRun, dropHoney: dropHoney, tryDash: tryDash,
      useBait: useBait, finishWinter: finishWinter, nextWinter: nextWinter,
      setWinterT: function (t) { G.winterT = t; },
      setStore: function (v) { G.store = v; },
      setQuota: function (v) { G.quota = v; },
      winterQuota: winterQuota,
      /** 布局探针：用与升级卡片相同的排版参数，检查每张卡的文字是否放得下 */
      measureCards: function () {
        const cw = 400;
        return UPGRADES.map(function (u) {
          const nameSz = fitSize(u.name, cw - 48, 40, '800');
          const descSz = 23;
          const lines = wrapLines(u.desc, cw - 64, descSz, '700');
          let maxW = 0;
          for (let i = 0; i < lines.length; i++) maxW = Math.max(maxW, measure(lines[i], descSz, '700'));
          return {
            id: u.id, nameSize: nameSz, nameFits: nameSz >= 40,
            descLines: lines.length, descMaxW: +maxW.toFixed(1), descMaxAllowed: cw - 64,
            descFits: lines.length <= 4 && maxW <= cw - 64,
            tagFits: measure(u.tag, 20, '800') <= 88,
          };
        });
      },
      best: function () { return Best.data; },
      /** 直接获得强化（测试用，跳过抽卡流程） */
      grant: function (id, n) {
        const u = UPGRADES.filter(function (x) { return x.id === id; })[0];
        if (!u) return null;
        for (let i = 0; i < (n || 1); i++) applyUpgrade(u);
        return G.upg[id] || 0;
      },
      setReturns: function (n) { G.returns = n; while (wasps.length < waspCount()) spawnWasp(); },
      addScore: addScore, gainExp: gainExp,
      levelUp: function () { G.exp = expNeed(G.level); gainExp(0); },
      expNeed: expNeed,
      choose: function (i) { if (G.choices[i]) applyUpgrade(G.choices[i]); },
      setHoney: function (v) { bee.honey = clamp(v, 0, beeCapMax()); },
      setPos: function (x, y) { bee.x = x; bee.y = y; },
      clearPointer: function () { Input.pointer.active = false; Input.pointer.x = HIVE.x; Input.pointer.y = HIVE.y; },
      hitPoison: function () { var f = null; for (var i = 0; i < flowers.length; i++) if (flowers[i].type === 'poison') f = flowers[i]; if (f) hitPoison(f); },
      catchNow: function () { G.invuln = 0; caught(wasps[0] || { x: bee.x, y: bee.y }); },
      kill: function () { G.lives = 0; G.invuln = 0; caught(wasps[0] || { x: bee.x, y: bee.y }); },
      rain: function () { G.rainT = 0.001; },
      wasps: function () { return wasps; },
      flowers: function () { return flowers; },
      bushes: function () { return bushes; },
      drops: function () { return drops; },
      forceFlower: function (t) { return spawnFlower(t); },
      step: function (dt) { stepOnce(dt || 1 / 60); },
      hive: function () { return { x: HIVE.x, y: HIVE.y, r: HIVE.r, safe: SAFE_R }; },
      world: function () { return { w: WORLD_W, h: WORLD_H }; },
      camera: function () { return cam; },
    },
  };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}

})();
