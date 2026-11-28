/* =========================================================
   scene.js —— 「当前场景」：你现在在哪、这里长什么样、谁在场。

   - 你在大地图上去了新地点（自己点「前往」，或 DM 写【移动到：…】），
     这里就自动换成那个地点的平面图（preset.scenes），
     棋子只留你和同伴，再摆上这个地点平时就有的路人。
   - 剧本里的主线人物不会提前摆出来（免得剧透）。
     DM 的回复里第一次写到某个人物的名字，他就出现在场景里。
   - 正在战斗时不换场景，等战斗结束再换。
   - 「线索与物品」区：ledger.js 还没加载时，这里先放一个只读的简易版。
   ========================================================= */
(function (App) {
  const st = () => {
    if (!App.state.scene) App.state.scene = { place: null, chatFrom: 0, met: [] };
    return App.state.scene;
  };
  const curPlace = () => {
    const id = App.state.map && App.state.map.current;
    return id && App.worldPlaces ? App.worldPlaces().find((p) => p.id === id) : null;
  };
  const sceneOf = (id) => (App.preset().scenes || {})[id] || null;

  /* 没单独写的地点：一张通用图 */
  const GENERIC = {
    start: [6, 7],
    zones: [{ x: 3, y: 1, w: 8, h: 5, label: "这里" }, { x: 5, y: 8, w: 4, h: 1, label: "出口", exit: true }],
    actors: []
  };

  /* board.js 画区域时来问这里 */
  App.sceneZones = function () {
    if (!App.preset().scenes) return App.preset().board.zones || [];
    const p = curPlace();
    return (p && sceneOf(p.id) || GENERIC).zones;
  };
  App.sceneProps = function () {
    const p = curPlace(), sc = p && sceneOf(p.id);
    return (sc && sc.props) || [];
  };
  App.sceneTitle = function () {
    const p = curPlace();
    return p ? App.placeFullName(p) : "";
  };

  /* 剧本人物的「叫法」：全名、去掉头衔、按 · 拆开的每一段 */
  function aliases(npc) {
    const raw = npc.name.replace(/[「」]/g, "");
    const out = new Set([raw]);
    raw.split(/[·•]/).forEach((s) => { s = s.replace(/^(督察|忆者)/, "").trim(); if (s.length >= 2) out.add(s); });
    return [...out];
  }
  const shortName = (npc) => aliases(npc).sort((a, b) => a.length - b.length)[0].slice(0, 4);

  function enterPlace(p) {
    const s = st(), b = App.preset().board;
    s.place = p.id;
    s.chatFrom = App.state.chat.length;
    s.met = [];
    const sc = sceneOf(p.id) || GENERIC;
    const [sx, sy] = sc.start || [6, 7];
    const locals = (sc.actors || []).map((a) => ({
      id: App.uid(), kind: a.kind || "npc", name: a.name, x: a.x, y: a.y,
      hp: a.hp || 6, maxHp: a.hp || 6, initBonus: 0, local: true
    }));
    // 你站在入口，同伴挨着你，谁都不跟别人站同一格
    const taken = new Set(locals.map((t) => `${t.x},${t.y}`));
    const near = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 0], [2, 0], [0, 1], [-1, 1], [1, 1]];
    const keep = App.state.tokens.filter((t) => t.kind === "player" || t.kind === "ally")
      .sort((a, b) => (a.kind === "player" ? -1 : 0) - (b.kind === "player" ? -1 : 0));
    keep.forEach((t) => {
      for (const [dx, dy] of near) {
        const x = sx + dx, y = sy + dy;
        if (x < 0 || y < 0 || x >= b.cols || y >= b.rows || taken.has(`${x},${y}`)) continue;
        t.x = x; t.y = y; taken.add(`${x},${y}`); break;
      }
    });
    App.state.tokens = keep.concat(locals);
    App.state.selectedToken = null;
  }

  /* DM 写到了主线人物的名字 → 让他出现在场景里（每个场景每人一次） */
  function spotNpcs() {
    const npcs = (App.preset().story && App.preset().story.npcs) || [];
    if (!npcs.length) return false;
    const s = st(), b = App.preset().board, chat = App.state.chat;
    const text = chat.slice(s.chatFrom).filter((m) => m.role === "assistant").map((m) => m.content).join("\n");
    let changed = false;
    for (const npc of npcs) {
      if (s.met.includes(npc.id)) continue;
      const name = shortName(npc);
      if (App.state.tokens.some((t) => t.npcId === npc.id || t.name === name)) { s.met.push(npc.id); continue; }
      if (!aliases(npc).some((a) => text.includes(a))) continue;
      // 找一个空格子：从右上角往左下找
      const taken = new Set(App.state.tokens.map((t) => `${t.x},${t.y}`));
      let x = b.cols - 2, y = 1;
      for (let i = 0; i < b.cols * b.rows && taken.has(`${x},${y}`); i++) {
        x--; if (x < 1) { x = b.cols - 2; y = (y + 1) % b.rows; }
      }
      App.state.tokens.push({ id: App.uid(), kind: "npc", npcId: npc.id, name, x, y, hp: 10, maxHp: 10, initBonus: 1 });
      s.met.push(npc.id);
      changed = true;
    }
    return changed;
  }

  /* ---------- 线索与物品：简易只读版 ---------- */
  function renderLedger() {
    if (App.ledger) return;              // 正式版接管了
    const box = App.$("#ledger");
    if (!box) return;
    const esc = App.esc, c = App.state.character, p = App.preset();
    const items = String(c.inventory || "").split(/[、,，\n]/).map((x) => x.trim()).filter(Boolean);
    const clues = App.story ? App.story().clues : [];
    const keys = (p.keyItems || []).filter((k) => App.state.keys && App.state.keys[k.key]).map((k) => k.label);
    const list = (arr, empty) => arr.length
      ? arr.map((x) => `<li>${esc(x)}</li>`).join("")
      : `<li class="empty">${empty}</li>`;
    box.innerHTML = `<div class="ledger-fallback">
      <h3>手上的东西</h3><ul>${list(keys.map((k) => k + "（指针）").concat(items), "什么都没有")}</ul>
      <h3>记住的线索</h3><ul>${list(clues, "还没有。DM 发现线索时会自动记在这里。")}</ul>
    </div>`;
  }

  function sync() {
    const p = curPlace(), s = st();
    if (p && s.place !== p.id && !App.state.combat.active && App.preset().scenes) {
      enterPlace(p);
      App.save();          // save 会再触发一次 sync，这时 place 已经对上，不会循环
      return;
    }
    if (App.preset().scenes && spotNpcs()) { App.save(); return; }
    const name = App.$("#scene-name");
    if (name) name.textContent = App.sceneTitle();
    renderLedger();
  }

  /* 【登场：名字】【退场：名字】（ledger.js 解析后调用这里） */
  const findNpc = (name) => ((App.preset().story && App.preset().story.npcs) || [])
    .find((n) => n.name === name || aliases(n).some((a) => name.includes(a)));
  function enter(name) {
    const npc = findNpc(name), b = App.preset().board;
    const short = npc ? shortName(npc) : String(name).slice(0, 4);
    if (App.state.tokens.some((t) => (npc && t.npcId === npc.id) || t.name === short)) return;
    const taken = new Set(App.state.tokens.map((t) => `${t.x},${t.y}`));
    let x = b.cols - 2, y = 1;
    for (let i = 0; i < b.cols * b.rows && taken.has(`${x},${y}`); i++) { x--; if (x < 1) { x = b.cols - 2; y = (y + 1) % b.rows; } }
    App.state.tokens.push({ id: App.uid(), kind: "npc", npcId: npc ? npc.id : null, name: short, x, y, hp: 10, maxHp: 10, initBonus: 1 });
    if (npc && !st().met.includes(npc.id)) st().met.push(npc.id);
  }
  function leave(name) {
    const npc = findNpc(name), short = npc ? shortName(npc) : String(name).slice(0, 4);
    App.state.tokens = App.state.tokens.filter((t) => t.kind === "player" || !((npc && t.npcId === npc.id) || t.name === short));
    App.state.combat.order = App.state.combat.order.filter((o) => App.state.tokens.some((t) => t.id === o.tokenId));
  }

  App.scene = {
    enterPlace, enter, leave,
    init() {
      // 老存档：第一次打开时，当前位置的场景直接认作「已经布置好」，不打乱棋子
      const s = st();
      if (s.place == null && curPlace() && App.state.chat.length > 1) {
        s.place = curPlace().id; s.chatFrom = App.state.chat.length;
      }
      sync();
      App.subscribe(sync);
    }
  };
})(window.App);
