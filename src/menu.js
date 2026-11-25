// =========================================================
// ECHOES OF ASH — DARK GLOOMY TITLE MENU + CONTROLS SCREEN
// =========================================================

const CREDITS_ENTRIES = [
    { role: 'GAME DESIGN, CODE & SHADERS', name: 'Savanth' },
    { role: 'SOUND & MUSIC', name: '[ Add your audio credits here ]' },
    { role: '3D ASSETS & TOOLS', name: '[ Add Three.js / Vite / tools here ]' },
    { role: 'PLAYTESTING & FEEDBACK', name: '[ Add playtesters here ]' },
  ];
  
  const CONTROLS_ENTRIES = [
    { key: 'W A S D / ARROWS', desc: 'Move Knight or Steer Warhorse' },
    { key: 'LEFT CLICK / F', desc: '3-Hit Broadsword Slash Combo' },
    { key: 'SPACE / RIGHT CLICK', desc: 'Resonance Shield Parry & Bounce Back' },
    { key: 'SHIFT', desc: 'Dash (On Foot) / Sprint Gallop (Mounted)' },
    { key: 'E', desc: 'Mount or Dismount Warhorse' },
    { key: 'H', desc: 'Whistle to Summon Warhorse' },
    { key: 'M', desc: 'Toggle Full Valley Cartography Map' },
    { key: '1 / 2 / 3 / 4', desc: 'Switch ASCII Modes & Raw 3D View' },
    { key: 'ESC', desc: 'Pause / Open Main Menu' },
  ];
  
  const ABOUT_ME_HTML = `
    <div class="twd-panel-title">ABOUT ME</div>
    <div class="twd-panel-body">
      <p>Hey, I&rsquo;m <span>Savanth</span>.</p>
      <p>Built this solo for the Harvest jam with zero AI art and zero AI audio.</p>
    </div>
  `;
  
  const BRUSH_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 58' preserveAspectRatio='none'%3E%3Cpath d='M9,9 L304,3 L318,12 L308,21 L317,34 L301,48 L312,54 L13,56 L2,45 L10,30 L1,18 Z' fill='%23ced6de'/%3E%3Cpath d='M0,24 L15,21 L11,29 L0,28 Z M303,14 L320,16 L308,23 Z M295,45 L318,47 L305,52 Z' fill='%23ced6de' opacity='0.82'/%3E%3C/svg%3E")`;
  
  function injectMenuStyles() {
    if (document.getElementById('twd-menu-styles')) return;
    const style = document.createElement('style');
    style.id = 'twd-menu-styles';
    style.textContent = `
      #menu-overlay {
        position: fixed; inset: 0; z-index: 50;
        display: flex; flex-direction: column; justify-content: space-between;
        padding: 6vh 7vw 5.5vh 7vw;
        font-family: 'Franklin Gothic Medium', 'Arial Narrow', 'Trebuchet MS', sans-serif;
        color: #c7d0d8;
        background:
          linear-gradient(90deg, rgba(4, 7, 11, 0.88) 0%, rgba(5, 9, 14, 0.56) 36%, rgba(5, 9, 14, 0.12) 70%, rgba(4, 7, 11, 0.48) 100%),
          radial-gradient(ellipse at 65% 50%, rgba(0,0,0,0) 38%, rgba(2, 4, 7, 0.86) 100%);
        box-shadow: inset 0 0 110px rgba(0, 0, 0, 0.92);
        transition: opacity 0.28s ease, visibility 0.28s ease;
        user-select: none;
      }
      #menu-overlay.menu-hidden {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }
      #menu-overlay::after {
        content: '';
        position: fixed; inset: 14px; pointer-events: none;
        border: 1px solid rgba(185, 200, 215, 0.08);
        box-shadow: inset 0 0 28px rgba(0, 0, 0, 0.75);
      }
  
      .twd-header { position: relative; z-index: 2; max-width: 520px; }
      .twd-title {
        font-size: clamp(32px, 4.6vw, 56px);
        font-weight: 800; letter-spacing: 5px; line-height: 1.02;
        color: #d7dee6; text-transform: uppercase;
        text-shadow: 0 4px 18px rgba(0, 0, 0, 0.95), 0 0 2px rgba(215, 226, 238, 0.35);
      }
      .twd-rule {
        width: 190px; height: 2px; margin-top: 10px;
        background: linear-gradient(90deg, rgba(196, 208, 220, 0.55), rgba(196, 208, 220, 0));
      }
  
      .twd-stage { position: relative; z-index: 2; margin: auto 0; max-width: 600px; }
      .twd-screen {
        display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
        animation: twdSlideIn 0.26s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      @keyframes twdSlideIn {
        from { opacity: 0; transform: translateX(-16px); }
        to   { opacity: 1; transform: translateX(0); }
      }
  
      .twd-sub-label {
        font-family: 'Courier New', monospace;
        font-size: 11px; letter-spacing: 3px; text-transform: uppercase;
        color: #7d92a3; margin-bottom: 10px; padding-left: 16px;
      }
  
      .twd-item {
        position: relative;
        display: inline-flex; align-items: center;
        min-width: 250px;
        padding: 8px 34px 8px 16px;
        border: none; background: transparent; cursor: pointer;
        font-family: inherit;
        font-size: clamp(20px, 2.2vw, 28px);
        font-weight: 800; letter-spacing: 2.2px; text-transform: uppercase; text-align: left;
        color: #b4c0ca;
        text-shadow: 0 3px 10px rgba(0, 0, 0, 0.95);
        transition: color 0.16s ease, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), letter-spacing 0.2s ease;
      }
      .twd-item::before {
        content: '';
        position: absolute; inset: -2px -12px -2px -10px; z-index: -1;
        background-image: ${BRUSH_SVG};
        background-size: 100% 100%; background-repeat: no-repeat;
        transform-origin: left center;
        transform: scaleX(0.05) skewX(-5deg);
        opacity: 0;
        filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.78));
        transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease;
      }
      .twd-item.is-active {
        color: #0b1015; text-shadow: none;
        transform: translateX(10px) scale(1.03);
        letter-spacing: 3px;
      }
      .twd-item.is-active::before { transform: scaleX(1) skewX(0deg); opacity: 0.95; }
      .twd-item.twd-back { margin-top: 14px; font-size: clamp(16px, 1.6vw, 20px); color: #8293a1; }
      .twd-item.twd-back.is-active { color: #0b1015; }
  
      .twd-panel {
        max-width: 560px; width: 100%;
        padding: 4px 0 8px 16px;
        border-left: 2px solid rgba(196, 208, 220, 0.28);
        margin-bottom: 8px;
      }
      .twd-panel-title {
        font-size: 22px; font-weight: 800; letter-spacing: 4px;
        color: #dce4ec; margin-bottom: 14px;
        text-shadow: 0 3px 10px rgba(0, 0, 0, 0.9);
      }
      .twd-panel-body p {
        font-family: 'Courier New', monospace;
        font-size: 14px; line-height: 1.68;
        color: #b7c4cf; margin-bottom: 12px;
        text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95);
      }
      .twd-panel-body span { color: #eef5fc; font-weight: bold; }
  
      .twd-credit-row { margin-bottom: 12px; }
      .twd-credit-role { font-family: 'Courier New', monospace; font-size: 11px; letter-spacing: 2.2px; color: #7e95a8; }
      .twd-credit-name { font-family: 'Courier New', monospace; font-size: 14px; color: #dce5ed; margin-top: 2px; text-shadow: 0 2px 6px rgba(0,0,0,0.9); }
  
      .twd-ctrl-row {
        display: grid; grid-template-columns: 185px 1fr; gap: 14px; align-items: center;
        margin-bottom: 8px; font-family: 'Courier New', monospace;
      }
      .twd-ctrl-key {
        font-size: 11.5px; font-weight: bold; letter-spacing: 1px; color: #77ffee;
        text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95);
      }
      .twd-ctrl-desc {
        font-size: 12.5px; color: #c8d5df;
        text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95);
      }
  
      .twd-footer {
        position: relative; z-index: 2;
        display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;
        flex-wrap: wrap; font-family: 'Courier New', monospace;
      }
      .twd-prompts { display: flex; gap: 18px; align-items: center; font-size: 12px; letter-spacing: 1.2px; color: #96a8b7; }
      .twd-key {
        display: inline-flex; align-items: center; justify-content: center;
        padding: 2px 7px; margin-right: 6px;
        border: 1px solid rgba(185, 200, 215, 0.45); border-radius: 3px;
        font-size: 11px; color: #dce5ed; background: rgba(10, 16, 22, 0.6);
      }
      .twd-hint {
        font-size: 12.5px; color: #a7b8c6; max-width: 390px; text-align: right;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.95);
        transition: opacity 0.18s ease;
      }
    `;
    document.head.appendChild(style);
  }
  
  export function createGameMenu({ onStartStory, onStartOpen, onResume }) {
    injectMenuStyles();
  
    const overlay = document.createElement('div');
    overlay.id = 'menu-overlay';
    overlay.innerHTML = `
      <div class="twd-header">
        <div class="twd-title">ECHOES OF ASH</div>
        <div class="twd-rule"></div>
      </div>
      <div class="twd-stage" id="twd-stage"></div>
      <div class="twd-footer">
        <div class="twd-prompts">
          <span><span class="twd-key">W/S</span>Move</span>
          <span><span class="twd-key">ENTER</span>Select</span>
          <span id="twd-back-prompt" style="display:none;"><span class="twd-key">ESC</span>Back</span>
        </div>
        <div class="twd-hint" id="twd-hint">The valley remembers what you bounce back.</div>
      </div>
    `;
    document.body.appendChild(overlay);
  
    const stageEl = overlay.querySelector('#twd-stage');
    const hintEl = overlay.querySelector('#twd-hint');
    const backPromptEl = overlay.querySelector('#twd-back-prompt');
  
    let visible = true;
    let canResume = false;
    let screen = 'main';
    let activeIdx = 0;
    let currentButtons = [];
  
    function setHint(text) {
      if (!text || hintEl.textContent === text) return;
      hintEl.style.opacity = '0';
      setTimeout(() => {
        hintEl.textContent = text;
        hintEl.style.opacity = '1';
      }, 90);
    }
  
    function highlight(index) {
      if (!currentButtons.length) return;
      activeIdx = (index + currentButtons.length) % currentButtons.length;
      currentButtons.forEach((btn, i) => btn.classList.toggle('is-active', i === activeIdx));
      const activeBtn = currentButtons[activeIdx];
      if (activeBtn && activeBtn.dataset.hint) setHint(activeBtn.dataset.hint);
    }
  
    function makeItem(label, hint, action, extraClass = '') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `twd-item ${extraClass}`.trim();
      btn.textContent = label;
      btn.dataset.hint = hint;
      btn.addEventListener('mouseenter', () => {
        const idx = currentButtons.indexOf(btn);
        if (idx !== -1 && idx !== activeIdx) highlight(idx);
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.blur();
        action();
      });
      return btn;
    }
  
    function renderScreen(nextScreen) {
      screen = nextScreen;
      stageEl.innerHTML = '';
      currentButtons = [];
      backPromptEl.style.display = screen === 'main' && !canResume ? 'none' : 'inline-flex';
  
      const wrap = document.createElement('div');
      wrap.className = 'twd-screen';
  
      if (screen === 'main') {
        if (canResume) {
          currentButtons.push(makeItem('RESUME', 'Step right back into the valley.', () => {
            close();
            onResume();
          }));
        }
        currentButtons.push(
          makeItem('PLAY', 'Choose between the guided story or peaceful open world.', () => renderScreen('play')),
          makeItem('CONTROLS', 'Sword combat, shield parries, horse riding & view shortcuts.', () => renderScreen('controls')),
          makeItem('CREDITS', 'The people and tools behind Echoes of Ash.', () => renderScreen('credits')),
          makeItem('ABOUT ME', 'A short note from the creator.', () => renderScreen('about'))
        );
        currentButtons.forEach((b) => wrap.appendChild(b));
      } else if (screen === 'play') {
        const label = document.createElement('div');
        label.className = 'twd-sub-label';
        label.textContent = 'SELECT MODE';
        wrap.appendChild(label);
  
        currentButtons.push(
          makeItem('STORY MODE', 'Follow the spirit trail from Silverstream Bridge to the Warden.', () => {
            canResume = true;
            close();
            onStartStory();
          }),
          makeItem('OPEN WORLD', 'Explore every biome, monument, village, and roaming foe freely.', () => {
            canResume = true;
            close();
            onStartOpen();
          }),
          makeItem('BACK', 'Return to the main menu.', () => renderScreen('main'), 'twd-back')
        );
        currentButtons.forEach((b) => wrap.appendChild(b));
      } else if (screen === 'controls') {
        const panel = document.createElement('div');
        panel.className = 'twd-panel';
        panel.innerHTML = `
          <div class="twd-panel-title">CONTROLS</div>
          ${CONTROLS_ENTRIES.map(
            (c) => `<div class="twd-ctrl-row"><span class="twd-ctrl-key">${c.key}</span><span class="twd-ctrl-desc">${c.desc}</span></div>`
          ).join('')}
        `;
        wrap.appendChild(panel);
        const backBtn = makeItem('BACK', 'Return to the main menu.', () => renderScreen('main'), 'twd-back');
        currentButtons.push(backBtn);
        wrap.appendChild(backBtn);
      } else if (screen === 'credits') {
        const panel = document.createElement('div');
        panel.className = 'twd-panel';
        panel.innerHTML = `
          <div class="twd-panel-title">CREDITS</div>
          ${CREDITS_ENTRIES.map(
            (c) => `<div class="twd-credit-row"><div class="twd-credit-role">${c.role}</div><div class="twd-credit-name">${c.name}</div></div>`
          ).join('')}
        `;
        wrap.appendChild(panel);
        const backBtn = makeItem('BACK', 'Return to the main menu.', () => renderScreen('main'), 'twd-back');
        currentButtons.push(backBtn);
        wrap.appendChild(backBtn);
      } else if (screen === 'about') {
        const panel = document.createElement('div');
        panel.className = 'twd-panel';
        panel.innerHTML = ABOUT_ME_HTML;
        wrap.appendChild(panel);
        const backBtn = makeItem('BACK', 'Return to the main menu.', () => renderScreen('main'), 'twd-back');
        currentButtons.push(backBtn);
        wrap.appendChild(backBtn);
      }
  
      stageEl.appendChild(wrap);
      highlight(0);
    }
  
    function open() {
      visible = true;
      overlay.classList.remove('menu-hidden');
      renderScreen('main');
    }
  
    function close() {
      visible = false;
      // CRITICAL FIX: blur focused button so pressing Space in-game never re-triggers menu clicks!
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
      overlay.classList.add('menu-hidden');
    }
  
    function goBack() {
      if (screen !== 'main') {
        renderScreen('main');
        return true;
      }
      return false;
    }
  
    window.addEventListener('keydown', (e) => {
      if (!visible) return;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        highlight(activeIdx + 1);
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        highlight(activeIdx - 1);
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        if (currentButtons[activeIdx]) currentButtons[activeIdx].click();
      } else if (e.code === 'Backspace' && screen !== 'main') {
        e.preventDefault();
        renderScreen('main');
      }
    });
  
    renderScreen('main');
    return { open, close, goBack, setCanResume(v) { canResume = v; }, isOpen() { return visible; } };
  }