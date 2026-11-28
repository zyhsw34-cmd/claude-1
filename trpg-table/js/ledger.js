/* =========================================================
   ledger.js —— 「账本」：物品、线索、在场人物、当前场景。
   DM 在回复里写标记，这里检查后入账，聊天里显示成小标签，点标签可以撤销：
     【获得：时针】【失去：艾迪恩硬币】【线索：表背面的钢印】【推进：下一幕】
     【生命：-2】【星芒：-1】【艾迪恩币：+5】【登场：多莉·缝针】【退场：多莉·缝针】
     【场景：一句话记下现在在哪、谁在场、正在发生什么】（玩家看不到，只给 DM 下一轮用）
   检查不通过的标记会变成灰色，并在聊天里告诉 DM 为什么没执行。
   你自己手动改物品、线索时，也会弹出提示，并告诉 DM。
   界面：页面上有 <div id="ledger"> 就画在那里，没有就画在角色卡的背包一栏。
   ========================================================= */
(function (App) {
  const TAG = /【(获得|失去|线索|推进|生命|星芒|星芒点|幸运点|艾迪恩币|信用点|登场|退场|场景)[:：]\s*([^】]*)】/g;
  const SPLIT = /[、，,；;\n]+/;
  const norm = (s) => String(s).replace(/[\s「」『』《》()（）·×x*\d]+/g, "");

  /* ---------- 小提示 ---------- */
  App.toast = function (text, tone) {
    let box = App.$("#toast-box");
    if (!box) { box = document.createElement("div"); box.id = "toast-box"; box.className = "ledger-toasts"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "ledger-toast " + (tone || "");
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3200);
  };

  /* ---------- 物品：存成列表，同时保留老的文字格式给别的模块用 ---------- */
  function items() {
    const c = App.state.character;
    if (!Array.isArray(c.items) || c._invSrc !== c.inventory) {
      c.items = String(c.inventory || "").split(SPLIT).map((x) => x.trim()).filter(Boolean);
      c._invSrc = c.inventory;
    }
    return c.items;
  }
  function setItems(list) {
    const c = App.state.character;
    c.items = list;
    c.inventory = list.join("、");
    c._invSrc = c.inventory;
  }
  const findItem = (name) => {
    const n = norm(name), list = items();
    let i = list.findIndex((x) => norm(x) === n);
    if (i < 0) i = list.findIndex((x) => norm(x).includes(n) || n.includes(norm(x)));
    return i;
  };
  const inScript = (name) => {
    const all = App.preset().story?.items || [];
    const n = norm(name);
    return !all.length || all.some((x) => norm(x).includes(n) || n.includes(norm(x)));
  };

  /* ---------- 在场人物 ---------- */
  function present() {
    const st = App.story();
    st.present = st.present || [];
    return st.present;
  }
  const npcName = (raw) => {
    const npcs = App.preset().story?.npcs || [];
    const n = norm(raw);
    const hit = npcs.find((x) => norm(x.name) === n) || npcs.find((x) => norm(x.name).includes(n) || n.includes(norm(x.name)));
    return hit ? hit.name : raw.trim();
  };

  /* ---------- 数值 ---------- */
  function bump(field, delta) {
    const c = App.state.character, r = App.preset().rules;
    const max = field === "hp" ? App.maxHp(c) : field === "luck" ? r.luckMax : Infinity;
    const before = c[field] || 0;
    c[field] = Math.max(0, Math.min(max, before + delta));
    return c[field] - before; // 实际变了多少
  }
  const numOf = (v) => {
    const m = /([+\-−－])?\s*(\d+)/.exec(v);
    return m ? (m[1] && m[1] !== "+" ? -m[2] : +m[2]) : 0;
  };
  const FIELD = { "生命": "hp", "星芒": "luck", "星芒点": "luck", "幸运点": "luck", "艾迪恩币": "credits", "信用点": "credits" };

  /* ---------- 执行一个标记，返回记录（ok=false 表示没执行） ---------- */
  function apply(kind, raw) {
    const v = raw.trim(), st = App.story();
    const rec = { kind, value: v, ok: true };
    if (kind === "场景") { st.scene = v.slice(0, 200); rec.hidden = true; return rec; }
    if (!v && kind !== "推进") return Object.assign(rec, { ok: false, why: "标记是空的" });
    switch (kind) {
      case "获得": {
        const names = v.split(SPLIT).map((x) => x.trim()).filter(Boolean);
        const list = items().slice();
        names.forEach((n) => list.push(n));
        setItems(list);
        rec.added = names;
        rec.outside = names.filter((n) => !inScript(n));
        return rec;
      }
      case "失去": {
        const i = findItem(v);
        if (i < 0) return Object.assign(rec, { ok: false, why: `背包里没有「${v}」` });
        const list = items().slice();
        rec.removed = list.splice(i, 1)[0];
        rec.at = i;
        setItems(list);
        return rec;
      }
      case "线索":
        if (st.clues.includes(v)) return Object.assign(rec, { ok: false, why: "这条线索已经记过了", quiet: true });
        st.clues.push(v);
        return rec;
      case "推进": {
        const acts = App.preset().story?.acts || [];
        if (!acts.length || st.act >= acts.length - 1) return Object.assign(rec, { ok: false, why: "已经是最后一幕" });
        rec.from = st.act;
        App.director.setAct(st.act + 1);
        return rec;
      }
      case "登场": {
        const n = npcName(v), list = present();
        if (!list.includes(n)) list.push(n);
        rec.value = n;
        if (App.scene && App.scene.enter) App.scene.enter(n);
        return rec;
      }
      case "退场": {
        const n = npcName(v), list = present(), i = list.indexOf(n);
        if (i >= 0) list.splice(i, 1);
        rec.value = n;
        if (App.scene && App.scene.leave) App.scene.leave(n);
        return rec;
      }
      default: {
        const field = FIELD[kind];
        const d = numOf(v);
        if (!field || !d) return Object.assign(rec, { ok: false, why: "看不懂这个数字" });
        if (App.state.character[field] == null) return Object.assign(rec, { ok: false, why: "这个剧本没有这一项" });
        rec.field = field;
        rec.delta = bump(field, d);
        if (rec.delta === 0) Object.assign(rec, { ok: false, why: "已经到上限或下限" });
        return rec;
      }
    }
  }

  function undo(rec) {
    const st = App.story();
    switch (rec.kind) {
      case "获得": {
        const list = items().slice();
        rec.added.forEach((n) => { const i = list.lastIndexOf(n); if (i >= 0) list.splice(i, 1); });
        setItems(list); break;
      }
      case "失去": { const list = items().slice(); list.splice(Math.min(rec.at, list.length), 0, rec.removed); setItems(list); break; }
      case "线索": { const i = st.clues.indexOf(rec.value); if (i >= 0) st.clues.splice(i, 1); break; }
      case "推进": App.director.setAct(rec.from); break;
      case "登场": { const l = present(), i = l.indexOf(rec.value); if (i >= 0) l.splice(i, 1); App.scene?.leave?.(rec.value); break; }
      case "退场": { const l = present(); if (!l.includes(rec.value)) l.push(rec.value); App.scene?.enter?.(rec.value); break; }
      default: if (rec.field) bump(rec.field, -rec.delta);
    }
    rec.undone = true;
  }

  /* DM 回复结束后调用一次 */
  function afterReply(m) {
    if (m.ledgerApplied) return;
    m.ledgerApplied = true;
    m.changes = [];
    const fails = [];
    for (const [, kind, raw] of m.content.matchAll(TAG)) {
      const rec = apply(kind, raw);
      m.changes.push(rec);
      if (!rec.ok && !rec.quiet) fails.push(`【${kind}：${rec.value}】没有执行：${rec.why}`);
    }
    m.changes.filter((r) => r.ok && !r.hidden).forEach((r) => App.toast(label(r), r.kind === "失去" || r.delta < 0 ? "bad" : "good"));
    if (fails.length) App.dm.addSystem(fails.join("；") + "。");
  }

  function label(r) {
    switch (r.kind) {
      case "获得": return "+ " + r.added.join("、");
      case "失去": return "− " + (r.removed || r.value);
      case "线索": return "线索：" + r.value;
      case "推进": return "进入下一幕";
      case "登场": return r.value + " 登场";
      case "退场": return r.value + " 离开";
      default: {
        const L = App.preset().labels || {};
        const name = { hp: "生命", luck: L.luck || "幸运点", credits: L.credits || "信用点" }[r.field] || r.kind;
        return `${name} ${r.delta > 0 ? "+" : ""}${r.delta ?? r.value}`;
      }
    }
  }

  /* 聊天里：把这些标记从正文里去掉，在末尾画成小标签 */
  function strip(text) { return String(text).replace(TAG, ""); }
  function chips(m, i) {
    if (!m.changes) { // 还在生成中：先按原文显示成灰色预览
      const pend = [...String(m.content).matchAll(TAG)].filter(([, k]) => k !== "场景");
      return pend.length ? `<span class="ledger-chips">${pend.map(([, k, v]) => `<span class="ledger-chip wait">${App.esc(k)}：${App.esc(v)}</span>`).join("")}</span>` : "";
    }
    const vis = m.changes.map((r, j) => ({ r, j })).filter(({ r }) => !r.hidden && !r.quiet);
    if (!vis.length) return "";
    return `<span class="ledger-chips">${vis.map(({ r, j }) => {
      const cls = !r.ok ? "fail" : r.undone ? "undone" : (r.kind === "失去" || r.delta < 0) ? "minus" : "plus";
      const tip = !r.ok ? r.why : r.undone ? "已撤销，点一下恢复" : "点一下撤销" + (r.outside?.length ? `（「${r.outside.join("、")}」不在剧本物品表里）` : "");
      return `<button type="button" class="ledger-chip ${cls} ${r.outside?.length ? "outside" : ""}" data-ledger="${i}:${j}" title="${App.esc(tip)}" ${r.ok ? "" : "disabled"}>${App.esc(r.ok ? label(r) : `${r.kind}：${r.value}`)}</button>`;
    }).join("")}</span>`;
  }

  function toggle(i, j) {
    const m = App.state.chat[i], r = m?.changes?.[j];
    if (!r || !r.ok) return;
    if (r.undone) { const again = apply(r.kind, r.value); again.undone = false; m.changes[j] = again; App.dm.addSystem(`玩家恢复了：${label(again)}`); }
    else { undo(r); App.dm.addSystem(`玩家撤销了：${label(r)}`); }
    App.save();
  }

  /* ---------- 面板 ---------- */
  let addOpen = false;
  function panelHtml() {
    const st = App.story(), list = items(), a = App.currentAct();
    const pres = present();
    return `
      <div class="ledger-head"><span>行囊与线索</span>
        <button type="button" class="btn btn-ghost btn-small" data-ledger-act="add" title="手动加一件物品（会告诉 DM）">+ 手动加</button></div>
      ${a ? `<div class="ledger-act">${App.esc(App.actLabel(st.act))}</div>` : ""}
      ${st.scene ? `<div class="ledger-scene" title="DM 记下的当前场景">${App.esc(st.scene)}</div>` : ""}
      ${pres.length ? `<div class="ledger-sub">在场</div><div class="ledger-row">${pres.map((n) => `<span class="ledger-pill person">${App.esc(n)}</span>`).join("")}</div>` : ""}
      <div class="ledger-sub">物品 <small>${list.length}</small></div>
      <div class="ledger-row">${list.length ? list.map((n, k) => `<span class="ledger-pill ${inScript(n) ? "" : "outside"}" title="${inScript(n) ? "" : "不在剧本物品表里"}">${App.esc(n)}<button type="button" data-ledger-drop="${k}" aria-label="丢掉${App.esc(n)}" title="手动去掉（会告诉 DM）">×</button></span>`).join("") : `<span class="ledger-empty">空空如也</span>`}</div>
      ${addOpen ? `<div class="ledger-add"><input id="ledger-add-text" maxlength="40" placeholder="物品名"><button type="button" class="btn btn-small" data-ledger-act="add-ok">加入</button></div>` : ""}
      <div class="ledger-sub">线索 <small>${st.clues.length}</small></div>
      <ol class="ledger-clues">${st.clues.length ? st.clues.map((c) => `<li>${App.esc(c)}</li>`).join("") : `<li class="ledger-empty">还没有发现</li>`}</ol>
      <button type="button" class="linkish ledger-more" data-ledger-act="memory">打开记忆（摘要、钉住、资料卡）</button>`;
  }

  function target() { return App.$("#ledger") || App.$("#sheet .ledger-slot"); }
  function render() {
    const el = target();
    if (!el) return;
    if (el.contains(document.activeElement) && document.activeElement.id === "ledger-add-text") return;
    el.classList.add("ledger");
    el.innerHTML = panelHtml();
  }

  function onClick(e) {
    const chip = e.target.closest("[data-ledger]");
    if (chip) { const [i, j] = chip.dataset.ledger.split(":").map(Number); toggle(i, j); return; }
    const drop = e.target.closest("[data-ledger-drop]");
    if (drop) {
      const list = items().slice(), [gone] = list.splice(+drop.dataset.ledgerDrop, 1);
      setItems(list); App.dm.addSystem(`玩家手动去掉了物品：${gone}`); App.toast("− " + gone, "bad"); App.save(); return;
    }
    const act = e.target.closest("[data-ledger-act]")?.dataset.ledgerAct;
    if (act === "add") { addOpen = !addOpen; render(); App.$("#ledger-add-text")?.focus(); }
    if (act === "add-ok") addManual();
    if (act === "memory") App.memory.open();
  }
  function addManual() {
    const inp = App.$("#ledger-add-text"), v = inp?.value.trim();
    if (!v) return;
    setItems(items().concat(v));
    addOpen = false;
    App.dm.addSystem(`玩家手动加入了物品：${v}`);
    App.toast("+ " + v, "good");
    inp.blur();
    App.save();
  }

  App.ledger = {
    TAG, items, setItems, present, afterReply, chips, strip, render, label,
    init() {
      items();
      document.addEventListener("click", (e) => {
        if (e.target.closest("[data-ledger],[data-ledger-drop],[data-ledger-act]")) onClick(e);
      });
      document.addEventListener("keydown", (e) => {
        if (e.target.id === "ledger-add-text" && e.key === "Enter" && !e.isComposing) { e.preventDefault(); addManual(); }
      });
      render();
      App.subscribe(render);
    }
  };
})(window.App);
