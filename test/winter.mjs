/* 冬季模式配额校准：让机器人以"囤够就收工"的最快方式过冬，
   测出每个冬天的实际通关时间。目标：首冬 ~75~105 秒（有压力但能过），
   第 3~4 个冬天成为墙（勉强过或过不去）。
   运行：node test/winter.mjs [局数] [每局上限分钟]                                  */
import { loadGame, HIVE } from './harness.mjs';
import { makeBot } from './bot.mjs';

const bot = makeBot(HIVE);
const RUNS = Number(process.argv[2] || 3);
const MAX_MIN = Number(process.argv[3] || 12);

const perWinter = {};
const summary = { runs: 0, clears: 0, fails: 0, deaths: 0 };

for (let run = 0; run < RUNS; run++) {
  const { BEE, api, step, movePointerTo } = loadGame();
  api.startRun('winter');
  api.clearPointer();
  step(16.6667, 2);
  summary.runs++;

  const limit = MAX_MIN * 60 * 60;
  for (let i = 0; i < limit; i++) {
    const st = BEE.state();
    if (st.mode === 'over') {
      if (st.result && st.result.reason === 'winter') summary.fails++; else summary.deaths++;
      console.log('  第 ' + run + ' 局结束：' + (st.result && st.result.reason === 'winter'
        ? ('冬季 ' + st.winter + ' 饿死（蜜仓 ' + st.store + '/' + st.quota + '）')
        : ('被黄蜂带走（冬季 ' + st.winter + '）')) + '　活过 ' + st.wintersCleared + ' 个冬天');
      break;
    }
    if (st.mode === 'winterend') {
      const n = st.winter, quota = st.quota, left = st.winterT, store = st.store;
      const rec = perWinter[n] || (perWinter[n] = { n: n, quota: quota, times: [], surplus: [] });
      rec.times.push(120 - left);
      rec.surplus.push(Math.max(0, Math.round(store) - quota));
      summary.clears++;
      api.nextWinter();
      step(16.6667, 2);
      continue;
    }
    if (st.mode === 'levelup') { api.choose(0); step(16.6667, 1); continue; }
    if (st.mode !== 'play') { step(16.6667, 1); continue; }
    // 囤够配额会由游戏自动结算（不需要手动收工），这里只管继续打
    const { tx, ty } = bot(BEE, api);
    movePointerTo(tx, ty);
    step(16.6667);
  }
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
console.log('=== 冬季配额校准（' + RUNS + ' 局，囤够即收工）===');
console.log('通关 ' + summary.clears + ' 个冬天　饿死 ' + summary.fails + ' 次　被抓死 ' + summary.deaths + ' 次');
console.log('');
console.log('冬天   配额   平均通关时间   最快   最慢   建议');
for (const k of Object.keys(perWinter).sort((a, b) => a - b)) {
  const r = perWinter[k];
  const t = avg(r.times);
  const verdict = t < 55 ? '太松（应上调配额）' : t < 75 ? '偏松' : t <= 112 ? '合适' : '偏紧';
  console.log('  ' + r.n + '    ' + String(r.quota).padEnd(6) + ' ' + t.toFixed(1).padStart(8) + 's' +
    '   ' + Math.min.apply(null, r.times).toFixed(0).padStart(5) + 's' +
    '  ' + Math.max.apply(null, r.times).toFixed(0).padStart(5) + 's   ' + verdict);
}
