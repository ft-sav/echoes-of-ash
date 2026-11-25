import * as THREE from 'three';

// =========================================================
// MINIMAL HUD, ANIMATED HP BAR, DAMAGE VIGNETTE, FLOATING NUMBERS & MAP
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

    /* Red Damage Vignette Overlay */
    #damage-vignette {
      position: fixed; inset: 0; pointer-events: none; z-index: 18;
      opacity: 0;
      box-shadow: inset 0 0 110px 28px rgba(210, 28, 36, 0.85);
      transition: opacity 0.45s ease-out;
    }
    #damage-vignette.flash { opacity: 1; transition: opacity 0.04s ease-in; }

    /* Subtle Area / Biome Fade Banner */
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

    /* Redesigned Health Bar: Delayed Chip + Shake + Flash + Color Shift + Regen Glow */
    #status-strip {
      position: fixed; bottom: 20px; left: 22px;
      display: flex; flex-direction: column; gap: 7px;
      text-shadow: 0 2px 8px rgba(0,0,0,0.95);
    }
    #boss-wrap { display: none; width: 250px; margin-bottom: 4px; }
    #boss-label { font-size: 10.5px; letter-spacing: 2.5px; color: #ff9466; margin-bottom: 3px; }
    #boss-track {
      position: relative; height: 7px;
      background: rgba(10, 14, 18, 0.85);
      border: 1px solid rgba(255, 130, 80, 0.45);
      overflow: hidden;
    }
    #boss-chip {
      position: absolute; inset: 0 auto 0 0; width: 100%;
      background: #ffe0c2; transition: width 0.4s ease-out 0.2s;
    }
    #boss-fill {
      position: absolute; inset: 0 auto 0 0; width: 100%;
      background: linear-gradient(90deg, #c93822, #ff6a2b);
      transition: width 0.12s ease-out;
    }

    #hp-meta {
      display: flex; align-items: center; gap: 14px;
      font-size: 11.5px; letter-spacing: 1.5px; color: #cbd8e3;
    }
    #hp-bar-outer {
      position: relative; width: 228px; height: 11px;
      background: rgba(6, 10, 14, 0.88);
      border: 1px solid rgba(175, 205, 225, 0.38);
      box-shadow: 0 3px 12px rgba(0,0,0,0.8);
      overflow: hidden;
    }
    #hp-bar-outer.shake { animation: hpShake 0.28s ease-out; }
    @keyframes hpShake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-7px); }
      45% { transform: translateX(6px); }
      70% { transform: translateX(-4px); }
      85% { transform: translateX(2px); }
    }
    #hp-chip {
      position: absolute; inset: 0 auto 0 0; width: 100%;
      background: #e6f0d5;
      transition: width 0.35s ease-out 0.22s;
    }
    #hp-fill {
      position: absolute; inset: 0 auto 0 0; width: 100%;
      background: linear-gradient(90deg, #2fb89a, #5ef2cc);
      transition: width 0.16s ease-out, background 0.25s ease;
    }
    #hp-fill.warn { background: linear-gradient(90deg, #cc8a24, #f5c34c); }
    #hp-fill.crit {
      background: linear-gradient(90deg, #b5242e, #ff4d57);
      animation: hpPulse 0.38s ease-in-out infinite alternate;
    }
    #hp-fill.regen { box-shadow: 0 0 12px rgba(100, 255, 210, 0.85); }
    @keyframes hpPulse { from { filter: brightness(0.85); } to { filter: brightness(1.35); } }

    #hp-flash {
      position: absolute; inset: 0; background: #ffffff; opacity: 0;
      transition: opacity 0.16s ease-out; pointer-events: none;
    }
    #hp-flash.pop { opacity: 0.9; transition: opacity 0.02s linear; }

    #key-hint { font-size: 10.5px; letter-spacing: 0.9px; color: rgba(165, 185, 200, 0.68); }

    #dialogue-box {
      position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%);
      background: rgba(5, 9, 14, 0.84); border: 1px solid rgba(155, 195, 220, 0.28);
      padding: 10px 20px; font-size: 12.5px; color: #e2edf5; max-width: 600px; width: 86%;
      text-align: center; display: none; letter-spacing: 0.6px;
    }

    /* Pooled Floating Damage & Heal Numbers */
    .float-num {
      position: fixed; left: 0; top: 0; z-index: 24;
      font-family: 'Courier New', monospace;
      font-size: 15px; font-weight: bold; letter-spacing: 1px;
      pointer-events: none; white-space: nowrap;
      text-shadow: 0 2px 6px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.9);
      display: none;
    }

    /* Zoomed Radar Minimap + Full Map */
    #minimap-wrap {
      position: fixed; top: 18px; right: 20px;
      background: rgba(5, 9, 14, 0.88);
      border: 1px solid rgba(165, 200, 220, 0.4);
      padding: 6px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.85);
      pointer-events: auto; cursor: pointer;
      transition: border-color 0.2s ease;
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
    <div id="damage-vignette"></div>
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
          <span style="color:#55ff66;">&#9632; FOE</span>
          <span style="color:#ff5522;">&#9632; WARDEN</span>
        </div>
      </div>
    </div>
    <div id="status-strip">
      <div id="boss-wrap">
        <div id="boss-label">THE HORNED WARDEN</div>
        <div id="boss-track"><div id="boss-chip"></div><div id="boss-fill"></div></div>
      </div>
      <div id="hp-meta">
        <span id="hp-num">HP 100/100</span>
        <span id="parry-num">PARRIES 0</span>
        <span id="mount-num">[E] MOUNT</span>
      </div>
      <div id="hp-bar-outer">
        <div id="hp-chip"></div>
        <div id="hp-fill"></div>
        <div id="hp-flash"></div>
      </div>
      <div id="key-hint">[LMB/F] SWORD &middot; [SPACE/RMB] PARRY &middot; [SHIFT] DASH &middot; [E] MOUNT &middot; [M] MAP &middot; [ESC] MENU</div>
    </div>
    <div id="dialogue-box"></div>
  `;
  document.body.appendChild(root);

  const dmgVig = root.querySelector('#damage-vignette');
  const areaBanner = root.querySelector('#area-banner');
  const areaNameEl = root.querySelector('#area-name');
  const areaSubEl = root.querySelector('#area-sub');
  const storyBanner = root.querySelector('#story-banner');
  const bossWrap = root.querySelector('#boss-wrap');
  const bossFill = root.querySelector('#boss-fill');
  const bossChip = root.querySelector('#boss-chip');
  const hpOuter = root.querySelector('#hp-bar-outer');
  const hpFill = root.querySelector('#hp-fill');
  const hpChip = root.querySelector('#hp-chip');
  const hpFlash = root.querySelector('#hp-flash');
  const hpNum = root.querySelector('#hp-num');
  const parryNum = root.querySelector('#parry-num');
  const mountNum = root.querySelector('#mount-num');
  const dlgBox = root.querySelector('#dialogue-box');
  const mmLabel = root.querySelector('#mm-region');
  const mmCanvas = root.querySelector('#minimap-canvas');
  const mmCtx = mmCanvas.getContext('2d');
  const fullOverlay = root.querySelector('#fullmap-overlay');
  const fullCanvas = root.querySelector('#fullmap-canvas');
  const fullCtx = fullCanvas.getContext('2d');

  // Pooled Floating Damage / Heal Numbers (Zero GC!)
  const floatPool = Array.from({ length: 16 }, () => {
    const el = document.createElement('div');
    el.className = 'float-num';
    root.appendChild(el);
    return { el, active: false, worldPos: new THREE.Vector3(), life: 0, maxLife: 0.75, rise: 0 };
  });
  let floatCursor = 0;
  const _proj = new THREE.Vector3();

  function spawnFloatText(pos, text, color = '#ffe066', big = false) {
    const slot = floatPool[floatCursor];
    floatCursor = (floatCursor + 1) % floatPool.length;
    slot.active = true;
    slot.worldPos.set(pos.x + (Math.random() - 0.5) * 0.6, pos.y + 2.0, pos.z);
    slot.life = 0.78;
    slot.maxLife = 0.78;
    slot.rise = 0;
    slot.el.textContent = text;
    slot.el.style.color = color;
    slot.el.style.fontSize = big ? '18px' : '14px';
    slot.el.style.display = 'block';
  }

  function updateFloatTexts(dt, camera) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < floatPool.length; i++) {
      const f = floatPool[i];
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        f.el.style.display = 'none';
        continue;
      }
      f.rise += dt * 1.45;
      _proj.set(f.worldPos.x, f.worldPos.y + f.rise, f.worldPos.z).project(camera);
      if (_proj.z > 1) {
        f.el.style.display = 'none';
        continue;
      }
      const sx = (_proj.x * 0.5 + 0.5) * w;
      const sy = (-_proj.y * 0.5 + 0.5) * h;
      const alpha = Math.min(1, (f.life / f.maxLife) * 1.4);
      f.el.style.display = 'block';
      f.el.style.opacity = alpha.toFixed(2);
      f.el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -50%)`;
    }
  }

  // Trigger Red Vignette + HP Bar Shake + White Flash on Damage
  function triggerDamageUI() {
    dmgVig.classList.add('flash');
    setTimeout(() => dmgVig.classList.remove('flash'), 80);

    hpOuter.classList.remove('shake');
    void hpOuter.offsetWidth;
    hpOuter.classList.add('shake');

    hpFlash.classList.add('pop');
    setTimeout(() => hpFlash.classList.remove('pop'), 65);
  }

  function triggerHealFlash() {
    hpFlash.classList.add('pop');
    setTimeout(() => hpFlash.classList.remove('pop'), 90);
  }

  // Pre-render 360x360 cartographic map once
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
    areaHideTimeout = setTimeout(() => areaBanner.classList.remove('show'), 2800);
  }

  function resetArea() {
    currentAreaId = '';
    areaBanner.classList.remove('show');
  }

  function setObjective(html) {
    if (!html) storyBanner.style.display = 'none';
    else {
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

  function updateStatus({ hp, maxHp, parries, mountLabel, isRegening, showBoss, bossHp, bossMax }) {
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    hpFill.style.width = `${pct.toFixed(1)}%`;
    hpChip.style.width = `${pct.toFixed(1)}%`;
    hpFill.classList.toggle('crit', pct <= 30);
    hpFill.classList.toggle('warn', pct > 30 && pct <= 60);
    hpFill.classList.toggle('regen', Boolean(isRegening));

    hpNum.textContent = `HP ${Math.ceil(hp)}/${maxHp}`;
    parryNum.textContent = `PARRIES ${parries}`;
    mountNum.textContent = mountLabel;

    if (showBoss && bossHp > 0) {
      bossWrap.style.display = 'block';
      const bpct = Math.max(0, (bossHp / bossMax) * 100);
      bossFill.style.width = `${bpct.toFixed(1)}%`;
      bossChip.style.width = `${bpct.toFixed(1)}%`;
    } else {
      bossWrap.style.display = 'none';
    }
  }

  function drawEntityMarkers(ctx, toXY, { playerPos, playerYaw, horsePos, isMounted, mobs, warden, objectivePos }, scale = 1) {
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
    mobs.forEach((m) => {
      if (!m.group.visible || m.hp <= 0) return;
      const [sx, sy] = toXY(m.group.position.x, m.group.position.z);
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

    mmCtx.strokeStyle = 'rgba(150, 210, 235, 0.14)';
    mmCtx.lineWidth = 1;
    mmCtx.strokeRect(0.5, 0.5, MINI_SIZE - 1, MINI_SIZE - 1);

    if (fullMapOpen) {
      fullCtx.drawImage(staticMap, 0, 0);
      const toFull = (wx, wz) => [((wx + 90) / 180) * BASE_SIZE, ((wz + 90) / 180) * BASE_SIZE];
      drawEntityMarkers(fullCtx, toFull, data, 1.35);
    }
  }

  return {
    setVisible,
    updateArea,
    resetArea,
    setObjective,
    showDialogue,
    tickDialogue,
    updateStatus,
    updateMinimap,
    spawnFloatText,
    updateFloatTexts,
    triggerDamageUI,
    triggerHealFlash,
  };
}