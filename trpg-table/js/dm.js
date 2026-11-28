/* =========================================================
   dm.js —— DM 区（和 AI 主持人聊天）。
   没填密钥：演示模式，轮流说预设里的几句固定台词。
   填了密钥：把"幕后说明 + 规则 + 角色卡 + 最近的对话"发给 DeepSeek，
            回复一个字一个字流出来。
   DM 回复里的 [检定:身手 13] 会变成一个按钮，点了就投骰并把结果发回去。
   ========================================================= */
(function (App) {
  // 认 [检定:身手 13]，也认 【判定:身手 威胁13】 这种写法
  const CHECK_RE = /[\[【](?:检定|判定)[:：]\s*([^\s\]】]+)\s+(?:威胁|难度)?\s*(\d+)\s*[\]】]/g;
  // DM 给桌面的标记，例如【移动到：匹诺康尼拍卖大厅】【好感：猎犬家系+1】
  const TAG_RE = /【(移动到|解锁地点|获得指针|好感)[:：]\s*([^】]+)】/g;
  const HISTORY = 30; // 最多带上最近多少条对话
  let busy = false;

  /* 最后一条 DM 回复的位置（它后面只有桌面提示时才算"最后"） */
  function lastDmIndex() {
    const c = App.state.chat;
    for (let i = c.length - 1; i >= 0; i--) {
      if (c[i].role === "assistant") return i;
      if (c[i].role !== "note") return -1;
    }
    return -1;
  }

  /* ---------- 显示 ---------- */
  function msgHtml(m, i) {
    if (m.role === "note") return `<div class="msg system">${App.esc(m.content)}</div>`;
    if (m.role === "error") return `<div class="msg system error">${App.esc(m.content)}</div>`;
    const who = m.role === "assistant" ? "DM" : m.kind === "roll" ? "骰子" : m.kind === "fix" ? "你（纠正）" : App.state.character.name || "你";
    const raw = m.role === "assistant" && App.ledger ? App.ledger.strip(m.content).replace(/\n{3,}/g, "\n\n").trim() : m.content;
    let body = App.esc(raw);
    if (m.role === "assistant") {
      body = body.replace(CHECK_RE, (all, attr, dc) => {
        const a = App.attrByLabel(attr);
        const [lo, hi] = App.dcRange();
        dc = Math.max(lo, Math.min(hi, +dc)); // AI 给的难度超出规则范围就夹回来
        return a ? `<button class="btn btn-small btn-accent roll-request" data-attr="${a.key}" data-dc="${dc}" ${m.rolled ? "disabled" : ""}>🎲 ${App.esc(a.label)}判定 · 难度 ${dc}</button>`
                 : all;
      });
      const isLast = i === lastDmIndex();
      if (App.ledger) body += App.ledger.chips(m, i); // 获得/失去/线索… 小标签，点了能撤销
      body += `<span class="msg-tools">
        <button class="btn btn-ghost btn-small" data-act="pin" title="把这段（或你选中的文字）钉进记忆，DM 会一直记得">📌 钉住</button>
        ${isLast && !busy ? `<button class="btn btn-ghost btn-small" data-act="wrong" title="DM 说错了？写一句哪里不对，让它重写">↻ 这不对</button>` : ""}
      </span>`;
    }
    if (m.role === "assistant") {
      body = body.replace(TAG_RE, (all, kind, val) => `<span class="tag-chip">◆ ${App.esc(kind)}：${App.esc(val.trim())}</span>`);
    }
    return `<div class="msg ${m.role === "assistant" ? "dm" : "player"}" data-i="${i}"><span class="msg-who">${App.esc(who)}</span>${body}</div>`;
  }

  function render() {
    const chat = App.$("#chat");
    const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
    chat.innerHTML = App.state.chat.map(msgHtml).join("");
    if (nearBottom || busy) chat.scrollTop = chat.scrollHeight;
    updateStatus();
  }

  function updateStatus(text) {
    const s = App.$("#dm-status");
    const live = !!App.settings.apiKey;
    s.className = "status-dot" + (busy ? " busy" : live ? " live" : "");
    s.textContent = text || (busy ? "DM 正在想…" : live ? App.settings.model : "演示模式");
    App.$("#chat-send").disabled = busy;
  }

  /* ---------- 拼给 AI 的内容 ---------- */
  function buildMessages() {
    if (App.director) return App.director.build(); // 新的分层资料，见 director.js
    const p = App.preset(), r = p.rules, c = App.state.character;
    const attrs = p.attributes.map((a) => `${a.label} ${c.attrs[a.key] >= 0 ? "+" : ""}${c.attrs[a.key] || 0}`).join("，");
    const tokens = App.state.tokens.map((t) => `${t.name}(${t.kind === "enemy" ? "敌" : t.kind === "ally" ? "友" : "玩家"}) 在第${t.x + 1}列第${t.y + 1}行`).join("；");
    const combat = App.state.combat.active ? `正在战斗，第 ${App.state.combat.round} 回合。` : "当前不在战斗中。";

    const system = [
      p.dm.systemPrompt,
      storyText(p),
      "",
      `【规则】检定 = d${r.die} + 属性值，≥ 难度即成功；骰出 ${r.critOn} 大成功，骰出 ${r.fumbleOn} 大失败。难度参考：${r.difficulties.map((d) => `${d.label}${d.dc}`).join("、")}。`,
      `可用属性：${p.attributes.map((a) => a.label).join("、")}。`,
      "",
      `【玩家角色】${c.name}，${p.classLabel}：${c.className}。来历：${c.background}`,
      `属性：${attrs}。生命 ${c.hp}/${App.maxHp(c)}，幸运点 ${c.luck}，信用点 ${c.credits}。`,
      `背包：${c.inventory || "无"}。状态：${c.status || "正常"}。`,
      "",
      `【桌面】${tokens}。${combat}`,
      worldContext()
    ].join("\n");

    const out = [{ role: "system", content: system }];
    App.state.chat.slice(-HISTORY).forEach((m) => {
      if (m.role === "error") return;
      const role = m.role === "assistant" ? "assistant" : "user";
      const content = m.role === "note" ? `[桌面提示] ${m.content}` : m.content;
      const last = out[out.length - 1];
      if (last.role === role && role === "user") last.content += "\n" + content; // 连着的玩家消息合并
      else out.push({ role, content });
    });
    return out;
  }

  /* 剧本里结构化的 story（幕、人物、物品、资料卡）→ 拼成文字给 DM */
  function storyText(p) {
    const st = p.story;
    if (!st) return "";
    const list = (a) => (a && a.length ? a.join("；") : "无");
    const out = ["", "【剧本资料】", "前提：" + st.premise];
    (st.acts || []).forEach((a) => out.push(
      `${a.name}｜目标：${a.goal}｜可以透露：${list(a.reveal)}｜暂不能说：${list(a.secrets)}｜进入下一幕：${a.endWhen}`));
    out.push("人物：");
    (st.npcs || []).forEach((n) => out.push(
      `- ${n.name}（${n.faction}）想要：${n.wants}。知道：${list(n.knows)}。不知道：${list(n.doesNotKnow)}。说话：${n.voice}。`));
    if (st.items) out.push("剧本里的物品名：" + st.items.join("、") + "。新物品照星铁的命名法起名。");
    (st.lore || []).forEach((l) => out.push(`资料（${l.keys.join("/")}）：${l.text}`));
    if (st.endings) out.push("结局：" + st.endings.map((e, i) => `${i + 1}. ${e}`).join(" "));
    return out.join("\n");
  }

  /* 剧本带大地图、势力、钥匙时，把进度也告诉 DM */
  function worldContext() {
    const p = App.preset(), st = App.state, out = [];
    if (p.paths && p.paths[st.character.className]) out.push(`命途技能：${p.paths[st.character.className].skill}`);
    if (p.worldMap && App.worldPlaces) {
      const all = App.worldPlaces();
      const cur = all.find((k) => k.id === st.map.current);
      out.push(`【位置】玩家现在在：${cur ? App.placeFullName(cur) : "未知"}。`);
      if (cur && cur.clues && cur.clues.length) out.push(`这里能发现的线索：${cur.clues.map((c) => c.name).join("、")}。`);
      const been = st.map.visited.map((id) => all.find((k) => k.id === id)).filter(Boolean).map((k) => k.name);
      if (been.length) out.push(`去过：${been.join("、")}。`);
      out.push(`地图上的地点名：${all.filter((k) => !k.hidden).map((k) => k.name).join("、")}。`);
      out.push(`隐藏地点「第十三时」${st.map.unlocked.includes("thirteenth-hour") ? "已经解锁" : "还没解锁"}。`);
    }
    if (p.keyItems) out.push(`【钥匙】${p.keyItems.map((k) => `${k.label}${st.keys[k.key] ? "已拿到" : "未拿到"}`).join("，")}。`);
    if (p.factions) out.push(`【势力好感，−3 敌对到 +3 盟友】${p.factions.map((f) => `${f.label} ${(st.factions[f.key] || 0)}`).join("，")}。`);
    return out.length ? "\n" + out.join("\n") : "";
  }

  /* DM 回复里的标记 → 改桌面。每条回复只执行一次。 */
  function applyTags(m) {
    if (m.tagsApplied) return;
    m.tagsApplied = true;
    const p = App.preset(), st = App.state;
    for (const [, kind, raw] of m.content.matchAll(TAG_RE)) {
      const val = raw.trim();
      if (kind === "移动到" && App.findPlace) {
        const pl = App.findPlace(val);
        if (pl) { if (pl.hidden) App.world.unlock(pl.id); App.world.goTo(pl.id, false); }
      } else if (kind === "解锁地点" && App.findPlace) {
        const pl = App.findPlace(val);
        if (pl) App.world.unlock(pl.id);
      } else if (kind === "获得指针" && p.keyItems) {
        const k = p.keyItems.find((x) => val.includes(x.label));
        if (k) st.keys[k.key] = true;
      } else if (kind === "好感" && p.factions) {
        const f = p.factions.find((x) => val.includes(x.label) || val.includes(x.label.slice(0, 2)));
        const d = /[-−－]\s*(\d)/.exec(val) ? -(+/[-−－]\s*(\d)/.exec(val)[1]) : /\+\s*(\d)/.exec(val) ? +/\+\s*(\d)/.exec(val)[1] : 0;
        if (f && d) st.factions[f.key] = Math.max(-3, Math.min(3, (st.factions[f.key] || 0) + d));
      }
    }
  }

  /* ---------- 发送 ---------- */
  async function ask() {
    if (busy) return;
    busy = true; updateStatus();
    const reply = { role: "assistant", content: "" };
    App.state.chat.push(reply);
    render();
    const node = App.$("#chat").lastElementChild;
    const paint = () => {
      const fresh = msgHtml(reply, App.state.chat.length - 1);
      const tmp = document.createElement("div"); tmp.innerHTML = fresh;
      node.innerHTML = tmp.firstElementChild.innerHTML;
      App.$("#chat").scrollTop = App.$("#chat").scrollHeight;
    };

    try {
      if (!App.settings.apiKey) await demo(reply, paint);
      else await stream(reply, paint);
      if (!reply.content.trim()) reply.content = "（DM 没有回话，再试一次？）";
      applyTags(reply);
      App.ledger?.afterReply(reply); // 【获得】【失去】【线索】【推进】【场景】…，见 ledger.js
    } catch (err) {
      App.state.chat.pop();
      App.state.chat.push({ role: "error", content: "连接 DM 失败：" + (err.message || err) });
    }
    busy = false;
    App.save();
    if (App.memory?.needsSummary()) App.memory.summarize(); // 对话太长就整理进前情摘要
  }

  async function demo(reply, paint) {
    const lines = App.preset().dm.demoReplies;
    const text = lines[App.state.demoIndex % lines.length];
    App.state.demoIndex++;
    for (const ch of text) {
      reply.content += ch; paint();
      await new Promise((r) => setTimeout(r, 12));
    }
  }

  async function stream(reply, paint) {
    const s = App.settings;
    const res = await fetch(s.baseUrl.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.apiKey },
      body: JSON.stringify({
        model: s.model,
        messages: buildMessages(),
        stream: true,
        thinking: { type: s.thinking ? "enabled" : "disabled" },
        temperature: s.thinking ? 1.0 : (s.temperature ?? 0.7) // 思考模式下官方会忽略它
      })
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).error?.message || ""; } catch (e) {}
      throw new Error(`HTTP ${res.status} ${detail}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", thinkingShown = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const data = l.slice(5).trim();
        if (data === "[DONE]") return;
        let j; try { j = JSON.parse(data); } catch (e) { continue; }
        const d = j.choices?.[0]?.delta || {};
        if (d.reasoning_content && !thinkingShown) { thinkingShown = true; updateStatus("DM 正在深度思考…"); }
        if (d.content) { reply.content += d.content; paint(); }
      }
    }
  }

  /* ---------- 给别的模块用 ---------- */
  App.dm = {
    render,
    updateStatus,
    say(text) {
      App.director?.beforeTurn();
      App.state.chat.push({ role: "user", content: text });
      App.save();
      ask();
    },
    addRoll(text, autoReply) {
      App.state.chat.push({ role: "user", kind: "roll", content: "【掷骰】" + text });
      App.save();
      if (autoReply) ask();
    },
    retry(reason) {
      if (busy) return;
      const i = lastDmIndex();
      if (i < 0) return;
      App.state.chat.splice(i, 1);
      App.state.chat.push({ role: "user", kind: "fix", content: `【纠正】你上一条回复有问题：${reason || "和事实不符"}。请以事实表为准，重新写这一段。` });
      App.save();
      ask();
    },
    addSystem(text) {
      App.state.chat.push({ role: "note", content: text });
    },
    init() {
      const form = App.$("#chat-form"), box = App.$("#chat-text");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = box.value.trim();
        if (!v || busy) return;
        box.value = "";
        App.dm.say(v);
      });
      box.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
      });
      App.$("#chat").addEventListener("click", (e) => {
        const t = e.target.closest("[data-act]");
        if (t) {
          const m = App.state.chat[+t.closest(".msg").dataset.i];
          if (t.dataset.act === "pin") {
            const sel = String(window.getSelection?.() || "").trim();
            App.memory.pin(sel || App.ledger.strip(m.content).replace(CHECK_RE, "").replace(TAG_RE, "").trim());
          } else if (t.dataset.act === "wrong") {
            App.$("#wrong-text").value = "";
            App.$("#wrong-dialog").showModal();
          }
          return;
        }
        const b = e.target.closest(".roll-request");
        if (!b || busy || b.disabled) return;
        const m = App.state.chat[+b.closest(".msg").dataset.i];
        if (m) m.rolled = true; // 同一个检定只投一次
        App.dice.doCheck(b.dataset.attr, +b.dataset.dc, App.$("#check-mode").value, true);
      });
      App.$("#wrong-dialog").addEventListener("close", () => {
        if (App.$("#wrong-dialog").returnValue === "send") App.dm.retry(App.$("#wrong-text").value.trim());
      });
      render();
      App.subscribe(() => { if (!busy) render(); });
    }
  };
})(window.App);
