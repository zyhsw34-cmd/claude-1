/* =========================================================
   store.js —— 整个桌面的"记忆"。
   所有数据（角色卡、棋子位置、战斗、聊天记录）都放在 App.state 里，
   改动后调用 App.save()，就会存进浏览器，并通知各个区块刷新。
   ========================================================= */
window.App = window.App || {};

(function (App) {
  const SAVE_KEY = "trpg.save.v1";
  const SETTINGS_KEY = "trpg.settings.v1";
  const listeners = [];

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const safeGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 隐私模式下可能存不了 */ } };
  const safeDel = (k) => { try { localStorage.removeItem(k); } catch (e) {} };

  App.uid = () => Math.random().toString(36).slice(2, 9);

  /* ---------- 设置（密钥等，和存档分开放） ---------- */
  const DEFAULT_SETTINGS = {
    apiKey: "",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    thinking: false,
    theme: "starlight",
    presetId: "penacony-13th-hour"   // 新设备默认打开匹诺康尼本；在「设置」里可以换
  };
  App.settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(safeGet(SETTINGS_KEY) || "{}"));
  App.saveSettings = () => safeSet(SETTINGS_KEY, JSON.stringify(App.settings));

  /* ---------- 预设 ---------- */
  App.preset = () => window.TRPG_PRESETS[App.settings.presetId] || window.TRPG_PRESETS["default"];

  /* ---------- 存档 ---------- */
  App.freshState = function () {
    const p = App.preset();
    return {
      version: 1,
      presetId: p.id,
      character: clone(p.character),
      tokens: clone(p.board.tokens),
      selectedToken: null,
      combat: { active: false, round: 0, turn: 0, order: [] },
      log: [],
      chat: [{ role: "assistant", content: p.dm.opening }],
      demoIndex: 0,
      // 下面几项只有带大地图、建卡弹窗的剧本才用得上
      started: !(p.paths && p.spawns),          // 还没在建卡弹窗里点「苏醒」时是 false
      boardMode: p.worldMap ? "world" : "grid",  // world = 大地图，grid = 格子战场
      map: { current: null, visited: [], unlocked: [] },
      factions: {},                              // 势力好感，例如 { hound: -1 }
      keys: {}                                   // 关键道具进度，例如 { hour: true }
    };
  };

  /* 旧存档里没有的字段，补上默认值 */
  function upgrade(s) {
    const f = App.freshState();
    ["boardMode", "map", "factions", "keys"].forEach((k) => { if (s[k] == null) s[k] = f[k]; });
    if (s.started == null) s.started = true;
    return s;
  }

  function load() {
    try {
      const s = JSON.parse(safeGet(SAVE_KEY) || "null");
      if (s && s.version === 1 && s.presetId === App.preset().id) return upgrade(s);
    } catch (e) {}
    return App.freshState();
  }
  App.state = load();

  App.save = function () {
    safeSet(SAVE_KEY, JSON.stringify(App.state));
    listeners.forEach((fn) => fn(App.state));
  };
  App.subscribe = (fn) => listeners.push(fn);

  App.reset = function () {
    safeDel(SAVE_KEY);
    App.state = App.freshState();
    App.save();
  };

  App.exportSave = function () {
    const blob = new Blob([JSON.stringify(App.state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `跑团存档-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  App.importSave = function (text) {
    const s = JSON.parse(text);
    if (!s || s.version !== 1) throw new Error("这不是本桌面导出的存档文件");
    if (s.presetId && window.TRPG_PRESETS[s.presetId]) {
      App.settings.presetId = s.presetId;
      App.saveSettings();
    }
    App.state = upgrade(s);
    App.save();
  };

  /* ---------- 战斗记录（战斗区下方的小日志） ---------- */
  App.log = function (html, tone) {
    App.state.log.push({ html, tone: tone || "", t: Date.now() });
    if (App.state.log.length > 200) App.state.log.shift();
    App.save();
  };

  /* ---------- 小工具 ---------- */
  App.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  App.$ = (sel, root) => (root || document).querySelector(sel);
  App.maxHp = (c) => App.preset().rules.hpBase + (c.attrs.body || 0) * App.preset().rules.hpPerBody;
  App.attrLabel = (key) => (App.preset().attributes.find((a) => a.key === key) || { label: key }).label;
  App.attrByLabel = (label) => App.preset().attributes.find((a) => a.label === label || a.key === label);
})(window.App);
