/* 平衡测量：让一个"会逃命"的机器人替真人打若干局，统计威胁密度与经济效率。
   运行：node test/balance.mjs [每局分钟数] [局数]
   输出：危险时间占比、遭遇频率、死亡频率、平均每趟载蜜率、每分钟收益、风险梯度等。
   用法：改 game.js 常量后重跑，对比数字判断改动是否有效。                        */
import { loadGame, HIVE } from './harness.mjs';
import { makeBot } from './bot.mjs';

const MINUTES = Number(process.argv[2] || 5);
const RUNS = Number(process.argv[3] || 4);
const FRAMES_PER_MIN = 60 * 60;
const bot = makeBot(HIVE);

const agg = {
  frames: 0, deaths: 0, returns: 0, honey: 0, score: 0, level: 0, ratioSum: 0, trips: 0,
  dNear: [], farThan400: 0, in400: 0, in250: 0, in120: 0,
  anyChase: 0, anyAlert: 0, inSafe: 0, dangerSum: 0,
  engagements: 0, prevChase: false,
  maxWasps: 0, tier: [0, 0, 0, 0], greed: 0, sessions: 0,
  band: [{ n: 0, chase: 0, alert: 0, d: 0 }, { n: 0, chase: 0, alert: 0, d: 0 }, { n: 0, chase: 0, alert: 0, d: 0 }],
  goldGot: 0, goldLost: 0,
};

for (let run = 0; run < RUNS; run++) {
  const { BEE, api, step, movePointerTo } = loadGame();
  api.startRun();
  step(16.6667, 2);
  agg.sessions++;

  const frames = MINUTES * FRAMES_PER_MIN;
  for (let i = 0; i < frames; i++) {
    const st = BEE.state();
    if (st.mode === 'over') { agg.deaths++; api.startRun(); step(16.6667, 2); agg.sessions++; continue; }
    if (st.mode === 'levelup') { api.choose(0); step(16.6667, 1); agg.level++; continue; }
    if (st.mode !== 'play') { step(16.6667, 1); continue; }

    const { tx, ty } = bot(BEE, api);
    movePointerTo(tx, ty);
    step(16.6667);

    const s = BEE.state();
    const t = s.threat;
    agg.frames++;
    agg.tier[t.tier]++;
    agg.dNear.push(t.nearest);
    if (t.nearest > 400) agg.farThan400++; else agg.in400++;
    if (t.nearest <= 250) agg.in250++;
    if (t.nearest <= 120) agg.in120++;
    if (t.chasing > 0) agg.anyChase++;
    if (t.alerting > 0) agg.anyAlert++;
    if (t.inSafe) agg.inSafe++;
    agg.dangerSum += t.danger;
    // 按"玩家离蜂巢的距离"分档：这才是玩家真正体验到的危险分布
    const hd = Math.hypot(s.bee.x - HIVE.x, s.bee.y - HIVE.y);
    const bi = hd < 250 ? 0 : hd < 450 ? 1 : 2;
    agg.band[bi].n++;
    agg.band[bi].d += t.nearest;
    if (t.chasing > 0) agg.band[bi].chase++;
    if (t.alerting > 0) agg.band[bi].alert++;
    if (s.bee.gold !== undefined) agg.goldGot = Math.max(agg.goldGot, s.bee.gold);
    agg.maxWasps = Math.max(agg.maxWasps, s.wasps);
    const isChase = t.chasing > 0;
    if (isChase && !agg.prevChase) agg.engagements++;
    agg.prevChase = isChase;
  }

  const fin = BEE.state();
  agg.returns += fin.returns;
  agg.honey += fin.honeyTotal;
  agg.score += fin.score;
  agg.ratioSum += fin.ratioSum;
  agg.trips += fin.trips;
  agg.greed += fin.greed !== undefined ? fin.greed : 0;
  agg.goldGot += fin.goldTotal || 0;
}

const pct = (n) => (n / agg.frames * 100).toFixed(1) + '%';
const sorted = agg.dNear.slice().sort((a, b) => a - b);
const q = (p) => sorted[Math.floor(sorted.length * p)];
const minutes = agg.frames / FRAMES_PER_MIN;

/* --- 风险梯度：各环花朵最近的黄蜂距离（内环应明显比外环安全） --- */
const ringStat = { inner: [], mid: [], outer: [], gold: [] };
{
  const { BEE, api, step } = loadGame();
  api.startRun();
  api.setReturns(12);
  for (let i = 0; i < 60 * 60 * 2; i++) {
    step(16.6667);
    const st = BEE.state();
    if (st.mode === 'levelup') api.choose(0);
    if (st.mode === 'over') { api.startRun(); api.setReturns(12); }
    if (i % 20) continue;
    const ws = api.wasps().filter((w) => w.readyT <= 0);
    if (!ws.length) continue;
    for (const f of api.flowers()) {
      let d = 1e9;
      for (const w of ws) d = Math.min(d, Math.hypot(w.x - f.x, w.y - f.y));
      if (ringStat[f.type]) ringStat[f.type].push(d);
    }
  }
}
const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : -1);

console.log('=== 平衡报告（' + RUNS + ' 局 × ' + MINUTES + ' 分钟，合格玩家机器人）===');
console.log('总游戏时长            ' + minutes.toFixed(1) + ' 分钟（含 ' + agg.sessions + ' 次开局）');
console.log('黄蜂数量峰值          ' + agg.maxWasps + '（上限 6，同时追击上限 2）');
console.log('');
console.log('--- 威胁密度 ---');
console.log('最近黄蜂距离 中位数   ' + q(0.5) + ' px    25%/75%: ' + q(0.25) + ' / ' + q(0.75) + ' px');
console.log('时间占比  400px 内    ' + pct(agg.in400) + '   （>400px：' + pct(agg.farThan400) + '）');
console.log('时间占比  250px 内    ' + pct(agg.in250));
console.log('时间占比  120px 内    ' + pct(agg.in120));
console.log('档位分布  安全/邻近/警觉/追击   ' +
  (agg.tier[0] / agg.frames * 100).toFixed(1) + '% / ' + (agg.tier[1] / agg.frames * 100).toFixed(1) + '% / ' +
  (agg.tier[2] / agg.frames * 100).toFixed(1) + '% / ' + (agg.tier[3] / agg.frames * 100).toFixed(1) + '%');
console.log('时间占比  有黄蜂追击  ' + pct(agg.anyChase));
console.log('时间占比  有黄蜂警觉  ' + pct(agg.anyAlert));
console.log('时间占比  蜂巢安全区内 ' + pct(agg.inSafe));
console.log('平均危险强度          ' + (agg.dangerSum / agg.frames).toFixed(3) + '（0=安全，1=贴脸；音频/暗角强度）');
console.log('遭遇（进入追击）次数  ' + agg.engagements + '   → ' + (agg.engagements / minutes).toFixed(2) + ' 次/分钟');
console.log('');
console.log('--- 风险梯度（各环花朵最近的黄蜂距离，越高越安全） ---');
console.log('内环花 ' + avg(ringStat.inner) + ' px   中环花 ' + avg(ringStat.mid) +
            ' px   外环花 ' + avg(ringStat.outer) + ' px   金花 ' + avg(ringStat.gold) + ' px');
console.log('--- 玩家所处位置的威胁（真正决定体验） ---');
for (let b = 0; b < 3; b++) {
  const x = agg.band[b];
  const name = b === 0 ? '蜂巢 250px 内 ' : b === 1 ? '中环 250-450  ' : '外环 450px 外 ';
  if (!x.n) { console.log(name + '：样本不足'); continue; }
  console.log(name + '：占比 ' + (x.n / agg.frames * 100).toFixed(1) + '%　被追 ' + (x.chase / x.n * 100).toFixed(1) +
              '%　警觉 ' + (x.alert / x.n * 100).toFixed(1) + '%　平均最近黄蜂 ' + Math.round(x.d / x.n) + 'px');
}
console.log('');
console.log('--- 经济与结局 ---');
console.log('死亡次数              ' + agg.deaths + '   → ' + (agg.deaths / minutes).toFixed(2) + ' 次/分钟');
console.log('回巢次数              ' + agg.returns + '   → ' + (agg.returns / minutes).toFixed(2) + ' 次/分钟');
console.log('平均每趟载蜜率        ' + (agg.trips ? (agg.ratioSum / agg.trips * 100).toFixed(1) : 0) + '%');
console.log('采蜜总量              ' + Math.round(agg.honey) + '   → ' + Math.round(agg.honey / minutes) + ' 蜜/分钟');
console.log('总分                  ' + agg.score + '   → ' + Math.round(agg.score / minutes) + ' 分/分钟');
console.log('升级次数              ' + agg.level + '   → ' + (agg.level / minutes).toFixed(2) + ' 次/分钟');
console.log('金蜜收集              ' + Math.round(agg.goldGot) + '   → ' + Math.round(agg.goldGot / minutes) + ' 金蜜/分钟');
