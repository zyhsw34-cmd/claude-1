/* =========================================================
   facts.js —— 「事实表」：把网页记下的东西整理成一段文字给 AI。
   这里的内容都来自程序，不来自 AI 的记忆。
   各个字段都是"有就写、没有就跳过"，不同剧本都能用。
   ========================================================= */
(function (App) {
  const asList = (x) => Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x) : [];
  const nameOf = (x) => typeof x === "string" ? x : x?.name || x?.label || x?.id || "";

  /* 地图地点：优先用 world.js 提供的工具 */
  function allPlaces() {
    if (App.worldPlaces && App.preset().worldMap) return App.worldPlaces();
    return [];
  }
  function findPlace(id) {
    return allPlaces().find((p) => p && (p.id === id || p.name === id)) || null;
  }
  function placeName(id) {
    const p = findPlace(id);
    if (!p) return id;
    return App.placeFullName ? App.placeFullName(p) : p.name;
  }

  function sign(n) { return (n >= 0 ? "+" : "") + n; }

  function text() {
    const p = App.preset(), s = App.state, c = s.character, st = App.story();
    const L = p.labels || {};
    const lines = ["【事实表（程序记录，以此为准）】"];

    // 角色
    const attrs = p.attributes.map((a) => `${a.label} ${sign(c.attrs[a.key] || 0)}`).join("，");
    lines.push(`角色：${c.name || "无名"}，${p.classLabel || "身份"}：${c.className || "未定"}。${c.background ? "来历：" + c.background : ""}`);
    const path = p.paths?.[c.className];
    if (path?.skill) lines.push(`命途技能：${path.skill}`);
    lines.push(`属性：${attrs}。`);
    const res = [];
    if (c.hp != null) res.push(`生命 ${c.hp}/${App.maxHp(c)}`);
    if (c.scars != null) res.push(`伤痕 ${c.scars}/3`);
    if (c.luck != null) res.push(`${L.luck || "幸运点"} ${c.luck}`);
    if (c.credits != null) res.push(`${L.credits || "信用点"} ${c.credits}`);
    if (res.length) lines.push(res.join("，") + "。");
    lines.push(`背包：${c.inventory && String(c.inventory).trim() ? c.inventory : "空"}。状态：${c.status || "正常"}。`);

    // 位置（剧本地图）
    if (p.worldMap && s.map) {
      lines.push(`当前位置：${s.map.current ? placeName(s.map.current) : "未知"}。`);
      const vis = asList(s.map.visited).map(placeName);
      if (vis.length) lines.push(`去过：${vis.join("、")}。`);
      const hidden = allPlaces().filter((x) => x.hidden);
      hidden.forEach((h) => lines.push(`隐藏地点「${h.name}」${asList(s.map.unlocked).includes(h.id) ? "已经解锁" : "还没解锁"}。`));
      const here = findPlace(s.map.current);
      const clues = asList(here?.clues).map(nameOf).filter(Boolean);
      if (clues.length) lines.push(`这里能发现的线索（玩家还不一定发现了）：${clues.join("、")}。`);
    }
    if (p.keyItems && s.keys) {
      lines.push("指针：" + p.keyItems.map((k) => `${k.label}${s.keys[k.key] ? "已拿到" : "未拿到"}`).join("，") + "。");
    }
    if (p.factions && s.factions) {
      lines.push("势力好感（−3 敌对到 +3 盟友）：" + p.factions.map((f) => `${f.label} ${sign(s.factions[f.key] || 0)}`).join("，") + "。");
    }
    lines.push(`已发现的线索：${st.clues.length ? st.clues.join("、") : "还没有"}。`);

    // 桌面
    const others = (s.tokens || []).filter((t) => t.kind !== "player");
    if (others.length) lines.push("战场棋子：" + others.map((t) => `${t.name}(${t.kind === "enemy" ? "敌" : "友"})`).join("、") + "。");
    lines.push(s.combat?.active ? `正在战斗，第 ${s.combat.round} 回合。` : "当前不在战斗中。");
    return lines.join("\n");
  }

  /* 地图上所有地点的名字（不常变，放在前面的固定部分） */
  function mapNames() {
    const all = allPlaces().filter((x) => !x.hidden);
    return all.length ? "【地图上的地点名（只用这些，别自己编新地名）】\n" + all.map((x) => x.name).join("、") : "";
  }

  App.facts = {
    text, mapNames,
    place: () => App.state.map ? findPlace(App.state.map.current) : null,
    placeName: () => App.state.map?.current ? placeName(App.state.map.current) : ""
  };
})(window.App);
