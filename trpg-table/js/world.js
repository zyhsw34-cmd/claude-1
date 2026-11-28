/* =========================================================
   world.js —— 大地图（钟盘式）。
   只在剧本预设里有 worldMap 时启用。
   画法：一面原创的钟盘。十二个「时刻」排在圆环上，中间是梦境大堂，
   下方连着现实层。全部用 SVG 线条画出来，不用任何图片。

   现在它是一个弹窗（点「匹诺康尼地图」打开），主界面放的是当前场景小地图。
   操作：滚轮 / 双指缩放，拖动空白处平移，点地点弹出小卡片，
        点「前往」= 棋子移过去，并自动告诉 DM。
   ========================================================= */
(function (App) {
  const W = 1000, H = 1100, CX = 500, CY = 500;
  const RING = 330;          // 十二时刻所在的圆环（球笼轨道）
  const EDGE = 460;          // 外圈：筑梦边境
  const NS = "http://www.w3.org/2000/svg";

  const HOME2 = { x: 20, y: 0, w: 960, h: 1080 };   // 「全图」时看到的范围（平面）
  const HOME3 = { x: 20, y: 130, w: 960, h: 760 };  // （立体）
  const home = () => (!App.settings.view || App.settings.view.d3 !== false) ? HOME3 : HOME2;
  let view = Object.assign({}, home());             // 当前看到的范围（SVG 坐标）
  let pointers = new Map(), gesture = null;
  let openCard = null;                       // 正在显示的地点卡片 id

  const el = () => App.$("#world");
  const map = () => App.preset().worldMap;
  const S = () => App.state.map;

  /* ---------- 坐标 ---------- */
  const polar = (hour, r) => {
    const a = hour * 30 * Math.PI / 180;
    return { x: CX + r * Math.sin(a), y: CY - r * Math.cos(a) };
  };

  function placePos(p) {
    if (p.center) return { x: CX, y: CY };
    if (p.reality) return { x: CX, y: 1030 };
    if (p.edge) return polar(p.hour, EDGE);
    if (p.r != null) return polar(p.hour, p.r);
    return polar(p.hour + (p.da || 0) / 30, RING + (p.dr || 0));
  }

  /* ---------- 立体视角 ----------
     钟盘像一只平放在桌上的怀表（上下压扁一半），十二个时刻是高低不同的小塔，
     中间的白日梦酒店是最高的阶梯塔，现实层在下面一层。 */
  const K = 0.5;                                   // 压扁比例
  const d3 = () => !App.settings.view || App.settings.view.d3 !== false;
  const HOUR_H = [34, 60, 70, 55, 90, 66, 44, 52, 78, 60, 86, 124];  // 每个时刻的塔高（黄金的时刻最高）
  const towerH = (p) => p.center ? 96 : p.reality ? 0 : p.hidden ? -70 : p.edge ? 10
    : p.kind === "hour" ? HOUR_H[p.hour] : 22;
  const proj = (pt) => d3() ? { x: pt.x, y: CY + (pt.y - CY) * K } : pt;
  /* 画图用的位置：立体时 = 塔顶 */
  function drawPos(p) {
    if (!d3()) return p.pos;
    if (p.reality) return { x: CX, y: 850 };
    const b = proj(p.pos);
    return { x: b.x, y: b.y - towerH(p) };
  }

  function drawTower(p) {
    if (!d3() || p.reality) return "";
    const b = proj(p.pos), H = towerH(p), t = { x: b.x, y: b.y - H };
    const ell = (y, rx, cls) => svg("ellipse", { cx: b.x, cy: y, rx, ry: rx * K, class: cls || "w-base" });
    if (p.center) {
      // 阶梯塔：三层台子一层比一层小，顶上一根尖
      const tiers = [[0, 74], [.42, 54], [.74, 36]];
      let g = "";
      tiers.forEach(([f, rx], i) => {
        const y = b.y - H * f, y2 = b.y - H * (tiers[i + 1] ? tiers[i + 1][0] : .92);
        g += svg("path", { d: `M${b.x - rx} ${y} L${b.x - rx * .86} ${y2} M${b.x + rx} ${y} L${b.x + rx * .86} ${y2}`, class: "w-tower" });
        g += ell(y, rx, i ? "w-base tier" : "w-base");
      });
      for (let i = -3; i <= 3; i++) g += svg("line", { x1: b.x + i * 9, y1: b.y - H * .74, x2: b.x + i * 6, y2: b.y - H * .92, class: "w-tower faint" });
      return g;
    }
    if (H < 0) return svg("line", { x1: b.x, y1: b.y, x2: t.x, y2: t.y, class: "w-tower secret" }) + ell(b.y, 16, "w-base secret");
    if (p.kind === "hour") {
      const w0 = 13, w1 = 7;
      return ell(b.y, 24) +
        svg("path", { d: `M${b.x - w0} ${b.y} L${t.x - w1} ${t.y} M${b.x + w0} ${b.y} L${t.x + w1} ${t.y}`, class: "w-tower" }) +
        svg("line", { x1: b.x - (w0 + w1) / 2, y1: b.y - H / 2, x2: b.x + (w0 + w1) / 2, y2: b.y - H / 2, class: "w-tower faint" });
    }
    return ell(b.y, 8) + svg("line", { x1: b.x, y1: b.y, x2: t.x, y2: t.y, class: "w-tower" });
  }

  /* 所有能点的地点：十二时刻本身 + 子地点 */
  function allPlaces() {
    const m = map();
    const hours = m.hours.map((h) => Object.assign({ kind: "hour" }, h, { pos: polar(h.hour, RING) }));
    const places = m.places.map((p) => Object.assign({ kind: "place" }, p, { pos: placePos(p) }));
    return hours.concat(places);
  }
  App.worldPlaces = allPlaces;
  App.findPlace = (name) => {
    const n = String(name).replace(/\s|·/g, "");
    return allPlaces().find((p) => p.id === name || p.name.replace(/\s|·/g, "") === n)
        || allPlaces().find((p) => p.name.replace(/\s|·/g, "").includes(n) || n.includes(p.name.replace(/\s|·/g, "")));
  };
  const hourOf = (p) => p.kind === "hour" ? p : map().hours.find((h) => h.hour === p.hour && !p.center && !p.reality && !p.edge && !p.hidden);
  App.placeFullName = (p) => {
    const h = p.kind === "place" ? hourOf(p) : null;
    return h ? `${h.name} · ${p.name}` : p.name;
  };

  const isHidden = (p) => p.hidden && !S().unlocked.includes(p.id);
  const visited = (p) => S().visited.includes(p.id) || p.center;

  /* ---------- 画图 ---------- */
  function svg(tag, attrs, inner) {
    const a = Object.entries(attrs || {}).map(([k, v]) => `${k}="${v}"`).join(" ");
    return `<${tag} ${a}>${inner || ""}</${tag}>`;
  }
  const esc = (s) => App.esc(s);

  function drawDial() {
    let g = "";
    // 外圈：筑梦边境（虚线 + 一圈碎线段，表示「还没建完」）
    g += svg("circle", { cx: CX, cy: CY, r: EDGE, class: "w-edge" });
    for (let i = 0; i < 72; i++) {
      const a = polar(i / 6, EDGE + 10), b = polar(i / 6, EDGE + (i % 3 ? 18 : 30));
      g += svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "w-edge-tick" });
    }
    // 中心的「放射光」：匹诺康尼的装饰艺术风（Art Deco）用这种扇形放射线条
    for (let i = 0; i < 48; i++) {
      const a = polar(i / 4, 76), b = polar(i / 4, i % 2 ? 150 : 196);
      g += svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "w-ray" });
    }
    // 阶梯状的同心圆，也是装饰艺术的常见母题
    [204, 212].forEach((r) => { g += svg("circle", { cx: CX, cy: CY, r, class: "w-thin faint" }); });
    // 刻度圈
    g += svg("circle", { cx: CX, cy: CY, r: 270, class: "w-thin" });
    for (let i = 0; i < 60; i++) {
      const a = polar(i / 5, 270), b = polar(i / 5, i % 5 ? 262 : 250);
      g += svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: i % 5 ? "w-tick" : "w-tick major" });
    }
    // 钟点数字（I … XII）
    const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
    ROMAN.forEach((r, i) => {
      const p = polar(i, 228);
      g += svg("text", { x: p.x, y: p.y + 5, class: "w-numeral" }, r);
    });
    // 球笼轨道：双线圆环 + 辐条
    g += svg("circle", { cx: CX, cy: CY, r: RING - 4, class: "w-track" });
    g += svg("circle", { cx: CX, cy: CY, r: RING + 4, class: "w-track" });
    for (let i = 0; i < 12; i++) {
      const a = polar(i, 86), b = polar(i, RING - 30);
      g += svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "w-spoke" });
    }
    // 晖长石号航线：从蓝调的时刻（9 点）出发的一条弧线
    const s = polar(9, RING + 70), e = polar(2.2, RING + 80);
    g += svg("path", { d: `M${s.x} ${s.y} Q ${CX} ${CY - 640} ${e.x} ${e.y}`, class: "w-airship" });
    g += svg("text", { x: CX - 210, y: 66, class: "w-note" }, "晖长石号航线");
    if (!d3()) g += drawReality();
    return g;
  }

  // 现实层：横线隔开，入梦池的虚线连到中心
  function drawReality() {
    let g = "";
    if (d3()) {
      g += svg("line", { x1: 120, y1: 790, x2: 880, y2: 790, class: "w-thin" });
      g += svg("text", { x: 120, y: 780, class: "w-note start" }, "梦境");
      g += svg("text", { x: 120, y: 810, class: "w-note start" }, "现实");
      g += svg("path", { d: `M${CX - 70} ${CY + 6} C ${CX - 300} ${CY + 130}, ${CX - 240} 790, ${CX - 18} 834`, class: "w-dreamline" });
      g += svg("text", { x: CX - 300, y: 740, class: "w-note" }, "入梦池");
      return g;
    }
    g += svg("line", { x1: 120, y1: 990, x2: 880, y2: 990, class: "w-thin" });
    g += svg("text", { x: 120, y: 980, class: "w-note start" }, "梦境");
    g += svg("text", { x: 120, y: 1010, class: "w-note start" }, "现实");
    g += svg("path", { d: `M${CX - 58} ${CY + 40} C ${CX - 330} ${CY + 260}, ${CX - 250} 900, ${CX - 18} 1012`, class: "w-dreamline" });
    g += svg("text", { x: CX - 300, y: 860, class: "w-note" }, "入梦池");
    return g;
  }

  // 时针：指向玩家当前所在的钟点，像真正的钟一样
  function drawHand() {
    const cur = S().current && allPlaces().find((p) => p.id === S().current);
    if (!cur || cur.center || cur.reality) return "";
    const hour = cur.hour != null ? cur.hour + (cur.da || 0) / 30 : 0;
    const tip = polar(hour, RING - 40), tail = polar(hour + 6, 40);
    const l = polar(hour - 0.9, 26), r = polar(hour + 0.9, 26);
    return svg("path", { d: `M${tail.x} ${tail.y} L${l.x} ${l.y} L${tip.x} ${tip.y} L${r.x} ${r.y} Z`, class: "w-hand" });
  }

  function labelFor(p, pos) {
    // 标签往圆心外侧放
    const dx = pos.x - CX, dy = pos.y - CY, len = Math.hypot(dx, dy) || 1;
    const big = p.kind === "hour";
    const off = big ? 34 : 16;
    const lx = pos.x + dx / len * off, ly = pos.y + dy / len * off;
    const anchor = Math.abs(dx / len) < 0.3 ? "middle" : dx > 0 ? "start" : "end";
    const vy = big ? (dy / len > 0.5 ? 22 : dy / len < -0.5 ? -6 : 8) : (dy / len > 0.5 ? 12 : dy / len < -0.5 ? -4 : 5);
    return { x: lx, y: ly + vy, anchor };
  }

  function drawPlaces() {
    let g = "";
    const cur = S().current;
    const list = allPlaces().filter((p) => !isHidden(p));
    // 立体时从后往前画，近处的塔挡住远处的
    if (d3()) list.sort((a, b) => (a.reality ? 1e4 : proj(a.pos).y) - (b.reality ? 1e4 : proj(b.pos).y));
    list.forEach((p) => {
      const pos = drawPos(p), D = d3();
      const cls = ["w-place", p.kind, visited(p) ? "visited" : "fog", p.id === cur ? "current" : "",
                   p.hidden ? "secret" : "", p.center ? "center" : "", p.reality ? "reality" : "", p.edge ? "edge" : ""].join(" ");
      let shape;
      if (p.center) shape = svg("circle", { cx: pos.x, cy: pos.y, r: D ? 26 : 62, class: "w-node" });
      else if (p.reality) shape = svg("rect", { x: pos.x - 150, y: pos.y - 26, width: 300, height: 52, class: "w-node" });
      else if (p.kind === "hour") shape = svg("circle", { cx: pos.x, cy: pos.y, r: 20, class: "w-node" }) + svg("circle", { cx: pos.x, cy: pos.y, r: 5, class: "w-pin" });
      else if (p.hidden) shape = svg("circle", { cx: pos.x, cy: pos.y, r: 34, class: "w-node" }) + svg("circle", { cx: pos.x, cy: pos.y, r: 44, class: "w-secret-ring" });
      else if (p.edge) shape = svg("path", { d: `M${pos.x} ${pos.y - 14} L${pos.x + 14} ${pos.y} L${pos.x} ${pos.y + 14} L${pos.x - 14} ${pos.y} Z`, class: "w-node" });
      else shape = svg("rect", { x: pos.x - 7, y: pos.y - 7, width: 14, height: 14, transform: `rotate(45 ${pos.x} ${pos.y})`, class: "w-node" });

      let label;
      if (p.center || p.reality || p.hidden) {
        const ly = p.center ? (D ? towerH(p) + 62 : -6) : p.hidden && D ? 54 : 8;
        label = svg("text", { x: pos.x, y: pos.y + ly, class: "w-label" }, esc(p.center ? "白日梦酒店" : p.name))
              + (p.center && !D ? svg("text", { x: pos.x, y: pos.y + 24, class: "w-sublabel" }, "梦境大堂 · 中央车站") : "");
      } else {
        const L = labelFor(p, pos);
        label = svg("text", { x: L.x, y: L.y, "text-anchor": L.anchor, class: p.kind === "hour" ? "w-label" : "w-label small" }, esc(p.name));
      }
      g += `<g class="${cls}" data-place="${p.id}" tabindex="0" role="button" aria-label="${esc(App.placeFullName(p))}">${drawTower(p)}${shape}${label}</g>`;
    });
    return g;
  }

  function drawToken() {
    const cur = S().current && allPlaces().find((p) => p.id === S().current);
    if (!cur) return "";
    const { x, y } = drawPos(cur);
    const name = (App.state.character.name || "你").slice(0, 1);
    const dy = d3() ? (cur.center ? -44 : cur.reality ? -48 : 30) : cur.center ? -86 : cur.reality ? -48 : -34;
    return `<g class="w-token" transform="translate(${x} ${y + dy})">
      <circle r="17"></circle><text y="6">${esc(name)}</text></g>`;
  }

  const dlg = () => App.$("#world-dialog");
  function render() {
    if (!el() || !dlg().open) return;   // 弹窗关着就不画
    const zoom = W / view.w;
    el().innerHTML = `
      <svg xmlns="${NS}" class="world-svg ${zoom > 1.5 ? "zoomed" : ""} ${d3() ? "d3" : ""}" viewBox="${view.x} ${view.y} ${view.w} ${view.h}"
           preserveAspectRatio="xMidYMid meet" role="img" aria-label="匹诺康尼大地图">
        <g class="w-dial" ${d3() ? `transform="matrix(1 0 0 ${K} 0 ${CY * (1 - K)})"` : ""}>${drawDial()}${d3() ? drawHand() : ""}</g>
        ${d3() ? `<g class="w-dial">${drawReality()}</g>` : drawHand()}
        <g class="w-places">${drawPlaces()}</g>
        ${drawToken()}
      </svg>
      <div class="world-zoom">
        <button class="btn btn-small btn-ghost" data-zoom="in" aria-label="放大">＋</button>
        <button class="btn btn-small btn-ghost" data-zoom="out" aria-label="缩小">－</button>
        <button class="btn btn-small btn-ghost" data-zoom="fit" aria-label="看全图">全图</button>
        <button class="btn btn-small btn-ghost" data-zoom="d3">${d3() ? "平面" : "立体"}</button>
      </div>
      ${openCard ? cardHtml(openCard) : ""}`;
  }

  /* ---------- 地点卡片 ---------- */
  function cardHtml(id) {
    const p = allPlaces().find((k) => k.id === id);
    if (!p) return "";
    const here = S().current === p.id;
    const subs = p.kind === "hour" ? map().places.filter((k) => k.hour === p.hour && !k.edge && !k.center && !k.reality && !isHidden(k) && k.r == null) : [];
    return `<div class="world-card" role="dialog" aria-label="${esc(p.name)}">
      <button class="world-card-x" data-close aria-label="关闭">×</button>
      <div class="world-card-hour">${p.kind === "place" && hourOf(p) ? esc(hourOf(p).name) : p.kind === "hour" ? "十二时刻之一" : p.reality ? "现实层" : "梦境"}</div>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.desc || "")}</p>
      ${subs.length ? `<div class="world-card-subs">这里有：${subs.map((s) => `<button class="linkish" data-show="${s.id}">${esc(s.name)}</button>`).join("、")}</div>` : ""}
      <div class="world-card-actions">
        ${here ? `<span class="hint">你就在这里</span>` : `<button class="btn btn-small btn-accent" data-go="${p.id}">前往</button>`}
      </div>
    </div>`;
  }

  function goTo(id, tellDm) {
    const p = allPlaces().find((k) => k.id === id);
    if (!p) return;
    S().current = p.id;
    if (!S().visited.includes(p.id)) S().visited.push(p.id);
    // 去了子地点，所在的时刻也算去过
    const h = p.kind === "place" ? hourOf(p) : null;
    if (h && !S().visited.includes(h.id)) S().visited.push(h.id);
    openCard = null;
    if (dlg().open) dlg().close();
    if (tellDm) App.dm.say(`我前往${App.placeFullName(p)}。`);
    else App.save();
  }
  App.world = App.world || {};
  App.world.goTo = goTo;
  App.world.unlock = (id) => { if (!S().unlocked.includes(id)) S().unlocked.push(id); };

  /* ---------- 缩放和平移 ---------- */
  function svgPoint(clientX, clientY) {
    const r = el().querySelector("svg").getBoundingClientRect();
    // preserveAspectRatio=meet：算出真正画图的区域
    const scale = Math.min(r.width / view.w, r.height / view.h);
    const ox = r.left + (r.width - view.w * scale) / 2, oy = r.top + (r.height - view.h * scale) / 2;
    return { x: view.x + (clientX - ox) / scale, y: view.y + (clientY - oy) / scale, scale };
  }

  function zoomAt(factor, cx, cy) {
    const nw = Math.max(W / 5, Math.min(W * 1.1, view.w / factor));
    const k = nw / view.w;
    view = { x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w: nw, h: view.h * k };
    render();
  }
  function fit() { view = Object.assign({}, home()); render(); }

  function bind() {
    const root = el();

    root.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = svgPoint(e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    }, { passive: false });

    root.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".world-card, .world-zoom")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      root.setPointerCapture(e.pointerId);
      if (pointers.size === 1) {
        gesture = { type: "pan", start: { x: e.clientX, y: e.clientY }, view: Object.assign({}, view), moved: false,
                    target: e.target.closest("[data-place]") };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        gesture = { type: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), view: Object.assign({}, view), moved: true };
      }
    });

    root.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId) || !gesture) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = root.querySelector("svg").getBoundingClientRect();
      const scale = Math.min(r.width / gesture.view.w, r.height / gesture.view.h);
      if (gesture.type === "pan" && pointers.size === 1) {
        const dx = e.clientX - gesture.start.x, dy = e.clientY - gesture.start.y;
        if (Math.hypot(dx, dy) > 6) gesture.moved = true;
        if (gesture.moved) {
          view = Object.assign({}, gesture.view, { x: gesture.view.x - dx / scale, y: gesture.view.y - dy / scale });
          root.querySelector("svg").setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
        }
      } else if (gesture.type === "pinch" && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = svgPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
        view = Object.assign({}, gesture.view);
        zoomAt(d / gesture.dist, mid.x, mid.y);
      }
    });

    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (gesture && gesture.type === "pan" && !gesture.moved) {
        openCard = gesture.target ? gesture.target.dataset.place : null;
        gesture = null;
        render();
        return;
      }
      if (pointers.size === 0) { gesture = null; render(); }
    };
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);

    root.addEventListener("click", (e) => {
      const z = e.target.closest("[data-zoom]");
      if (z) {
        if (z.dataset.zoom === "d3") {
          if (!App.settings.view) App.settings.view = { d3: true, rot: 0 };
          App.settings.view.d3 = !d3(); App.saveSettings();
          fit(); if (App.board) App.board.render();
          return;
        }
        if (z.dataset.zoom === "fit") fit();
        else zoomAt(z.dataset.zoom === "in" ? 1.4 : 1 / 1.4, view.x + view.w / 2, view.y + view.h / 2);
        return;
      }
      if (e.target.closest("[data-close]")) { openCard = null; render(); return; }
      const show = e.target.closest("[data-show]");
      if (show) { openCard = show.dataset.show; render(); return; }
      const go = e.target.closest("[data-go]");
      if (go) goTo(go.dataset.go, true);
    });

    root.addEventListener("keydown", (e) => {
      const g = e.target.closest("[data-place]");
      if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openCard = g.dataset.place; render(); }
      if (e.key === "Escape") { openCard = null; render(); }
    });
  }

  Object.assign(App.world, {
    render,
    open() {
      if (!this.enabled()) return;
      // 电脑上打开时顺便展示「你在这里」的卡片；手机屏幕小，就不挡图了
      openCard = window.innerWidth > 700 ? (S().current || null) : null;
      dlg().showModal();
      render();
    },
    enabled: () => !!App.preset().worldMap,
    init() {
      if (!this.enabled()) return;
      bind();
      App.$("#world-close").addEventListener("click", () => dlg().close());
      dlg().addEventListener("click", (e) => { if (e.target === dlg()) dlg().close(); });
      App.subscribe(() => { if (!gesture) render(); });
    }
  });
})(window.App);
