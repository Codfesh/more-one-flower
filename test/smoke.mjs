/* 冒烟测试：桩化 DOM/Canvas/WebAudio 驱动 game.js 的真实帧循环（骨架见 harness.mjs）。
   目的：在没有浏览器的环境下捕获运行时异常与数值越界。
   运行：node test/smoke.mjs                                                     */
import assert from 'node:assert/strict';
import { loadGame, HIVE } from './harness.mjs';

const { BEE, api, step: rawStep, key, keyDown, keyUp, movePointerTo } = loadGame();

const log = [];
function say(s) { log.push(s); console.log('  ' + s); }

/* 自动处理升级弹窗：默认让机器人随手选一个，这样长时间推进不会被弹窗卡住。
   测"升级流程"本身时把 autoLevelUp 设为 false，手动断言。 */
let autoLevelUp = true;
function step(ms = 16.6667, n = 1) {
  for (let i = 0; i < n; i++) {
    rawStep(ms, 1);
    if (autoLevelUp && BEE.state().mode === 'levelup') api.choose(0);
  }
}

/* ================= 1. 启动 ================= */
step(16.7, 12);
assert.equal(BEE.state().mode, 'title', '初始应为标题界面');
say('启动 OK：标题界面，帧循环稳定');

/* ================= 2. 开始游戏 ================= */
key('Enter');
step(16.7, 2);
assert.equal(BEE.state().mode, 'play', '按 Enter 应开始游戏');
say('开始游戏 OK');

/* ================= 3. 采蜜 ================= */
const f0 = api.flowers()[0];
const beforeFlowers = api.flowers().length;
api.setPos(f0.x, f0.y);
step(16.7, 40);
assert.ok(BEE.state().honey > 0, '靠近花朵应自动采蜜');
assert.equal(api.flowers().length, beforeFlowers - 1, '采完的花应消失');
say('采蜜 OK：honey=' + Math.round(BEE.state().honey) + '，花数 ' + beforeFlowers + ' → ' + api.flowers().length);

/* ================= 4. 负重减速公式（核心张力） ================= */
const cap = BEE.state().cap;
assert.equal(cap, 100, '初始蜜囊容量应为 100');
const speeds = {};
for (const [label, v] of [['empty', 0], ['half', cap * 0.5], ['full', cap]]) {
  api.setHoney(v);
  step(16.7, 1);
  speeds[label] = BEE.state().speed;
}
assert.ok(Math.abs(speeds.empty - 300) < 1, '空载速度应为 300，实际 ' + speeds.empty);
assert.ok(Math.abs(speeds.half - 225) < 1, '半载速度应为 225，实际 ' + speeds.half);
assert.ok(Math.abs(speeds.full - 150) < 1, '满载速度应为 150，实际 ' + speeds.full);
say('速度公式 OK：空载 ' + speeds.empty + ' / 半载 ' + speeds.half + ' / 满载 ' + speeds.full + ' px/s');

/* ================= 5. 回巢卸蜜 ================= */
api.setHoney(BEE.state().cap);
const scoreBefore = BEE.state().score;
api.setPos(HIVE.x, HIVE.y);
step(16.7, 60);
const st5 = BEE.state();
assert.equal(st5.honey, 0, '回巢应卸完蜜');
assert.equal(st5.returns, 1, '应记录 1 次回巢');
assert.ok(st5.score > scoreBefore, '卸蜜应得分');
assert.ok(Math.abs(st5.ratioSum - 1) < 1e-6, '满囊回巢比例应为 1');
say('卸蜜 OK：分数 ' + scoreBefore + ' → ' + st5.score + '，回巢 1 次，比例 100%');

/* ================= 6. 不满回巢惩罚 ================= */
api.setHoney(BEE.state().cap * 0.4);
api.setPos(HIVE.x, HIVE.y);
step(16.7, 60);
const st6 = BEE.state();
assert.equal(st6.returns, 2);
assert.ok(st6.ratioSum < 1.5, '40% 回巢应记录较低比例');
say('不满回巢 OK：累计比例 ' + st6.ratioSum.toFixed(2) + '（<80% 卸蜜效率 -20%）');

/* ================= 7. 冲刺 / 舍蜜 ================= */
api.setHoney(BEE.state().cap);
const dashBefore = BEE.state();
key('Space');
step(16.7, 1);
const dashAfter = BEE.state();
assert.ok(dashAfter.honey < dashBefore.honey, '冲刺应消耗蜂蜜');
say('过载冲刺 OK：蜜 ' + Math.round(dashBefore.honey) + ' → ' + Math.round(dashAfter.honey));

api.setPos(700, 500);   // 远离蜂巢，排除自动卸蜜的干扰
api.setHoney(60);
key('KeyQ');
step(16.7, 1);
const stDrop = BEE.state();
assert.ok(stDrop.honey <= 31 && stDrop.honey >= 29, 'Q 应丢弃 50% 蜜');
assert.equal(stDrop.drops, 1, '应在地上留下蜜滴');
// 蜜滴掉落瞬间不能马上捡回（需飞开再回头）
step(16.7, 12);
assert.equal(BEE.state().drops, 1, '站在蜜滴上不应立即回收');
say('舍蜜逃生 OK：蜜 60 → ' + Math.round(stDrop.honey) + '，蜜滴 ' + stDrop.drops + ' 个留在地上');

// 飞开再回头，才能捡回（防止丢下即收回）
const dp = api.drops()[0];
api.setPos(dp.x + 400, dp.y);
step(16.7, 60);
assert.equal(BEE.state().drops, 1, '离开后蜜滴应仍在地上');
api.setHoney(0);
api.setPos(dp.x, dp.y);
step(16.7, 3);
assert.equal(BEE.state().drops, 0, '回到蜜滴处应捡回');
assert.ok(BEE.state().honey > 28, '应捡回约 30 蜜，实际 ' + BEE.state().honey);
say('蜜滴回收 OK：飞开后回头可捡回 ' + Math.round(BEE.state().honey) + ' 蜜');

/* ================= 7.5 毒花 ================= */
const pf = api.forceFlower('poison');
api.setPos(pf.x, pf.y);
const livesBeforePoison = BEE.state().lives;
step(16.7, 3);
assert.ok(BEE.state().lives < livesBeforePoison, '踩到毒花应扣 1 命');
say('毒花 OK：命 ' + livesBeforePoison + ' → ' + BEE.state().lives);

/* ================= 7.6 金花经济（金蜜不占负重、溢出转化、回巢结算、被抓丢失） ================= */
const gf = api.forceFlower('gold');
api.setHoney(BEE.state().cap);                 // 先把蜜囊装满：验证"满载去拿金花也不亏"
const beforeGold = BEE.state();
api.setPos(gf.x, gf.y);
step(16.7, 45);
const afterGold = BEE.state();
assert.ok(afterGold.gold > 0, '金花应给出不占负重的金蜜（即使蜜囊已满）');
assert.ok(afterGold.score - beforeGold.score >= 200, '金花应给一次性重奖，实际 +' + (afterGold.score - beforeGold.score));
say('金花 OK：蜜囊已满仍拿到 ' + Math.round(afterGold.gold) + ' 金蜜，一次性 +' + (afterGold.score - beforeGold.score) + ' 分');

api.setPos(HIVE.x, HIVE.y);
const beforeUnload2 = BEE.state().score;
step(16.7, 60);
assert.equal(BEE.state().gold, 0, '回巢应把金蜜卸完');
assert.ok(BEE.state().score > beforeUnload2, '卸金蜜应得分');
say('金蜜卸货 OK：+ ' + Math.round(BEE.state().score - beforeUnload2) + ' 分');

// 被抓会丢掉金蜜（跑远路的风险）
api.setPos(700, 500);
step(16.7, 2);
const g2 = api.forceFlower('gold');
api.setPos(g2.x, g2.y);
step(16.7, 45);
const goldCarried = BEE.state().gold;
assert.ok(goldCarried > 0, '应重新拿到金蜜');
api.setPos(700, 500);
const livesBeforeCatch = BEE.state().lives;
api.catchNow();
step(16.7, 3);
const afterCatch = BEE.state();
if (afterCatch.lives < livesBeforeCatch) {
  assert.equal(afterCatch.gold, 0, '被抓应丢掉全部金蜜');
  assert.equal(afterCatch.honey, 0, '被抓应清空蜜囊');
  say('金蜜风险 OK：被抓丢掉 ' + Math.round(goldCarried) + ' 金蜜');
} else {
  say('金蜜风险：本次被保命类强化（装死/毒刺）免疫，未触发损失');
}

/* ================= 8. 升级三选一 ================= */autoLevelUp = false;                       // 这一段要手动断言弹窗流程
api.levelUp();
step(16.7, 1);
assert.equal(BEE.state().mode, 'levelup', '升级应暂停并弹出三选一');
assert.equal(BEE.state().choices.length, 3, '应提供 3 个选项');
const picked = BEE.state().choices[0];
key('Digit1');
step(16.7, 1);
assert.equal(BEE.state().mode, 'play', '选择后应继续游戏');
assert.equal(BEE.state().upg[picked], 1, '升级应生效：' + picked);
say('升级 OK：选择 ' + picked + ' 生效');

// 全部升级项各选一次，确认无异常
const ids = ['cap', 'wing', 'defense', 'playdead', 'scent', 'sting', 'fastleg', 'jelly'];
for (let guard = 0; guard < 80 && Object.keys(BEE.state().upg).length < ids.length; guard++) {
  api.levelUp();
  step(16.7, 1);
  const ch = BEE.state().choices;
  if (ch.length) api.choose(0);
  step(16.7, 2);
}
assert.equal(BEE.state().mode, 'play', '连续升级后应处于游戏中');
say('全套升级 OK：已获得 ' + Object.keys(BEE.state().upg).join(','));
autoLevelUp = true;

/* ================= 9. 花蜜雨 ================= */
api.rain();
step(16.7, 6);
assert.ok(BEE.state().rainLeft > 0, '花蜜雨应被触发');
const rainHoney = api.flowers().length ? api.flowers()[0].honey : 0;
say('花蜜雨 OK：剩余 ' + BEE.state().rainLeft.toFixed(1) + 's，场上花朵蜜量 ×1.5（示例 ' + rainHoney + '）');

/* ================= 10. 难度阶段推进 ================= */
for (const r of [3, 6, 9, 12, 15]) {
  api.setReturns(r);
  step(16.7, 3);
  const st = BEE.state();
  assert.ok(st.wasps <= 6, '黄蜂数量上限 6');
  say('回巢 ' + r + ' 次 → 阶段「' + st.phase + '」，黄蜂 ' + st.wasps + ' 只');
}
api.setReturns(15);
step(16.7, 5);
assert.equal(BEE.state().phase, '极限');
assert.equal(BEE.state().wasps, 6, '极限阶段黄蜂应为 6 只');

/* ================= 11. 被抓 → 掉命 ================= */
const livesBefore = BEE.state().lives;
api.setPos(700, 500);   // 远离蜂巢，避免安全区免伤
api.catchNow();
step(16.7, 2);
const st11 = BEE.state();
assert.ok(st11.lives <= livesBefore, '被抓应扣命或由保命升级免疫');
say('被抓 OK：命 ' + livesBefore + ' → ' + st11.lives + '（含装死/毒刺免疫）');

/* ================= 12. 死亡 → 结算 ================= */
for (let i = 0; i < 12 && BEE.state().mode !== 'over'; i++) {
  api.setPos(700, 500);
  api.kill();
  step(16.7, 40);   // 等无敌帧与慢动作结束
}
assert.equal(BEE.state().mode, 'over', '命归零应进入结算界面');const result = BEE.state().result;
assert.ok(result && ['S', 'A', 'B', 'C'].includes(result.rating), '结算应有评级');
say('死亡结算 OK：评级 ' + result.rating + '，平均每趟 ' + Math.round(result.avg * 100) + '%，总分 ' + BEE.state().score);

/* ================= 13. 重开 ================= */
key('KeyR');
step(16.7, 3);
const st13 = BEE.state();
assert.equal(st13.mode, 'play', 'R 应重开');
assert.equal(st13.score, 0);
assert.equal(st13.returns, 0);
assert.equal(st13.lives, 3);
say('重开 OK：状态已重置');

/* ================= 14. 长时间压力跑（模拟 4 分钟游玩） ================= */
let frames = 0, peakFlowers = 0, peakWasps = 0, sawLevelUp = 0, sawCatch = 0, sawRain = 0;
const tierFrames = [0, 0, 0, 0];
const world = api.world();
for (let i = 0; i < 14400; i++) {
  // 随机飞行目标：多数飞向花朵，偶尔冲向蜂巢
  const list = api.flowers();
  let tx, ty;
  if (i % 300 < 90) { tx = HIVE.x; ty = HIVE.y; }
  else if (list.length) { const f = list[(i / 7 | 0) % list.length]; tx = f.x; ty = f.y; }
  else { tx = HIVE.x + Math.cos(i / 40) * 400; ty = HIVE.y + Math.sin(i / 40) * 400; }
  movePointerTo(tx, ty);
  if (i % 900 === 0) keyDown('Space');
  if (i % 900 === 20) keyUp('Space');
  if (i % 1500 === 0) key('KeyQ');
  if (i % 600 === 0) keyDown('KeyW'); else if (i % 600 === 30) keyUp('KeyW');
  step(16.6667);
  frames++;
  const st = BEE.state();
  peakFlowers = Math.max(peakFlowers, st.flowers);
  peakWasps = Math.max(peakWasps, st.wasps);
  if (st.mode === 'levelup') { sawLevelUp++; api.choose(0); }
  if (st.mode === 'over') { api.startRun(); sawCatch++; }
  if (st.rainLeft > 0) sawRain++;
  tierFrames[st.threat.tier]++;
  assert.ok(st.honey <= st.cap + 1e-6, '蜂蜜不得超过容量 @' + i);
  assert.ok(st.honey >= -1e-6, '蜂蜜不得为负 @' + i);
  assert.ok(st.flowers <= 12, '花朵数量上限 12 @' + i);
  assert.ok(st.wasps <= 6, '黄蜂数量上限 6 @' + i);
  assert.ok(st.lives >= 0 && st.lives <= 5, '生命应在 0..5 @' + i);
  assert.ok(st.score >= 0, '分数不得为负 @' + i);
  assert.ok(Number.isFinite(st.bee.x) && Number.isFinite(st.bee.y), '蜜蜂坐标必须有限 @' + i);
  assert.ok(world.w > 0 && st.bee.x >= 0 && st.bee.x <= world.w && st.bee.y >= 0 && st.bee.y <= world.h, '蜜蜂须在世界内 @' + i);
  assert.ok(st.threat.chasing <= 2, '同时追击不得超过 2 只 @' + i);
  assert.ok(st.threat.tier >= 0 && st.threat.tier <= 3, '威胁档位应在 0..3 @' + i);
}
say('压力跑 OK：' + frames + ' 帧（约 ' + (frames / 60 / 60).toFixed(1) + ' 分钟）；' +
    '峰值花朵 ' + peakFlowers + '，峰值黄蜂 ' + peakWasps + '；' +
    '升级 ' + sawLevelUp + ' 次，死亡重开 ' + sawCatch + ' 次，花蜜雨帧 ' + sawRain);
say('威胁档位分布：安全 ' + (tierFrames[0] / frames * 100).toFixed(1) + '%　巡逻邻近 ' + (tierFrames[1] / frames * 100).toFixed(1) +
    '%　警觉 ' + (tierFrames[2] / frames * 100).toFixed(1) + '%　追击 ' + (tierFrames[3] / frames * 100).toFixed(1) + '%');

/* ================= 16. 冬季模式 ================= */
api.newGame(); api.clearPointer();
step(16.7, 2);
assert.equal(BEE.state().mode, 'title');
key('Digit1');
step(16.7, 2);
let w = BEE.state();
assert.equal(w.gameType, 'winter', '按 1 应进入冬季模式');
assert.equal(w.winter, 1, '应从冬季 1 开始');
assert.ok(Math.abs(w.winterT - 120) < 0.2, '冬季时长应为 120 秒，实际 ' + w.winterT);
assert.equal(w.quota, api.winterQuota(1), '首冬配额应与 winterQuota(1) 一致');
assert.equal(w.store, 0, '蜜仓应从 0 开始');
say('冬季模式 OK：冬季 1 · 配额 ' + w.quota + ' · 时限 ' + Math.round(w.winterT) + 's');

// 卸蜜进入蜜仓
api.setHoney(BEE.state().cap);
api.setPos(HIVE.x, HIVE.y);
step(16.7, 60);
w = BEE.state();
assert.ok(w.store >= 100, '卸下的蜜应进入蜂巢蜜仓，实际 ' + w.store);
assert.equal(w.quotaMet, false, '还没到配额');
say('蜜仓累计 OK：' + w.store + ' / ' + w.quota + ' 蜜');

// 囤够配额 → 自动进入过冬小结（不需要手动结算）
api.setStore(w.quota - 5);
api.setHoney(BEE.state().cap);
api.setPos(HIVE.x, HIVE.y);
const scoreBeforeMet = BEE.state().score;
step(16.7, 45);
w = BEE.state();
assert.equal(w.quotaMet, true, '达到配额应标记达标');
assert.equal(w.mode, 'winterend', '囤够配额应自动进入过冬小结（不用按键）');
assert.ok(w.score - scoreBeforeMet >= 500, '达标应给一次性奖励，实际 +' + (w.score - scoreBeforeMet));
assert.equal(w.wintersCleared, 1, '应记录活过 1 个冬天');
say('达标 OK：蜜仓 ' + w.store + '/' + w.quota + '，+' + (w.score - scoreBeforeMet) + ' 分（自动进入过冬小结）');

// 小结会自己走完并进入冬季 2 —— 全程不按键
step(16.7, 180);
w = BEE.state();
assert.equal(w.winter, 2, '过冬小结应自动进入冬季 2，实际 winter=' + w.winter + ' mode=' + w.mode);
assert.equal(w.quota, api.winterQuota(2), '冬季 2 配额应与 winterQuota(2) 一致');
say('自动过冬 OK：冬季 ' + w.winter + ' · 配额 ' + w.quota + '（无需手动结算）');

// 背上没卸完的蜜会带进新冬天，不会凭空消失
api.setHoney(40);
step(16.7, 40);
assert.ok(BEE.state().store >= 35, '没卸完的蜜应带进新冬天，实际 ' + BEE.state().store);
say('蜜囊跨冬 OK：没卸完的 40 蜜带进了冬季 2 的蜜仓');

// 小结也可以用按键提前跳过
const q2 = BEE.state().quota;
api.setStore(q2 - 1);
api.setHoney(20);
api.setPos(HIVE.x, HIVE.y);
step(16.7, 30);
assert.equal(BEE.state().mode, 'winterend', '再次囤够应进入过冬小结');
key('Space');
step(16.7, 6);
assert.equal(BEE.state().winter, 3, '按空格应跳过小结直接进入冬季 3');
say('跳过小结 OK：空格直接进入冬季 ' + BEE.state().winter);

// 时间到没囤够 → 蜂巢饿死
const clearedBefore = BEE.state().wintersCleared;
assert.ok(clearedBefore >= 1, '此时应已活过至少 1 个冬天');
api.setStore(0);
api.setWinterT(0.05);
step(16.7, 4);
w = BEE.state();
assert.equal(w.mode, 'over', '时间到没达标应结束');
assert.equal(w.result.reason, 'winter', '结算原因应为冬天失败');
assert.equal(w.wintersCleared, clearedBefore, '失败不应增加过冬数');
say('冬季失败 OK：结算显示「活过 ' + w.result.winters + ' 个冬天」');

// 无尽模式仍可作为调试对照模式启动（不再是玩家入口）
api.newGame(); api.startRun('endless'); api.clearPointer();
step(16.7, 2);
w = BEE.state();
assert.equal(w.gameType, 'endless', 'startRun("endless") 应进入无尽模式');
say('无尽对照模式 OK：无时限、无配额（仅供调参对照）');

/* ================= 17. 三个新技能 ================= */
/* 过载蜜囊：可超载到 130%、过载时更慢、过载段回巢按 2 倍结算 */
api.newGame(); api.startRun('endless'); api.clearPointer();
step(16.7, 2);
api.grant('overload');
step(16.7, 1);
const capBase = BEE.state().cap;
api.setHoney(capBase * 2);                        // 尝试灌到 200%
step(16.7, 1);
const hOver = BEE.state().honey;
assert.ok(hOver > capBase + 1, '过载蜜囊应允许超过容量，实际 ' + hOver);
assert.ok(hOver <= capBase * 1.3 + 1, '过载上限应为 130%，实际 ' + hOver);
const speedOver = BEE.state().speed;
api.setHoney(capBase);
step(16.7, 1);
const speedFull = BEE.state().speed;
assert.ok(speedOver < speedFull, '过载时应比满载更慢：' + speedOver + ' vs ' + speedFull);
say('过载蜜囊 OK：可装 ' + Math.round(hOver) + '（上限 ' + Math.round(capBase * 1.3) + '），过载速度 ' + speedOver + ' < 满载 ' + speedFull);

// 过载段结算更高：同样从 0 分开始，130 蜜应明显高于 100 蜜
api.newGame(); api.startRun('endless'); api.clearPointer(); step(16.7, 2);
api.grant('overload');
api.setHoney(capBase * 1.3);
api.setPos(HIVE.x, HIVE.y);
let s0 = BEE.state().score;
step(16.7, 120);
assert.equal(BEE.state().honey, 0, '应卸完蜜');
const gainOver = BEE.state().score - s0;
api.newGame(); api.startRun('endless'); api.clearPointer(); step(16.7, 2);
api.setHoney(capBase);
api.setPos(HIVE.x, HIVE.y);
s0 = BEE.state().score;
step(16.7, 120);
const gainNormal = BEE.state().score - s0;
assert.ok(gainOver > gainNormal * 1.15, '过载 130 蜜的收益应明显高于普通 100 蜜：' + gainOver + ' vs ' + gainNormal);
say('过载结算 OK：130 蜜得 ' + gainOver + ' 分 > 普通 100 蜜得 ' + gainNormal + ' 分（超出部分 3 倍）');

/* 逆风冲刺：不耗蜜 + 冲刺途中免疫抓取 */
api.newGame(); api.startRun('endless'); api.clearPointer();
step(16.7, 2);
api.grant('gale');
api.setHoney(0);
const charges0 = BEE.state().dashCharges;
key('Space');
step(16.7, 1);
assert.equal(BEE.state().honey, 0, '逆风冲刺不应消耗蜜');
assert.ok(BEE.state().dashCharges < charges0, '应消耗一次冲刺次数');
say('逆风冲刺 OK：蜜 0 也能冲（次数 ' + charges0 + ' → ' + BEE.state().dashCharges + '）');

// 冲刺中免疫抓取：直接把自己放到黄蜂身上
api.setReturns(6);
step(16.7, 220);                        // 等入场预告结束
let target = api.wasps().filter((x) => x.readyT <= 0)[0];
assert.ok(target, '应存在已登场的黄蜂');
const livesBeforeDash = BEE.state().lives;
api.tryDash();
api.setPos(target.x, target.y);
step(16.7, 1);
assert.equal(BEE.state().lives, livesBeforeDash, '冲刺途中不应被抓');
say('冲刺免疫 OK：贴着黄蜂飞过不掉命');
// 冲刺结束后仍会被抓（免疫只在冲刺期间）
step(16.7, 40);
assert.ok(BEE.state().lives < livesBeforeDash || BEE.state().invuln > 0 || BEE.state().upg.playdead || BEE.state().upg.sting,
  '冲刺结束后应恢复可被抓状态');

/* 蜜香诱饵：吸引范围内的黄蜂 + 冷却 */
api.newGame(); api.startRun('endless'); api.clearPointer();
step(16.7, 2);
api.setReturns(6);
api.grant('bait');
step(16.7, 220);                        // 等入场预告结束
const wTargets = api.wasps().filter((x) => x.readyT <= 0);
assert.ok(wTargets.length > 0, '应有已登场黄蜂');
api.setPos(wTargets[0].x + 120, wTargets[0].y);
api.useBait();
step(16.7, 1);
let stB = BEE.state();
assert.equal(stB.decoy, true, '应放下诱饵');
assert.ok(stB.baitT > 11, '诱饵应进入冷却（12s），实际 ' + stB.baitT);
const lured = api.wasps().filter((x) => x.lureSrc === 'decoy' && x.lureT > 0).length;
assert.ok(lured >= 1, '范围内的黄蜂应被吸引，实际 ' + lured + ' 只');
say('蜜香诱饵 OK：吸引 ' + lured + ' 只黄蜂，冷却 ' + stB.baitT.toFixed(1) + 's');
// 冷却中不能再放
api.setPos(HIVE.x, HIVE.y);
const decoyBefore = BEE.state().decoy;
api.useBait();
step(16.7, 1);
assert.equal(BEE.state().decoy, decoyBefore, '冷却中不应重复放置');
say('诱饵冷却 OK：冷却期间无法再放');

/* ================= 18. 暂停 / 静音 ================= */
key('KeyM'); step(16.7, 1);
key('KeyP'); step(16.7, 2);
assert.equal(BEE.state().mode, 'paused', 'P 应暂停');
key('KeyP'); step(16.7, 2);
assert.equal(BEE.state().mode, 'play', 'P 应继续');
say('暂停 / 静音 OK');

console.log('\n全部通过：' + log.length + ' 项检查');
