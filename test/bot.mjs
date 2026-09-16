/* 会逃命、会绕路、会用花丛的"合格玩家"机器人：冒烟测试与平衡测量共用。
   设计目标：不是打得好，而是像真人一样做决策 —— 避开巡逻黄蜂、载蜜越重越早撤、
   被追时先丢蜜/冲刺、优先钻花丛断视线。                                          */

export function makeBot(HIVE) {
  return function playBot(BEE, api) {
    const st = BEE.state();
    const cap = st.cap;
    const t = st.threat;
    const flowers = api.flowers();
    const wasps = api.wasps();
    const bushes = api.bushes ? api.bushes() : [];
    const bx = st.bee.x, by = st.bee.y;
    const load = st.honey / cap;

    const chasing = wasps.filter((w) => w.state === 'chase' && w.readyT <= 0);
    const nearestChase = chasing.length
      ? Math.min(...chasing.map((w) => Math.hypot(w.x - bx, w.y - by)))
      : Infinity;
    const live = wasps.filter((w) => w.readyT <= 0);

    // 保命：被贴脸时先丢蜜再冲刺
    if (nearestChase < 170 && st.honey > cap * 0.3) api.dropHoney();
    if (nearestChase < 240 && st.dashCharges > 0 && st.honey >= 30) api.tryDash();

    // 被追：载蜜越重越早撤；优先钻花丛（黄蜂失去目标），否则回巢
    if (nearestChase < Math.max(300, 180 + load * 260)) {
      let bestBush = null, bd = 1e9;
      for (const b of bushes) {
        const d = Math.hypot(b.x - bx, b.y - by);
        if (d < bd) { bd = d; bestBush = b; }
      }
      const hiveD = Math.hypot(HIVE.x - bx, HIVE.y - by);
      if (bestBush && bd < hiveD * 0.8) return { tx: bestBush.x, ty: bestBush.y };
      return { tx: HIVE.x, ty: HIVE.y };
    }

    // 巡逻黄蜂贴太近：侧向绕开
    let avoidX = 0, avoidY = 0;
    for (const w of live) {
      const d = Math.hypot(w.x - bx, w.y - by);
      if (d < 260 && d > 1) {
        const wgt = (260 - d) / 260;
        avoidX += (bx - w.x) / d * wgt * 420;
        avoidY += (by - w.y) / d * wgt * 420;
      }
    }

    // 选花：距离 + 蜜量 - 黄蜂威胁惩罚（外环赚得多，但被守得也凶）
    let best = null, bs = -1e9;
    for (const f of flowers) {
      if (f.type === 'poison') continue;
      const d = Math.hypot(f.x - bx, f.y - by);
      let s = 260 - d + f.honey * 6 + (f.type === 'gold' ? 260 : 0);
      for (const w of live) {
        const wd = Math.hypot(w.x - f.x, w.y - f.y);
        const danger = w.state === 'chase' ? 2 : w.state === 'alert' ? 1.4 : 1;
        if (wd < 300) s -= (300 - wd) * 2.2 * danger;
      }
      if (s > bs) { bs = s; best = f; }
    }

    let goHome = load >= 0.7 || (t.alerting > 0 && load > 0.3) || !best;
    if (!goHome && best) {
      for (const w of live) {
        if (w.state === 'alert' && Math.hypot(w.x - best.x, w.y - best.y) < 220) goHome = true;
      }
    }
    if (st.inSafe && st.honey > 0.5) goHome = true;
    if (goHome) return { tx: HIVE.x, ty: HIVE.y };
    return { tx: best.x + avoidX, ty: best.y + avoidY };
  };
}
