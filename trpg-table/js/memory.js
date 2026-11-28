/* =========================================================
   memory.js —— DM 的三层记忆。
   短期：最近的对话原文（director.js 负责带上）。
   中期：前情摘要。对话太长时，网页自己请 DeepSeek 把最早的一段压缩进摘要。
   长期：资料卡。每张卡有几个关键词，最近的对话或当前地点里出现这些词，
         才把这张卡塞给 AI。剧本自带的卡写在 story.lore 里，玩家也可以自己加。
   另外玩家可以"钉住"一句话，它会一直带着。
   「记忆」弹窗里这些都能看、能改。
   ========================================================= */
(function (App) {
  const KEEP = 24;        // 摘要后保留多少条原文
  const TRIGGER = 40;     // 没摘要的原文超过这么多条，就整理一次
  const MAX_CARDS = 6;    // 一次最多塞几张资料卡
  let summarizing = false;

  /* ---------- 资料卡 ---------- */
  function presetCards() {
    const p = App.preset();
    return [...(p.story?.lore || []), ...(p.lore || [])].map((c, i) => ({ ...c, id: "p" + i, own: false }));
  }
  function ownCards() {
    const st = App.story();
    st.lore = st.lore || [];
    return st.lore.map((c, i) => ({ ...c, id: "u" + i, own: true }));
  }
  function active() {
    const recent = App.state.chat.slice(-6).map((m) => m.content).join("\n");
    const place = App.facts.place();
    const hay = recent + "\n" + App.facts.placeName() + "\n" + (place?.desc || place?.description || "");
    const hits = [...ownCards(), ...presetCards()].filter((c) =>
      c.always || (c.keys || []).some((k) => k && hay.includes(k)));
    return hits.slice(0, MAX_CARDS);
  }
  App.lore = { active, presetCards, ownCards };

  /* ---------- 前情摘要 ---------- */
  function needsSummary() {
    const st = App.story();
    return App.state.chat.length - st.summarizedUpTo > TRIGGER;
  }

  async function summarize(force) {
    const st = App.story(), s = App.settings;
    if (summarizing || !s.apiKey) return false;
    const end = App.state.chat.length - KEEP;
    if (end <= st.summarizedUpTo || (!force && !needsSummary())) return false;
    summarizing = true;
    App.dm.updateStatus("DM 正在整理记忆…");
    const chunk = App.state.chat.slice(st.summarizedUpTo, end)
      .filter((m) => m.role !== "error")
      .map((m) => `${m.role === "assistant" ? "DM" : m.role === "note" ? "桌面" : "玩家"}：${m.content}`).join("\n");
    const prompt = [
      "你是跑团记录员。把下面这段新对话合并进已有的前情摘要，输出更新后的完整摘要。",
      "只写对话里真的发生过的事，不要补充、不要猜测。物品、线索、地点以事实表为准，事实表里没有的不要写成玩家拥有。",
      "固定用这四个小标题，每栏用短句列点，全文不超过 700 字：",
      "【已发生的事】【答应过的事和伏笔】【NPC 对玩家的态度】【还没解开的谜】",
      "",
      App.facts.text(),
      "",
      "【已有的前情摘要】",
      st.summary.trim() || "（还没有）",
      "",
      "【新的一段对话】",
      chunk
    ].join("\n");
    try {
      const res = await fetch(s.baseUrl.replace(/\/+$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.apiKey },
        body: JSON.stringify({
          model: s.model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          thinking: { type: "disabled" },
          temperature: 0.3
        })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      const text = j.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("空回复");
      st.summary = text;
      st.summarizedUpTo = end;
      App.dm.addSystem("DM 把较早的对话整理进了「记忆」里的前情摘要。");
      App.save();
      return true;
    } catch (e) {
      App.dm.addSystem("整理记忆没成功（" + (e.message || e) + "），下次再试。");
      App.save();
      return false;
    } finally {
      summarizing = false;
      App.dm.updateStatus();
    }
  }

  /* ---------- 钉住 ---------- */
  function pin(text) {
    const t = String(text || "").trim().slice(0, 200);
    if (!t) return;
    const st = App.story();
    if (!st.pins.includes(t)) st.pins.push(t);
    App.toast?.("已钉住，DM 会一直记得", "good");
    App.save();
  }

  /* ---------- 「记忆」弹窗 ---------- */
  function listHtml(items, kind) {
    return items.length ? items.map((t, i) =>
      `<li><span>${App.esc(t)}</span><button type="button" class="btn btn-ghost btn-small" data-del="${kind}" data-i="${i}" aria-label="删除">✕</button></li>`).join("")
      : `<li class="empty">还没有</li>`;
  }

  function renderPanel() {
    const st = App.story();
    const acts = App.preset().story?.acts || [];
    App.$("#mem-act-wrap").hidden = !acts.length;
    App.$("#mem-act").innerHTML = acts.map((a, i) => `<option value="${i}" ${i === st.act ? "selected" : ""}>${App.esc(App.actLabel(i))}</option>`).join("");
    App.$("#mem-summary").value = st.summary;
    App.$("#mem-summary-meta").textContent = st.summarizedUpTo
      ? `已经整理了前 ${st.summarizedUpTo} 条对话。` : "对话还不长，暂时不需要摘要。";
    App.$("#mem-pins").innerHTML = listHtml(st.pins, "pin");
    App.$("#mem-clues").innerHTML = listHtml(st.clues, "clue");
    const on = new Set(active().map((c) => c.id));
    const card = (c, i) => `<li class="${on.has(c.id) ? "on" : ""}">
        <div><b>${App.esc((c.keys || []).join("、") || "（总是带上）")}</b>${on.has(c.id) ? ' <small class="tag">本轮会带上</small>' : ""}
        <div class="mem-card-text">${App.esc(c.text)}</div></div>
        ${c.own ? `<button type="button" class="btn btn-ghost btn-small" data-del="lore" data-i="${i}" aria-label="删除">✕</button>` : ""}
      </li>`;
    const own = ownCards(), pre = presetCards();
    App.$("#mem-lore").innerHTML = (own.map(card).join("") + pre.map(card).join("")) || `<li class="empty">这个剧本还没有资料卡</li>`;
  }

  function open() { renderPanel(); App.$("#memory-dialog").showModal(); }

  // 弹窗本身是一个表单，里面的小输入框用按钮或回车提交
  function onAdd(sel, fn) {
    const box = App.$(sel);
    box.querySelector("[data-submit]").addEventListener("click", fn);
    box.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); fn(); }
    }));
  }

  function bind() {
    App.$("#mem-act").addEventListener("change", (e) => { App.director.setAct(+e.target.value); App.toast?.("剧情进度已改", "good"); App.save(); renderPanel(); });
    App.$("#btn-memory").addEventListener("click", open);
    App.$("#mem-summary").addEventListener("change", (e) => {
      App.story().summary = e.target.value;
      App.dm.addSystem("玩家手动修改了前情摘要。");
      App.toast?.("摘要已保存，DM 下一轮会用新的", "good");
      App.save();
    });
    App.$("#memory-dialog").addEventListener("click", (e) => {
      const b = e.target.closest("[data-del]");
      if (!b) return;
      const st = App.story(), i = +b.dataset.i;
      const kind = b.dataset.del, [gone] = ({ pin: st.pins, clue: st.clues, lore: st.lore })[kind].splice(i, 1);
      const what = { pin: "钉住的笔记", clue: "线索", lore: "资料卡" }[kind];
      App.dm.addSystem(`玩家手动删掉了${what}：${typeof gone === "string" ? gone : (gone?.keys || []).join("、")}`);
      App.toast?.(`已删掉${what}`, "bad");
      App.save(); renderPanel();
    });
    onAdd("#mem-pin-form", () => {
      const v = App.$("#mem-pin-text").value.trim();
      if (v) { App.story().pins.push(v.slice(0, 200)); App.$("#mem-pin-text").value = ""; App.toast?.("已钉住", "good"); App.save(); renderPanel(); }
    });
    onAdd("#mem-clue-form", () => {
      const v = App.$("#mem-clue-text").value.trim();
      if (v) { App.story().clues.push(v); App.$("#mem-clue-text").value = ""; App.dm.addSystem("玩家手动记下了一条线索：" + v); App.toast?.("线索：" + v, "good"); App.save(); renderPanel(); }
    });
    onAdd("#mem-lore-form", () => {
      const keys = App.$("#mem-lore-keys").value.split(/[,，、\s]+/).map((x) => x.trim()).filter(Boolean);
      const text = App.$("#mem-lore-text").value.trim();
      if (!keys.length || !text) return;
      const st = App.story(); st.lore = st.lore || [];
      st.lore.push({ keys, text });
      App.$("#mem-lore-keys").value = ""; App.$("#mem-lore-text").value = "";
      App.toast?.("资料卡已加上", "good");
      App.save(); renderPanel();
    });
    App.$("#mem-summarize").addEventListener("click", async () => {
      if (!App.settings.apiKey) { App.$("#mem-summary-meta").textContent = "要先在设置里填 DeepSeek 密钥，才能自动整理。"; return; }
      App.$("#mem-summary-meta").textContent = "正在整理…";
      const ok = await summarize(true);
      renderPanel();
      if (!ok) App.$("#mem-summary-meta").textContent = "现在没有需要整理的旧对话（最近 " + KEEP + " 条会保留原文）。";
    });
  }

  App.memory = { summarize, needsSummary, pin, open, init: bind };
})(window.App);
