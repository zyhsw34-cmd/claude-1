/* =========================================================
   dm.js —— DM 区（和 AI 主持人聊天）。
   没填密钥：演示模式，轮流说预设里的几句固定台词。
   填了密钥：把"幕后说明 + 规则 + 角色卡 + 最近的对话"发给 DeepSeek，
            回复一个字一个字流出来。
   DM 回复里的 [检定:身手 13] 会变成一个按钮，点了就投骰并把结果发回去。
   ========================================================= */
(function (App) {
  const CHECK_RE = /\[检定[:：]\s*([^\s\]]+)\s+(\d+)\s*\]/g;
  const HISTORY = 30; // 最多带上最近多少条对话
  let busy = false;

  /* ---------- 显示 ---------- */
  function msgHtml(m, i) {
    if (m.role === "note") return `<div class="msg system">${App.esc(m.content)}</div>`;
    if (m.role === "error") return `<div class="msg system error">${App.esc(m.content)}</div>`;
    const who = m.role === "assistant" ? "DM" : m.kind === "roll" ? "骰子" : App.state.character.name || "你";
    let body = App.esc(m.content);
    if (m.role === "assistant") {
      body = body.replace(CHECK_RE, (all, attr, dc) => {
        const a = App.attrByLabel(attr);
        return a ? `<button class="btn btn-small btn-accent roll-request" data-attr="${a.key}" data-dc="${dc}" ${m.rolled ? "disabled" : ""}>🎲 ${App.esc(a.label)}检定 · 难度 ${dc}</button>`
                 : all;
      });
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
    const p = App.preset(), r = p.rules, c = App.state.character;
    const attrs = p.attributes.map((a) => `${a.label} ${c.attrs[a.key] >= 0 ? "+" : ""}${c.attrs[a.key] || 0}`).join("，");
    const tokens = App.state.tokens.map((t) => `${t.name}(${t.kind === "enemy" ? "敌" : t.kind === "ally" ? "友" : "玩家"}) 在第${t.x + 1}列第${t.y + 1}行`).join("；");
    const combat = App.state.combat.active ? `正在战斗，第 ${App.state.combat.round} 回合。` : "当前不在战斗中。";

    const system = [
      p.dm.systemPrompt,
      "",
      `【规则】检定 = d${r.die} + 属性值，≥ 难度即成功；骰出 ${r.critOn} 大成功，骰出 ${r.fumbleOn} 大失败。难度参考：${r.difficulties.map((d) => `${d.label}${d.dc}`).join("、")}。`,
      `可用属性：${p.attributes.map((a) => a.label).join("、")}。`,
      "",
      `【玩家角色】${c.name}，${p.classLabel}：${c.className}。来历：${c.background}`,
      `属性：${attrs}。生命 ${c.hp}/${App.maxHp(c)}，幸运点 ${c.luck}，信用点 ${c.credits}。`,
      `背包：${c.inventory || "无"}。状态：${c.status || "正常"}。`,
      "",
      `【桌面】${tokens}。${combat}`
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
    } catch (err) {
      App.state.chat.pop();
      App.state.chat.push({ role: "error", content: "连接 DM 失败：" + (err.message || err) });
    }
    busy = false;
    App.save();
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
        temperature: 1.0
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
      App.state.chat.push({ role: "user", content: text });
      App.save();
      ask();
    },
    addRoll(text, autoReply) {
      App.state.chat.push({ role: "user", kind: "roll", content: "【掷骰】" + text });
      App.save();
      if (autoReply) ask();
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
        const b = e.target.closest(".roll-request");
        if (!b || busy || b.disabled) return;
        const m = App.state.chat[+b.closest(".msg").dataset.i];
        if (m) m.rolled = true; // 同一个检定只投一次
        App.dice.doCheck(b.dataset.attr, +b.dataset.dc, App.$("#check-mode").value, true);
      });
      render();
      App.subscribe(() => { if (!busy) render(); });
    }
  };
})(window.App);
