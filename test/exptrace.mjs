/* 一次性诊断：跟踪经验/等级曲线是否符合预期 */
import { loadGame, HIVE } from './harness.mjs';
import { makeBot } from './bot.mjs';

const bot = makeBot(HIVE);
const { BEE, api, step, movePointerTo } = loadGame();
api.startRun();
step(16.6667, 2);

let levelUps = 0, lastLevel = 1;
const t0 = Date.now();
for (let i = 0; i < 60 * 60 * 6; i++) {
  const st = BEE.state();
  if (st.mode === 'levelup') {
    console.log('  [升级] t=' + (i / 60).toFixed(1) + 's  Lv' + st.level + '  exp=' + st.exp.toFixed(1) +
                '  选择=' + st.choices.join(',') + '  已获得=' + JSON.stringify(st.upg));
    api.choose(0);
    levelUps++;
    step(16.6667, 1);
    continue;
  }
  if (st.mode === 'over') { console.log('  [死亡] t=' + (i / 60).toFixed(1) + 's'); break; }
  const { tx, ty } = bot(BEE, api);
  movePointerTo(tx, ty);
  step(16.6667);
  if (i % 900 === 0) {
    const s = BEE.state();
    console.log('t=' + (i / 60).toFixed(0) + 's  Lv' + s.level + ' exp=' + s.exp.toFixed(1) + '/' + api.expNeed(s.level) +
                '  蜜=' + Math.round(s.honeyTotal) + ' 回巢=' + s.returns + ' 趟=' + s.trips +
                ' 升级次数=' + levelUps);
  }
}
const fin = BEE.state();
console.log('结束：存活 ' + fin.aliveT.toFixed(0) + 's  等级 ' + fin.level + '  升级 ' + levelUps + ' 次' +
            '  采蜜 ' + Math.round(fin.honeyTotal) + '  回巢 ' + fin.returns + '  死亡=' + (fin.mode === 'over'));
console.log('理论经验：蜜 ' + (fin.honeyTotal / 20).toFixed(1) + ' + 趟 ' + (fin.trips * 3) + ' + 满囊奖励若干');
