/* =========================================================
   main.js —— 把各个区块启动起来。
   ========================================================= */
(function (App) {
  /* 主题列表：value 要和 css/theme.css 里的 [data-theme="..."] 对上 */
  const THEMES = [
    { value: "starlight", label: "星夜" },
    { value: "parchment", label: "羊皮纸" },
    { value: "neon", label: "霓虹" },
    { value: "astral", label: "星轨" }
  ];

  function applyTheme(v) {
    document.documentElement.dataset.theme = v;
    App.settings.theme = v;
    App.saveSettings();
  }

  const sel = App.$("#theme-select");
  sel.innerHTML = THEMES.map((t) => `<option value="${t.value}">${t.label}</option>`).join("");
  sel.value = THEMES.some((t) => t.value === App.settings.theme) ? App.settings.theme : "starlight";
  applyTheme(sel.value);
  sel.addEventListener("change", () => applyTheme(sel.value));

  App.$("#preset-name").textContent = App.preset().name;

  App.dice.init();
  App.sheet.init();
  App.board.init();
  App.world.init();
  App.scene.init();
  App.combat.init();
  App.dm.init();
  App.director.init();
  App.memory.init();
  App.settingsUI.init();
  App.intro.init();
})(window.App);
