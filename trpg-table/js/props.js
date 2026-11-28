/* =========================================================
   props.js —— 场景里的小摆设（立体沙盘里立着的小模型）。
   全部是原创的线条画（SVG），照着匹诺康尼「装饰艺术」的感觉画：
   台阶状的轮廓、扇形放射线、金色细线、停住的钟。
   剧本里这样摆：scenes["某地点"].props = [{ t: "clock", x: 7, y: 4 }]
   x / y 是格子坐标，w 是占几格宽（默认 1）。
   ========================================================= */
(function (App) {
  const L = 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"';
  const F = 'fill="rgba(8,10,30,.88)" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"';
  const G = 'fill="currentColor"';

  App.PROPS = {
    /* 停住的钟：台阶底座 + 柱子 + 钟面，指针停在十二点过一点 */
    clock: { w: .85, vb: [40, 104], svg: `
      <path ${F} d="M8 102h24l-3-6H11z"/><path ${F} d="M15 96V44h10v52z"/>
      <path ${L} d="M18 92V48M22 92V48"/><path ${F} d="M11 44h18l-3-4H14z"/>
      <circle ${F} cx="20" cy="22" r="17"/><circle ${L} cx="20" cy="22" r="13" opacity=".6"/>
      ${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<line ${L} x1="${20 + 11 * Math.sin(a)}" y1="${22 - 11 * Math.cos(a)}" x2="${20 + 13 * Math.sin(a)}" y2="${22 - 13 * Math.cos(a)}"/>`; }).join("")}
      <path ${L} d="M20 22V11M20 22l5-3"/><circle ${G} cx="20" cy="22" r="1.6"/>
      <path ${L} d="M14 5l6-4 6 4"/>` },

    /* 路灯：细杆、台阶灯座、发光的灯球 */
    lamp: { w: .6, vb: [30, 96], svg: `
      <path ${F} d="M7 94h16l-2-5H9z"/><path ${L} d="M15 89V26"/>
      <path ${L} d="M11 40h8M12 34h6"/>
      <path ${F} d="M9 26h12l-2-4h-8z"/>
      <circle cx="15" cy="14" r="8" fill="rgba(233,201,131,.35)" stroke="currentColor" stroke-width="1.3"/>
      <circle ${G} cx="15" cy="14" r="3" opacity=".9"/><path ${L} d="M15 2v3"/>` },

    /* 装饰艺术拱门：台阶轮廓 + 扇形放射线，占两格宽 */
    arch: { w: 2, vb: [84, 76], svg: `
      <path ${F} d="M4 74V34h6v-6h6v-6h6C30 10 54 10 62 22h6v6h6v6h6v40H66V40c0-14-12-24-24-24S18 26 18 40v34z"/>
      ${Array.from({ length: 9 }, (_, i) => { const a = Math.PI * (i + 1) / 10; return `<line ${L} opacity=".7" x1="${42 - 10 * Math.cos(a)}" y1="${40 - 10 * Math.sin(a)}" x2="${42 - 20 * Math.cos(a)}" y2="${40 - 20 * Math.sin(a)}"/>`; }).join("")}
      <path ${L} d="M42 6v-4M8 74v-8M76 74v-8"/>` },

    /* 梦泡：浮在半空的小泡泡 */
    bubble: { w: .7, vb: [30, 46], float: true, svg: `
      <circle cx="15" cy="15" r="12" fill="rgba(150,190,255,.14)" stroke="currentColor" stroke-width="1.2"/>
      <path ${L} d="M8 11a8 8 0 0 1 6-5" opacity=".8"/><circle ${G} cx="19" cy="19" r="1.4" opacity=".6"/>
      <ellipse cx="15" cy="43" rx="7" ry="2" fill="currentColor" opacity=".15"/>` },

    /* 老虎机 */
    slot: { w: .8, vb: [34, 58], svg: `
      <path ${F} d="M4 56V14q0-10 13-10t13 10v42z"/>
      <rect ${F} x="8" y="18" width="18" height="11"/><path ${L} d="M14 18v11M20 18v11"/>
      <path ${L} d="M8 36h18M8 42h18" opacity=".6"/><path ${L} d="M30 22h3v-8"/><circle ${G} cx="33" cy="12" r="2.4"/>
      <path ${L} d="M11 8l6-3 6 3" opacity=".7"/>` },

    /* 一排座椅（剧院 / 拍卖厅），占两格宽 */
    seats: { w: 2, vb: [80, 30], svg: `
      ${[2, 28, 54].map((x) => `<path ${F} d="M${x} 28V10q0-6 6-6h12q6 0 6 6v18z"/><path ${L} d="M${x + 3} 18h18" opacity=".6"/>`).join("")}` },

    /* 讲台 / 拍卖台 */
    podium: { w: .9, vb: [40, 54], svg: `
      <path ${F} d="M8 52l3-34h18l3 34z"/><path ${F} d="M4 18l4-8h24l4 8z"/>
      <path ${L} d="M20 22v26M14 24l-1 22M26 24l1 22" opacity=".6"/><circle ${G} cx="20" cy="6" r="2"/>` },

    /* 书架 */
    shelf: { w: .9, vb: [40, 70], svg: `
      <path ${F} d="M3 68V8l17-6 17 6v60z"/><path ${L} d="M3 24h34M3 40h34M3 56h34"/>
      ${[10, 26, 42].map((y) => [7, 11, 14, 19, 23, 28, 32].map((x, i) => `<line ${L} opacity=".55" x1="${x}" y1="${y + 12}" x2="${x + (i % 3 ? 0 : 1.5)}" y2="${y + 3 + (i % 2) * 2}"/>`).join("")).join("")}` },

    /* 仙人掌（热砂的时刻） */
    cactus: { w: .8, vb: [34, 66], svg: `
      <path ${F} d="M13 64V12q4-6 8 0v52z"/><path ${F} d="M13 38H7q-3 0-3-3V22q2-4 4 0v10h5M21 30h6V18q2-4 4 0v13q0 3-3 3h-7"/>
      <path ${L} d="M17 16v44" opacity=".5"/><path ${L} d="M6 64h22"/>` },

    /* 站牌（零点车站） */
    sign: { w: .7, vb: [34, 80], svg: `
      <path ${L} d="M17 78V30"/><path ${F} d="M11 78h12l-2-4h-8z"/>
      <rect ${F} x="2" y="6" width="30" height="22"/><circle ${L} cx="17" cy="17" r="7"/><path ${L} d="M17 17v-5M17 17h3"/>` },

    /* 画在墙上的门 */
    door: { w: .85, vb: [36, 66], svg: `
      <path fill="rgba(8,10,30,.6)" stroke="currentColor" stroke-width="1.3" stroke-dasharray="3 3" d="M4 64V18Q4 4 18 4t14 14v46z"/>
      <path ${L} d="M10 64V20q0-9 8-9t8 9v44" opacity=".5"/><circle ${G} cx="23" cy="40" r="1.8"/>
      <path ${L} d="M0 64h36"/>` },

    /* 牢房栅栏（第十三时） */
    bars: { w: 1, vb: [40, 64], svg: `
      <rect ${F} x="2" y="4" width="36" height="58"/><path ${L} d="M10 4v58M17 4v58M24 4v58M31 4v58M2 22h36"/>
      <path ${L} d="M2 4l18-3 18 3" opacity=".6"/>` }
  };

  /* 画一个摆设（board.js 调用） */
  App.propHtml = function (p, pct, cols, rows, lift) {
    const d = App.PROPS[p.t];
    if (!d) return "";
    const w = p.w || d.w;
    const x = p.x + (Math.ceil(w) - w) / 2;   // 比一格窄的摆设放在格子正中
    return `<div class="prop ${d.float ? "float" : ""}" data-t="${p.t}" aria-hidden="true"
        style="left:${pct(x, cols)};top:${pct(p.y, rows)};width:${pct(w, cols)};height:${pct(1, rows)};--z:${lift}px">
      <div class="prop-stand" style="aspect-ratio:${d.vb[0]} / ${d.vb[1]}">
        <svg viewBox="0 0 ${d.vb[0]} ${d.vb[1]}" xmlns="http://www.w3.org/2000/svg">${d.svg}</svg>
      </div></div>`;
  };
})(window.App);
