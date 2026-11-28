/* =========================================================
   sheet.js —— 角色卡区。
   点属性方块 = 直接用这个属性做一次检定（难度取骰子区填的数）。
   ========================================================= */
(function (App) {
  const root = () => App.$("#sheet");

  function render() {
    const p = App.preset(), r = p.rules, c = App.state.character;
    const max = App.maxHp(c);
    const used = Object.values(c.attrs).reduce((a, b) => a + b, 0);
    const left = r.attrPoints - used;
    const esc = App.esc;
    const L = Object.assign({ luck: "幸运点", credits: "信用点" }, p.labels);
    const path = p.paths && p.paths[c.className];
    const st = App.state;

    const locked = !editing && st.started !== false;
    root().innerHTML = `
      <div class="sheet-lockbar ${locked ? "" : "editing"}">
        <span>${locked ? "数值由判定和 DM 自动更新" : "正在手动修改，改完点「完成」，会告诉 DM"}</span>
        <button type="button" class="btn btn-small ${locked ? "btn-ghost" : "btn-accent"}" data-lock>${locked ? "✎ 手动修改" : "完成"}</button>
      </div>
      <input class="sheet-name" data-f="name" value="${esc(c.name)}" aria-label="角色名">
      <div class="sheet-row"><span>${esc(p.classLabel)}</span>
        <select data-f="className">${p.classes.map((k) => `<option ${k === c.className ? "selected" : ""}>${esc(k)}</option>`).join("")}</select>
      </div>
      <div class="sheet-row"><span>来历</span><input data-f="background" value="${esc(c.background)}"></div>
      ${path ? `<div class="path-skill" data-path-name="${esc(c.className)}"><span class="path-tag">${esc(c.className)}</span>${esc(path.skill)}</div>` : ""}

      <div class="sheet-section">属性　<span class="${left < 0 ? "bad" : ""}">剩余 ${left} 点</span></div>
      <div class="attr-grid">
        ${p.attributes.map((a) => `
          <div class="attr" data-roll="${a.key}" title="点一下做${esc(a.label)}检定">
            <span class="attr-label">${esc(a.label)}</span>
            <input class="attr-value" type="number" data-attr="${a.key}" value="${c.attrs[a.key] || 0}" min="${r.attrMin}" max="${r.attrMax}">
            <span class="attr-hint">${esc(a.hint || "")}</span>
          </div>`).join("")}
      </div>

      <div class="sheet-section">状态</div>
      <div class="sheet-row"><span>生命</span>
        <div class="meter">
          <input type="number" data-f="hp" value="${c.hp}" min="0" max="${max}">
          <div class="bar ${c.hp / max < .35 ? "low" : ""}"><i style="width:${Math.max(0, Math.min(100, c.hp / max * 100))}%"></i></div>
          <small>/ ${max}</small>
        </div>
      </div>
      <div class="sheet-row"><span>${esc(L.luck)}</span>
        <div class="pips">${Array.from({ length: r.luckMax }, (_, i) => `<button class="pip ${i < c.luck ? "on" : ""}" data-pip="${i}" aria-label="${esc(L.luck)} ${i + 1}"></button>`).join("")}</div>
      </div>
      <div class="sheet-row"><span>${esc(L.credits)}</span><input type="number" data-f="credits" value="${c.credits}"></div>
      <div class="sheet-row"><span>状态</span><input data-f="status" value="${esc(c.status)}" placeholder="例如：轻伤"></div>

      ${p.keyItems ? `
      <div class="sheet-section">钥匙进度</div>
      <div class="key-row">${p.keyItems.map((k) => `<button class="key-pill ${st.keys[k.key] ? "on" : ""}" data-key="${k.key}" title="点一下切换">${esc(k.label)}</button>`).join("")}</div>` : ""}
      ${p.factions ? `
      <div class="sheet-section">势力好感</div>
      <div class="fac-list">${p.factions.map((f) => {
        const v = st.factions[f.key] || 0;
        return `<div class="fac" title="${esc(f.who)}">
          <span class="fac-name">${esc(f.label)}</span>
          <button class="btn btn-small btn-ghost" data-fac="${f.key}" data-d="-1" aria-label="${esc(f.label)}好感减一">−</button>
          <span class="fac-val ${v > 0 ? "good" : v < 0 ? "bad" : ""}">${v > 0 ? "+" : ""}${v}</span>
          <button class="btn btn-small btn-ghost" data-fac="${f.key}" data-d="1" aria-label="${esc(f.label)}好感加一">+</button>
        </div>`; }).join("")}</div>` : ""}

      <div class="ledger-slot"></div>
      <div class="sheet-section">笔记</div>
      <textarea data-f="notes" rows="4" placeholder="你自己的笔记（DM 看不到）">${esc(c.notes)}</textarea>
    `;
    if (locked) {
      root().querySelectorAll("input, textarea").forEach((x) => { if (x.dataset.f !== "notes") x.readOnly = true; });
      root().querySelectorAll("select, .pip, .key-pill, [data-fac]").forEach((x) => { x.disabled = true; });
    }
    if (App.ledger) App.ledger.render();
  }

  /* ---------- 手动修改：先解锁，改完对比一下，告诉 DM ---------- */
  let editing = false, snap = null;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function snapshot() { const s = App.state; return { c: clone(s.character), keys: clone(s.keys || {}), fac: clone(s.factions || {}) }; }
  function diff(a, b) {
    const p = App.preset(), L = Object.assign({ luck: "幸运点", credits: "信用点" }, p.labels), out = [];
    const cmp = (name, x, y) => { if (String(x ?? "") !== String(y ?? "")) out.push(`${name} ${x ?? "空"}→${y ?? "空"}`); };
    cmp("名字", a.c.name, b.c.name); cmp(p.classLabel || "身份", a.c.className, b.c.className); cmp("来历", a.c.background, b.c.background);
    p.attributes.forEach((t) => cmp(t.label, a.c.attrs[t.key] || 0, b.c.attrs[t.key] || 0));
    cmp("生命", a.c.hp, b.c.hp); cmp(L.luck, a.c.luck, b.c.luck); cmp(L.credits, a.c.credits, b.c.credits); cmp("状态", a.c.status, b.c.status);
    (p.keyItems || []).forEach((k) => cmp(k.label, a.keys[k.key] ? "已拿到" : "未拿到", b.keys[k.key] ? "已拿到" : "未拿到"));
    (p.factions || []).forEach((f) => cmp(f.label + "好感", a.fac[f.key] || 0, b.fac[f.key] || 0));
    return out;
  }
  function toggleLock() {
    if (!editing) { editing = true; snap = snapshot(); render(); return; }
    editing = false;
    const changes = diff(snap, snapshot());
    snap = null;
    if (changes.length) {
      App.dm.addSystem("玩家手动修改了角色卡：" + changes.join("，") + "。");
      if (App.toast) App.toast("已记下 " + changes.length + " 处修改，DM 下一轮会知道", "good");
    } else if (App.toast) App.toast("没有改动");
    App.save(); render();
  }

  let byMouse = false;
  function bind() {
    const el = root();
    // 用 mousedown 处理「完成」：不让输入框先失焦重画，免得按钮被换掉、点击丢失
    el.addEventListener("mousedown", (e) => {
      if (!e.target.closest("[data-lock]")) return;
      e.preventDefault(); byMouse = true; setTimeout(() => { byMouse = false; }, 400); toggleLock();
    });
    el.addEventListener("input", (e) => {
      const c = App.state.character, t = e.target;
      if (t.dataset.f) {
        c[t.dataset.f] = t.type === "number" ? (parseInt(t.value, 10) || 0) : t.value;
        if (t.dataset.f === "name") syncPlayerToken();
      }
      if (t.dataset.attr) c.attrs[t.dataset.attr] = parseInt(t.value, 10) || 0;
      App.save();
    });
    el.addEventListener("change", (e) => {
      if (e.target.dataset.attr || e.target.dataset.f === "hp") render(); // 刷新剩余点数和血条
    });
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-lock]")) { if (!byMouse) toggleLock(); byMouse = false; return; }
      const pip = e.target.closest("[data-pip]");
      if (pip) {
        const i = +pip.dataset.pip, c = App.state.character;
        c.luck = c.luck === i + 1 ? i : i + 1;
        App.save(); render();
        return;
      }
      const key = e.target.closest("[data-key]");
      if (key) { const k = App.state.keys; k[key.dataset.key] = !k[key.dataset.key]; App.save(); render(); return; }
      const fac = e.target.closest("[data-fac]");
      if (fac) {
        const f = App.state.factions, k = fac.dataset.fac;
        f[k] = Math.max(-3, Math.min(3, (f[k] || 0) + +fac.dataset.d));
        App.save(); render(); return;
      }
      const attr = e.target.closest("[data-roll]");
      if (attr && !e.target.matches("input")) {
        App.dice.doCheck(attr.dataset.roll, parseInt(App.$("#check-dc").value, 10) || 13, App.$("#check-mode").value);
      }
    });
  }

  function syncPlayerToken() {
    const t = App.state.tokens.find((k) => k.kind === "player");
    if (t) t.name = App.state.character.name.slice(0, 4) || "你";
  }

  App.sheet = {
    render,
    init() {
      bind();
      render();
      if (App.intro && App.intro.enabled()) {
        App.$("#btn-sheet-reset").textContent = "重新开局";
        App.$("#btn-sheet-reset").title = "重新选择命途和苏醒地点（当前进度会清空）";
      }
      App.$("#btn-sheet-reset").addEventListener("click", () => {
        if (App.intro && App.intro.enabled()) { App.intro.open(); return; }
        App.state.character = JSON.parse(JSON.stringify(App.preset().character));
        App.save(); render();
      });
      // 别的地方改了血量（比如战斗区），且你没在角色卡里打字时，刷新一下
      App.subscribe(() => { if (!root().contains(document.activeElement)) render(); });
    }
  };
})(window.App);
