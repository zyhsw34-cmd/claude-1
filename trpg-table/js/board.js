/* =========================================================
   board.js —— 当前场景（格子小地图）。
   显示你现在所在地点的平面图和每个角色站在哪。
   棋子按格子吸附，电脑用鼠标拖，平板用手指拖。
   场景布置（区域、谁在场）由 scene.js 按地点自动换。
   ========================================================= */
(function (App) {
  const el = () => App.$("#board");
  let drag = null;

  /* 视角：立体（斜放的沙盘）还是平面；转了多少度。只存在这台设备上。 */
  const view = () => {
    if (!App.settings.view) App.settings.view = { d3: true, rot: 0 };
    return App.settings.view;
  };

  /* 手指 / 鼠标下面是哪一格。
     立体视角下地板是斜的，没法直接按坐标算，所以地板上铺了一层看不见的格子，
     问浏览器「这个点下面是哪个格子」就行。 */
  function cellFromPoint(clientX, clientY) {
    const hit = document.elementsFromPoint(clientX, clientY).find((n) => n.classList && n.classList.contains("cell"));
    return hit ? { x: +hit.dataset.x, y: +hit.dataset.y } : null;
  }

  /* 某一格在哪个区域上：区域有高度时，站在上面的棋子也跟着抬高 */
  function liftAt(zones, x, y) {
    let h = 0;
    zones.forEach((z) => { if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) h = Math.max(h, z.h3 || 0); });
    return h;
  }

  function activeTokenId() {
    const c = App.state.combat;
    return c.active && c.order[c.turn] ? c.order[c.turn].tokenId : null;
  }

  function render() {
    const b = App.preset().board, s = App.state, v = view(), esc = App.esc;
    const pct = (n, total) => `${n / total * 100}%`;
    const board = el(), wrap = board.parentElement;
    board.style.setProperty("--cols", b.cols);
    board.style.setProperty("--rows", b.rows);
    board.style.setProperty("--rot", `${v.rot}deg`);
    // 转 90° 时沙盘变成竖的，缩小一点才放得下
    board.style.setProperty("--fit", Math.abs(v.rot / 90) % 2 ? 0.82 : 1);
    board.classList.toggle("is-3d", !!v.d3);
    wrap.classList.toggle("is-3d", !!v.d3);
    App.$("#btn-d3").textContent = v.d3 ? "平面" : "立体";
    App.$("#view-tools").querySelectorAll("[data-view^=rot]").forEach((n) => { n.hidden = !v.d3; });
    const active = activeTokenId();
    const zones = App.sceneZones();

    // 高度（px）：剧本里写 h3，没写就贴地
    const walls = (z) => z.h3 ? `<i class="zw zw-n"></i><i class="zw zw-e"></i><i class="zw zw-s"></i><i class="zw zw-w"></i>` : "";
    let cells = "";
    for (let y = 0; y < b.rows; y++) for (let x = 0; x < b.cols; x++) {
      cells += `<i class="cell" data-x="${x}" data-y="${y}" style="left:${pct(x, b.cols)};top:${pct(y, b.rows)}"></i>`;
    }
    const title = App.sceneTitle ? App.sceneTitle() : "";
    board.innerHTML =
      (title ? `<div class="scene-watermark" aria-hidden="true">${esc(title)}</div>` : "") +
      cells +
      zones.map((z) => `<div class="zone ${z.exit ? "exit" : ""} ${z.h3 ? "raised" : ""}" style="left:${pct(z.x, b.cols)};top:${pct(z.y, b.rows)};width:${pct(z.w, b.cols)};height:${pct(z.h, b.rows)};--h:${z.h3 || 0}px">
          ${walls(z)}<span class="zone-label">${esc(z.label)}</span></div>`).join("") +
      App.sceneProps().map((pr) => App.propHtml(pr, pct, b.cols, b.rows, liftAt(zones, Math.floor(pr.x), Math.floor(pr.y)))).join("") +
      s.tokens.map((t) => {
        const down = t.kind !== "player" && t.hp <= 0;
        return `<div class="token ${t.id === s.selectedToken ? "selected" : ""} ${t.id === active ? "active" : ""} ${down ? "down" : ""}"
                  data-id="${t.id}" data-kind="${t.kind}" style="left:${pct(t.x, b.cols)};top:${pct(t.y, b.rows)};--z:${liftAt(zones, t.x, t.y)}px"
                  title="${esc(t.name)}">
          <i class="token-shadow"></i>
          <div class="token-stand">
            <div class="token-disc">${esc(t.name.slice(0, 1))}</div>
            <span class="token-name">${esc(t.name)}</span>
            <i class="token-pole"></i>
          </div>
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
      const cell = cellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      const b = App.preset().board;
      // 拖动时棋子一格一格跟着走，松手就停在那一格
      drag.node.style.left = `${cell.x / b.cols * 100}%`;
      drag.node.style.top = `${cell.y / b.rows * 100}%`;
      drag.node.style.setProperty("--z", `${liftAt(App.sceneZones(), cell.x, cell.y)}px`);
      drag.cell = cell;
      drag.moved = true;
    });

    const end = (e) => {
      if (!drag) return;
      const t = App.state.tokens.find((k) => k.id === drag.id);
      if (drag.moved) {
        const cell = cellFromPoint(e.clientX, e.clientY) || drag.cell;
        if (cell && (t.x !== cell.x || t.y !== cell.y)) {
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
      App.$("#view-tools").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-view]");
        if (!btn) return;
        const v = view();
        if (btn.dataset.view === "d3") v.d3 = !v.d3;
        if (btn.dataset.view === "rotl") v.rot -= 90;
        if (btn.dataset.view === "rotr") v.rot += 90;
        App.saveSettings();
        render();
        if (App.world && App.world.render) App.world.render();
      });
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
