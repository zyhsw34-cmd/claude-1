/* =========================================================
   dice.js —— 骰子区。
   App.dice.roll("2d6+3")   普通掷骰
   App.dice.check("agi", 13) 属性检定（d20 + 属性 ≥ 难度）
   ========================================================= */
(function (App) {
  const rand = (n) => 1 + Math.floor(Math.random() * n);

  /* 解析 "2d6+3"、"d20"、"1d8-1+d4" 这种式子 */
  function parse(expr) {
    const s = String(expr).replace(/\s+/g, "").toLowerCase();
    if (!s || !/^([+-]?(\d*d\d+|\d+))+$/.test(s)) return null;
    const parts = s.match(/[+-]?(\d*d\d+|\d+)/g);
    return parts.map((p) => {
      const sign = p[0] === "-" ? -1 : 1;
      const body = p.replace(/^[+-]/, "");
      if (body.includes("d")) {
        const [n, m] = body.split("d");
        return { sign, count: Math.min(parseInt(n || "1", 10), 50), sides: parseInt(m, 10) };
      }
      return { sign, flat: parseInt(body, 10) };
    });
  }

  function roll(expr) {
    const terms = parse(expr);
    if (!terms) return null;
    let total = 0;
    const pieces = [];
    terms.forEach((t) => {
      if (t.flat != null) { total += t.sign * t.flat; pieces.push(`${t.sign < 0 ? "-" : "+"}${t.flat}`); return; }
      const rolls = Array.from({ length: t.count }, () => rand(t.sides));
      total += t.sign * rolls.reduce((a, b) => a + b, 0);
      pieces.push(`${t.sign < 0 ? "-" : "+"}${t.count}d${t.sides}[${rolls.join(",")}]`);
    });
    return { expr, total, text: pieces.join(" ").replace(/^\+/, "") };
  }

  /* 属性检定 */
  function check(attrKey, dc, mode) {
    const r = App.preset().rules;
    const bonus = App.state.character.attrs[attrKey] || 0;
    const a = rand(r.die), b = rand(r.die);
    const nat = mode === "adv" ? Math.max(a, b) : mode === "dis" ? Math.min(a, b) : a;
    const total = nat + bonus;
    const crit = nat >= r.critOn, fumble = nat <= r.fumbleOn;
    const success = crit || (!fumble && total >= dc);
    return {
      attrKey, dc, mode, nat, bonus, total, crit, fumble, success,
      rolls: mode === "normal" ? [a] : [a, b]
    };
  }

  /* ---------- 显示 ---------- */
  function show(face, html, cls) {
    const el = App.$("#die-face");
    el.textContent = face;
    el.className = "die-face";
    void el.offsetWidth; // 让动画每次都重新播放
    el.classList.add("rolling");
    if (cls) el.classList.add(cls);
    App.$("#dice-detail").innerHTML = html;
  }

  function tellDM(text, autoReply) {
    if (!App.$("#dice-to-dm").checked && !autoReply) return;
    App.dm.addRoll(text, autoReply);
  }

  App.dice = {
    roll, check, parse,

    doRoll(expr) {
      const res = roll(expr);
      if (!res) { show("?", "看不懂这个式子，试试 2d6+3"); return null; }
      show(res.total, `<b>${res.total}</b>　${App.esc(res.text)}`);
      App.log(`掷 <b>${App.esc(expr)}</b> = <b>${res.total}</b>　<small>${App.esc(res.text)}</small>`);
      tellDM(`掷骰 ${expr} = ${res.total}（${res.text}）`);
      return res;
    },

    doCheck(attrKey, dc, mode, fromDM) {
      const c = check(attrKey, dc, mode || "normal");
      const label = App.attrLabel(attrKey);
      const modeText = { normal: "", adv: "（优势）", dis: "（劣势）" }[c.mode];
      const verdict = c.crit ? "大成功！" : c.fumble ? "大失败…" : c.success ? "成功" : "失败";
      const sign = c.bonus >= 0 ? "+" : "";
      show(c.nat, `${label}检定${modeText}<br><b>${c.total}</b> = ${c.rolls.join("/")} ${sign}${c.bonus}　vs ${dc}　<b>${verdict}</b>`,
        c.crit ? "crit" : c.fumble ? "fumble" : "");
      App.log(`${label}检定${modeText} <b>${c.total}</b> vs ${dc} → <b>${verdict}</b>`, c.success ? "good" : "bad");
      tellDM(`${label}检定${modeText}：骰出 ${c.rolls.join("/")}，${sign}${c.bonus}，合计 ${c.total}，难度 ${dc}，${verdict}`, fromDM);
      return c;
    },

    init() {
      const sides = [4, 6, 8, 10, 12, 20, 100];
      const wrap = App.$("#dice-buttons");
      wrap.innerHTML = sides.map((s) => `<button class="btn" data-d="${s}">d${s}</button>`).join("") +
        `<button class="btn" data-d="2d6">2d6</button>`;
      wrap.addEventListener("click", (e) => {
        const d = e.target.closest("button")?.dataset.d;
        if (d) this.doRoll(d.includes("d") ? d : `1d${d}`);
      });

      App.$("#dice-expr-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const v = App.$("#dice-expr").value.trim();
        if (v) this.doRoll(v);
      });

      const sel = App.$("#check-attr");
      sel.innerHTML = App.preset().attributes.map((a) => `<option value="${a.key}">${a.label}</option>`).join("");
      App.$("#check-form").addEventListener("submit", (e) => {
        e.preventDefault();
        this.doCheck(sel.value, parseInt(App.$("#check-dc").value, 10) || 13, App.$("#check-mode").value);
      });
    }
  };
})(window.App);
