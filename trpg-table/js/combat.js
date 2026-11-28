/* =========================================================
   combat.js —— 战斗区。
   「投先攻」：地图上每个棋子投 d20 + 先攻加值，按大小排顺序。
   「下一位」：轮到下一个，轮完一圈回合数 +1。
   每行右边的 − / + 调生命值，你的生命值和角色卡是同步的。
   ========================================================= */
(function (App) {
  const tokenOf = (id) => App.state.tokens.find((t) => t.id === id);
  const isPlayer = (t) => t.kind === "player";
  const hpOf = (t) => isPlayer(t) ? App.state.character.hp : t.hp;
  const maxOf = (t) => isPlayer(t) ? App.maxHp(App.state.character) : t.maxHp;

  function setHp(t, v) {
    v = Math.max(0, Math.min(maxOf(t), v));
    if (isPlayer(t)) App.state.character.hp = v; else t.hp = v;
  }

  function rollInitiative() {
    const c = App.state.combat;
    c.order = App.state.tokens.map((t) => {
      const bonus = isPlayer(t) ? (App.state.character.attrs.agi || 0) : (t.initBonus || 0);
      const d = 1 + Math.floor(Math.random() * 20);
      return { tokenId: t.id, init: d + bonus, d, bonus };
    }).sort((a, b) => b.init - a.init);
    c.active = true; c.round = 1; c.turn = 0;
    App.log(`<b>战斗开始！</b> 先攻顺序：${c.order.map((o) => `${App.esc(tokenOf(o.tokenId).name)}(${o.init})`).join(" → ")}`);
    App.dm.addSystem(`战斗开始。先攻顺序：${c.order.map((o) => `${tokenOf(o.tokenId).name} ${o.init}`).join("，")}`);
  }

  function nextTurn() {
    const c = App.state.combat;
    if (!c.active || !c.order.length) return;
    // 跳过已经倒下的
    for (let i = 0; i < c.order.length; i++) {
      c.turn++;
      if (c.turn >= c.order.length) { c.turn = 0; c.round++; App.log(`— 第 ${c.round} 回合 —`); }
      const t = tokenOf(c.order[c.turn].tokenId);
      if (t && hpOf(t) > 0) break;
    }
    App.save();
  }

  function endCombat() {
    const c = App.state.combat;
    if (!c.active) return;
    App.state.combat = { active: false, round: 0, turn: 0, order: [] };
    App.log("<b>战斗结束</b>");
  }

  function render() {
    const c = App.state.combat;
    App.$("#round-badge").textContent = c.active ? `第 ${c.round} 回合` : "未开始";
    const list = App.$("#turn-list");
    list.hidden = !c.active; // 行动顺序条只在战斗中显示，叠在场景左上角
    const rows = c.active ? c.order.map((o, i) => ({ t: tokenOf(o.tokenId), init: o.init, i })).filter((r) => r.t)
                          : App.state.tokens.map((t, i) => ({ t, init: "–", i: -1 }));
    list.innerHTML = rows.length ? rows.map(({ t, init, i }) => {
      const hp = hpOf(t), max = maxOf(t);
      return `<li class="turn ${i === c.turn && c.active ? "active" : ""} ${hp <= 0 ? "down" : ""}" data-kind="${t.kind}">
        <span class="turn-init">${init}</span>
        <div><div class="turn-name">${App.esc(t.name)}</div>
          <div class="bar ${hp / max < .35 ? "low" : ""}"><i style="width:${hp / max * 100}%"></i></div></div>
        <div class="hp-ctrl">
          <button class="btn" data-hp="-1" data-id="${t.id}" aria-label="扣 1 点生命">−</button>
          <span>${hp}/${max}</span>
          <button class="btn" data-hp="1" data-id="${t.id}" aria-label="加 1 点生命">+</button>
        </div>
      </li>`;
    }).join("") : `<li class="empty">地图上还没有棋子</li>`;

    const log = App.$("#combat-log");
    const items = App.state.log.slice(-12).reverse();
    log.innerHTML = items.length ? items.map((l) => `<li class="${l.tone}">${l.html}</li>`).join("")
                                 : `<li class="empty">掷骰和战斗的记录会出现在这里</li>`;
  }

  App.combat = {
    render,
    init() {
      App.$("#btn-initiative").addEventListener("click", () => {
        rollInitiative(); App.save();
      });
      App.$("#btn-next-turn").addEventListener("click", nextTurn);
      App.$("#btn-end-combat").addEventListener("click", () => { endCombat(); App.save(); });
      App.$("#turn-list").addEventListener("click", (e) => {
        const b = e.target.closest("[data-hp]");
        if (!b) return;
        const t = tokenOf(b.dataset.id);
        setHp(t, hpOf(t) + Number(b.dataset.hp));
        if (hpOf(t) === 0) App.log(`<b>${App.esc(t.name)}</b> 倒下了`, "bad");
        App.save();
      });
      render();
      App.subscribe(render);
    }
  };
})(window.App);
