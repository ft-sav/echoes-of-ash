// =========================================================
// MINIMAL HUD, BIOME FADE BANNER & ENHANCED RADAR + [M] FULL MAP
// =========================================================
export function createGameUI(drawStaticMinimap) {
    const legacyHud = document.getElementById('hud');
    if (legacyHud) legacyHud.remove();
  
    const style = document.createElement('style');
    style.textContent = `
      #game-ui {
        position: fixed; inset: 0; z-index: 20;
        pointer-events: none;
        font-family: 'Courier New', monospace;
        transition: opacity 0.3s ease;
      }
      #game-ui.ui-hidden { opacity: 0; }
  
      #area-banner {
        position: fixed; top: 9vh; left: 50%; transform: translateX(-50%) translateY(-6px);
        text-align: center; opacity: 0;
        transition: opacity 0.85s ease, transform 0.85s cubic-bezier(0.22, 1, 0.36, 1);
      }
      #area-banner.show { opacity: 1; transform: translateX(-50%) translateY(0); }
      #area-name {
        font-family: 'Franklin Gothic Medium', 'Trebuchet MS', sans-serif;
        font-size: clamp(20px, 2.4vw, 30px); font-weight: 800;
        letter-spacing: 6px; text-transform: uppercase;
        color: #e4edf5;
        text-shadow: 0 3px 16px rgba(0,0,0,0.95), 0 0 8px rgba(150,210,255,0.22);
      }
      #area-line {
        width: 220px; height: 1px; margin: 7px auto 6px auto;
        background: linear-gradient(90deg, rgba(200,220,235,0), rgba(200,220,235,0.65), rgba(200,220,235,0));
      }
      #area-sub {
        font-size: 11px; letter-spacing: 3.5px; text-transform: uppercase;
        color: #8fa6b8; text-shadow: 0 2px 8px rgba(0,0,0,0.95);
      }
  
      #story-banner {
        position: fixed; top: 20px; left: 22px; max-width: 340px;
        border-left: 2px solid rgba(120, 235, 220, 0.55);
        padding: 2px 0 2px 12px;
        font-size: 12px; line-height: 1.5; color: #c4d6e3;
        text-shadow: 0 2px 8px rgba(0,0,0,0.95);
        display: none;
      }
      #story-banner b { color: #f2c272; letter-spacing: 1.5px; display: block; margin-bottom: 2px; }
  
      #status-strip {
        position: fixed; bottom: 20px; left: 22px;
        display: flex; flex-direction: column; gap: 5px;
        text-shadow: 0 2px 8px rgba(0,0,0,0.95);
      }
      #hp-row {
        display: flex; align-items: center; gap: 14px;
        font-size: 13px; letter-spacing: 1.5px; color: #dce6ef;
      }
      .hp-pip { color: #66ffee; }
      .hp-lost { color: #394854; }
      #boss-hp-row { font-size: 12px; letter-spacing: 2px; color: #ff8c5a; display: none; }
      #key-hint { font-size: 10.5px; letter-spacing: 1px; color: rgba(165, 185, 200, 0.68); }
  
      #dialogue-box {
        position: fixed; bottom: 68px; left: 50%; transform: translateX(-50%);
        background: rgba(5, 9, 14, 0.84); border: 1px solid rgba(155, 195, 220, 0.28);
        padding: 10px 20px; font-size: 12.5px; color: #e2edf5; max-width: 600px; width: 86%;
        text-align: center; display: none; letter-spacing: 0.6px;
      }
  
      /* Crisp Zoomed Radar Minimap (Top Right — Click or press [M] to expand) */
      #minimap-wrap {
        position: fixed; top: 18px; right: 20px;
        background: rgba(5, 9, 14, 0.88);
        border: 1px solid rgba(165, 200, 220, 0.4);
        padding: 6px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.85);
        pointer-events: auto; cursor: pointer;
        transition: transform 0.2s ease, border-color 0.2s ease;
      }
      #minimap-wrap:hover { border-color: #77ffee; }
      #minimap-frame { position: relative; width: 176px; height: 176px; overflow: hidden; }
      #minimap-canvas { display: block; width: 176px; height: 176px; }
      .mm-cardinal {
        position: absolute; font-size: 9px; font-weight: bold; color: #c7d9e8;
        text-shadow: 0 1px 4px #000; pointer-events: none;
      }
      .mm-n { top: 3px; left: 50%; transform: translateX(-50%); color: #ffbe66; }
      .mm-s { bottom: 3px; left: 50%; transform: translateX(-50%); }
      .mm-w { left: 4px; top: 50%; transform: translateY(-50%); }
      .mm-e { right: 4px; top: 50%; transform: translateY(-50%); }
      #minimap-label {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 9.5px; letter-spacing: 1.5px; color: #9ab2c4;
        margin-top: 5px; padding: 0 2px;
      }
      #mm-coords { color: #66ffee; font-size: 9px; }
  
      /* Expanded Full Valley Map Overlay ([M]) */
      #fullmap-overlay {
        position: fixed; inset: 0; z-index: 40;
        display: none; align-items: center; justify-content: center; flex-direction: column;
        background: rgba(4, 7, 11, 0.84);
        pointer-events: auto;
      }
      #fullmap-overlay.open { display: flex; }
      #fullmap-box {
        background: rgba(6, 11, 16, 0.96);
        border: 1px solid rgba(165, 200, 220, 0.45);
        padding: 14px 18px;
        box-shadow: 0 0 48px rgba(0,0,0,0.95);
        text-align: center;
      }
      #fullmap-title {
        font-size: 14px; letter-spacing: 4px; color: #dce8f2; margin-bottom: 10px;
        display: flex; justify-content: space-between; align-items: center;
      }
      #fullmap-canvas { display: block; width: min(72vh, 460px); height: min(72vh, 460px); border: 1px solid rgba(165,200,220,0.2); }
      #fullmap-legend {
        margin-top: 10px; font-size: 10.5px; letter-spacing: 1px; color: #9db4c4;
        display: flex; justify-content: center; gap: 16px; flex-wrap: wrap;
      }
    `;
    document.head.appendChild(style);
  
    const root = document.createElement('div');
    root.id = 'game-ui';
    root.className = 'ui-hidden';
    root.innerHTML = `
      <div id="area-banner">
        <div id="area-name"></div>
        <div id="area-line"></div>
        <div id="area-sub"></div>
      </div>
      <div id="story-banner"></div>
      <div id="minimap-wrap" title="Click or press [M] for Full Valley Map">
        <div id="minimap-frame">
          <canvas id="minimap-canvas" width="176" height="176"></canvas>
          <span class="mm-cardinal mm-n">N</span>
          <span class="mm-cardinal mm-s">S</span>
          <span class="mm-cardinal mm-w">W</span>
          <span class="mm-cardinal mm-e">E</span>
        </div>
        <div id="minimap-label"><span id="mm-region">MEADOW</span><span id="mm-coords">[M] MAP</span></div>
      </div>
      <div id="fullmap-overlay">
        <div id="fullmap-box">
          <div id="fullmap-title"><span>VALLEY CARTOGRAPHY</span><span style="font-size:11px;color:#8aa4b8;">[M] CLOSE</span></div>
          <canvas id="fullmap-canvas" width="360" height="360"></canvas>
          <div id="fullmap-legend">
            <span style="color:#66ffee;">&#9650; YOU</span>
            <span style="color:#d4e2f0;">&#9632; HORSE</span>
            <span style="color:#ffe07d;">&#9678; QUEST</span>
            <span style="color:#55ff66;">&#9632; SENTINEL</span>
            <span style="color:#ff5522;">&#9632; WARDEN</span>
          </div>
        </div>
      </div>
      <div id="status-strip">
        <div id="boss-hp-row"></div>
        <div id="hp-row"></div>
        <div id="key-hint">[E] MOUNT &middot; [H] CALL &middot; [M] FULL MAP &middot; [SHIFT] DASH &middot; [SPACE] PARRY &middot; [1-4] VIEW &middot; [ESC] MENU</div>
      </div>
      <div id="dialogue-box"></div>
    `;
    document.body.appendChild(root);
  
    const areaBanner = root.querySelector('#area-banner');
    const areaNameEl = root.querySelector('#area-name');
    const areaSubEl = root.querySelector('#area-sub');
    const storyBanner = root.querySelector('#story-banner');
    const hpRow = root.querySelector('#hp-row');
    const bossRow = root.querySelector('#boss-hp-row');
    const dlgBox = root.querySelector('#dialogue-box');
    const mmLabel = root.querySelector('#mm-region');
    const mmCanvas = root.querySelector('#minimap-canvas');
    const mmCtx = mmCanvas.getContext('2d');
    const fullOverlay = root.querySelector('#fullmap-overlay');
    const fullCanvas = root.querySelector('#fullmap-canvas');
    const fullCtx = fullCanvas.getContext('2d');
  
    // Pre-render sharp 360x360 cartographic base ONCE at startup (0 FPS cost)
    const BASE_SIZE = 360;
    const MINI_SIZE = 176;
    const staticMap = document.createElement('canvas');
    staticMap.width = BASE_SIZE;
    staticMap.height = BASE_SIZE;
    drawStaticMinimap(staticMap.getContext('2d'), BASE_SIZE);
  
    let fullMapOpen = false;
    let currentAreaId = '';
    let areaHideTimeout = null;
    let dlgTimer = 0;
  
    function toggleFullMap(force) {
      fullMapOpen = typeof force === 'boolean' ? force : !fullMapOpen;
      fullOverlay.classList.toggle('open', fullMapOpen);
    }
  
    root.querySelector('#minimap-wrap').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFullMap();
    });
    fullOverlay.addEventListener('click', () => toggleFullMap(false));
    window.addEventListener('keydown', (e) => {
      if (root.classList.contains('ui-hidden')) return;
      if (e.code === 'KeyM') toggleFullMap();
      if (e.code === 'Escape' && fullMapOpen) toggleFullMap(false);
    });
  
    function setVisible(show) {
      root.classList.toggle('ui-hidden', !show);
      if (!show) toggleFullMap(false);
    }
  
    function updateArea(area) {
      if (!area || area.id === currentAreaId) return;
      currentAreaId = area.id;
      mmLabel.textContent = area.name.split(' ')[0];
  
      areaNameEl.textContent = area.name;
      areaSubEl.textContent = area.sub;
      areaBanner.classList.remove('show');
      void areaBanner.offsetWidth;
      areaBanner.classList.add('show');
  
      if (areaHideTimeout) clearTimeout(areaHideTimeout);
      areaHideTimeout = setTimeout(() => {
        areaBanner.classList.remove('show');
      }, 2800);
    }
  
    function resetArea() {
      currentAreaId = '';
      areaBanner.classList.remove('show');
    }
  
    function setObjective(html) {
      if (!html) {
        storyBanner.style.display = 'none';
      } else {
        storyBanner.innerHTML = html;
        storyBanner.style.display = 'block';
      }
    }
  
    function showDialogue(text, duration = 5.0) {
      dlgBox.textContent = text;
      dlgBox.style.display = 'block';
      dlgTimer = duration;
    }
  
    function tickDialogue(dt) {
      if (dlgTimer > 0) {
        dlgTimer -= dt;
        if (dlgTimer <= 0) dlgBox.style.display = 'none';
      }
    }
  
    function updateStatus({ hp, maxHp, parries, mountLabel, showBoss, bossHp, bossMax }) {
      const pips =
        '<span class="hp-pip">' + '&#9632;'.repeat(Math.max(0, hp)) + '</span>' +
        '<span class="hp-lost">' + '&#9632;'.repeat(Math.max(0, maxHp - hp)) + '</span>';
      hpRow.innerHTML = `<span>HP ${pips}</span><span>PARRIES ${parries}</span><span>${mountLabel}</span>`;
      if (showBoss && bossHp > 0) {
        bossRow.style.display = 'block';
        bossRow.textContent = `WARDEN [${'#'.repeat(bossHp)}${'-'.repeat(bossMax - bossHp)}]`;
      } else {
        bossRow.style.display = 'none';
      }
    }
  
    function drawEntityMarkers(ctx, toXY, { playerPos, playerYaw, horsePos, isMounted, skeletons, warden, objectivePos }, scale = 1) {
      if (objectivePos) {
        const [ox, oy] = toXY(objectivePos.x, objectivePos.z);
        ctx.strokeStyle = '#ffe07d';
        ctx.lineWidth = 1.8 * scale;
        ctx.beginPath();
        ctx.arc(ox, oy, 6 * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffe07d';
        ctx.fillRect(ox - 1.5 * scale, oy - 1.5 * scale, 3 * scale, 3 * scale);
      }
  
      ctx.fillStyle = '#55ff66';
      skeletons.forEach((s) => {
        if (!s.group.visible || s.hp <= 0) return;
        const [sx, sy] = toXY(s.group.position.x, s.group.position.z);
        ctx.fillRect(sx - 2 * scale, sy - 2 * scale, 4 * scale, 4 * scale);
      });
  
      if (warden.group.visible && warden.hp > 0) {
        const [bx, by] = toXY(warden.group.position.x, warden.group.position.z);
        ctx.fillStyle = '#ff5522';
        ctx.fillRect(bx - 3 * scale, by - 3 * scale, 6 * scale, 6 * scale);
      }
  
      if (!isMounted) {
        const [hx, hy] = toXY(horsePos.x, horsePos.z);
        ctx.fillStyle = '#e8f1fa';
        ctx.fillRect(hx - 2.2 * scale, hy - 2.2 * scale, 4.4 * scale, 4.4 * scale);
      }
  
      const [px, py] = toXY(playerPos.x, playerPos.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(Math.sin(playerYaw), -Math.cos(playerYaw)));
      ctx.fillStyle = '#66ffee';
      ctx.beginPath();
      ctx.moveTo(0, -6 * scale);
      ctx.lineTo(4 * scale, 4.5 * scale);
      ctx.lineTo(0, 2 * scale);
      ctx.lineTo(-4 * scale, 4.5 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  
    function updateMinimap(data) {
      // 1. Player-centered zoomed radar minimap (shows ~110x110 world units clearly)
      const viewUnits = 112;
      const viewPx = (viewUnits / 180) * BASE_SIZE;
      const pBaseX = ((data.playerPos.x + 90) / 180) * BASE_SIZE;
      const pBaseY = ((data.playerPos.z + 90) / 180) * BASE_SIZE;
      const sx = Math.max(0, Math.min(BASE_SIZE - viewPx, pBaseX - viewPx / 2));
      const sy = Math.max(0, Math.min(BASE_SIZE - viewPx, pBaseY - viewPx / 2));
  
      mmCtx.drawImage(staticMap, sx, sy, viewPx, viewPx, 0, 0, MINI_SIZE, MINI_SIZE);
  
      const toMini = (wx, wz) => {
        const bx = ((wx + 90) / 180) * BASE_SIZE;
        const by = ((wz + 90) / 180) * BASE_SIZE;
        return [((bx - sx) / viewPx) * MINI_SIZE, ((by - sy) / viewPx) * MINI_SIZE];
      };
      drawEntityMarkers(mmCtx, toMini, data, 1.0);
  
      // Subtle radar crosshair vignette
      mmCtx.strokeStyle = 'rgba(150, 210, 235, 0.14)';
      mmCtx.lineWidth = 1;
      mmCtx.strokeRect(0.5, 0.5, MINI_SIZE - 1, MINI_SIZE - 1);
  
      // 2. Full Valley Map (only draws when [M] overlay is open!)
      if (fullMapOpen) {
        fullCtx.drawImage(staticMap, 0, 0);
        const toFull = (wx, wz) => [((wx + 90) / 180) * BASE_SIZE, ((wz + 90) / 180) * BASE_SIZE];
        drawEntityMarkers(fullCtx, toFull, data, 1.35);
      }
    }
  
    return { setVisible, updateArea, resetArea, setObjective, showDialogue, tickDialogue, updateStatus, updateMinimap };
  }