/* =========================================================
   board.js —— 桌面（地图）区。
   地图是一个格子网，棋子按格子吸附。电脑用鼠标拖，平板用手指拖。
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

    el().innerHTML =
      b.zones.map((z) => `<div class="zone" style="left:${pct(z.x, b.cols)};top:${pct(z.y, b.rows)};width:${pct(z.w, b.cols)};height:${pct(z.h, b.rows)}">${App.esc(z.label)}</div>`).join("") +
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

  /* ---------- 大地图 / 战场 切换 ---------- */
  function applyMode() {
    const world = App.world && App.world.enabled();
    const mode = world ? App.state.boardMode : "grid";
    App.$("#board-mode").hidden = !world;
    App.$("#board").hidden = mode !== "grid";
    App.$("#world").hidden = mode !== "world";
    App.$("#grid-tools").hidden = mode !== "grid";
    App.$(".board-wrap").classList.toggle("is-world", mode === "world");
    // 大地图默认展开（盖住战斗区和骰子区），可以收起
    const big = mode === "world" && App.state.mapBig !== false;
    App.$(".app").classList.toggle("world-big", big);
    App.$("#btn-map-big").hidden = mode !== "world";
    App.$("#btn-map-big").textContent = big ? "收起地图" : "展开地图";
    App.$("#board-mode").querySelectorAll("[data-mode]").forEach((b) => {
      b.classList.toggle("on", b.dataset.mode === mode);
      b.setAttribute("aria-selected", b.dataset.mode === mode);
    });
    App.$("#board-hint").textContent = mode === "world"
      ? "点地点看介绍，点「前往」就会移过去并告诉 DM。滚轮或双指缩放，拖动空白处移动地图。"
      : "拖动棋子移动位置。点一下棋子选中它。";
  }

  App.board = {
    render,
    setMode(mode) { App.state.boardMode = mode; App.save(); applyMode(); },
    init() {
      bind(); render(); applyMode();
      App.$("#board-mode").addEventListener("click", (e) => {
        const b = e.target.closest("[data-mode]");
        if (b) this.setMode(b.dataset.mode);
      });
      App.$("#btn-map-big").addEventListener("click", () => {
        App.state.mapBig = App.state.mapBig === false; App.save(); applyMode();
      });
      App.subscribe(() => { if (!drag) render(); applyMode(); });
    }
  };
})(window.App);
