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

    root().innerHTML = `
      <input class="sheet-name" data-f="name" value="${esc(c.name)}" aria-label="角色名">
      <div class="sheet-row"><span>${esc(p.classLabel)}</span>
        <select data-f="className">${p.classes.map((k) => `<option ${k === c.className ? "selected" : ""}>${esc(k)}</option>`).join("")}</select>
      </div>
      <div class="sheet-row"><span>来历</span><input data-f="background" value="${esc(c.background)}"></div>

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
      <div class="sheet-row"><span>幸运点</span>
        <div class="pips">${Array.from({ length: r.luckMax }, (_, i) => `<button class="pip ${i < c.luck ? "on" : ""}" data-pip="${i}" aria-label="幸运点 ${i + 1}"></button>`).join("")}</div>
      </div>
      <div class="sheet-row"><span>信用点</span><input type="number" data-f="credits" value="${c.credits}"></div>
      <div class="sheet-row"><span>状态</span><input data-f="status" value="${esc(c.status)}" placeholder="例如：轻伤"></div>

      <div class="sheet-section">背包</div>
      <textarea data-f="inventory" rows="3">${esc(c.inventory)}</textarea>
      <div class="sheet-section">笔记</div>
      <textarea data-f="notes" rows="4" placeholder="线索、NPC 名字…">${esc(c.notes)}</textarea>
    `;
  }

  function bind() {
    const el = root();
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
      const pip = e.target.closest("[data-pip]");
      if (pip) {
        const i = +pip.dataset.pip, c = App.state.character;
        c.luck = c.luck === i + 1 ? i : i + 1;
        App.save(); render();
        return;
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
      App.$("#btn-sheet-reset").addEventListener("click", () => {
        App.state.character = JSON.parse(JSON.stringify(App.preset().character));
        App.save(); render();
      });
      // 别的地方改了血量（比如战斗区），且你没在角色卡里打字时，刷新一下
      App.subscribe(() => { if (!root().contains(document.activeElement)) render(); });
    }
  };
})(window.App);
