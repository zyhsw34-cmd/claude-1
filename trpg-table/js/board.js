/* =========================================================
   board.js —— 当前场景（格子小地图）。
   显示你现在所在地点的平面图和每个角色站在哪。
   棋子按格子吸附，电脑用鼠标拖，平板用手指拖。
   场景布置（区域、谁在场）由 scene.js 按地点自动换。
   ========================================================= */
(function (App) {
  const el = () => App.$("#board");
  let drag = null;

  function cellFromPoint(clientX, clientY) {
    const b = App.preset().board, r = el().getBoundingClientRect();
    const x = Math.floor((clientX - r.left) / r.width * b.cols);
    const y = Math.floor((clientY - r.top) / r.height * b.rows);
    return { x: Math.max(0, Math.min(b.cols - 1, x)), y: Math.max(0, Math.min(b.rows - 1, y)) };
  }

  function activeTokenId() {
    const c = App.state.combat;
    return c.active && c.order[c.turn] ? c.order[c.turn].tokenId : null;
  }

  function render() {
    const b = App.preset().board, s = App.state;
    const pct = (v, total) => `${v / total * 100}%`;
    el().style.setProperty("--cols", b.cols);
    el().style.setProperty("--rows", b.rows);
    const active = activeTokenId();

    const title = App.sceneTitle ? App.sceneTitle() : "";
    el().innerHTML =
      (title ? `<div class="scene-watermark" aria-hidden="true">${App.esc(title)}</div>` : "") +
      App.sceneZones().map((z) => `<div class="zone ${z.exit ? "exit" : ""}" style="left:${pct(z.x, b.cols)};top:${pct(z.y, b.rows)};width:${pct(z.w, b.cols)};height:${pct(z.h, b.rows)}">${App.esc(z.label)}</div>`).join("") +
      s.tokens.map((t) => {
        const down = t.kind !== "player" && t.hp <= 0;
        return `<div class="token ${t.id === s.selectedToken ? "selected" : ""} ${t.id === active ? "active" : ""}"
                  data-id="${t.id}" data-kind="${t.kind}" style="left:${pct(t.x, b.cols)};top:${pct(t.y, b.rows)};${down ? "opacity:.35" : ""}"
                  title="${App.esc(t.name)}">
          <div class="token-disc">${App.esc(t.name.slice(0, 1))}</div>
          <span class="token-name">${App.esc(t.name)}</span>
        </div>`;
      }).join("");

    App.$("#btn-remove-token").disabled = !s.selectedToken || s.tokens.find((t) => t.id === s.selectedToken)?.kind === "player";
  }

  function bind() {
    const board = el();

    board.addEventListener("pointerdown", (e) => {
      const tok = e.target.closest(".token");
      if (!tok) { App.state.selectedToken = null; App.save(); return; }
      e.preventDefault();
      tok.setPointerCapture(e.pointerId);
      drag = { id: tok.dataset.id, node: tok, moved: false };
      tok.classList.add("dragging");
    });

    board.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const b = App.preset().board, r = board.getBoundingClientRect();
      // 拖动时棋子跟着手指走，松手再吸附到格子
      drag.node.style.left = `${(e.clientX - r.left) / r.width * 100 - 50 / b.cols}%`;
      drag.node.style.top = `${(e.clientY - r.top) / r.height * 100 - 50 / b.rows}%`;
      drag.moved = true;
    });

    const end = (e) => {
      if (!drag) return;
      const t = App.state.tokens.find((k) => k.id === drag.id);
      if (drag.moved) {
        const cell = cellFromPoint(e.clientX, e.clientY);
        if (t.x !== cell.x || t.y !== cell.y) {
          t.x = cell.x; t.y = cell.y;
        }
      }
      App.state.selectedToken = drag.id;
      drag = null;
      App.save();
    };
    board.addEventListener("pointerup", end);
    board.addEventListener("pointercancel", end);

    const add = (kind) => {
      const b = App.preset().board, n = App.state.tokens.filter((t) => t.kind === kind).length + 1;
      const t = {
        id: App.uid(), kind,
        name: (kind === "enemy" ? "敌人" : "同伴") + n,
        x: kind === "enemy" ? b.cols - 2 : 1, y: Math.min(b.rows - 1, n),
        hp: 8, maxHp: 8, initBonus: 0
      };
      App.state.tokens.push(t);
      App.state.selectedToken = t.id;
      App.save();
    };
    App.$("#btn-add-ally").addEventListener("click", () => add("ally"));
    App.$("#btn-add-enemy").addEventListener("click", () => add("enemy"));
    App.$("#btn-remove-token").addEventListener("click", () => {
      const id = App.state.selectedToken;
      App.state.tokens = App.state.tokens.filter((t) => t.id !== id || t.kind === "player");
      App.state.combat.order = App.state.combat.order.filter((o) => o.tokenId !== id);
      App.state.selectedToken = null;
      App.save();
    });
  }

  App.board = {
    render,
    init() {
      bind(); render();
      // 有大地图的剧本：头部多一个「匹诺康尼地图」按钮，点开是一个大弹窗
      const w = App.$("#btn-world");
      if (App.world && App.world.enabled()) {
        w.hidden = false;
        w.addEventListener("click", () => App.world.open());
      }
      App.subscribe(() => { if (!drag) render(); });
    }
  };
})(window.App);
