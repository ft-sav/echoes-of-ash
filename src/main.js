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
  getWalkableY,
  isInWater,
  getBiomeWeights,
  getAreaInfo,
  BRIDGE_X,
  BRIDGE_Z,
  WATERFALL_POOL,
  SHRINE_POS,
  KEEP_POS,
  DESERT_TEMPLE_POS,
  SNOW_MONUMENT_POS,
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
  for (let i = 0; i < CHARS.length; i++) ctx.fillText(CHARS[i], i * cw + cw / 2, ch / 2 + 1);

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

const orbLightPool = Array.from({ length: 2 }, () => {
  const pl = new THREE.PointLight(0xff5511, 0, 10, 1.2);
  pl.position.set(0, -50, 0);
  scene.add(pl);
  return pl;
});

const world = buildWorld(scene);
const ui = createGameUI(world.drawStaticMinimap);

// =========================================================
// 3. POOLED VFX SYSTEM (SPARKS, CHUNKS, SOULS, RINGS, HEAL PILLAR, AFTERIMAGES)
// =========================================================
const dummy = new THREE.Object3D();
const tmpCol = new THREE.Color(0xffffff);

// 1-Draw-Call Instanced Particle & Chunk Pool (200 slots: sparks, ash rise, chunks, biome dust)
const MAX_PARTS = 200;
const partMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.18, 0.18, 0.18),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
  MAX_PARTS
);
partMesh.frustumCulled = false;
for (let i = 0; i < MAX_PARTS; i++) {
  dummy.scale.setScalar(0);
  dummy.updateMatrix();
  partMesh.setMatrixAt(i, dummy.matrix);
  partMesh.setColorAt(i, tmpCol);
}
partMesh.instanceMatrix.needsUpdate = true;
partMesh.instanceColor.needsUpdate = true;
scene.add(partMesh);

const partData = Array.from({ length: MAX_PARTS }, () => ({
  active: false,
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  rot: new THREE.Vector3(),
  life: 0,
  maxLife: 0.5,
  gravity: 15,
  bounce: false,
  scale: 1,
}));
let partCursor = 0;

function spawnParticles(pos, hex, count = 12, opts = {}) {
  const { spread = 8, upMin = 1.5, upRand = 4.5, gravity = 15, life = 0.48, bounce = false, scale = 1.0 } = opts;
  tmpCol.setHex(hex);
  for (let i = 0; i < count; i++) {
    const idx = partCursor;
    partCursor = (partCursor + 1) % MAX_PARTS;
    const p = partData[idx];
    p.active = true;
    p.pos.set(pos.x + (Math.random() - 0.5) * 0.4, Math.max(pos.y, 0.25) + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * 0.4);
    p.vel.set((Math.random() - 0.5) * spread, upMin + Math.random() * upRand, (Math.random() - 0.5) * spread);
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.maxLife = life * (0.75 + Math.random() * 0.45);
    p.life = p.maxLife;
    p.gravity = gravity;
    p.bounce = bounce;
    p.scale = scale;
    partMesh.setColorAt(idx, tmpCol);
  }
  partMesh.instanceColor.needsUpdate = true;
}

// Curated Effect: Enemy Defeat — Ash Dissolve + Chunk Burst + Soul Rise
const soulPool = Array.from({ length: 5 }, () => {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xc8f5ff, transparent: true, opacity: 0.85 })
  );
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 0.75, 6),
    new THREE.MeshBasicMaterial({ color: 0x88d8ff, transparent: true, opacity: 0.55 })
  );
  tail.rotation.x = Math.PI;
  tail.position.y = -0.45;
  g.add(core, tail);
  g.visible = false;
  scene.add(g);
  return { g, core, tail, active: false, life: 0, maxLife: 1.4, baseX: 0, baseZ: 0, phase: 0 };
});

function spawnSoulRise(pos) {
  const s = soulPool.find((x) => !x.active) || soulPool[0];
  s.active = true;
  s.life = 1.35;
  s.maxLife = 1.35;
  s.baseX = pos.x;
  s.baseZ = pos.z;
  s.phase = Math.random() * 6;
  s.g.position.set(pos.x, pos.y + 1.0, pos.z);
  s.g.visible = true;
}

// Curated Effect: Expanding Ground Rings (Heal Circle, Summon Circle, Fire Ring Impact)
const vfxRingPool = Array.from({ length: 8 }, () => {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 1.0, 28),
    new THREE.MeshBasicMaterial({ color: 0x66ffdd, side: THREE.DoubleSide, transparent: true, opacity: 0 })
  );
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  scene.add(m);
  return { m, active: false, life: 0, maxLife: 0.45, maxScale: 3.5 };
});

function spawnExpandingRing(pos, hex, maxScale = 3.2, duration = 0.45) {
  const r = vfxRingPool.find((x) => !x.active) || vfxRingPool[0];
  r.active = true;
  r.life = duration;
  r.maxLife = duration;
  r.maxScale = maxScale;
  r.m.material.color.setHex(hex);
  r.m.position.set(pos.x, pos.y + 0.16, pos.z);
  r.m.scale.setScalar(0.35);
  r.m.visible = true;
}

// Curated Effect: Healing Light Pillar (25% instant heal on kill)
const healPillar = new THREE.Mesh(
  new THREE.CylinderGeometry(0.95, 1.1, 13, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x77ffdd, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
);
healPillar.visible = false;
scene.add(healPillar);
let healPillarTimer = 0;

// Curated Effect: Dash Afterimages (5 Pooled Mint Silhouettes)
const afterimagePool = Array.from({ length: 5 }, () => {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x66ffdd, transparent: true, opacity: 0, depthWrite: false });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.32, 0.95, 6), mat);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.48, 6), mat);
  head.position.y = 1.88;
  g.add(torso, head);
  g.visible = false;
  scene.add(g);
  return { g, mat, active: false, life: 0, maxLife: 0.28 };
});
let afterimageCursor = 0;

function spawnAfterimage(pos, yaw) {
  const a = afterimagePool[afterimageCursor];
  afterimageCursor = (afterimageCursor + 1) % afterimagePool.length;
  a.active = true;
  a.life = 0.28;
  a.maxLife = 0.28;
  a.g.position.copy(pos);
  a.g.rotation.y = yaw;
  a.mat.opacity = 0.52;
  a.g.visible = true;
}

function getBiomeDustColor(x, z) {
  const b = getBiomeWeights(x, z);
  if (b.ice + b.frost > 0.45) return 0xd8eefc;
  if (b.desert + b.steppe > 0.45) return 0xc79e65;
  if (b.swamp > 0.45) return 0x3b4d38;
  return 0x4b5e46;
}

// =========================================================
// 4. RIDEABLE WARHORSE + VERLET FLOWING MANE & TAIL
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

      posArr[ptr++] = a.x - _side.x * w0; posArr[ptr++] = a.y; posArr[ptr++] = a.z - _side.z * w0;
      posArr[ptr++] = a.x + _side.x * w0; posArr[ptr++] = a.y; posArr[ptr++] = a.z + _side.z * w0;
      posArr[ptr++] = b.x + _side.x * w1; posArr[ptr++] = b.y; posArr[ptr++] = b.z + _side.z * w1;

      posArr[ptr++] = a.x - _side.x * w0; posArr[ptr++] = a.y; posArr[ptr++] = a.z - _side.z * w0;
      posArr[ptr++] = b.x + _side.x * w1; posArr[ptr++] = b.y; posArr[ptr++] = b.z + _side.z * w1;
      posArr[ptr++] = b.x - _side.x * w1; posArr[ptr++] = b.y; posArr[ptr++] = b.z - _side.z * w1;
    }
  }
  horse.hairGeo.attributes.position.needsUpdate = true;
}

// =========================================================
// 5. KNIGHT WITH DETAILED BROADSWORD, SLASH ARC & VERLET CAPE
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

  // --- ARTICULATED RIGHT SWORD ARM + DETAILED BROADSWORD ---
  const swordPivot = new THREE.Group();
  swordPivot.position.set(0.52, 1.38, 0.08);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.58, 0.22), darkSteel);
  armR.position.y = -0.25;
  const gauntletR = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.26, 0.25), steelMat);
  gauntletR.position.set(0, -0.52, 0.06);

  // Detailed Broadsword (Pommel + Leather Grip + Brass Crossguard + Fuller Blade + Tip + Rune Edge)
  const sword = new THREE.Group();
  sword.position.set(0, -0.52, 0.16);
  sword.rotation.x = Math.PI * 0.44;
  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), brassMat);
  pommel.position.y = -0.26;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.34, 6), leatherMat);
  grip.position.y = -0.06;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.11), brassMat);
  guard.position.y = 0.12;
  const bladeCore = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 1.48, 0.045),
    new THREE.MeshStandardMaterial({ color: 0xdfe9f5, metalness: 0.85, roughness: 0.18 })
  );
  bladeCore.position.y = 0.9;
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.25, 0.055), darkSteel);
  fuller.position.y = 0.86;
  const runeEdge = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 1.42, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x88eeff, transparent: true, opacity: 0.45 })
  );
  runeEdge.position.y = 0.9;
  const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 4), steelMat);
  bladeTip.position.y = 1.8;
  bladeTip.rotation.y = Math.PI / 4;
  sword.add(pommel, grip, guard, bladeCore, fuller, runeEdge, bladeTip);
  swordPivot.add(armR, gauntletR, sword);

  // Curved Glowing Slash Arc Mesh (sweeps visibly on sword swing!)
  const slashArc = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 2.65, 18, 1, -Math.PI * 0.42, Math.PI * 0.84),
    new THREE.MeshBasicMaterial({ color: 0xaaf5ff, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false })
  );
  slashArc.rotation.x = -Math.PI / 2;
  slashArc.position.set(0, 1.15, 0.35);
  group.add(slashArc);

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

  // Detailed Heater Resonance Shield
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
    pauldronL, pauldronR, swordPivot, helm, helmRim, visor, plume, shieldGroup
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
    group, bodyPivot, leftLeg, rightLeg, swordPivot, slashArc, shieldGroup, shieldRing, shieldGlow,
    armorMats: [steelMat, darkSteel, brassMat],
    capeCols: cols, capeRows: rows, capeAnchors, capeNodes, capeGeo, capePositions,
    yaw: 0, speed: 0, bank: 0, knockVel: new THREE.Vector3(),
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
// 6. BIOME-SPECIFIC MOBS (MELEE & RANGED) + HYBRID BOSS
// =========================================================
const MOB_PRESETS = {
  swordsman: { name: 'Ashbone Swordsman', combat: 'melee', hp: 55, speed: 3.8, dmg: 16, bodyHex: 0x3b424c, headHex: 0xe3dfd3, accentHex: 0xff6644, scale: 1.0, heavy: false },
  acolyte:   { name: 'Hex Acolyte',       combat: 'ranged', hp: 45, speed: 2.3, dmg: 16, bodyHex: 0x1f3026, headHex: 0xe3dfd3, accentHex: 0x55ff55, scale: 1.0, heavy: false },
  stalker:   { name: 'Mire Stalker',      combat: 'melee', hp: 50, speed: 4.9, dmg: 14, bodyHex: 0x203326, headHex: 0x354d38, accentHex: 0x44ffaa, scale: 0.92, heavy: false },
  necro:     { name: 'Shrine Necromancer',combat: 'ranged', hp: 55, speed: 2.4, dmg: 18, bodyHex: 0x261d36, headHex: 0xd8dce8, accentHex: 0x9966ff, scale: 1.05, heavy: false },
  tombguard: { name: 'Dune Tomb Guard',   combat: 'melee', hp: 80, speed: 3.4, dmg: 20, bodyHex: 0x8f6b40, headHex: 0xc9a870, accentHex: 0xffaa33, scale: 1.18, heavy: true },
  pyro:      { name: 'Sun Pyromancer',    combat: 'ranged', hp: 55, speed: 2.5, dmg: 18, bodyHex: 0x5e2d1c, headHex: 0xd9ba8c, accentHex: 0xff7722, scale: 1.02, heavy: false },
  raider:    { name: 'Frostbound Raider', combat: 'melee', hp: 75, speed: 3.7, dmg: 20, bodyHex: 0x3e5466, headHex: 0xcfe8f7, accentHex: 0x77ddff, scale: 1.15, heavy: true },
  wraith:    { name: 'Glacier Wraith',    combat: 'ranged', hp: 55, speed: 2.8, dmg: 16, bodyHex: 0x4b708a, headHex: 0xe0f6ff, accentHex: 0x66e0ff, scale: 1.05, heavy: false },
  brute:     { name: 'Thornback Brute',   combat: 'melee', hp: 85, speed: 3.2, dmg: 22, bodyHex: 0x234729, headHex: 0x405c38, accentHex: 0xb5ff55, scale: 1.24, heavy: true },
};

function createBiomeMob(x, z, typeKey, role) {
  const cfg = MOB_PRESETS[typeKey];
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.bodyHex, roughness: 0.8 });
  const headMat = new THREE.MeshStandardMaterial({ color: cfg.headHex, roughness: 0.65 });
  const accentMat = new THREE.MeshBasicMaterial({ color: cfg.accentHex });
  const weapMat = new THREE.MeshStandardMaterial({ color: 0xaab6c2, metalness: 0.7, roughness: 0.35 });

  const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.75, 6), bodyMat);
  leftLeg.position.set(-0.19, 0.37, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.19;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.84, 0.38), bodyMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.46), headMat);
  head.position.y = 1.78;
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), accentMat);
  eyeL.position.set(-0.11, 1.8, 0.24);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.11;

  // Articulated weapon arm (swings on melee wind-up or lifts on ranged cast)
  const weaponArm = new THREE.Group();
  weaponArm.position.set(0.48, 1.32, 0.12);
  if (cfg.combat === 'melee') {
    const blade = new THREE.Mesh(
      typeKey === 'brute' ? new THREE.CylinderGeometry(0.16, 0.09, 1.45, 6) : new THREE.BoxGeometry(0.12, 1.35, 0.08),
      typeKey === 'brute' ? bodyMat : weapMat
    );
    blade.position.set(0, -0.2, 0.45);
    blade.rotation.x = Math.PI * 0.45;
    const edgeGlow = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 0.05), accentMat);
    edgeGlow.position.set(0, -0.2, 0.6);
    edgeGlow.rotation.x = Math.PI * 0.45;
    weaponArm.add(blade, edgeGlow);
  } else {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6), new THREE.MeshStandardMaterial({ color: 0x4d3524 }));
    staff.position.set(0, -0.1, 0.16);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), accentMat);
    orb.position.set(0, 0.95, 0.16);
    weaponArm.add(staff, orb);
  }

  group.add(leftLeg, rightLeg, torso, head, eyeL, eyeR, weaponArm);
  group.scale.setScalar(cfg.scale);
  group.position.set(x, getWalkableY(x, z), z);
  scene.add(group);

  return {
    group,
    leftLeg,
    rightLeg,
    weaponArm,
    flashMats: [bodyMat, headMat],
    name: cfg.name,
    combat: cfg.combat,
    accentHex: cfg.accentHex,
    heavy: cfg.heavy,
    hp: cfg.hp,
    maxHp: cfg.hp,
    speed: cfg.speed,
    dmg: cfg.dmg,
    homeX: x,
    homeZ: z,
    role,
    // Spawn animation & Combat state
    spawned: false,
    spawnTimer: 0,
    hitFlash: 0,
    stagger: 0,
    knockVel: new THREE.Vector3(),
    atkTimer: 1.2 + Math.random(),
    windup: 0,
    isBoss: false,
  };
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

  // Warden's Ember Greatsword for Close-Range Cleaves
  const weaponArm = new THREE.Group();
  weaponArm.position.set(1.4, 2.3, 0.2);
  const gsBlade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.8, 0.1), ironMat);
  gsBlade.position.set(0, -0.3, 0.9);
  gsBlade.rotation.x = Math.PI * 0.45;
  const gsGlow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.5, 0.05), emberMat);
  gsGlow.position.set(0, -0.3, 0.95);
  gsGlow.rotation.x = Math.PI * 0.45;
  weaponArm.add(gsBlade, gsGlow);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.75, 0.09, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xff8822 })
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 4.15;

  group.add(body, shoulders, head, hornL, hornR, eyeL, eyeR, weaponArm, halo);
  group.position.set(x, 0, z);
  scene.add(group);

  return {
    group,
    halo,
    weaponArm,
    flashMats: [ironMat],
    name: 'The Horned Warden',
    combat: 'hybrid',
    accentHex: 0xff5522,
    heavy: true,
    hp: 180,
    maxHp: 180,
    speed: 3.1,
    dmg: 22,
    homeX: x,
    homeZ: z,
    spawned: false,
    spawnTimer: 0,
    hitFlash: 0,
    stagger: 0,
    knockVel: new THREE.Vector3(),
    fireTimer: 1.8,
    ringTimer: 4.5,
    windup: 0,
    isBoss: true,
  };
}

const knight = createKnight();
knight.group.position.set(-1.5, 0, 12);
scene.add(knight.group);

const horse = createWarhorse(-5.0, 10.5);
scene.add(horse.root);

// Diverse Biome Mobs across the whole 180x180 Valley (Story + Open World!)
const mobs = [
  // Act I — Silverstream Bridge
  createBiomeMob(BRIDGE_X + 9.0, BRIDGE_Z + 1.4, 'swordsman', 'act1'),
  createBiomeMob(BRIDGE_X + 9.8, BRIDGE_Z - 2.2, 'acolyte', 'act1'),
  // Act II — Moonfall Waterfall Shrine
  createBiomeMob(SHRINE_POS.x + 5.2, SHRINE_POS.z + 3.2, 'stalker', 'act2'),
  createBiomeMob(SHRINE_POS.x + 4.2, SHRINE_POS.z - 4.2, 'necro', 'act2'),
  // Sunscorch Barrens — Sunken Sand Temple (Both Modes!)
  createBiomeMob(DESERT_TEMPLE_POS.x - 13, DESERT_TEMPLE_POS.z + 2, 'tombguard', 'roam'),
  createBiomeMob(DESERT_TEMPLE_POS.x - 10, DESERT_TEMPLE_POS.z - 8, 'pyro', 'roam'),
  // Shiverpeak Frostlands — Frost Sanctum (Both Modes!)
  createBiomeMob(SNOW_MONUMENT_POS.x + 11, SNOW_MONUMENT_POS.z + 3, 'raider', 'roam'),
  createBiomeMob(SNOW_MONUMENT_POS.x + 6, SNOW_MONUMENT_POS.z + 11, 'wraith', 'roam'),
  // Deepwood Canopy & Misty Fenlands (South)
  createBiomeMob(4, 42, 'brute', 'roam'),
  createBiomeMob(-34, 42, 'stalker', 'roam'),
];
const warden = createWarden(KEEP_POS.x, KEEP_POS.z);

// Pre-allocated Orb & Ground Ring Pools
const sharedOrbGeo = new THREE.SphereGeometry(0.38, 10, 10);
const orbPool = Array.from({ length: 14 }, () => {
  const mesh = new THREE.Mesh(sharedOrbGeo, new THREE.MeshBasicMaterial({ color: 0xff5511 }));
  mesh.visible = false;
  scene.add(mesh);
  return { active: false, mesh, colorHex: 0xff5511, vel: new THREE.Vector3(), reflected: false, owner: null, dmg: 16 };
});

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

// Story Mode Spirit Trail & Beacon
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
// 7. COMBAT, HEALING (SLOW REGEN + 25% ON KILL) & GAME STATE
// =========================================================
let appState = 'menu';
let gameMode = null;
let storyStage = 0;
let runTime = 0;

const MAX_HP = 100;
let playerHP = MAX_HP;
let timeSinceDamage = 10;
let playerIFrames = 0;
let playerRedTint = 0;
let parries = 0;

// Sword 3-hit combo state
let swordSwingTimer = 0;
let swordCooldown = 0;
let comboStep = 0;
let comboResetTimer = 0;

// Shield & Dash state
let parryTimer = 0;
let parryCooldown = 0;
let dashTimer = 0;
let dashCooldown = 0;
let dashAfterimageTick = 0;
let skidTimer = 0;

let hitstop = 0;
let shake = 0;
let isMounted = false;
let useAscii = true;
let splashCooldown = 0;

const keys = {};
const msgEl = document.getElementById('msg');
const storyObjectivePos = new THREE.Vector3();

function getActivePos() { return isMounted ? horse.root.position : knight.group.position; }
function getActiveYaw() { return isMounted ? horse.yaw : knight.yaw; }

function flashMsg(text) {
  if (!msgEl) return;
  msgEl.textContent = text;
  setTimeout(() => { if (msgEl.textContent === text) msgEl.textContent = ''; }, 1600);
}

function clearProjectiles() {
  orbPool.forEach((o) => { o.active = false; o.mesh.visible = false; });
  ringPool.forEach((r) => { r.active = false; r.mesh.visible = false; });
  orbLightPool.forEach((l) => { l.intensity = 0; });
}

function refreshStatus() {
  const mountLabel = isMounted
    ? 'MOUNTED'
    : knight.group.position.distanceTo(horse.root.position) < 4.8
      ? '[E] MOUNT HORSE'
      : '[H] CALL HORSE';
  ui.updateStatus({
    hp: playerHP,
    maxHp: MAX_HP,
    parries,
    mountLabel,
    isRegening: playerHP < MAX_HP && timeSinceDamage >= 4.0,
    showBoss: gameMode === 'story' && storyStage === 3 && warden.hp > 0 && warden.spawned,
    bossHp: warden.hp,
    bossMax: warden.maxHp,
  });
}

// Curated Healing Effect: 25% Instant Heal on Hostile Mob Kill
function healOnKill(pos) {
  const healAmt = Math.round(MAX_HP * 0.25);
  playerHP = Math.min(MAX_HP, playerHP + healAmt);
  ui.triggerHealFlash();
  ui.spawnFloatText(pos, `+${healAmt}`, '#66ffbb', true);

  // Two expanding mint ground rings + fading Light Pillar
  spawnExpandingRing(pos, 0x66ffbb, 3.4, 0.48);
  setTimeout(() => spawnExpandingRing(getActivePos(), 0x99ffdd, 4.4, 0.52), 90);
  healPillar.position.set(pos.x, pos.y + 6.5, pos.z);
  healPillar.visible = true;
  healPillarTimer = 0.45;
  refreshStatus();
}

// Curated Taking-Damage Effects: Knockback + Blink I-Frames + Red Vignette + Red Tint
function damagePlayer(amount, sourcePos) {
  if (playerIFrames > 0 || dashTimer > 0) return;
  playerHP = Math.max(0, playerHP - amount);
  timeSinceDamage = 0;
  playerIFrames = 0.65;
  playerRedTint = 0.3;
  shake = 0.65;

  const p = getActivePos();
  ui.triggerDamageUI();
  ui.spawnFloatText(p, `-${amount}`, '#ff5555', false);
  spawnParticles(p, 0xff4433, 12, { spread: 8, upRand: 4 });

  // Knockback away from attacker
  if (sourcePos && !isMounted) {
    const kb = new THREE.Vector3(p.x - sourcePos.x, 0, p.z - sourcePos.z);
    if (kb.lengthSq() > 0.001) kb.normalize().multiplyScalar(11.5);
    knight.knockVel.copy(kb);
  }

  if (playerHP <= 0) respawnPlayer();
  refreshStatus();
}

// Curated Hit-Feedback & Enemy Defeat Effects
function damageMob(mob, amount, fromPos, isHeavy = false) {
  if (mob.hp <= 0) return;
  mob.hp = Math.max(0, mob.hp - amount);
  mob.hitFlash = 0.1; // White Flash for ~4 frames
  mob.stagger = Math.max(mob.stagger, isHeavy ? 0.38 : 0.22);

  // Knockback
  const kb = new THREE.Vector3(mob.group.position.x - fromPos.x, 0, mob.group.position.z - fromPos.z);
  if (kb.lengthSq() > 0.001) kb.normalize().multiplyScalar(mob.isBoss ? 3.5 : isHeavy ? 11.0 : 7.5);
  mob.knockVel.copy(kb);

  // Hit Stop + Screen Shake + Spark Burst + Floating Damage Number
  hitstop = isHeavy ? 0.07 : 0.045;
  shake = Math.max(shake, isHeavy ? 0.6 : 0.35);
  ui.spawnFloatText(mob.group.position, `${amount}`, isHeavy ? '#66ffee' : '#ffe066', isHeavy);
  spawnParticles(mob.group.position, isHeavy ? 0x66ffee : 0xffcc55, isHeavy ? 16 : 11, { spread: 9, upRand: 5 });

  if (mob.hp <= 0) {
    mob.group.visible = false;
    const p = mob.group.position;

    // 1) Ash / Pixel Dissolve (floating upward embers)
    spawnParticles(p, mob.accentHex, 18, { spread: 4.5, upMin: 2.2, upRand: 4.0, gravity: -1.8, life: 0.9, scale: 0.85 });
    // 2) Chunk Burst (spinning shards bouncing on the ground for heavy mobs & boss)
    if (mob.heavy) {
      spawnParticles(p, 0xc8c2b4, 14, { spread: 10, upMin: 3.5, upRand: 5.5, gravity: 18, life: 0.85, bounce: true, scale: 1.35 });
    }
    // 3) Soul Rise (pale swaying wisp floating up)
    spawnSoulRise(p);

    // 25% Instant Heal on Hostile Mob Defeat!
    healOnKill(getActivePos());

    if (mob.isBoss) {
      scene.background.setHex(0x2e1c11);
      scene.fog.color.setHex(0x2e1c11);
      moonLight.color.setHex(0xffd28a);
      setStoryStage(4);
      ui.showDialogue(`THE WARDEN FALLS! DAWN RETURNS TO ASHENBROOK AND THE VALLEY. (${Math.floor(runTime)}s · ${parries} PARRIES)`, 8.5);
    } else {
      flashMsg(`${mob.name.toUpperCase()} DEFEATED!`);
    }
  }
  refreshStatus();
}

// Detailed Broadsword 3-Hit Combo Slash
function triggerSwordAttack() {
  if (appState !== 'playing' || swordCooldown > 0) return;
  comboStep = comboResetTimer > 0 ? (comboStep % 3) + 1 : 1;
  comboResetTimer = 0.85;
  swordSwingTimer = 0.24;
  swordCooldown = comboStep === 3 ? 0.42 : 0.28;

  const p = getActivePos();
  const yaw = getActiveYaw();
  const fwdX = Math.sin(yaw);
  const fwdZ = Math.cos(yaw);

  // Subtle forward lunge on foot
  if (!isMounted) knight.speed = Math.max(knight.speed, 9.5);

  // Orient glowing slash arc
  knight.slashArc.rotation.z = comboStep === 2 ? -0.35 : 0.35;
  knight.slashArc.scale.setScalar(comboStep === 3 ? 1.25 : 1.0);
  knight.slashArc.material.color.setHex(comboStep === 3 ? 0x66ffee : 0xd8f6ff);
  knight.slashArc.material.opacity = 0.9;

  // Hit detection in a generous forward cleave cone
  const reach = (isMounted ? 4.4 : 3.7) + (comboStep === 3 ? 0.6 : 0);
  const baseDmg = comboStep === 3 ? 34 : 22;

  const targets = [...mobs, warden];
  targets.forEach((m) => {
    if (!m.group.visible || !m.spawned || m.hp <= 0) return;
    const dx = m.group.position.x - p.x;
    const dz = m.group.position.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > reach) return;
    const dot = (dx * fwdX + dz * fwdZ) / (dist || 1);
    if (dot > -0.15 || dist < 1.6) {
      damageMob(m, baseDmg, p, comboStep === 3);
    }
  });
}

function triggerParry() {
  if (appState !== 'playing' || parryCooldown > 0) return;
  parryTimer = 0.32;
  parryCooldown = 0.55;
}

function setStoryStage(stage) {
  storyStage = stage;
  if (stage === 1) {
    ui.setObjective('<b>ACT I &mdash; SILVERSTREAM BRIDGE</b>Slay or parry the Bridge Guardians with [LMB/F] Sword &amp; [SPACE] Shield.');
    storyObjectivePos.set(BRIDGE_X + 8.5, 0, BRIDGE_Z);
  } else if (stage === 2) {
    ui.setObjective('<b>ACT II &mdash; MOONFALL SHRINE</b>Cross Silverstream Bridge and cleanse the Waterfall Shrine Guardians.');
    storyObjectivePos.copy(SHRINE_POS);
  } else if (stage === 3) {
    ui.setObjective('<b>ACT III &mdash; BEYOND THE GATE</b>Ride north through Citadel Gate &amp; Ashenbrook Village to face the Warden.');
    storyObjectivePos.copy(KEEP_POS);
  } else if (stage === 4) {
    ui.setObjective(`<b>DAWN RETURNS</b>Cleared in ${Math.floor(runTime)}s &middot; ${parries} Parries. Press [ESC] for Open World.`);
    spiritTrail.visible = false;
    objectiveBeacon.visible = false;
  }
  objectiveBeacon.position.set(storyObjectivePos.x, 8, storyObjectivePos.z);
}

function resetWorldForMode(mode) {
  gameMode = mode;
  appState = 'playing';
  ui.setVisible(true);
  ui.resetArea();

  clearProjectiles();
  playerHP = MAX_HP;
  timeSinceDamage = 10;
  playerIFrames = 0;
  playerRedTint = 0;
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
  knight.knockVel.set(0, 0, 0);
  horse.root.position.set(-5.0, 0, 10.5);
  horse.speed = 0;
  horse.calling = false;

  // Reset mobs — they stay dormant until player enters range, then Rise from Ground / Summon Circle!
  mobs.forEach((m) => {
    m.hp = m.maxHp;
    m.stagger = 0;
    m.windup = 0;
    m.hitFlash = 0;
    m.knockVel.set(0, 0, 0);
    m.spawned = false;
    m.spawnTimer = 0;
    m.group.position.set(m.homeX, getWalkableY(m.homeX, m.homeZ), m.homeZ);
    m.group.visible = mode === 'story' ? true : m.role === 'roam';
  });

  warden.hp = warden.maxHp;
  warden.stagger = 0;
  warden.windup = 0;
  warden.spawned = false;
  warden.spawnTimer = 0;
  warden.group.position.set(warden.homeX, 0, warden.homeZ);
  warden.group.visible = mode === 'story';

  if (mode === 'story') {
    spiritTrail.visible = true;
    objectiveBeacon.visible = true;
    world.shrineCrystal.material.color.setHex(0xff5566);
    setStoryStage(1);
    ui.showDialogue('SLAY FOES WITH [LEFT CLICK / F] BROADSWORD &amp; PARRY WITH [SPACE / RIGHT CLICK]. DEFEATING ENEMIES HEALS 25% HP.', 6.0);
  } else {
    ui.setObjective(null);
    spiritTrail.visible = false;
    objectiveBeacon.visible = false;
    world.shrineCrystal.material.color.setHex(0x55ffee);
    ui.showDialogue('OPEN WORLD: RIDE FREELY TO ASHENBROOK VILLAGE, SAND TEMPLE (EAST) &amp; FROST SANCTUM (NW). CHECK [ESC] &rarr; CONTROLS ANYTIME.', 6.5);
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

function spawnOrb(origin, target, colorHex, owner, speed = 7.8, dmg = 16) {
  const slot = orbPool.find((o) => !o.active);
  if (!slot) return;
  slot.active = true;
  slot.colorHex = colorHex;
  slot.reflected = false;
  slot.owner = owner;
  slot.dmg = dmg;
  slot.mesh.material.color.setHex(colorHex);
  slot.mesh.position.set(origin.x, origin.y + 1.35, origin.z);
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
  playerHP = MAX_HP;
  timeSinceDamage = 10;
  playerIFrames = 1.2;
  const p = getActivePos();
  p.set(-1.5, 0, 12);
  if (isMounted) horse.speed = 0;
  spawnParticles(p, 0x55ffee, 22);
  flashMsg('SHATTERED — BOUNCED BACK TO BRAZIER');
}

// --- INPUT LISTENERS (SPACEBAR BUG PERMANENTLY FIXED) ---
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

  if (e.code === 'Space') {
    e.preventDefault(); // Prevents accidental button activation or page scroll
    triggerParry();
  }
  if (e.code === 'KeyF' || e.code === 'KeyJ') triggerSwordAttack();
  if (e.code === 'KeyE') toggleMount();
  if (e.code === 'KeyH' && !isMounted) {
    horse.calling = true;
    flashMsg('WHISTLED FOR WARHORSE...');
  }
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !isMounted && dashCooldown <= 0) {
    dashTimer = 0.18;
    dashCooldown = 0.8;
    dashAfterimageTick = 0;
    // Curated Dash Effect: Biome Dust Kick backward at dash start
    spawnParticles(knight.group.position, getBiomeDustColor(knight.group.position.x, knight.group.position.z), 8, {
      spread: 5.5, upMin: 1.0, upRand: 2.2, gravity: 10, life: 0.38,
    });
  }
  if (e.code === 'Digit1') { useAscii = true; asciiPass.uniforms.uHybrid.value = 1.0; asciiPass.uniforms.uCellSize.value.set(5.5, 9.0); flashMsg('REEL HYBRID ASCII'); }
  if (e.code === 'Digit2') { useAscii = true; asciiPass.uniforms.uHybrid.value = 0.0; asciiPass.uniforms.uCellSize.value.set(5.0, 8.0); flashMsg('PURE MICRO ASCII'); }
  if (e.code === 'Digit3') { useAscii = true; asciiPass.uniforms.uHybrid.value = 0.0; asciiPass.uniforms.uCellSize.value.set(8.5, 14.0); flashMsg('RETRO TERMINAL'); }
  if (e.code === 'Digit4') { useAscii = !useAscii; flashMsg(useAscii ? 'ASCII ON' : 'RAW 3D'); }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

window.addEventListener('contextmenu', (e) => {
  if (appState === 'playing') e.preventDefault();
});
window.addEventListener('pointerdown', (e) => {
  if (appState !== 'playing') return;
  if (e.target.closest('#menu-overlay') || e.target.closest('#minimap-wrap') || e.target.closest('#fullmap-overlay')) return;
  if (e.button === 2) triggerParry();
  else if (e.button === 0) triggerSwordAttack();
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
// 8. BUTTER-SMOOTH 60 FPS MAIN LOOP
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

  // Cinematic Waterfall Orbit on Title Screen
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

  // Curated Hit Feedback: Hit Stop Freeze
  if (hitstop > 0) {
    hitstop -= dt;
    asciiPass.uniforms.uFlash.value = Math.max(0, hitstop * 3.8);
    if (useAscii) composer.render();
    else renderer.render(scene, camera);
    return;
  }
  asciiPass.uniforms.uFlash.value = 0;

  if (gameMode === 'story' && storyStage < 4) runTime += dt;
  ui.tickDialogue(dt);

  // Passive Slow Healing Over Time (kicks in 4s after taking damage)
  timeSinceDamage += dt;
  if (playerHP < MAX_HP && timeSinceDamage >= 4.0) {
    playerHP = Math.min(MAX_HP, playerHP + 3.8 * dt);
  }

  // Player Blink I-Frames + Red Damage Tint
  if (playerIFrames > 0) {
    playerIFrames -= dt;
    knight.bodyPivot.visible = Math.floor(t * 28) % 2 === 0;
  } else {
    knight.bodyPivot.visible = true;
  }
  if (playerRedTint > 0) {
    playerRedTint -= dt;
    const tint = Math.max(0, playerRedTint / 0.3);
    knight.armorMats.forEach((m) => m.emissive.setRGB(tint * 0.85, 0, 0));
  } else {
    knight.armorMats.forEach((m) => m.emissive.setRGB(0, 0, 0));
  }

  // --- MOVEMENT (SMOOTH HORSE OR SMOOTH ON-FOOT KNIGHT + DASH EFFECTS) ---
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
      horse.speed = THREE.MathUtils.lerp(horse.speed, maxSpeed * (Math.abs(diff) > 1.2 ? 0.45 : 1.0), 1 - Math.exp(-3.4 * dt));
    } else {
      horse.bank = 0;
      horse.speed = THREE.MathUtils.lerp(horse.speed, 0, 1 - Math.exp(-4.2 * dt));
      if (horse.speed < 0.08) horse.speed = 0;
    }

    const nx = THREE.MathUtils.clamp(horse.root.position.x + Math.sin(horse.yaw) * horse.speed * dt, -84, 84);
    const nz = THREE.MathUtils.clamp(horse.root.position.z + Math.cos(horse.yaw) * horse.speed * dt, -82, 82);
    const blocked = world.colliders.some((c) => Math.hypot(nx - c.x, nz - c.z) < c.r + 0.9);
    if (!blocked) { horse.root.position.x = nx; horse.root.position.z = nz; }
    else horse.speed *= 0.35;

    horse.root.position.y = THREE.MathUtils.lerp(horse.root.position.y, getWalkableY(horse.root.position.x, horse.root.position.z), 1 - Math.exp(-14 * dt));
    horse.root.rotation.y = horse.yaw;
    currentMoveSpeed = horse.speed;

    if (horse.speed > 4.5 && splashCooldown <= 0) {
      if (inRiver) spawnParticles(horse.root.position, 0xdff5ff, 5, { spread: 6, upRand: 4 });
      else if (horse.speed > 11.5) spawnParticles(horse.root.position, getBiomeDustColor(nx, nz), 3, { spread: 4, upRand: 2 });
      splashCooldown = 0.09;
    }
  } else {
    if (dashCooldown > 0) dashCooldown -= dt;
    const wasDashing = dashTimer > 0;
    if (dashTimer > 0) {
      dashTimer -= dt;
      // Curated Dash Effect: Mint Afterimages every 0.035s
      dashAfterimageTick -= dt;
      if (dashAfterimageTick <= 0) {
        dashAfterimageTick = 0.035;
        spawnAfterimage(knight.group.position, knight.yaw);
      }
      if (dashTimer <= 0 && wasDashing) {
        // Curated Dash Effect: Skid Stop lean-back + foot sparks
        skidTimer = 0.16;
        spawnParticles(knight.group.position, 0xbbeeff, 7, { spread: 6, upMin: 0.6, upRand: 2.2, life: 0.3 });
      }
    }

    const targetSpeed = hasInput ? (dashTimer > 0 ? 19.0 : 8.2) : (dashTimer > 0 ? 17.5 : 0);
    knight.speed = THREE.MathUtils.lerp(knight.speed, targetSpeed, 1 - Math.exp(-12 * dt));

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

    // Apply Knockback Decay
    const vx = Math.sin(knight.yaw) * knight.speed + knight.knockVel.x;
    const vz = Math.cos(knight.yaw) * knight.speed + knight.knockVel.z;
    knight.knockVel.multiplyScalar(Math.exp(-10 * dt));

    if (Math.hypot(vx, vz) > 0.15) {
      const nx = THREE.MathUtils.clamp(knight.group.position.x + vx * dt, -84, 84);
      const nz = THREE.MathUtils.clamp(knight.group.position.z + vz * dt, -82, 82);
      const blocked = world.colliders.some((c) => Math.hypot(nx - c.x, nz - c.z) < c.r + 0.55);
      if (!blocked) { knight.group.position.x = nx; knight.group.position.z = nz; }
      knight.group.position.y = THREE.MathUtils.lerp(knight.group.position.y, getWalkableY(knight.group.position.x, knight.group.position.z), 1 - Math.exp(-15 * dt));
      knight.leftLeg.rotation.x = Math.sin(t * 13) * 0.55;
      knight.rightLeg.rotation.x = -Math.sin(t * 13) * 0.55;
      knight.bodyPivot.position.y = Math.abs(Math.sin(t * 13)) * 0.08;

      if (isInWater(nx, nz) && splashCooldown <= 0) {
        spawnParticles(knight.group.position, 0xdff5ff, 3, { spread: 3.8, upRand: 2.5 });
        splashCooldown = 0.16;
      }
    } else {
      knight.leftLeg.rotation.x *= 0.82;
      knight.rightLeg.rotation.x *= 0.82;
      knight.bodyPivot.position.y *= 0.85;
    }

    // Skid Stop backward pitch
    if (skidTimer > 0) {
      skidTimer -= dt;
      knight.bodyPivot.rotation.x = THREE.MathUtils.lerp(knight.bodyPivot.rotation.x, -0.32, 0.45);
    } else {
      knight.bodyPivot.rotation.x = THREE.MathUtils.lerp(knight.bodyPivot.rotation.x, 0, 0.25);
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

  // Animate Broadsword 3-Hit Swing & Glowing Slash Arc
  if (swordCooldown > 0) swordCooldown -= dt;
  if (comboResetTimer > 0) comboResetTimer -= dt;
  if (swordSwingTimer > 0) {
    swordSwingTimer -= dt;
    const prog = 1 - swordSwingTimer / 0.24;
    if (comboStep === 1) {
      knight.swordPivot.rotation.y = THREE.MathUtils.lerp(-1.5, 1.35, prog);
      knight.swordPivot.rotation.x = -0.5;
    } else if (comboStep === 2) {
      knight.swordPivot.rotation.y = THREE.MathUtils.lerp(1.4, -1.45, prog);
      knight.swordPivot.rotation.x = -0.35;
    } else {
      knight.swordPivot.rotation.x = THREE.MathUtils.lerp(-1.85, 0.75, prog);
      knight.swordPivot.rotation.y = 0;
    }
    knight.slashArc.material.opacity = Math.max(0, (1 - prog) * 0.85);
    knight.slashArc.rotation.z += (comboStep === 2 ? -6.5 : 6.5) * dt;
  } else {
    knight.swordPivot.rotation.x = THREE.MathUtils.lerp(knight.swordPivot.rotation.x, 0.15, 0.22);
    knight.swordPivot.rotation.y = THREE.MathUtils.lerp(knight.swordPivot.rotation.y, 0.0, 0.22);
    knight.slashArc.material.opacity = 0;
  }

  // Shield Parry Visual
  if (parryCooldown > 0) parryCooldown -= dt;
  if (parryTimer > 0) {
    parryTimer -= dt;
    knight.shieldRing.material.opacity = 0.92;
    knight.shieldRing.scale.setScalar(1.0 + (0.32 - parryTimer) * 1.4);
    knight.shieldGlow.intensity = 18;
    knight.shieldGroup.position.z = 0.45;
  } else {
    knight.shieldRing.material.opacity = 0;
    knight.shieldGlow.intensity = 0;
    knight.shieldGroup.position.z = 0.26;
  }

  const playerPos = getActivePos();
  world.updateWorld(dt, t, playerPos, windX, windZ, true);
  animateHorseLegs(horse, dt, t);
  updateHorseHair(horse, dt, t, windX, windZ);
  updateKnightCape(knight, dt, t, windX, windZ, currentMoveSpeed);

  // --- STORY MODE PROGRESSION & SPIRIT TRAIL ---
  if (gameMode === 'story' && storyStage < 4) {
    if (storyStage === 1 && mobs.filter((m) => m.role === 'act1' && m.hp > 0).length === 0) {
      setStoryStage(2);
      ui.showDialogue('THE BRIDGE IS CLEAR! CROSS SILVERSTREAM BRIDGE ABOVE THE STREAM TO MOONFALL SHRINE.', 5.5);
    } else if (storyStage === 2 && mobs.filter((m) => m.role === 'act2' && m.hp > 0).length === 0 && playerPos.distanceTo(world.shrineGroup.position) < 9.5) {
      world.shrineCrystal.material.color.setHex(0x66ffee);
      world.shrineCrystal.getWorldPosition(_tmpPos);
      spawnParticles(_tmpPos, 0x66ffee, 26, { spread: 10, upRand: 6 });
      setStoryStage(3);
      ui.showDialogue('SHRINE AWAKENED! RIDE THROUGH CITADEL GATE &amp; ASHENBROOK VILLAGE TO DEFEAT THE WARDEN.', 6.0);
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

  // --- BIOME MOBS AI (RISE FROM GROUND / SUMMON CIRCLE + MELEE & RANGED COMBAT) ---
  mobs.forEach((m) => {
    if (!m.group.visible || m.hp <= 0) return;

    // White Hit Flash update
    if (m.hitFlash > 0) {
      m.hitFlash -= dt;
      m.flashMats.forEach((mat) => mat.emissive.setHex(0xffffff));
    } else {
      m.flashMats.forEach((mat) => mat.emissive.setHex(0x000000));
    }

    const dist = m.group.position.distanceTo(playerPos);

    // Trigger Curated Spawn Effect when player enters range!
    if (!m.spawned) {
      if (dist < 22) {
        m.spawned = true;
        m.spawnTimer = 0.55;
        if (m.combat === 'ranged') {
          spawnExpandingRing(m.group.position, m.accentHex, 2.8, 0.55); // Summon Circle
        } else {
          spawnParticles(m.group.position, getBiomeDustColor(m.homeX, m.homeZ), 12, { spread: 6, upMin: 2.0, upRand: 3.5 }); // Rise from Ground
        }
      } else {
        return;
      }
    }

    if (m.spawnTimer > 0) {
      m.spawnTimer -= dt;
      const p = 1 - m.spawnTimer / 0.55;
      const baseY = getWalkableY(m.group.position.x, m.group.position.z);
      m.group.position.y = baseY - (1 - p) * 2.1;
      return;
    }

    if (dist > 28) return;

    // Apply Knockback & Stagger
    if (m.knockVel.lengthSq() > 0.05) {
      m.group.position.x += m.knockVel.x * dt;
      m.group.position.z += m.knockVel.z * dt;
      m.group.position.y = getWalkableY(m.group.position.x, m.group.position.z);
      m.knockVel.multiplyScalar(Math.exp(-9 * dt));
    }
    if (m.stagger > 0) {
      m.stagger -= dt;
      return;
    }

    m.group.lookAt(playerPos.x, m.group.position.y, playerPos.z);

    if (m.combat === 'melee') {
      if (m.windup > 0) {
        m.windup -= dt;
        m.weaponArm.rotation.x = THREE.MathUtils.lerp(-1.9, 0.9, 1 - m.windup / 0.45);
        if (m.windup <= 0) {
          if (dist < 3.1) {
            if (parryTimer > 0) {
              // MELEE PARRY! Staggers mob, bounces sparks & deals counter-damage!
              parries++;
              flashMsg('>> MELEE PARRIED! <<');
              damageMob(m, 30, playerPos, true);
            } else {
              damagePlayer(m.dmg, m.group.position);
            }
          }
          m.atkTimer = 1.35 + Math.random() * 0.4;
        }
      } else {
        m.weaponArm.rotation.x = THREE.MathUtils.lerp(m.weaponArm.rotation.x, 0, 0.2);
        if (dist > 2.3) {
          const dx = (playerPos.x - m.group.position.x) / dist;
          const dz = (playerPos.z - m.group.position.z) / dist;
          const nx = m.group.position.x + dx * m.speed * dt;
          const nz = m.group.position.z + dz * m.speed * dt;
          if (!isInWater(nx, nz)) m.group.position.set(nx, getWalkableY(nx, nz), nz);
          m.leftLeg.rotation.x = Math.sin(t * 10) * 0.5;
          m.rightLeg.rotation.x = -Math.sin(t * 10) * 0.5;
        } else {
          m.atkTimer -= dt;
          if (m.atkTimer <= 0) {
            m.windup = 0.45; // Visible melee telegraph before strike
            spawnParticles(m.group.position, m.accentHex, 4, { spread: 3, upRand: 2, life: 0.25 });
          }
        }
      }
    } else {
      // Ranged Caster Mob
      if (dist > 7.0 && dist < 21) {
        const dx = (playerPos.x - m.group.position.x) / dist;
        const dz = (playerPos.z - m.group.position.z) / dist;
        const nx = m.group.position.x + dx * m.speed * dt;
        const nz = m.group.position.z + dz * m.speed * dt;
        if (!isInWater(nx, nz)) m.group.position.set(nx, getWalkableY(nx, nz), nz);
        m.leftLeg.rotation.x = Math.sin(t * 8) * 0.4;
        m.rightLeg.rotation.x = -Math.sin(t * 8) * 0.4;
      }
      if (dist < 18.5) {
        m.atkTimer -= dt;
        if (m.atkTimer <= 0) {
          spawnOrb(m.group.position, playerPos, m.accentHex, m, 7.6, m.dmg);
          m.atkTimer = 2.5 + Math.random() * 0.8;
        }
      }
    }
  });

  // --- HYBRID WARDEN BOSS AI (MELEE GREATSWORD + FIREBALLS + FIRE RINGS) ---
  if (warden.group.visible && warden.hp > 0) {
    if (warden.hitFlash > 0) {
      warden.hitFlash -= dt;
      warden.flashMats.forEach((mat) => mat.emissive.setHex(0xffffff));
    } else {
      warden.flashMats.forEach((mat) => mat.emissive.setHex(0x000000));
    }

    warden.halo.rotation.z = t * 1.8;
    const bossDist = warden.group.position.distanceTo(playerPos);

    if (!warden.spawned && bossDist < 26) {
      warden.spawned = true;
      warden.spawnTimer = 0.7;
      spawnExpandingRing(warden.group.position, 0xff5522, 5.2, 0.7);
      refreshStatus();
    }

    if (warden.spawned) {
      if (warden.spawnTimer > 0) {
        warden.spawnTimer -= dt;
        warden.group.position.y = -(warden.spawnTimer / 0.7) * 3.2;
      } else {
        warden.group.position.y = 0;
        warden.group.lookAt(playerPos.x, 0, playerPos.z);

        if (warden.knockVel.lengthSq() > 0.05) {
          warden.group.position.x += warden.knockVel.x * dt;
          warden.group.position.z += warden.knockVel.z * dt;
          warden.knockVel.multiplyScalar(Math.exp(-8 * dt));
        }

        if (bossDist < 25) {
          const enraged = warden.hp <= warden.maxHp * 0.5;
          // Close-range greatsword cleave
          if (warden.windup > 0) {
            warden.windup -= dt;
            warden.weaponArm.rotation.x = THREE.MathUtils.lerp(-2.0, 0.9, 1 - warden.windup / 0.55);
            if (warden.windup <= 0 && bossDist < 4.2) {
              if (parryTimer > 0) {
                parries++;
                flashMsg('>> WARDEN CLEAVE PARRIED! <<');
                damageMob(warden, 32, playerPos, true);
              } else {
                damagePlayer(warden.dmg, warden.group.position);
              }
            }
          } else {
            warden.weaponArm.rotation.x = THREE.MathUtils.lerp(warden.weaponArm.rotation.x, 0, 0.2);
            if (bossDist > 3.6 && bossDist < 15) {
              const dx = (playerPos.x - warden.group.position.x) / bossDist;
              const dz = (playerPos.z - warden.group.position.z) / bossDist;
              warden.group.position.x += dx * warden.speed * dt;
              warden.group.position.z += dz * warden.speed * dt;
            } else if (bossDist <= 3.6) {
              warden.windup = 0.55;
            }
          }

          warden.fireTimer -= dt;
          if (warden.fireTimer <= 0) {
            spawnOrb(warden.group.position, playerPos, 0xff5511, warden, enraged ? 10.2 : 8.5, 18);
            warden.fireTimer = enraged ? 1.55 : 2.25;
          }
          warden.ringTimer -= dt;
          if (warden.ringTimer <= 0) {
            spawnGroundRing(playerPos.x, playerPos.z);
            warden.ringTimer = enraged ? 3.5 : 4.4;
          }
        }
      }
    }
  }

  // Update Pooled Ground Fire Rings
  for (let i = 0; i < ringPool.length; i++) {
    const r = ringPool[i];
    if (!r.active) continue;
    r.timer -= dt;
    r.mesh.material.opacity = 0.4 + (1 - r.timer / r.maxTimer) * 0.6;
    if (r.timer <= 0) {
      // Curated Projectile/Blast Impact: Fire Ring + Sparks
      spawnExpandingRing(r.mesh.position, 0xff7722, 3.6, 0.35);
      spawnParticles(r.mesh.position, 0xff9933, 16, { spread: 9, upRand: 5 });
      if (playerPos.distanceTo(r.mesh.position) < 2.35) damagePlayer(20, r.mesh.position);
      r.active = false;
      r.mesh.visible = false;
    }
  }

  // Update Pooled Orbs & Static Light Pool
  let lightIdx = 0;
  for (let i = 0; i < orbPool.length; i++) {
    const o = orbPool[i];
    if (!o.active) continue;

    o.mesh.position.addScaledVector(o.vel, dt);
    const distPlayer = Math.hypot(o.mesh.position.x - playerPos.x, o.mesh.position.z - playerPos.z);
    const parryRadius = isMounted ? 3.3 : 2.6;

    if (!o.reflected && parryTimer > 0 && distPlayer < parryRadius) {
      o.reflected = true;
      o.colorHex = 0x55ffee;
      o.mesh.material.color.setHex(0x55ffee);
      parries++;
      hitstop = 0.055;
      shake = 0.45;
      spawnParticles(o.mesh.position, 0x55ffee, 14, { spread: 9, upRand: 4, bounce: true });
      const tp = o.owner.group.position;
      o.vel.set(tp.x - o.mesh.position.x, 0, tp.z - o.mesh.position.z).normalize().multiplyScalar(18.5);
      flashMsg('>> BOUNCED BACK! <<');
      refreshStatus();
    } else if (!o.reflected && distPlayer < 0.98) {
      // Curated Projectile Impact: Shatter Bolt shards + Fire Ring
      spawnParticles(o.mesh.position, o.colorHex, 10, { spread: 8, upRand: 4, bounce: true });
      spawnExpandingRing(o.mesh.position, o.colorHex, 2.0, 0.28);
      damagePlayer(o.dmg, o.mesh.position);
      o.active = false;
      o.mesh.visible = false;
      continue;
    } else if (o.reflected && o.owner.hp > 0) {
      const distOwner = Math.hypot(
        o.mesh.position.x - o.owner.group.position.x,
        o.mesh.position.z - o.owner.group.position.z
      );
      if (distOwner < 1.95) {
        spawnExpandingRing(o.mesh.position, 0x55ffee, 2.8, 0.32);
        damageMob(o.owner, 45, playerPos, true);
        o.active = false;
        o.mesh.visible = false;
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

  // --- UPDATE ALL POOLED VFX (Particles, Souls, Rings, Heal Pillar, Afterimages) ---
  for (let i = 0; i < MAX_PARTS; i++) {
    const p = partData[i];
    if (p.active) {
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        dummy.scale.setScalar(0);
      } else {
        p.vel.y -= p.gravity * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.bounce && p.pos.y < 0.14) {
          p.pos.y = 0.14;
          p.vel.y = Math.abs(p.vel.y) * 0.45;
          p.vel.x *= 0.72;
          p.vel.z *= 0.72;
        }
        p.rot.x += dt * 7;
        p.rot.y += dt * 5;
        dummy.position.copy(p.pos);
        dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);
        dummy.scale.setScalar((p.life / p.maxLife) * p.scale);
      }
    } else {
      dummy.scale.setScalar(0);
    }
    dummy.updateMatrix();
    partMesh.setMatrixAt(i, dummy.matrix);
  }
  partMesh.instanceMatrix.needsUpdate = true;

  soulPool.forEach((s) => {
    if (!s.active) return;
    s.life -= dt;
    if (s.life <= 0) { s.active = false; s.g.visible = false; return; }
    const ratio = s.life / s.maxLife;
    s.g.position.y += dt * 2.4;
    s.g.position.x = s.baseX + Math.sin(t * 5.0 + s.phase) * 0.45;
    s.core.material.opacity = ratio * 0.85;
    s.tail.material.opacity = ratio * 0.5;
  });

  vfxRingPool.forEach((r) => {
    if (!r.active) return;
    r.life -= dt;
    if (r.life <= 0) { r.active = false; r.m.visible = false; return; }
    const prog = 1 - r.life / r.maxLife;
    r.m.scale.setScalar(0.35 + prog * r.maxScale);
    r.m.material.opacity = (1 - prog) * 0.85;
  });

  if (healPillarTimer > 0) {
    healPillarTimer -= dt;
    const ratio = Math.max(0, healPillarTimer / 0.45);
    healPillar.position.set(playerPos.x, playerPos.y + 6.5, playerPos.z);
    healPillar.scale.set(ratio, 1, ratio);
    healPillar.material.opacity = ratio * 0.48;
    if (healPillarTimer <= 0) healPillar.visible = false;
  }

  afterimagePool.forEach((a) => {
    if (!a.active) return;
    a.life -= dt;
    if (a.life <= 0) { a.active = false; a.g.visible = false; return; }
    a.mat.opacity = (a.life / a.maxLife) * 0.5;
  });

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

  // Update floating numbers smoothly every frame
  ui.updateFloatTexts(dt, camera);

  // Throttled 10 Hz Minimap, Area Transition & Status Updates
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
      mobs,
      warden,
      objectivePos: gameMode === 'story' && storyStage < 4 ? storyObjectivePos : null,
    });
  }

  if (useAscii) composer.render();
  else renderer.render(scene, camera);
}

animate();