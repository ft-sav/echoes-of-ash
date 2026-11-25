import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createGameMenu } from './menu.js';
import { createGameUI } from './ui.js';
import {
  buildWorld,
  createAsciiRockTexture,
  getGroundY,
  getWalkableY,
  isInWater,
  getAreaInfo,
  BRIDGE_X,
  BRIDGE_Z,
  WATERFALL_POOL,
  SHRINE_POS,
  KEEP_POS,
} from './world.js';

// =========================================================
// 1. HYBRID HIGH-DETAIL "REEL" ASCII SHADER
// =========================================================
const CHARS = " .'`,-:;~=+*!ivco08Q#MW%@";

function createAsciiPass(width, height, cellW = 5.5, cellH = 9.0) {
  const cw = 28;
  const ch = 44;
  const canvas = document.createElement('canvas');
  canvas.width = cw * CHARS.length;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px "Consolas", "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < CHARS.length; i++) {
    ctx.fillText(CHARS[i], i * cw + cw / 2, ch / 2 + 1);
  }

  const atlas = new THREE.CanvasTexture(canvas);
  atlas.minFilter = THREE.LinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.needsUpdate = true;

  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tAtlas: { value: atlas },
      uResolution: { value: new THREE.Vector2(width, height) },
      uCellSize: { value: new THREE.Vector2(cellW, cellH) },
      uCharCount: { value: CHARS.length },
      uHybrid: { value: 1.0 },
      uFlash: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform sampler2D tAtlas;
      uniform vec2 uResolution;
      uniform vec2 uCellSize;
      uniform float uCharCount;
      uniform float uHybrid;
      uniform float uFlash;
      varying vec2 vUv;

      vec3 sampleSrgb(vec2 uv) {
        vec3 lin = texture2D(tDiffuse, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
        return pow(max(lin, vec3(0.0)), vec3(0.454545));
      }

      float getLum(vec3 c) {
        return dot(c, vec3(0.299, 0.587, 0.114));
      }

      void main() {
        vec2 grid = max(floor(uResolution / uCellSize), vec2(1.0));
        vec2 stepUv = vec2(1.0) / grid;
        vec2 cellUv = (floor(vUv * grid) + vec2(0.5)) / grid;
        vec2 localUv = fract(vUv * grid);

        vec3 rawCol = sampleSrgb(vUv);
        float rawLum = getLum(rawCol);
        vec3 cellCol = sampleSrgb(cellUv);
        float cellLum = getLum(cellCol);

        float lL = getLum(sampleSrgb(cellUv - vec2(stepUv.x, 0.0)));
        float lR = getLum(sampleSrgb(cellUv + vec2(stepUv.x, 0.0)));
        float lU = getLum(sampleSrgb(cellUv + vec2(0.0, stepUv.y)));
        float lD = getLum(sampleSrgb(cellUv - vec2(0.0, stepUv.y)));
        float edge = clamp((abs(lL - lR) + abs(lU - lD)) * 1.85, 0.0, 0.5);

        float contrast = smoothstep(0.025, 0.88, cellLum * 1.25);
        float density = clamp(pow(contrast, 0.72) + edge * 0.75, 0.0, 0.999);
        float charIndex = floor(density * uCharCount);

        vec2 atlasUv = vec2((charIndex + localUv.x) / uCharCount, localUv.y);
        float glyph = texture2D(tAtlas, atlasUv).r;

        vec3 pureBg = vec3(0.01, 0.014, 0.02);
        vec3 pureFg = mix(vec3(cellLum), cellCol, 1.12) * (1.35 + edge * 0.7) + vec3(0.03);
        vec3 pureAscii = mix(pureBg, pureFg, glyph);

        vec3 crispBase = rawCol * 0.68;
        vec3 glyphInk = (mix(vec3(cellLum), cellCol, 0.75) * 1.5 + vec3(0.08)) * glyph;
        float asciiMask = clamp(0.42 + edge * 0.95 + smoothstep(0.18, 0.75, cellLum) * 0.45, 0.0, 1.0);
        vec3 hybridCol = crispBase + glyphInk * asciiMask * 0.82;
        hybridCol = mix(hybridCol, rawCol * 1.15 + glyphInk * 0.35, smoothstep(0.68, 0.98, rawLum));

        vec3 finalColor = mix(pureAscii, hybridCol, uHybrid);

        vec2 bOff = stepUv * 1.8;
        vec3 glow =
          max(sampleSrgb(vUv + vec2(bOff.x, 0.0)) - vec3(0.62), vec3(0.0)) +
          max(sampleSrgb(vUv - vec2(bOff.x, 0.0)) - vec3(0.62), vec3(0.0)) +
          max(sampleSrgb(vUv + vec2(0.0, bOff.y)) - vec3(0.62), vec3(0.0)) +
          max(sampleSrgb(vUv - vec2(0.0, bOff.y)) - vec3(0.62), vec3(0.0));
        finalColor += glow * 0.3;

        float dist = distance(vUv, vec2(0.5));
        finalColor *= smoothstep(0.95, 0.32, dist);

        finalColor = mix(finalColor, vec3(1.0), uFlash);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

// =========================================================
// 2. RENDERER, SCENE, LIGHTING & STATIC ORB LIGHT POOL
// =========================================================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const dpr = Math.min(window.devicePixelRatio, 1.25);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(dpr);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05090e);
scene.fog = new THREE.Fog(0x060b12, 42, 98);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.5, 210);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const asciiPass = createAsciiPass(window.innerWidth * dpr, window.innerHeight * dpr, 5.5, 9.0);
composer.addPass(asciiPass);

scene.add(new THREE.HemisphereLight(0x88bef0, 0x102418, 0.9));

const moonLight = new THREE.DirectionalLight(0xcce4ff, 2.25);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
moonLight.shadow.camera.near = 2;
moonLight.shadow.camera.far = 85;
moonLight.shadow.camera.left = -26;
moonLight.shadow.camera.right = 26;
moonLight.shadow.camera.top = 26;
moonLight.shadow.camera.bottom = -26;
moonLight.shadow.bias = -0.0005;
scene.add(moonLight);
scene.add(moonLight.target);

// Pre-allocated 2-light Orb Pool (Zero shader recompilations during combat)
const orbLightPool = Array.from({ length: 2 }, () => {
  const pl = new THREE.PointLight(0xff5511, 0, 10, 1.2);
  pl.position.set(0, -50, 0);
  scene.add(pl);
  return pl;
});

// Build Expanded Multi-Biome World, Stream, Bridge & Ashenbrook Village
const world = buildWorld(scene);
const ui = createGameUI(world.drawStaticMinimap);

// =========================================================
// 3. RIDEABLE WARHORSE + VERLET FLOWING MANE & TAIL
// =========================================================
function createWarhorse(x, z) {
  const root = new THREE.Group();
  root.position.set(x, getWalkableY(x, z), z);
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const coatMat = new THREE.MeshStandardMaterial({ map: createAsciiRockTexture(), color: 0x8e99a6, roughness: 0.55, metalness: 0.2 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.8 });
  const saddleMat = new THREE.MeshStandardMaterial({ color: 0x5c2424, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.88, 2.25), coatMat);
  torso.position.set(0, 1.48, 0);
  torso.castShadow = true;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.54, 10, 10), coatMat);
  chest.position.set(0, 1.48, 0.92);
  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.56, 10, 10), coatMat);
  rump.position.set(0, 1.5, -0.92);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.22, 0.82), saddleMat);
  saddle.position.set(0, 1.96, -0.05);
  bodyPivot.add(torso, chest, rump, saddle);

  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 1.65, 0.98);
  bodyPivot.add(neckPivot);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.15, 0.56), coatMat);
  neck.position.set(0, 0.45, 0.24);
  neck.rotation.x = 0.46;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.92), coatMat);
  head.position.set(0, 0.92, 0.68);
  head.rotation.x = 0.28;
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 4), coatMat);
  earL.position.set(-0.14, 1.22, 0.46);
  const earR = earL.clone();
  earR.position.x = 0.14;
  neckPivot.add(neck, head, earL, earR);

  function makeLeg(lx, lz) {
    const hip = new THREE.Group();
    hip.position.set(lx, 1.22, lz);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.26), coatMat);
    upper.position.y = -0.32;
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.set(0, -0.64, 0);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.2), coatMat);
    lower.position.y = -0.28;
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.26), darkMat);
    hoof.position.set(0, -0.56, 0.03);
    knee.add(lower, hoof);
    hip.add(knee);
    bodyPivot.add(hip);
    return { hip, knee };
  }

  const legs = {
    fl: makeLeg(-0.34, 0.85),
    fr: makeLeg(0.34, 0.85),
    bl: makeLeg(-0.34, -0.88),
    br: makeLeg(0.34, -0.88),
  };

  const strands = [];
  const N = 6;
  for (let i = 0; i < 16; i++) {
    const u = i / 15;
    const nodes = Array.from({ length: N }, (_, k) => {
      const p = new THREE.Vector3(x, 2.0 - k * 0.14, z - k * 0.14);
      return { pos: p.clone(), prev: p.clone() };
    });
    strands.push({
      parent: neckPivot,
      anchor: new THREE.Vector3((Math.random() - 0.5) * 0.24, 0.15 + u * 0.92, -0.05 + u * 0.45),
      segLen: 0.17 + Math.random() * 0.05,
      width: 0.11,
      nodes,
      phase: Math.random() * 10,
    });
  }
  for (let i = 0; i < 20; i++) {
    const nodes = Array.from({ length: N }, (_, k) => {
      const p = new THREE.Vector3(x, 1.65 - k * 0.22, z - 1.35 - k * 0.2);
      return { pos: p.clone(), prev: p.clone() };
    });
    strands.push({
      parent: bodyPivot,
      anchor: new THREE.Vector3((Math.random() - 0.5) * 0.26, 1.65 + (Math.random() - 0.5) * 0.18, -1.35),
      segLen: 0.25 + Math.random() * 0.07,
      width: 0.15,
      nodes,
      phase: Math.random() * 10,
    });
  }

  const hairPositions = new Float32Array(strands.length * (N - 1) * 6 * 3);
  const hairGeo = new THREE.BufferGeometry();
  hairGeo.setAttribute('position', new THREE.BufferAttribute(hairPositions, 3));
  const hairMesh = new THREE.Mesh(
    hairGeo,
    new THREE.MeshBasicMaterial({ color: 0xf2f7ff, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })
  );
  hairMesh.frustumCulled = false;
  scene.add(hairMesh);

  const seatPivot = new THREE.Group();
  seatPivot.position.set(0, 1.55, -0.05);
  bodyPivot.add(seatPivot);

  return { root, bodyPivot, neckPivot, seatPivot, legs, strands, hairGeo, hairPositions, yaw: 0, speed: 0, bank: 0, gaitPhase: 0, calling: false };
}

const _anchorWorld = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _backDir = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();
const _tmpPos = new THREE.Vector3();

function updateHorseHair(horse, dt, t, windX, windZ) {
  horse.root.updateMatrixWorld(true);
  const posArr = horse.hairPositions;
  let ptr = 0;
  const gallopKick = Math.min(horse.speed / 14, 1.0);

  for (let s = 0; s < horse.strands.length; s++) {
    const st = horse.strands[s];
    _anchorWorld.copy(st.anchor).applyMatrix4(st.parent.matrixWorld);
    if (st.nodes[0].pos.distanceTo(_anchorWorld) > 6) {
      st.nodes.forEach((n) => { n.pos.copy(_anchorWorld); n.prev.copy(_anchorWorld); });
    }
    st.nodes[0].pos.copy(_anchorWorld);
    st.nodes[0].prev.copy(_anchorWorld);

    for (let k = 1; k < st.nodes.length; k++) {
      const n = st.nodes[k];
      const vx = (n.pos.x - n.prev.x) * 0.84;
      const vy = (n.pos.y - n.prev.y) * 0.84;
      const vz = (n.pos.z - n.prev.z) * 0.84;
      n.prev.copy(n.pos);

      const flutter = Math.sin(t * (7 + gallopKick * 10) + st.phase + k * 0.7);
      n.pos.x += vx + (windX * 4.5 + flutter * (2.2 + gallopKick * 4.5)) * dt * dt;
      n.pos.y += vy + (-7.5 + gallopKick * 2.2) * dt * dt;
      n.pos.z += vz + (windZ * 4.5 + flutter * 1.8) * dt * dt;
    }

    for (let iter = 0; iter < 2; iter++) {
      for (let k = 1; k < st.nodes.length; k++) {
        const a = st.nodes[k - 1].pos;
        const b = st.nodes[k].pos;
        _dir.subVectors(b, a);
        const d = _dir.length() || 0.001;
        _dir.multiplyScalar((d - st.segLen) / d);
        b.sub(_dir);
      }
    }

    for (let k = 0; k < st.nodes.length - 1; k++) {
      const a = st.nodes[k].pos;
      const b = st.nodes[k + 1].pos;
      _dir.subVectors(b, a).normalize();
      _side.crossVectors(_dir, _up);
      if (_side.lengthSq() < 0.01) _side.set(1, 0, 0);
      else _side.normalize();

      const w0 = st.width * (1.0 - k / st.nodes.length);
      const w1 = st.width * (1.0 - (k + 1) / st.nodes.length);

      const ax1 = a.x - _side.x * w0, ay1 = a.y, az1 = a.z - _side.z * w0;
      const ax2 = a.x + _side.x * w0, ay2 = a.y, az2 = a.z + _side.z * w0;
      const bx1 = b.x - _side.x * w1, by1 = b.y, bz1 = b.z - _side.z * w1;
      const bx2 = b.x + _side.x * w1, by2 = b.y, bz2 = b.z + _side.z * w1;

      posArr[ptr++] = ax1; posArr[ptr++] = ay1; posArr[ptr++] = az1;
      posArr[ptr++] = ax2; posArr[ptr++] = ay2; posArr[ptr++] = az2;
      posArr[ptr++] = bx2; posArr[ptr++] = by2; posArr[ptr++] = bz2;

      posArr[ptr++] = ax1; posArr[ptr++] = ay1; posArr[ptr++] = az1;
      posArr[ptr++] = bx2; posArr[ptr++] = by2; posArr[ptr++] = bz2;
      posArr[ptr++] = bx1; posArr[ptr++] = by1; posArr[ptr++] = bz1;
    }
  }
  horse.hairGeo.attributes.position.needsUpdate = true;
}

// =========================================================
// 4. REALISTIC KNIGHT + VERLET CLOTH CAPE
// =========================================================
function createKnight() {
  const group = new THREE.Group();
  const bodyPivot = new THREE.Group();
  group.add(bodyPivot);

  const steelMat = new THREE.MeshStandardMaterial({ color: 0xc6d4e3, roughness: 0.28, metalness: 0.68 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2c3642, roughness: 0.45, metalness: 0.55 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc49a45, roughness: 0.35, metalness: 0.72 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x452b1f, roughness: 0.85 });
  const crestMat = new THREE.MeshStandardMaterial({ color: 0xb82438, roughness: 0.8 });

  function makeKnightLeg(lx) {
    const leg = new THREE.Group();
    leg.position.set(lx, 0.78, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.4, 0.28), darkSteel);
    thigh.position.y = -0.2;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), steelMat);
    knee.position.set(0, -0.4, 0.06);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.38, 0.26), steelMat);
    shin.position.y = -0.58;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.14, 0.34), darkSteel);
    boot.position.set(0, -0.72, 0.05);
    leg.add(thigh, knee, shin, boot);
    bodyPivot.add(leg);
    return leg;
  }
  const leftLeg = makeKnightLeg(-0.21);
  const rightLeg = makeKnightLeg(0.21);

  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.32, 8), darkSteel);
  waist.position.y = 0.88;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.12, 8), leatherMat);
  belt.position.y = 0.88;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.08), brassMat);
  buckle.position.set(0, 0.88, 0.36);

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.62, 8), steelMat);
  chest.scale.set(1.08, 1.0, 0.72);
  chest.position.y = 1.28;
  chest.castShadow = true;

  const chestTrim = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.56), brassMat);
  chestTrim.position.y = 1.52;
  const gorget = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.18, 8), darkSteel);
  gorget.position.y = 1.62;

  const pauldronL = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), steelMat);
  pauldronL.scale.set(1.1, 0.85, 1.0);
  pauldronL.position.set(-0.52, 1.5, 0);
  const pauldronR = pauldronL.clone();
  pauldronR.position.x = 0.52;

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), darkSteel);
  armR.position.set(0.52, 1.15, 0.06);
  const gauntletR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.24), steelMat);
  gauntletR.position.set(0.52, 0.84, 0.1);

  const scabbard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.15, 0.12), leatherMat);
  scabbard.position.set(0.46, 0.82, -0.18);
  scabbard.rotation.x = 0.45;
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.08), brassMat);
  hilt.position.set(0.46, 1.28, 0.06);

  const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.52, 8), steelMat);
  helm.position.y = 1.9;
  helm.castShadow = true;
  const helmRim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 16), brassMat);
  helmRim.rotation.x = Math.PI / 2;
  helmRim.position.y = 2.02;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.075, 0.08), new THREE.MeshBasicMaterial({ color: 0x66ffee }));
  visor.position.set(0, 1.9, 0.25);
  const plume = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.48), crestMat);
  plume.position.set(0, 2.25, -0.06);

  const shieldGroup = new THREE.Group();
  shieldGroup.position.set(-0.62, 1.12, 0.26);
  shieldGroup.rotation.y = -0.22;
  const shieldRim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.96, 0.72), brassMat);
  const shieldFace = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.84, 0.6), darkSteel);
  const shieldRune = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0x55ffee }));
  shieldRune.scale.set(0.4, 1.35, 0.75);
  shieldRune.position.x = -0.06;
  shieldGroup.add(shieldRim, shieldFace, shieldRune);

  const shieldRing = new THREE.Mesh(
    new THREE.RingGeometry(1.4, 1.95, 28),
    new THREE.MeshBasicMaterial({ color: 0x66ffee, side: THREE.DoubleSide, transparent: true, opacity: 0 })
  );
  shieldRing.rotation.x = -Math.PI / 2;
  shieldRing.position.y = 0.16;

  const playerLight = new THREE.PointLight(0xaad8ff, 12, 11, 1.2);
  playerLight.position.set(0, 2.5, 0.5);
  const shieldGlow = new THREE.PointLight(0x55ffee, 0, 14, 1);
  shieldGlow.position.set(0, 1.3, 0);

  bodyPivot.add(
    waist, belt, buckle, chest, chestTrim, gorget,
    pauldronL, pauldronR, armR, gauntletR, scabbard, hilt,
    helm, helmRim, visor, plume, shieldGroup
  );
  group.add(shieldRing, playerLight, shieldGlow);

  // Verlet Cloth Cape
  const cols = 4;
  const rows = 6;
  const capeAnchors = [];
  const capeNodes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1) - 0.5;
      if (r === 0) capeAnchors.push(new THREE.Vector3(u * 0.72, 1.54, -0.28));
      const p = new THREE.Vector3(u * 0.72, 1.54 - r * 0.22, -0.28 - r * 0.08);
      capeNodes.push({ pos: p.clone(), prev: p.clone() });
    }
  }
  const capeIndices = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      capeIndices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  const capePositions = new Float32Array(cols * rows * 3);
  const capeGeo = new THREE.BufferGeometry();
  capeGeo.setAttribute('position', new THREE.BufferAttribute(capePositions, 3));
  capeGeo.setIndex(capeIndices);
  const capeMesh = new THREE.Mesh(
    capeGeo,
    new THREE.MeshStandardMaterial({ color: 0xb82438, roughness: 0.78, side: THREE.DoubleSide })
  );
  capeMesh.frustumCulled = false;
  capeMesh.castShadow = true;
  scene.add(capeMesh);

  return {
    group, bodyPivot, leftLeg, rightLeg, shieldGroup, shieldRing, shieldGlow,
    capeCols: cols, capeRows: rows, capeAnchors, capeNodes, capeGeo, capePositions,
    yaw: 0, speed: 0, bank: 0,
  };
}

function updateKnightCape(knight, dt, t, windX, windZ, moveSpeed) {
  knight.bodyPivot.updateMatrixWorld(true);
  const cols = knight.capeCols;
  const rows = knight.capeRows;
  const nodes = knight.capeNodes;

  knight.group.getWorldQuaternion(_worldQuat);
  _backDir.set(0, 0, -1).applyQuaternion(_worldQuat).normalize();
  knight.bodyPivot.getWorldPosition(_tmpPos);

  _anchorWorld.copy(knight.capeAnchors[0]).applyMatrix4(knight.bodyPivot.matrixWorld);
  const teleported = nodes[0].pos.distanceTo(_anchorWorld) > 4.5;

  for (let c = 0; c < cols; c++) {
    _anchorWorld.copy(knight.capeAnchors[c]).applyMatrix4(knight.bodyPivot.matrixWorld);
    nodes[c].pos.copy(_anchorWorld);
    nodes[c].prev.copy(_anchorWorld);
    if (teleported) {
      for (let r = 1; r < rows; r++) {
        const idx = r * cols + c;
        nodes[idx].pos.copy(_anchorWorld).addScaledVector(_backDir, r * 0.14);
        nodes[idx].pos.y -= r * 0.2;
        nodes[idx].prev.copy(nodes[idx].pos);
      }
    }
  }

  const speedFactor = Math.min(moveSpeed / 12, 1.3);
  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = nodes[r * cols + c];
      const vx = (n.pos.x - n.prev.x) * 0.86;
      const vy = (n.pos.y - n.prev.y) * 0.86;
      const vz = (n.pos.z - n.prev.z) * 0.86;
      n.prev.copy(n.pos);

      const wave = Math.sin(t * (6.5 + speedFactor * 8) + c * 1.1 + r * 0.8);
      n.pos.x += vx + (windX * 6.8 + _backDir.x * (4.0 + speedFactor * 11.5) + wave * (1.8 + speedFactor * 3.5)) * dt * dt;
      n.pos.y += vy + (-11.5 + speedFactor * 2.5) * dt * dt;
      n.pos.z += vz + (windZ * 6.8 + _backDir.z * (4.0 + speedFactor * 11.5) + wave * 1.5) * dt * dt;

      const relX = n.pos.x - _tmpPos.x;
      const relZ = n.pos.z - _tmpPos.z;
      const backDot = relX * _backDir.x + relZ * _backDir.z;
      if (backDot < 0.26) {
        const push = 0.26 - backDot;
        n.pos.x += _backDir.x * push;
        n.pos.z += _backDir.z * push;
      }
    }
  }

  for (let iter = 0; iter < 3; iter++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (r > 0) {
          const above = nodes[(r - 1) * cols + c].pos;
          const cur = nodes[idx].pos;
          _dir.subVectors(cur, above);
          const d = _dir.length() || 0.001;
          _dir.multiplyScalar((d - 0.22) / d);
          if (r === 1) cur.sub(_dir);
          else { cur.addScaledVector(_dir, -0.65); above.addScaledVector(_dir, 0.35); }
        }
        if (c > 0 && r > 0) {
          const left = nodes[idx - 1].pos;
          const cur = nodes[idx].pos;
          _dir.subVectors(cur, left);
          const d = _dir.length() || 0.001;
          _dir.multiplyScalar((d - (0.24 + r * 0.025)) / d);
          cur.addScaledVector(_dir, -0.5);
          left.addScaledVector(_dir, 0.5);
        }
      }
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    knight.capePositions[i * 3] = nodes[i].pos.x;
    knight.capePositions[i * 3 + 1] = nodes[i].pos.y;
    knight.capePositions[i * 3 + 2] = nodes[i].pos.z;
  }
  knight.capeGeo.attributes.position.needsUpdate = true;
  knight.capeGeo.computeVertexNormals();
}

// =========================================================
// 5. MOBS, WARDEN BOSS & ZERO-ALLOCATION COMBAT POOLS
// =========================================================
const boneMat = new THREE.MeshStandardMaterial({ color: 0xe3dfd3, roughness: 0.7 });
const cloakMat = new THREE.MeshStandardMaterial({ color: 0x1f2e24, roughness: 0.9 });
const staffMat = new THREE.MeshStandardMaterial({ color: 0x4d3524 });
const greenGlowMat = new THREE.MeshBasicMaterial({ color: 0x55ff44 });

function createSkeleton(x, z, role) {
  const group = new THREE.Group();
  const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.75, 6), boneMat);
  leftLeg.position.set(-0.18, 0.37, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.18;
  const ribs = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.8, 0.36), cloakMat);
  ribs.position.y = 1.1;
  ribs.castShadow = true;
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.46), boneMat);
  skull.position.y = 1.74;
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), greenGlowMat);
  eyeL.position.set(-0.11, 1.76, 0.23);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.11;
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6), staffMat);
  staff.position.set(0.5, 1.2, 0.25);
  const staffOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), greenGlowMat);
  staffOrb.position.set(0.5, 2.25, 0.25);

  group.add(leftLeg, rightLeg, ribs, skull, eyeL, eyeR, staff, staffOrb);
  group.position.set(x, getWalkableY(x, z), z);
  scene.add(group);
  return { group, leftLeg, rightLeg, hp: 2, maxHp: 2, homeX: x, homeZ: z, role, fireTimer: 1.4 + Math.random() };
}

function createWarden(x, z) {
  const group = new THREE.Group();
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x4d3844, roughness: 0.45, metalness: 0.55 });
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5522 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.25, 2.8, 8), ironMat);
  body.position.y = 1.4;
  body.castShadow = true;
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.62, 0.95), ironMat);
  shoulders.position.y = 2.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.86, 0.84), ironMat);
  head.position.y = 3.25;

  const hornGeo = new THREE.ConeGeometry(0.18, 1.1, 5);
  const hornL = new THREE.Mesh(hornGeo, ironMat);
  hornL.position.set(-0.52, 3.82, 0);
  hornL.rotation.z = 0.45;
  const hornR = hornL.clone();
  hornR.position.x = 0.52;
  hornR.rotation.z = -0.45;

  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.1), emberMat);
  eyeL.position.set(-0.19, 3.3, 0.43);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.19;

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.75, 0.09, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xff8822 })
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 4.15;

  group.add(body, shoulders, head, hornL, hornR, eyeL, eyeR, halo);
  group.position.set(x, 0, z);
  scene.add(group);
  return { group, halo, hp: 6, maxHp: 6, fireTimer: 1.6, ringTimer: 4.5 };
}

const knight = createKnight();
knight.group.position.set(-1.5, 0, 12);
scene.add(knight.group);

const horse = createWarhorse(-5.0, 10.5);
scene.add(horse.root);

const skeletons = [
  createSkeleton(BRIDGE_X + 9.2, BRIDGE_Z + 1.2, 'act1'),
  createSkeleton(BRIDGE_X + 9.6, BRIDGE_Z - 2.0, 'act1'),
  createSkeleton(SHRINE_POS.x + 5.0, SHRINE_POS.z + 3.0, 'act2'),
  createSkeleton(SHRINE_POS.x + 4.0, SHRINE_POS.z - 4.5, 'act2'),
  createSkeleton(-5.5, -65.0, 'open'),
  createSkeleton(5.5, -65.0, 'open'),
];
const warden = createWarden(KEEP_POS.x, KEEP_POS.z);

// Pre-allocated Orb Pool (14)
const sharedOrbGeo = new THREE.SphereGeometry(0.38, 10, 10);
const orbPool = Array.from({ length: 14 }, () => {
  const mesh = new THREE.Mesh(sharedOrbGeo, new THREE.MeshBasicMaterial({ color: 0xff5511 }));
  mesh.visible = false;
  scene.add(mesh);
  return { active: false, mesh, colorHex: 0xff5511, vel: new THREE.Vector3(), reflected: false, owner: null };
});

// Pre-allocated Ground Ring Pool (6)
const sharedRingGeo = new THREE.RingGeometry(1.75, 2.2, 28);
const ringPool = Array.from({ length: 6 }, () => {
  const mesh = new THREE.Mesh(
    sharedRingGeo,
    new THREE.MeshBasicMaterial({ color: 0xff9922, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  scene.add(mesh);
  return { active: false, mesh, timer: 0, maxTimer: 1.35 };
});

// 1-Draw-Call Instanced Spark Pool (140)
const MAX_SPARKS = 140;
const sparkMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.17, 0.17, 0.17),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
  MAX_SPARKS
);
sparkMesh.frustumCulled = false;
const dummy = new THREE.Object3D();
const tmpCol = new THREE.Color(0xffffff);
for (let i = 0; i < MAX_SPARKS; i++) {
  dummy.scale.setScalar(0);
  dummy.updateMatrix();
  sparkMesh.setMatrixAt(i, dummy.matrix);
  sparkMesh.setColorAt(i, tmpCol);
}
sparkMesh.instanceMatrix.needsUpdate = true;
sparkMesh.instanceColor.needsUpdate = true;
scene.add(sparkMesh);

const sparkData = Array.from({ length: MAX_SPARKS }, () => ({
  active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 0.45,
}));
let sparkCursor = 0;

function spawnSparks(pos, hex, count = 12, spread = 8, upBoost = 4.5) {
  tmpCol.setHex(hex);
  for (let i = 0; i < count; i++) {
    const idx = sparkCursor;
    sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
    const s = sparkData[idx];
    s.active = true;
    s.pos.set(pos.x, Math.max(pos.y, 0.25), pos.z);
    s.vel.set((Math.random() - 0.5) * spread, 1.5 + Math.random() * upBoost, (Math.random() - 0.5) * spread);
    s.maxLife = 0.38 + Math.random() * 0.22;
    s.life = s.maxLife;
    sparkMesh.setColorAt(idx, tmpCol);
  }
  sparkMesh.instanceColor.needsUpdate = true;
}

// Story Mode Golden Spirit Trail & Sky Beacon
const trailCount = 56;
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array(trailCount * 3);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
const spiritTrail = new THREE.Points(
  trailGeo,
  new THREE.PointsMaterial({ color: 0xffe07d, size: 0.34, transparent: true, opacity: 0.9 })
);
spiritTrail.visible = false;
scene.add(spiritTrail);

const objectiveBeacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.18, 0.55, 16, 10, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x66ffee, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
);
objectiveBeacon.visible = false;
scene.add(objectiveBeacon);

// =========================================================
// 6. GAMEPLAY STATE, STORY MODE & MENU WIRING
// =========================================================
let appState = 'menu';
let gameMode = null;
let storyStage = 0;
let runTime = 0;

let playerHP = 5;
let parries = 0;
let parryTimer = 0;
let parryCooldown = 0;
let dashTimer = 0;
let dashCooldown = 0;
let hitstop = 0;
let shake = 0;
let isMounted = false;
let useAscii = true;
let splashCooldown = 0;

const keys = {};
const msgEl = document.getElementById('msg');
const storyObjectivePos = new THREE.Vector3();

function getActivePos() {
  return isMounted ? horse.root.position : knight.group.position;
}
function getActiveYaw() {
  return isMounted ? horse.yaw : knight.yaw;
}

function flashMsg(text) {
  if (!msgEl) return;
  msgEl.textContent = text;
  setTimeout(() => { if (msgEl.textContent === text) msgEl.textContent = ''; }, 1700);
}

function clearProjectiles() {
  orbPool.forEach((o) => { o.active = false; o.mesh.visible = false; });
  ringPool.forEach((r) => { r.active = false; r.mesh.visible = false; });
  orbLightPool.forEach((l) => { l.intensity = 0; });
}

function setStoryStage(stage) {
  storyStage = stage;
  if (stage === 1) {
    ui.setObjective('<b>ACT I &mdash; SILVERSTREAM BRIDGE</b>Follow the golden trail west and bounce back the Sentinels&rsquo; bolts.');
    storyObjectivePos.set(BRIDGE_X + 8.5, 0, BRIDGE_Z);
  } else if (stage === 2) {
    ui.setObjective('<b>ACT II &mdash; MOONFALL SHRINE</b>Cross the arched bridge above the stream and cleanse the Waterfall Shrine.');
    storyObjectivePos.copy(SHRINE_POS);
  } else if (stage === 3) {
    ui.setObjective('<b>ACT III &mdash; BEYOND THE GATE</b>Ride north through Citadel Gate &amp; Ashenbrook Village to confront the Warden.');
    storyObjectivePos.copy(KEEP_POS);
  } else if (stage === 4) {
    ui.setObjective(`<b>DAWN RETURNS</b>Cleared in ${Math.floor(runTime)}s &middot; ${parries} Parries. Press [ESC] for Open World.`);
    spiritTrail.visible = false;
    objectiveBeacon.visible = false;
  }
  objectiveBeacon.position.set(storyObjectivePos.x, 8, storyObjectivePos.z);
}

function refreshStatus() {
  const mountLabel = isMounted
    ? 'MOUNTED'
    : knight.group.position.distanceTo(horse.root.position) < 4.8
      ? '[E] MOUNT HORSE'
      : '[H] CALL HORSE';
  ui.updateStatus({
    hp: playerHP,
    maxHp: 5,
    parries,
    mountLabel,
    showBoss: gameMode === 'story' && storyStage === 3 && warden.hp > 0,
    bossHp: warden.hp,
    bossMax: warden.maxHp,
  });
}

function resetWorldForMode(mode) {
  gameMode = mode;
  appState = 'playing';
  ui.setVisible(true);
  ui.resetArea();

  clearProjectiles();
  playerHP = 5;
  parries = 0;
  runTime = 0;
  storyStage = 0;
  scene.background.setHex(0x05090e);
  scene.fog.color.setHex(0x060b12);
  moonLight.color.setHex(0xcce4ff);

  if (isMounted) {
    isMounted = false;
    scene.add(knight.group);
    knight.leftLeg.rotation.set(0, 0, 0);
    knight.rightLeg.rotation.set(0, 0, 0);
  }
  knight.group.position.set(-1.5, 0, 12);
  knight.yaw = 0;
  knight.speed = 0;
  horse.root.position.set(-5.0, 0, 10.5);
  horse.speed = 0;
  horse.calling = false;

  skeletons.forEach((s) => {
    s.group.position.set(s.homeX, getWalkableY(s.homeX, s.homeZ), s.homeZ);
    s.hp = s.maxHp;
    s.group.visible = mode === 'story' ? (s.role === 'act1' || s.role === 'act2') : s.role === 'open';
  });

  warden.hp = warden.maxHp;
  warden.group.visible = mode === 'story';

  if (mode === 'story') {
    spiritTrail.visible = true;
    objectiveBeacon.visible = true;
    world.shrineCrystal.material.color.setHex(0xff5566);
    setStoryStage(1);
    ui.showDialogue('THE VALLEY SLEEPS IN ASH. FOLLOW THE GOLDEN TRAIL WEST TO SILVERSTREAM BRIDGE — BOUNCE MAGIC BACK WITH [SPACE] OR [CLICK].', 6.0);
  } else {
    ui.setObjective(null);
    spiritTrail.visible = false;
    objectiveBeacon.visible = false;
    world.shrineCrystal.material.color.setHex(0x55ffee);
    ui.showDialogue('PRESS [E] TO MOUNT YOUR HORSE. EXPLORE ASHENBROOK VILLAGE NORTH OF THE GATE, MOONFALL WATERFALL, FROSTLANDS, SWAMP, JUNGLE &amp; DESERT.', 6.5);
  }

  ui.updateArea(getAreaInfo(knight.group.position.x, knight.group.position.z));
  refreshStatus();
}

const menu = createGameMenu({
  onStartStory: () => resetWorldForMode('story'),
  onStartOpen: () => resetWorldForMode('open'),
  onResume: () => {
    appState = 'playing';
    ui.setVisible(true);
  },
});

function triggerParry() {
  if (appState !== 'playing' || parryCooldown > 0) return;
  parryTimer = 0.3;
  parryCooldown = 0.52;
}

function toggleMount() {
  if (appState !== 'playing') return;
  if (isMounted) {
    isMounted = false;
    scene.add(knight.group);
    const dx = horse.root.position.x + Math.cos(horse.yaw) * 1.6;
    const dz = horse.root.position.z - Math.sin(horse.yaw) * 1.6;
    knight.group.position.set(dx, getWalkableY(dx, dz), dz);
    knight.yaw = horse.yaw;
    knight.group.rotation.set(0, knight.yaw, 0);
    knight.leftLeg.rotation.set(0, 0, 0);
    knight.rightLeg.rotation.set(0, 0, 0);
    flashMsg('DISMOUNTED');
  } else if (knight.group.position.distanceTo(horse.root.position) < 4.8) {
    isMounted = true;
    horse.calling = false;
    horse.seatPivot.add(knight.group);
    knight.group.position.set(0, 0, 0);
    knight.group.rotation.set(0, 0, 0);
    knight.leftLeg.rotation.set(0.35, 0, 0.35);
    knight.rightLeg.rotation.set(0.35, 0, -0.35);
    flashMsg('MOUNTED WARHORSE');
  } else {
    horse.calling = true;
    flashMsg('WHISTLED FOR WARHORSE...');
  }
  refreshStatus();
}

function spawnOrb(origin, target, colorHex, owner, speed = 7.5) {
  const slot = orbPool.find((o) => !o.active);
  if (!slot) return;
  slot.active = true;
  slot.colorHex = colorHex;
  slot.reflected = false;
  slot.owner = owner;
  slot.mesh.material.color.setHex(colorHex);
  slot.mesh.position.set(origin.x, origin.y + 1.3, origin.z);
  slot.mesh.visible = true;
  slot.vel.set(target.x - origin.x, 0, target.z - origin.z).normalize().multiplyScalar(speed);
}

function spawnGroundRing(x, z) {
  const slot = ringPool.find((r) => !r.active);
  if (!slot) return;
  slot.active = true;
  slot.timer = slot.maxTimer;
  slot.mesh.position.set(x, getWalkableY(x, z) + 0.14, z);
  slot.mesh.visible = true;
}

function respawnPlayer() {
  playerHP = 5;
  const p = getActivePos();
  p.set(-1.5, 0, 12);
  if (isMounted) horse.speed = 0;
  spawnSparks(p, 0x55ffee, 20);
  flashMsg('SHATTERED — BOUNCED BACK TO BRAZIER');
}

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape') {
    if (appState === 'menu') {
      if (!menu.goBack() && gameMode) {
        appState = 'playing';
        menu.close();
        ui.setVisible(true);
      }
    } else if (gameMode) {
      appState = 'menu';
      ui.setVisible(false);
      menu.open();
    }
    return;
  }
  if (appState !== 'playing') return;
  if (e.code === 'Space') triggerParry();
  if (e.code === 'KeyE') toggleMount();
  if (e.code === 'KeyH' && !isMounted) {
    horse.calling = true;
    flashMsg('WHISTLED FOR WARHORSE...');
  }
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !isMounted && dashCooldown <= 0) {
    dashTimer = 0.16;
    dashCooldown = 0.82;
  }
  if (e.code === 'Digit1') { useAscii = true; asciiPass.uniforms.uHybrid.value = 1.0; asciiPass.uniforms.uCellSize.value.set(5.5, 9.0); flashMsg('REEL HYBRID ASCII'); }
  if (e.code === 'Digit2') { useAscii = true; asciiPass.uniforms.uHybrid.value = 0.0; asciiPass.uniforms.uCellSize.value.set(5.0, 8.0); flashMsg('PURE MICRO ASCII'); }
  if (e.code === 'Digit3') { useAscii = true; asciiPass.uniforms.uHybrid.value = 0.0; asciiPass.uniforms.uCellSize.value.set(8.5, 14.0); flashMsg('RETRO TERMINAL'); }
  if (e.code === 'Digit4') { useAscii = !useAscii; flashMsg(useAscii ? 'ASCII ON' : 'RAW 3D'); }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#menu-overlay')) return;
  triggerParry();
});

window.addEventListener('resize', () => {
  const newDpr = Math.min(window.devicePixelRatio, 1.25);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(newDpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  asciiPass.uniforms.uResolution.value.set(window.innerWidth * newDpr, window.innerHeight * newDpr);
});

function animateHorseLegs(h, dt, t) {
  const speedRatio = Math.min(h.speed / 16.0, 1.0);
  if (h.speed > 0.4) {
    h.gaitPhase += dt * (6.5 + speedRatio * 10.5);
    const p = h.gaitPhase;
    const swing = 0.35 + speedRatio * 0.55;
    h.legs.fl.hip.rotation.x = Math.sin(p) * swing;
    h.legs.fl.knee.rotation.x = Math.max(0, -Math.cos(p)) * swing * 1.1;
    h.legs.fr.hip.rotation.x = Math.sin(p + 0.65) * swing;
    h.legs.fr.knee.rotation.x = Math.max(0, -Math.cos(p + 0.65)) * swing * 1.1;
    h.legs.bl.hip.rotation.x = Math.sin(p + Math.PI) * swing;
    h.legs.bl.knee.rotation.x = -Math.max(0, Math.cos(p + Math.PI)) * swing * 0.85;
    h.legs.br.hip.rotation.x = Math.sin(p + Math.PI + 0.65) * swing;
    h.legs.br.knee.rotation.x = -Math.max(0, Math.cos(p + Math.PI + 0.65)) * swing * 0.85;

    h.bodyPivot.position.y = Math.abs(Math.sin(p)) * (0.14 + speedRatio * 0.22);
    h.bodyPivot.rotation.x = Math.cos(p) * (0.05 + speedRatio * 0.11);
    h.neckPivot.rotation.x = Math.sin(p - 0.5) * (0.08 + speedRatio * 0.12);
  } else {
    h.bodyPivot.position.y = Math.sin(t * 2.0) * 0.03;
    h.bodyPivot.rotation.x *= 0.88;
    h.neckPivot.rotation.x = Math.sin(t * 1.4) * 0.06;
    Object.values(h.legs).forEach((l) => { l.hip.rotation.x *= 0.85; l.knee.rotation.x *= 0.85; });
  }
  h.bodyPivot.rotation.z = THREE.MathUtils.lerp(h.bodyPivot.rotation.z, h.bank, 1 - Math.exp(-8 * dt));
}

// =========================================================
// 7. BUTTER-SMOOTH 60 FPS MAIN LOOP
// =========================================================
const clock = new THREE.Clock();
let uiTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  const windAngle = 0.55 + Math.sin(t * 0.16) * 0.5;
  const windX = Math.cos(windAngle);
  const windZ = Math.sin(windAngle);

  // Cinematic Waterfall & Stream Orbit during Main Menu
  if (appState === 'menu') {
    world.updateWorld(dt, t, WATERFALL_POOL, windX, windZ, false);
    const camAngle = t * 0.13;
    camera.position.set(
      WATERFALL_POOL.x + Math.sin(camAngle) * 21,
      13.5 + Math.sin(t * 0.3) * 1.4,
      WATERFALL_POOL.z + 2 + Math.cos(camAngle) * 21
    );
    camera.lookAt(WATERFALL_POOL.x + 1, 3.0, WATERFALL_POOL.z - 2);
    moonLight.position.set(WATERFALL_POOL.x + 18, 34, WATERFALL_POOL.z + 14);
    moonLight.target.position.copy(WATERFALL_POOL);
    updateHorseHair(horse, dt, t, windX, windZ);
    updateKnightCape(knight, dt, t, windX, windZ, 0);
    if (useAscii) composer.render();
    else renderer.render(scene, camera);
    return;
  }

  // Hitstop Freeze
  if (hitstop > 0) {
    hitstop -= dt;
    asciiPass.uniforms.uFlash.value = Math.max(0, hitstop * 4.5);
    if (useAscii) composer.render();
    else renderer.render(scene, camera);
    return;
  }
  asciiPass.uniforms.uFlash.value = 0;

  if (gameMode === 'story' && storyStage < 4) runTime += dt;
  ui.tickDialogue(dt);

  // --- MOVEMENT (SMOOTH HORSE OR SMOOTH ON-FOOT KNIGHT) ---
  const inputX = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
  const inputZ = (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) - (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0);
  const hasInput = inputX !== 0 || inputZ !== 0;

  if (splashCooldown > 0) splashCooldown -= dt;
  let currentMoveSpeed = 0;

  if (isMounted) {
    const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
    const inRiver = isInWater(horse.root.position.x, horse.root.position.z);
    const maxSpeed = (sprinting ? 18.0 : 11.2) * (inRiver ? 0.78 : 1.0);

    if (hasInput) {
      const targetYaw = Math.atan2(inputX, inputZ);
      let diff = targetYaw - horse.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      const turnRate = THREE.MathUtils.lerp(4.6, 2.7, Math.min(horse.speed / 18.0, 1));
      horse.yaw += THREE.MathUtils.clamp(diff, -turnRate * dt, turnRate * dt);
      horse.bank = THREE.MathUtils.clamp(-diff * (horse.speed / 12) * 0.28, -0.26, 0.26);

      const turnPenalty = Math.abs(diff) > 1.2 ? 0.45 : 1.0;
      horse.speed = THREE.MathUtils.lerp(horse.speed, maxSpeed * turnPenalty, 1 - Math.exp(-3.4 * dt));
    } else {
      horse.bank = 0;
      horse.speed = THREE.MathUtils.lerp(horse.speed, 0, 1 - Math.exp(-4.2 * dt));
      if (horse.speed < 0.08) horse.speed = 0;
    }

    const nx = THREE.MathUtils.clamp(horse.root.position.x + Math.sin(horse.yaw) * horse.speed * dt, -84, 84);
    const nz = THREE.MathUtils.clamp(horse.root.position.z + Math.cos(horse.yaw) * horse.speed * dt, -82, 82);
    const blocked = world.colliders.some((c) => Math.hypot(nx - c.x, nz - c.z) < c.r + 0.9);
    if (!blocked) {
      horse.root.position.x = nx;
      horse.root.position.z = nz;
    } else {
      horse.speed *= 0.35;
    }
    horse.root.position.y = THREE.MathUtils.lerp(
      horse.root.position.y,
      getWalkableY(horse.root.position.x, horse.root.position.z),
      1 - Math.exp(-14 * dt)
    );
    horse.root.rotation.y = horse.yaw;
    currentMoveSpeed = horse.speed;

    if (horse.speed > 4.5 && splashCooldown <= 0) {
      if (inRiver) spawnSparks(horse.root.position, 0xdff5ff, 6, 6.5, 4.2);
      else if (horse.speed > 11.5) spawnSparks(horse.root.position, 0x3b5944, 3, 4.0, 2.2);
      splashCooldown = 0.09;
    }
  } else {
    if (dashCooldown > 0) dashCooldown -= dt;
    const targetSpeed = hasInput ? (dashTimer > 0 ? 18.0 : 8.0) : 0;
    if (dashTimer > 0) dashTimer -= dt;

    knight.speed = THREE.MathUtils.lerp(knight.speed, targetSpeed, 1 - Math.exp(-11 * dt));

    if (hasInput) {
      const targetYaw = Math.atan2(inputX, inputZ);
      let diff = targetYaw - knight.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      knight.yaw += diff * (1 - Math.exp(-11.5 * dt));
      knight.bank = THREE.MathUtils.lerp(knight.bank, THREE.MathUtils.clamp(-diff * 0.25, -0.22, 0.22), 1 - Math.exp(-10 * dt));
    } else {
      knight.bank = THREE.MathUtils.lerp(knight.bank, 0, 1 - Math.exp(-10 * dt));
    }

    if (knight.speed > 0.15) {
      const nx = THREE.MathUtils.clamp(knight.group.position.x + Math.sin(knight.yaw) * knight.speed * dt, -84, 84);
      const nz = THREE.MathUtils.clamp(knight.group.position.z + Math.cos(knight.yaw) * knight.speed * dt, -82, 82);
      const blocked = world.colliders.some((c) => Math.hypot(nx - c.x, nz - c.z) < c.r + 0.55);
      if (!blocked) {
        knight.group.position.x = nx;
        knight.group.position.z = nz;
      }
      knight.group.position.y = THREE.MathUtils.lerp(
        knight.group.position.y,
        getWalkableY(knight.group.position.x, knight.group.position.z),
        1 - Math.exp(-15 * dt)
      );
      knight.leftLeg.rotation.x = Math.sin(t * 13) * 0.55;
      knight.rightLeg.rotation.x = -Math.sin(t * 13) * 0.55;
      knight.bodyPivot.position.y = Math.abs(Math.sin(t * 13)) * 0.08;

      if (isInWater(nx, nz) && splashCooldown <= 0) {
        spawnSparks(knight.group.position, 0xdff5ff, 3, 3.8, 2.5);
        splashCooldown = 0.16;
      }
    } else {
      knight.leftLeg.rotation.x *= 0.82;
      knight.rightLeg.rotation.x *= 0.82;
      knight.bodyPivot.position.y *= 0.85;
    }

    knight.group.rotation.y = knight.yaw;
    knight.bodyPivot.rotation.z = knight.bank;
    currentMoveSpeed = knight.speed;

    if (horse.calling) {
      const dist = horse.root.position.distanceTo(knight.group.position);
      if (dist > 3.2) {
        const targetYaw = Math.atan2(knight.group.position.x - horse.root.position.x, knight.group.position.z - horse.root.position.z);
        let diff = targetYaw - horse.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        horse.yaw += THREE.MathUtils.clamp(diff, -4.5 * dt, 4.5 * dt);
        horse.speed = THREE.MathUtils.lerp(horse.speed, 13.5, 1 - Math.exp(-4 * dt));
        horse.root.position.x += Math.sin(horse.yaw) * horse.speed * dt;
        horse.root.position.z += Math.cos(horse.yaw) * horse.speed * dt;
        horse.root.position.y = getWalkableY(horse.root.position.x, horse.root.position.z);
        horse.root.rotation.y = horse.yaw;
      } else {
        horse.calling = false;
        horse.speed *= 0.4;
      }
    } else {
      horse.speed = THREE.MathUtils.lerp(horse.speed, 0, 1 - Math.exp(-5 * dt));
      horse.bank = 0;
    }
  }

  const playerPos = getActivePos();
  world.updateWorld(dt, t, playerPos, windX, windZ, true);
  animateHorseLegs(horse, dt, t);
  updateHorseHair(horse, dt, t, windX, windZ);
  updateKnightCape(knight, dt, t, windX, windZ, currentMoveSpeed);

  // Parry Shield Glow
  if (parryCooldown > 0) parryCooldown -= dt;
  if (parryTimer > 0) {
    parryTimer -= dt;
    knight.shieldRing.material.opacity = 0.92;
    knight.shieldRing.scale.setScalar(1.0 + (0.3 - parryTimer) * 1.4);
    knight.shieldGlow.intensity = 18;
    knight.shieldGroup.position.z = 0.42;
  } else {
    knight.shieldRing.material.opacity = 0;
    knight.shieldGlow.intensity = 0;
    knight.shieldGroup.position.z = 0.26;
  }

  // --- STORY MODE PROGRESSION & SPIRIT TRAIL ---
  if (gameMode === 'story' && storyStage < 4) {
    if (storyStage === 1 && skeletons.filter((s) => s.role === 'act1' && s.hp > 0).length === 0) {
      setStoryStage(2);
      ui.showDialogue('THE BRIDGE IS CLEAR! CROSS SILVERSTREAM BRIDGE ABOVE THE STREAM TO MOONFALL SHRINE.', 5.5);
    } else if (storyStage === 2 && skeletons.filter((s) => s.role === 'act2' && s.hp > 0).length === 0 && playerPos.distanceTo(world.shrineGroup.position) < 9.5) {
      world.shrineCrystal.material.color.setHex(0x66ffee);
      world.shrineCrystal.getWorldPosition(_tmpPos);
      spawnSparks(_tmpPos, 0x66ffee, 28, 10, 6);
      setStoryStage(3);
      ui.showDialogue('SHRINE AWAKENED! RIDE THROUGH CITADEL GATE AND ASHENBROOK VILLAGE TO DEFEAT THE WARDEN.', 6.0);
    }

    const tp = spiritTrail.geometry.attributes.position.array;
    for (let i = 0; i < trailCount; i++) {
      const u = ((i / trailCount) + t * 0.22) % 1.0;
      const px = THREE.MathUtils.lerp(playerPos.x, storyObjectivePos.x, u);
      const pz = THREE.MathUtils.lerp(playerPos.z, storyObjectivePos.z, u);
      const sway = Math.sin(u * Math.PI) * Math.sin(t * 2.5 + u * 8) * 1.4;
      tp[i * 3] = px + sway;
      tp[i * 3 + 1] = getWalkableY(px, pz) + 0.8 + Math.sin(u * Math.PI) * 1.2 + Math.sin(t * 4 + i) * 0.25;
      tp[i * 3 + 2] = pz + sway * 0.5;
    }
    spiritTrail.geometry.attributes.position.needsUpdate = true;
  }

  // --- MOBS & WARDEN AI ---
  skeletons.forEach((s) => {
    if (!s.group.visible || s.hp <= 0) return;
    const dist = s.group.position.distanceTo(playerPos);
    if (dist > 22) return;

    s.group.lookAt(playerPos.x, s.group.position.y, playerPos.z);
    if (dist < 18 && dist > 6.2) {
      const dx = (playerPos.x - s.group.position.x) / dist;
      const dz = (playerPos.z - s.group.position.z) / dist;
      const nx = s.group.position.x + dx * 2.4 * dt;
      const nz = s.group.position.z + dz * 2.4 * dt;
      if (!isInWater(nx, nz)) s.group.position.set(nx, getWalkableY(nx, nz), nz);
      s.leftLeg.rotation.x = Math.sin(t * 9) * 0.45;
      s.rightLeg.rotation.x = -Math.sin(t * 9) * 0.45;
    }
    if (dist < 16.5) {
      s.fireTimer -= dt;
      if (s.fireTimer <= 0) {
        spawnOrb(s.group.position, playerPos, 0x55ff55, s, 7.2);
        s.fireTimer = 2.6 + Math.random();
      }
    }
  });

  if (warden.group.visible && warden.hp > 0) {
    warden.halo.rotation.z = t * 1.8;
    warden.group.lookAt(playerPos.x, 0, playerPos.z);
    if (warden.group.position.distanceTo(playerPos) < 22) {
      warden.fireTimer -= dt;
      if (warden.fireTimer <= 0) {
        const enraged = warden.hp <= 3;
        spawnOrb(warden.group.position, playerPos, 0xff5511, warden, enraged ? 10.2 : 8.5);
        warden.fireTimer = enraged ? 1.45 : 2.1;
      }
      warden.ringTimer -= dt;
      if (warden.ringTimer <= 0) {
        spawnGroundRing(playerPos.x, playerPos.z);
        warden.ringTimer = warden.hp <= 3 ? 3.4 : 4.3;
      }
    }
  }

  // Pooled Ground Rings
  for (let i = 0; i < ringPool.length; i++) {
    const r = ringPool[i];
    if (!r.active) continue;
    r.timer -= dt;
    r.mesh.material.opacity = 0.4 + (1 - r.timer / r.maxTimer) * 0.6;
    if (r.timer <= 0) {
      spawnSparks(r.mesh.position, 0xff8822, 16);
      if (playerPos.distanceTo(r.mesh.position) < 2.3 && dashTimer <= 0) {
        playerHP--;
        shake = 0.55;
        if (playerHP <= 0) respawnPlayer();
        refreshStatus();
      }
      r.active = false;
      r.mesh.visible = false;
    }
  }

  // Pooled Orbs + Static 2-Light Pool
  let lightIdx = 0;
  for (let i = 0; i < orbPool.length; i++) {
    const o = orbPool[i];
    if (!o.active) continue;

    o.mesh.position.addScaledVector(o.vel, dt);
    const distPlayer = Math.hypot(o.mesh.position.x - playerPos.x, o.mesh.position.z - playerPos.z);
    const parryRadius = isMounted ? 3.2 : 2.5;

    if (!o.reflected && parryTimer > 0 && distPlayer < parryRadius) {
      o.reflected = true;
      o.colorHex = 0x55ffee;
      o.mesh.material.color.setHex(0x55ffee);
      parries++;
      hitstop = 0.05;
      shake = 0.45;
      spawnSparks(o.mesh.position, 0x55ffee, 14);
      const tp = o.owner.group.position;
      o.vel.set(tp.x - o.mesh.position.x, 0, tp.z - o.mesh.position.z).normalize().multiplyScalar(18);
      flashMsg('>> BOUNCED BACK! <<');
      refreshStatus();
    } else if (!o.reflected && distPlayer < 0.95 && dashTimer <= 0) {
      playerHP--;
      shake = 0.5;
      spawnSparks(o.mesh.position, 0xff4422, 10);
      o.active = false;
      o.mesh.visible = false;
      if (playerHP <= 0) respawnPlayer();
      refreshStatus();
      continue;
    } else if (o.reflected && o.owner.hp > 0) {
      const distOwner = Math.hypot(
        o.mesh.position.x - o.owner.group.position.x,
        o.mesh.position.z - o.owner.group.position.z
      );
      if (distOwner < 1.85) {
        o.owner.hp--;
        hitstop = 0.055;
        shake = 0.6;
        spawnSparks(o.mesh.position, 0x55ffee, 18);
        o.active = false;
        o.mesh.visible = false;

        if (o.owner.hp <= 0) {
          o.owner.group.visible = false;
          spawnSparks(o.owner.group.position, 0xffaa33, 28);
          if (o.owner === warden) {
            scene.background.setHex(0x2e1c11);
            scene.fog.color.setHex(0x2e1c11);
            moonLight.color.setHex(0xffd28a);
            setStoryStage(4);
            ui.showDialogue(`THE WARDEN FALLS! DAWN RETURNS TO ASHENBROOK AND THE VALLEY. (${Math.floor(runTime)}s · ${parries} PARRIES)`, 8.5);
          } else {
            flashMsg('SENTINEL SHATTERED!');
          }
        }
        refreshStatus();
        continue;
      }
    } else if (o.mesh.position.distanceTo(playerPos) > 52) {
      o.active = false;
      o.mesh.visible = false;
      continue;
    }

    if (lightIdx < orbLightPool.length) {
      orbLightPool[lightIdx].position.copy(o.mesh.position);
      orbLightPool[lightIdx].color.setHex(o.colorHex);
      orbLightPool[lightIdx].intensity = 14;
      lightIdx++;
    }
  }
  for (let i = lightIdx; i < orbLightPool.length; i++) orbLightPool[i].intensity = 0;

  // 1-Draw-Call Instanced Sparks
  for (let i = 0; i < MAX_SPARKS; i++) {
    const s = sparkData[i];
    if (s.active) {
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        dummy.scale.setScalar(0);
      } else {
        s.vel.y -= 15 * dt;
        s.pos.addScaledVector(s.vel, dt);
        dummy.position.copy(s.pos);
        dummy.scale.setScalar(s.life / s.maxLife);
      }
    } else {
      dummy.scale.setScalar(0);
    }
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    sparkMesh.setMatrixAt(i, dummy.matrix);
  }
  sparkMesh.instanceMatrix.needsUpdate = true;

  // Smooth Camera & Shadow Follow
  shake = Math.max(0, shake - dt * 2.5);
  const sx = (Math.random() - 0.5) * shake;
  const sy = (Math.random() - 0.5) * shake;
  const zoomOut = isMounted ? 3.5 + (horse.speed / 18.0) * 3.2 : 0;

  camera.position.x = THREE.MathUtils.lerp(camera.position.x, playerPos.x + sx, 1 - Math.exp(-7 * dt));
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, playerPos.y + 18.5 + zoomOut * 0.7 + sy, 1 - Math.exp(-7 * dt));
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, playerPos.z + 17.5 + zoomOut, 1 - Math.exp(-7 * dt));
  camera.lookAt(playerPos.x, playerPos.y + (isMounted ? 1.8 : 1.0), playerPos.z - 1.2);

  moonLight.position.set(playerPos.x + 18, 34, playerPos.z + 14);
  moonLight.target.position.set(playerPos.x, 0, playerPos.z);

  // Throttled 10 Hz Minimap, Area Transition Banner & Status Updates (Zero FPS impact)
  uiTimer += dt;
  if (uiTimer >= 0.1) {
    uiTimer = 0;
    ui.updateArea(getAreaInfo(playerPos.x, playerPos.z));
    refreshStatus();
    ui.updateMinimap({
      playerPos,
      playerYaw: getActiveYaw(),
      horsePos: horse.root.position,
      isMounted,
      skeletons,
      warden,
      objectivePos: gameMode === 'story' && storyStage < 4 ? storyObjectivePos : null,
    });
  }

  if (useAscii) composer.render();
  else renderer.render(scene, camera);
}

animate();