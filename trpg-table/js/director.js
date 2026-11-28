/* =========================================================
   director.js —— 每一轮"发给 AI 的资料"由这里拼好。
   原则：代码记账，AI 讲故事。
   顺序固定（越靠前越不常变，DeepSeek 会自动缓存相同的开头，又快又省钱）：
     1 铁律  2 规则  3 世界观/剧本前提  4 当前这一幕  5 在场 NPC
     6 事实表  7 故事摘要 / 钉住的笔记 / 相关资料卡  8 最近的对话
     9 本轮提醒（贴在玩家这句话后面，AI 对结尾最上心）
   ========================================================= */
(function (App) {
  const RECENT = 40; // 最多带上多少条对话原文；更早的由 memory.js 压进摘要

  /* ---------- 判定档位（和战斗规则草案一致，预设可以用 rules.tiers 覆盖） ---------- */
  const DEFAULT_TIERS = [
    { min: 10, label: "碾压" },
    { min: 5, label: "大胜" },
    { min: 0, label: "险胜" },
    { min: -5, label: "受挫" },
    { min: -Infinity, label: "溃败" }
  ];
  App.tiers = () => (App.preset().rules.tiers || DEFAULT_TIERS);
  App.tierOf = (margin) => {
    const list = App.tiers();
    const i = list.findIndex((t) => margin >= t.min);
    return i < 0 ? list.length - 1 : i;
  };
  App.dcRange = () => {
    const r = App.preset().rules;
    const dcs = (r.difficulties || []).map((d) => d.dc);
    return [r.dcMin ?? (dcs.length ? Math.min(...dcs) - 2 : 5), r.dcMax ?? (dcs.length ? Math.max(...dcs) + 2 : 25)];
  };

  /* ---------- 剧本进度（懒加载，老存档也能用） ---------- */
  App.story = function () {
    const s = App.state;
    if (!s.story) s.story = {};
    const st = s.story;
    st.act = st.act || 0;
    st.clues = st.clues || [];
    st.pins = st.pins || [];
    st.summary = st.summary || "";
    st.summarizedUpTo = st.summarizedUpTo || 0;
    st.stall = st.stall || 0;
    return st;
  };
  /* 幕的名字本身带「序章」「第一幕」时就直接用，不再加编号 */
  App.actLabel = (i) => {
    const a = (App.preset().story?.acts || [])[i];
    if (!a) return "";
    return /^(序章|第.{1,3}幕|终章|尾声)/.test(a.name) ? `《${a.name}》` : `第 ${i + 1} 幕《${a.name}》`;
  };
  App.currentAct = () => {
    const acts = App.preset().story?.acts || [];
    return acts.length ? acts[Math.min(App.story().act, acts.length - 1)] : null;
  };

  /* ---------- 1 铁律 ---------- */
  const IRON = [
    "你是一场单人桌面角色扮演游戏的主持人（DM）。用中文回答。",
    "【铁律，任何时候都优先于其他要求】",
    "1. 下面的「事实表」由程序记录，是唯一可信的事实。它和你的印象冲突时，以事实表为准。事实表里没有的物品，玩家就没有。",
    "2. 不替玩家决定行动、台词和想法。每次回复两到四段，结尾问玩家接下来做什么。",
    "3. 你不掷骰子，也不决定判定成败。玩家做有风险或有对抗的事时，先单独写一行判定标记，例如 [检定:身手 13]，然后停下等结果。程序会把结果和档位发回来，你必须按那个档位描写，不得改档。",
    "4. 只能透露「当前这一幕」允许透露的内容。标着「未解锁」的秘密只能暗示，不能说破，也不能让 NPC 说出来。",
    "5. NPC 只知道他们资料里写的事。他们不知道的事，就算你知道，他们也不能说。",
    "6. 不确定的官方设定，宁可含糊带过或用原创内容，也不要编造官方人物的经历和官方地名。",
    "7. 玩家偏离主线时不要硬拉回来，让世界通过 NPC、事件或线索自然地给出方向。",
    "8. 只写和「当前场景」有关的东西。新出现的人、物、事件，必须和当前场景或本幕目标有关；一旦写出来，后面就要接着用上，不能出现一次就丢掉。拿不准就别加。",
    "9. 只描写玩家这次说的行动和它的直接结果，不替玩家多走一步，也不一次塞进好几件新事。NPC 的举动要符合他们的「想要」和说话方式。",
    "10. 桌面会根据下面这些标记自动记账（每个单独一行，写在回复末尾，玩家看到的是小标签）：",
    "   【获得：物品名】【失去：物品名】只有真的拿到或用掉、交出时才写；失去的东西必须在背包里。",
    "   【线索：线索名】玩家真的发现了一条线索。【推进：下一幕】本幕结束条件达成。",
    "   【生命：-2】【星芒：-1】数值变化（受伤、治疗、消耗）。【登场：人名】【退场：人名】NPC 进入或离开当前场景。",
    "11. 每条回复的最后一行必须是【场景：……】，用一句话记下现在在哪、谁在场、正在发生什么（玩家看不到，下一轮你会从这里接着写）。"
  ].join("\n");

  /* ---------- 2 规则 ---------- */
  function rulesText() {
    const p = App.preset(), r = p.rules;
    const [lo, hi] = App.dcRange();
    const tiers = App.tiers();
    const tierText = tiers.map((t, i) => {
      const next = tiers[i - 1];
      if (t.min === -Infinity) return `${t.label}（差值 ≤ ${next.min - 1}）`;
      return next ? `${t.label}（差值 ${t.min}～${next.min - 1}）` : `${t.label}（差值 ≥ ${t.min}）`;
    }).join("、");
    return [
      "【规则】",
      `判定 = d${r.die} + 属性值（以及命途、道具等加值），减去难度得到差值。档位：${tierText}。骰出 ${r.critOn} 升一档，骰出 ${r.fumbleOn} 降一档。`,
      `难度/威胁值只能在 ${lo}～${hi} 之间。参考：${(r.difficulties || []).map((d) => `${d.label}${d.dc}`).join("、")}。`,
      `可用属性：${p.attributes.map((a) => a.label).join("、")}。`
    ].join("\n");
  }

  /* ---------- 3 世界观 / 前提 ---------- */
  function premiseText() {
    const p = App.preset();
    const out = [];
    if (p.dm?.systemPrompt) out.push("【剧本说明】\n" + p.dm.systemPrompt);
    if (p.story?.premise) out.push("【故事前提】\n" + p.story.premise);
    if (p.world?.brief) out.push("【世界观要点】\n" + p.world.brief);
    if (p.story?.items?.length) out.push("【剧本里的物品名】" + p.story.items.join("、") + "。要给新物品时，照同样的命名法起名。");
    const names = App.facts.mapNames();
    if (names) out.push(names);
    return out.join("\n\n");
  }

  /* ---------- 4 当前这一幕 ---------- */
  function actText() {
    const acts = App.preset().story?.acts;
    if (!acts?.length) return "";
    const st = App.story(), a = App.currentAct(), next = acts[st.act + 1];
    const list = (arr) => (arr || []).map((x) => "- " + x).join("\n");
    return [
      `【当前这一幕：${App.actLabel(st.act)}（全本共 ${acts.length} 段）】`,
      a.goal ? "本幕目标：" + a.goal : "",
      a.reveal?.length ? "本幕可以透露：\n" + list(a.reveal) : "",
      a.secrets?.length ? "未解锁的秘密（只能暗示，不能说破）：\n" + list(a.secrets) : "",
      a.endWhen ? "本幕结束条件：" + a.endWhen : "",
      next ? `下一段是《${next.name}》，现在还没到，不要提前演。` : "这是最后一幕。",
      !next && App.preset().story?.endings?.length ? "可能的结局（由玩家的选择决定，不要替玩家选）：\n" + list(App.preset().story.endings) : ""
    ].filter(Boolean).join("\n");
  }

  /* ---------- 5 在场 NPC：最近对话或当前地点提到的才给完整资料 ---------- */
  function recentText(n) {
    return App.state.chat.slice(-(n || 8)).map((m) => m.content).join("\n");
  }
  function npcText() {
    const npcs = App.preset().story?.npcs;
    if (!npcs?.length) return "";
    const hay = recentText(8) + "\n" + (App.facts.placeName() || "");
    const here = App.facts.place();
    const pres = App.ledger ? App.ledger.present() : [];
    const full = npcs.filter((n) => pres.includes(n.name) || hay.includes(n.name) || (here?.npcs || []).includes(n.id));
    const rest = npcs.filter((n) => !full.includes(n));
    const out = ["【NPC】"];
    full.forEach((n) => {
      out.push([
        `■ ${n.name}${n.faction ? "（" + n.faction + "）" : ""}`,
        n.wants ? "想要：" + n.wants : "",
        n.voice ? "说话方式：" + n.voice : "",
        n.knows?.length ? "知道：" + n.knows.join("；") : "",
        n.doesNotKnow?.length ? "不知道（绝不能说出）：" + n.doesNotKnow.join("；") : ""
      ].filter(Boolean).join("\n"));
    });
    if (rest.length) out.push("下面这些人现在不在场，也没被提到。除非本幕目标需要、而且有合理的理由，不要让他们突然出现：" + rest.map((n) => n.name).join("、"));
    return out.join("\n");
  }

  /* ---------- 7 记忆：摘要 + 钉住的笔记 + 关键词资料卡 ---------- */
  function memoryText() {
    const st = App.story(), out = [];
    if (st.pins.length) out.push("【玩家钉住的重要笔记（一定要记得）】\n" + st.pins.map((x) => "- " + x).join("\n"));
    if (st.summary.trim()) out.push("【前情摘要（更早的对话已经压缩成这样）】\n" + st.summary.trim());
    const cards = App.lore.active();
    if (cards.length) out.push("【相关资料卡（只是背景参考，帮你说对设定；不需要在回复里专门提到）】\n" + cards.map((c) => `■ ${c.keys[0]}：${c.text}`).join("\n"));
    return out.join("\n\n");
  }

  /* ---------- 9 本轮提醒 ---------- */
  function reminder() {
    const a = App.currentAct(), st = App.story();
    const bits = [];
    if (a) bits.push(`现在是${App.actLabel(st.act)}${a.goal ? "，目标：" + a.goal : ""}。`);
    if (a?.secrets?.length) bits.push("不要说破未解锁的秘密。");
    if (a?.endWhen) bits.push(`满足「${a.endWhen}」时写【推进：下一幕】。`);
    if (st.scene) bits.push(`上一轮的场景：${st.scene}。从这里接着写。`);
    if (st.stall >= 6) bits.push(`玩家已经 ${st.stall} 轮没有新进展。如果合适，让当前场景里已经在的人或东西给一点提示，帮玩家找到方向；不要凭空加新人物。`);
    bits.push("事实以事实表为准；有风险的行动先写判定标记再停下；最后一行写【场景：…】。");
    return "\n\n【本轮提醒·玩家看不到】" + bits.join("");
  }

  /* ---------- 拼起来 ---------- */
  function build() {
    const sys = [IRON, rulesText(), premiseText(), actText(), npcText(), App.facts.text(), memoryText()]
      .filter((x) => x && x.trim()).join("\n\n");
    const out = [{ role: "system", content: sys }];

    const st = App.story();
    const start = Math.max(st.summarizedUpTo, App.state.chat.length - RECENT);
    App.state.chat.slice(start).forEach((m) => {
      if (m.role === "error") return;
      const role = m.role === "assistant" ? "assistant" : "user";
      const content = m.role === "note" ? `[桌面提示] ${m.content}` : m.content;
      const last = out[out.length - 1];
      if (last.role === role && role === "user") last.content += "\n" + content;
      else out.push({ role, content });
    });

    // DeepSeek 要求 system 后面先出现 user
    if (out.length > 1 && out[1].role === "assistant") out.splice(1, 0, { role: "user", content: "（开始游戏）" });
    const last = out[out.length - 1];
    if (last.role === "user") last.content += reminder();
    else out.push({ role: "user", content: "（继续）" + reminder() });
    return out;
  }

  /* ---------- 「DM 看到了什么」 ---------- */
  function preview() {
    const msgs = build();
    const name = { system: "幕后资料（system）", user: "玩家这边", assistant: "DM 说过的" };
    const chars = msgs.reduce((n, m) => n + m.content.length, 0);
    App.$("#peek-meta").textContent = `共 ${msgs.length} 段，约 ${chars} 字。更早的对话已经压缩在「前情摘要」里（见「记忆」）。`;
    App.$("#peek-body").innerHTML = msgs.map((m) =>
      `<details ${m.role === "system" ? "open" : ""}><summary>${name[m.role]}</summary><pre>${App.esc(m.content)}</pre></details>`).join("");
    App.$("#peek-dialog").showModal();
  }

  /* ---------- 节奏：玩家每说一次话，看看故事有没有往前走 ---------- */
  function beforeTurn() {
    const st = App.story(), m = App.state.map;
    const sig = JSON.stringify([st.act, st.clues.length, m?.current, (m?.unlocked || []).length,
      Array.isArray(App.state.keys) ? App.state.keys.length : App.state.keys]);
    st.stall = sig === st.lastSig ? st.stall + 1 : 0;
    st.lastSig = sig;
  }

  /* ---------- 改幕数（【推进】标记由 ledger.js 处理） ---------- */
  function setAct(n) {
    const acts = App.preset().story?.acts || [];
    if (!acts.length) return;
    const st = App.story();
    const to = Math.max(0, Math.min(acts.length - 1, n));
    if (to === st.act) return;
    st.act = to;
    App.dm.addSystem(`剧情进入${App.actLabel(to)}`);
  }
  App.director = {
    build, preview, reminder, beforeTurn, setAct,
    init() {
      App.$("#btn-peek").addEventListener("click", preview);
    }
  };
})(window.App);
