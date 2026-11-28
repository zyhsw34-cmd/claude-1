/* =========================================================
   settings.js —— 设置弹窗、导入导出、主题切换。
   ========================================================= */
(function (App) {
  App.settingsUI = {
    open() {
      const s = App.settings;
      App.$("#set-key").value = s.apiKey;
      App.$("#set-base").value = s.baseUrl;
      App.$("#set-model").value = s.model;
      App.$("#set-thinking").checked = s.thinking;
      App.$("#set-preset").innerHTML = Object.values(window.TRPG_PRESETS)
        .map((p) => `<option value="${p.id}" ${p.id === s.presetId ? "selected" : ""}>${App.esc(p.name)}</option>`).join("");
      App.$("#settings-dialog").showModal();
    },

    init() {
      App.$("#btn-settings").addEventListener("click", () => this.open());

      App.$("#settings-dialog").addEventListener("close", () => {
        if (App.$("#settings-dialog").returnValue !== "save") return;
        const s = App.settings;
        const oldPreset = s.presetId;
        s.apiKey = App.$("#set-key").value.trim();
        s.baseUrl = App.$("#set-base").value.trim() || "https://api.deepseek.com";
        s.model = App.$("#set-model").value.trim() || "deepseek-flash";
        s.thinking = App.$("#set-thinking").checked;
        s.presetId = App.$("#set-preset").value || "default";
        App.saveSettings();
        if (s.presetId !== oldPreset) { location.reload(); return; } // 换剧本 = 重新载入
        App.dm.updateStatus();
      });

      App.$("#btn-wipe").addEventListener("click", () => {
        App.$("#settings-dialog").close();
        App.reset();
        App.sheet.render();
      });

      App.$("#btn-export").addEventListener("click", () => App.exportSave());
      App.$("#file-import").addEventListener("change", async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const old = App.settings.presetId;
          App.importSave(await f.text());
          if (App.settings.presetId !== old) location.reload();
          App.sheet.render();
        } catch (err) {
          App.state.chat.push({ role: "error", content: "导入失败：" + err.message });
          App.save();
        }
        e.target.value = "";
      });
    }
  };
})(window.App);
