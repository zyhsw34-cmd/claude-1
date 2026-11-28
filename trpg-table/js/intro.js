/* =========================================================
   intro.js —— 开局建卡弹窗。
   只在剧本预设里有 paths（命途）和 spawns（苏醒地点）时启用。
   玩家只做两个选择：命途、苏醒地点。名字可以先空着。
   点「苏醒」后：属性按命途填好，背包放开局物品，
   大地图把棋子放到苏醒地点，聊天区换成这个地点的开场白。
   ========================================================= */
(function (App) {
  let pick = { path: null, spawn: null };

  const dlg = () => App.$("#intro-dialog");
  const enabled = () => { const p = App.preset(); return !!(p.paths && p.spawns); };

  function attrLine(attrs) {
    return App.preset().attributes.map((a) => `${a.label} ${attrs[a.key] || 0}`).join(" · ");
  }

  function render() {
    const p = App.preset(), esc = App.esc;
    App.$("#intro-paths").innerHTML = Object.entries(p.paths).map(([name, d]) => `
      <button type="button" class="pick path-pick ${pick.path === name ? "on" : ""}" data-path="${esc(name)}" data-path-name="${esc(name)}">
        <span class="pick-title">${esc(name)}</span>
        <span class="pick-line">${esc(d.line)}</span>
        <span class="pick-meta">${esc(attrLine(d.attrs))}</span>
      </button>`).join("");
    App.$("#intro-spawns").innerHTML = p.spawns.map((s, i) => `
      <button type="button" class="pick spawn-pick ${pick.spawn === s.id ? "on" : ""}" data-spawn="${esc(s.id)}">
        <span class="pick-no">${String(i + 1).padStart(2, "0")}</span>
        <span class="pick-title">${esc(s.label)}</span>
        <span class="pick-line">${esc(s.blurb)}</span>
      </button>`).join("");
    const d = pick.path && p.paths[pick.path];
    App.$("#intro-skill").innerHTML = d ? `<b>${esc(pick.path)}</b>　${esc(d.skill)}` : "先选一条命途。";
    App.$("#intro-go").disabled = !(pick.path && pick.spawn);
  }

  function start() {
    const p = App.preset();
    const path = p.paths[pick.path], spawn = p.spawns.find((s) => s.id === pick.spawn);
    const name = App.$("#intro-name").value.trim();

    App.state = App.freshState();
    const c = App.state.character;
    c.name = name || "无名者";
    c.className = pick.path;
    c.attrs = Object.assign({}, path.attrs);
    c.hp = App.maxHp(c);
    c.background = `在匹诺康尼的梦里醒来，什么都不记得。苏醒地点：${spawn.label}。`;
    c.inventory = `${p.startItems}、${spawn.item}`;
    c.notes = `命途技能：${path.skill}`;
    App.state.started = true;
    App.state.spawn = spawn.id;
    App.state.chat = [{ role: "assistant", content: spawn.opening }];
    const player = App.state.tokens.find((t) => t.kind === "player");
    if (player) player.name = c.name.slice(0, 4);
    if (App.world && App.world.goTo) App.world.goTo(spawn.place, false);
    App.save();
    dlg().close();
    App.sheet.render();
  }

  App.intro = {
    enabled,
    open() {
      if (!enabled()) return;
      pick = { path: null, spawn: null };
      App.$("#intro-name").value = "";
      App.$("#intro-title").textContent = App.preset().name;
      render();
      dlg().showModal();
    },
    init() {
      if (!enabled()) return;
      dlg().addEventListener("click", (e) => {
        const a = e.target.closest("[data-path]"), b = e.target.closest("[data-spawn]");
        if (a) { pick.path = a.dataset.path; render(); }
        if (b) { pick.spawn = b.dataset.spawn; render(); }
      });
      App.$("#intro-go").addEventListener("click", start);
      App.$("#intro-cancel").addEventListener("click", () => dlg().close());
      if (!App.state.started) this.open();
    }
  };
})(window.App);
