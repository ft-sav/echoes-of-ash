import * as THREE from 'three';

// =========================================================
// WORLD CONSTANTS & STREAM / TERRAIN / BIOME MATH
// =========================================================
export const WORLD_HALF = 90;
export const BRIDGE_Z = 6.0;
export const BRIDGE_HALF_LEN = 7.6;
export const BRIDGE_HALF_W = 2.5;

export function getStreamX(z) {
  const t = z + 14.0;
  return (
    -24.0 +
    Math.sin(t * 0.055) * 6.8 +
    THREE.MathUtils.clamp(t, 0, 30) * 0.12 -
    Math.max(0, t - 36) * 0.22
  );
}

export const BRIDGE_X = getStreamX(BRIDGE_Z);
export const WATERFALL_POOL = new THREE.Vector3(-24, 0, -14);
export const SHRINE_POS = new THREE.Vector3(-33, 0, -8);
export const GATE_POS = new THREE.Vector3(0, 0, -22);
export const VILLAGE_CENTER = new THREE.Vector3(0, 0, -41);
export const KEEP_POS = new THREE.Vector3(0, 0, -70);
export const DESERT_TEMPLE_POS = new THREE.Vector3(60, 0, 22);
export const SNOW_MONUMENT_POS = new THREE.Vector3(-56, 0, -46);

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function isOnBridge(x, z) {
  return Math.abs(z - BRIDGE_Z) <= BRIDGE_HALF_W && Math.abs(x - BRIDGE_X) <= BRIDGE_HALF_LEN;
}

export function getBridgeY(x) {
  const u = THREE.MathUtils.clamp((x - BRIDGE_X) / BRIDGE_HALF_LEN, -1, 1);
  return Math.cos(u * Math.PI * 0.5) * 1.75;
}

export function getWaterDistance(x, z) {
  const distPool = Math.hypot(x - WATERFALL_POOL.x, z - WATERFALL_POOL.z) - 8.4;
  let distStream = 999;
  if (z >= -14.5 && z <= 82) {
    const sx = getStreamX(z);
    const halfW = 3.3 + smoothstep(24, 65, z) * 2.2;
    distStream = Math.abs(x - sx) - halfW;
  }
  return Math.min(distPool, distStream);
}

export function isInWater(x, z) {
  if (isOnBridge(x, z)) return false;
  return getWaterDistance(x, z) < 0;
}

export function getBiomeWeights(x, z) {
  const wx = x + Math.sin(z * 0.042) * 10.0 + Math.cos(z * 0.019) * 5.0;
  const wz = z + Math.cos(x * 0.042) * 10.0 + Math.sin(x * 0.021) * 5.0;

  const villageMask = 1.0 - smoothstep(14, 28, Math.hypot(x, z + 42));

  const iceRaw = smoothstep(-28, -50, wx) * smoothstep(-14, -36, wz);
  const frostRaw = smoothstep(-14, -32, wx) * smoothstep(2, -18, wz) * (1.0 - iceRaw * 0.85);
  const swampRaw = smoothstep(-8, -28, wx) * smoothstep(18, 36, wz);
  const jungleRaw = smoothstep(-16, 4, wx) * (1.0 - smoothstep(24, 42, wx)) * smoothstep(20, 38, wz);

  const desertLat = smoothstep(-28, -4, wz);
  const desertRaw = smoothstep(38, 58, wx) * desertLat;
  const steppeRaw = smoothstep(18, 36, wx) * (1.0 - desertRaw * 0.85) * smoothstep(-34, -12, wz);

  const ice = iceRaw * (1.0 - villageMask);
  const frost = frostRaw * (1.0 - villageMask);
  const swamp = swampRaw * (1.0 - villageMask);
  const jungle = jungleRaw * (1.0 - villageMask);
  const steppe = steppeRaw * (1.0 - villageMask);
  const desert = desertRaw * (1.0 - villageMask);

  const others = ice + frost + swamp + jungle + steppe + desert;
  const meadow = Math.max(0.05, 1.0 - others);
  const sum = meadow + others;

  return {
    meadow: meadow / sum,
    frost: frost / sum,
    ice: ice / sum,
    swamp: swamp / sum,
    jungle: jungle / sum,
    steppe: steppe / sum,
    desert: desert / sum,
  };
}

export function getAreaInfo(x, z) {
  if (isOnBridge(x, z)) return { id: 'bridge', name: 'SILVERSTREAM BRIDGE', sub: 'CROSSING OF THE MOONFALL STREAM' };
  if (Math.hypot(x - WATERFALL_POOL.x, z - WATERFALL_POOL.z) < 15.5) {
    return { id: 'waterfall', name: 'MOONFALL WATERFALL', sub: 'ANCIENT CASCADE' };
  }
  if (Math.hypot(x - DESERT_TEMPLE_POS.x, z - DESERT_TEMPLE_POS.z) < 17) {
    return { id: 'temple', name: 'SUNKEN SAND TEMPLE', sub: 'FORGOTTEN MONUMENT OF THE DUNES' };
  }
  if (Math.hypot(x - SNOW_MONUMENT_POS.x, z - SNOW_MONUMENT_POS.z) < 16) {
    return { id: 'cairn', name: 'SHIVERPEAK SANCTUM', sub: 'ANCIENT FROST MONOLITHS' };
  }
  if (Math.hypot(x - KEEP_POS.x, z - KEEP_POS.z) < 16) {
    return { id: 'keep', name: 'ASHEN KEEP', sub: 'SEAT OF THE WARDEN' };
  }
  if (Math.abs(x) < 20 && z < -24 && z > -60) {
    return { id: 'village', name: 'ASHENBROOK VILLAGE', sub: 'HAMLET BEYOND THE GATE' };
  }
  if (Math.abs(x) < 11 && Math.abs(z - GATE_POS.z) < 5) {
    return { id: 'gate', name: 'CITADEL GATE', sub: 'THRESHOLD OF ASHENBROOK' };
  }

  const b = getBiomeWeights(x, z);
  const entries = [
    { id: 'ice', w: b.ice, name: 'SHIVERPEAK FROSTLANDS', sub: 'FROZEN HIGHLANDS' },
    { id: 'frost', w: b.frost, name: 'FROSTPINE FOOTHILLS', sub: 'CHILLED BORDERLANDS' },
    { id: 'swamp', w: b.swamp, name: 'MISTY FENLANDS', sub: 'DROWNED MARSHES' },
    { id: 'jungle', w: b.jungle, name: 'DEEPWOOD CANOPY', sub: 'OVERGROWN THICKET' },
    { id: 'desert', w: b.desert, name: 'SUNSCORCH BARRENS', sub: 'MOONLIT DUNES' },
    { id: 'steppe', w: b.steppe, name: 'OCHRE STEPPE', sub: 'DRY SCRUBLANDS' },
    { id: 'meadow', w: b.meadow, name: 'WHISPERING MEADOW', sub: 'TEMPERATE VALLEY' },
  ];
  entries.sort((a, c) => c.w - a.w);
  return entries[0];
}

export function getGroundY(x, z) {
  const wDist = getWaterDistance(x, z);
  if (wDist < 2.2) {
    const bank = smoothstep(-1.2, 2.2, wDist);
    return THREE.MathUtils.lerp(-0.58, 0.0, bank);
  }

  // Flat foundations for village, keep, road, bridge & ancient monuments
  if (Math.abs(x) < 20 && z < -20 && z > -78) return 0;
  if (Math.abs(x) < 9 && z > -24 && z < 26) return 0;
  if (Math.abs(z - BRIDGE_Z) < 6 && x < 2 && x > BRIDGE_X - 11) return 0;
  if (Math.hypot(x - DESERT_TEMPLE_POS.x, z - DESERT_TEMPLE_POS.z) < 16) return 0.2;
  if (Math.hypot(x - SNOW_MONUMENT_POS.x, z - SNOW_MONUMENT_POS.z) < 15) return 0.2;

  const b = getBiomeWeights(x, z);
  const meadowHill = Math.max(0, (Math.sin(x * 0.07) * Math.cos(z * 0.07) + 0.4) * 1.4);
  const duneHill = (Math.sin(x * 0.09 + z * 0.05) * 0.5 + 0.5) * 2.5;
  const frostRidge = Math.max(0, (Math.sin(x * 0.08) * Math.sin(z * 0.08) + 0.6) * 2.9);
  const swampFlat = -0.05;

  const h =
    b.meadow * meadowHill +
    b.jungle * meadowHill * 0.8 +
    b.steppe * duneHill * 0.65 +
    b.desert * duneHill +
    b.frost * frostRidge * 0.7 +
    b.ice * frostRidge +
    b.swamp * swampFlat;

  const flatNearWater = smoothstep(2.2, 7.5, wDist);
  const flatNearTemple = smoothstep(14, 24, Math.hypot(x - DESERT_TEMPLE_POS.x, z - DESERT_TEMPLE_POS.z));
  const flatNearCairn = smoothstep(13, 23, Math.hypot(x - SNOW_MONUMENT_POS.x, z - SNOW_MONUMENT_POS.z));
  return h * flatNearWater * flatNearTemple * flatNearCairn;
}

export function getWalkableY(x, z) {
  return isOnBridge(x, z) ? getBridgeY(x) : Math.max(0.0, getGroundY(x, z));
}

function blendBiomeColor(target, colors, b) {
  target.setRGB(
    colors.meadow.r * b.meadow +
      colors.frost.r * b.frost +
      colors.ice.r * b.ice +
      colors.swamp.r * b.swamp +
      colors.jungle.r * b.jungle +
      colors.steppe.r * b.steppe +
      colors.desert.r * b.desert,
    colors.meadow.g * b.meadow +
      colors.frost.g * b.frost +
      colors.ice.g * b.ice +
      colors.swamp.g * b.swamp +
      colors.jungle.g * b.jungle +
      colors.steppe.g * b.steppe +
      colors.desert.g * b.desert,
    colors.meadow.b * b.meadow +
      colors.frost.b * b.frost +
      colors.ice.b * b.ice +
      colors.swamp.b * b.swamp +
      colors.jungle.b * b.jungle +
      colors.steppe.b * b.steppe +
      colors.desert.b * b.desert
  );
}

// =========================================================
// PROCEDURAL TEXTURES (100% NON-AI)
// =========================================================
function createGroundDetailTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 12000; i++) {
    const v = 145 + Math.floor(Math.random() * 105);
    ctx.strokeStyle = `rgb(${v},${v},${v})`;
    ctx.lineWidth = 1;
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.35) * 4, y - 4 - Math.random() * 6);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

export function createAsciiRockTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#181e24';
  ctx.fillRect(0, 0, 256, 256);
  const glyphs = '08Q#WM@*+:-.';
  ctx.font = 'bold 11px monospace';
  for (let y = 10; y < 256; y += 11) {
    for (let x = 2; x < 256; x += 8) {
      const s = 44 + Math.floor(Math.random() * 90);
      ctx.fillStyle = `rgb(${s}, ${s + 8}, ${s + 16})`;
      ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], x, y);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createBrickTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#14191f';
  ctx.fillRect(0, 0, 256, 256);
  const rows = 10;
  const rowH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 24;
    for (let x = -24; x < 280; x += 48) {
      const s = 64 + Math.floor(Math.random() * 48);
      ctx.fillStyle = `rgb(${s}, ${s + 7}, ${s + 14})`;
      ctx.fillRect(x + offset + 2, r * rowH + 2, 44, rowH - 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createSandstoneTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5c452b';
  ctx.fillRect(0, 0, 256, 256);
  const rows = 8;
  const rowH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 28;
    for (let x = -28; x < 284; x += 56) {
      const s = 128 + Math.floor(Math.random() * 38);
      ctx.fillStyle = `rgb(${s + 18}, ${s - 6}, ${s - 42})`;
      ctx.fillRect(x + offset + 2, r * rowH + 2, 52, rowH - 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createWoodPlankTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a1d14';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 28) {
    const s = 58 + Math.floor(Math.random() * 26);
    ctx.fillStyle = `rgb(${s + 18}, ${s}, ${s - 18})`;
    ctx.fillRect(x + 2, 0, 24, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createWaterfallTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0d2233';
  ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 420; i++) {
    const bright = Math.random();
    ctx.fillStyle = bright > 0.72 ? '#e6f7ff' : bright > 0.35 ? '#79b8de' : '#265373';
    ctx.fillRect(Math.random() * 256, Math.random() * 512, 1.5 + Math.random() * 3, 18 + Math.random() * 55);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createRiverTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b2236';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 340; i++) {
    ctx.fillStyle = i % 3 === 0 ? '#a6e0ff' : '#1c5278';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 14, 14 + Math.random() * 28);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 20);
  return tex;
}

function createMoonReflectionTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 118);
  grad.addColorStop(0, 'rgba(230, 245, 255, 0.92)');
  grad.addColorStop(0.68, 'rgba(170, 205, 230, 0.65)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = 'bold 11px monospace';
  const chars = '@#MW08Q=+:-.';
  for (let y = 16; y < 240; y += 9) {
    const wave = Math.sin(y * 0.25) * 6;
    for (let x = 16; x < 240; x += 8) {
      const d = Math.hypot(x - 128, y - 128);
      if (d < 105) {
        const shade = d < 65 ? 245 : 175;
        ctx.fillStyle = `rgba(${shade}, ${shade + 5}, 255, ${0.85 - d / 135})`;
        ctx.fillText(chars[(x + y) % chars.length], x + wave, y);
      }
    }
  }
  return new THREE.CanvasTexture(c);
}

function createMistTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(215, 235, 250, 0.55)');
  g.addColorStop(0.5, 'rgba(140, 175, 205, 0.22)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// =========================================================
// BUILD FULL MULTI-BIOME WORLD, STREAM, BRIDGE, VILLAGE & MONUMENTS
// =========================================================
export function buildWorld(scene) {
  const colliders = [];
  const lightSources = [];
  const animatedFlames = [];

  const rockMat = new THREE.MeshStandardMaterial({ map: createAsciiRockTexture(), roughness: 0.92, flatShading: true });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x244f2f, roughness: 0.95, flatShading: true });
  const brickMat = new THREE.MeshStandardMaterial({ map: createBrickTexture(), roughness: 0.9 });
  const sandstoneMat = new THREE.MeshStandardMaterial({ map: createSandstoneTexture(), roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ map: createWoodPlankTexture(), roughness: 0.85 });
  const plasterMat = new THREE.MeshStandardMaterial({ color: 0x8f8a7e, roughness: 0.9 });
  const slateRoofMat = new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.85, flatShading: true });
  const warmRoofMat = new THREE.MeshStandardMaterial({ color: 0x5c3028, roughness: 0.88, flatShading: true });
  const glowWinMat = new THREE.MeshBasicMaterial({ color: 0xffc066 });
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff7722 });
  const frostRuneMat = new THREE.MeshBasicMaterial({ color: 0x88eeff });

  const envLightPool = Array.from({ length: 3 }, () => {
    const pl = new THREE.PointLight(0xff8833, 0, 24, 1.2);
    pl.position.set(0, -50, 0);
    scene.add(pl);
    return pl;
  });

  function registerLight(x, y, z, color = 0xff8833, intensity = 24, distance = 20) {
    lightSources.push({ pos: new THREE.Vector3(x, y, z), color, intensity, distance, phase: Math.random() * 10 });
  }

  // --- 1. MULTI-BIOME VERTEX-COLORED TERRAIN (190 x 190) ---
  const biomeColors = {
    meadow: new THREE.Color(0x1b3a24),
    frost: new THREE.Color(0x3a4d54),
    ice: new THREE.Color(0x9bb7c9),
    swamp: new THREE.Color(0x1b2b20),
    jungle: new THREE.Color(0x143823),
    steppe: new THREE.Color(0x52452f),
    desert: new THREE.Color(0x876a45),
    bed: new THREE.Color(0x0b1a24),
  };

  const groundGeo = new THREE.PlaneGeometry(190, 190, 116, 116);
  groundGeo.rotateX(-Math.PI / 2);
  const gPos = groundGeo.attributes.position;
  const vColors = new Float32Array(gPos.count * 3);
  const cTmp = new THREE.Color();

  for (let i = 0; i < gPos.count; i++) {
    const x = gPos.getX(i);
    const z = gPos.getZ(i);
    const y = getGroundY(x, z);
    gPos.setY(i, y);

    const b = getBiomeWeights(x, z);
    blendBiomeColor(cTmp, biomeColors, b);

    const wDist = getWaterDistance(x, z);
    if (wDist < 2.2) {
      const k = 1.0 - smoothstep(-0.6, 2.2, wDist);
      cTmp.lerp(biomeColors.bed, k * 0.85);
    }

    vColors[i * 3] = cTmp.r;
    vColors[i * 3 + 1] = cTmp.g;
    vColors[i * 3 + 2] = cTmp.b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(vColors, 3));
  groundGeo.computeVertexNormals();

  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({
      map: createGroundDetailTexture(),
      vertexColors: true,
      roughness: 0.94,
    })
  );
  ground.receiveShadow = true;
  scene.add(ground);

  // --- 2. COBBLESTONE ROADS ---
  const roadMat = new THREE.MeshStandardMaterial({ map: createBrickTexture(), color: 0x6f7b87, roughness: 0.95 });
  for (let z = -66; z <= 28; z += 3.2) {
    const rx = z < -20 ? 0 : Math.sin(z * 0.08) * 2.2;
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.4), roadMat);
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(rx, 0.04, z);
    slab.receiveShadow = true;
    scene.add(slab);
  }
  for (let x = BRIDGE_X + BRIDGE_HALF_LEN - 0.5; x <= 1.0; x += 2.6) {
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 3.2), roadMat);
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(x, 0.045, BRIDGE_Z);
    slab.receiveShadow = true;
    scene.add(slab);
  }
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(7.2, 24), roadMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.045, -40);
  plaza.receiveShadow = true;
  scene.add(plaza);

  // --- 3. CONNECTED MOONFALL POOL & FLOWING STREAM (FIXED +Y WINDING!) ---
  const riverTex = createRiverTexture();
  const waterMat = new THREE.MeshStandardMaterial({
    map: riverTex,
    color: 0x2a72a3,
    emissive: 0x0a253b,
    roughness: 0.16,
    metalness: 0.55,
    side: THREE.DoubleSide,
  });

  const streamSegs = 80;
  const streamGeo = new THREE.BufferGeometry();
  const sVerts = [];
  const sUvs = [];
  for (let i = 0; i < streamSegs; i++) {
    const z0 = -14.0 + (i / streamSegs) * 96;
    const z1 = -14.0 + ((i + 1) / streamSegs) * 96;
    const x0 = getStreamX(z0);
    const x1 = getStreamX(z1);
    const w0 = 3.7 + smoothstep(24, 65, z0) * 2.2;
    const w1 = 3.7 + smoothstep(24, 65, z1) * 2.2;
    const v0 = i / streamSegs;
    const v1 = (i + 1) / streamSegs;
    // Counter-clockwise from above so normals point straight +Y!
    sVerts.push(
      x0 - w0, 0.08, z0, x1 - w1, 0.08, z1, x1 + w1, 0.08, z1,
      x0 - w0, 0.08, z0, x1 + w1, 0.08, z1, x0 + w0, 0.08, z0
    );
    sUvs.push(0, v0, 0, v1, 1, v1, 0, v0, 1, v1, 1, v0);
  }
  streamGeo.setAttribute('position', new THREE.Float32BufferAttribute(sVerts, 3));
  streamGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sUvs, 2));
  streamGeo.computeVertexNormals();
  const streamMesh = new THREE.Mesh(streamGeo, waterMat);
  streamMesh.receiveShadow = true;
  scene.add(streamMesh);

  const basinPool = new THREE.Mesh(new THREE.CircleGeometry(9.2, 36), waterMat);
  basinPool.rotation.x = -Math.PI / 2;
  basinPool.position.set(WATERFALL_POOL.x, 0.085, WATERFALL_POOL.z);
  basinPool.receiveShadow = true;
  scene.add(basinPool);

  const moonReflection = new THREE.Mesh(
    new THREE.PlaneGeometry(6.8, 6.8),
    new THREE.MeshBasicMaterial({ map: createMoonReflectionTexture(), transparent: true, opacity: 0.92, depthWrite: false })
  );
  moonReflection.rotation.x = -Math.PI / 2;
  moonReflection.position.set(WATERFALL_POOL.x + 4.4, 0.11, WATERFALL_POOL.z + 3.6);
  scene.add(moonReflection);

  for (let z = -6; z <= 32; z += 4.5) {
    const sx = getStreamX(z);
    const side = z % 9 === 0 ? -1 : 1;
    const bankRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 0), rockMat);
    bankRock.scale.set(1.2, 0.55, 0.9);
    bankRock.position.set(sx + side * 4.0, 0.05, z);
    scene.add(bankRock);
  }

  // --- 4. ARCHED STONE & TIMBER BRIDGE SPANNING THE STREAM ---
  const bridgeGroup = new THREE.Group();
  const deckSteps = 14;
  for (let i = 0; i < deckSteps; i++) {
    const x0 = BRIDGE_X - BRIDGE_HALF_LEN + (i / deckSteps) * (BRIDGE_HALF_LEN * 2);
    const x1 = BRIDGE_X - BRIDGE_HALF_LEN + ((i + 1) / deckSteps) * (BRIDGE_HALF_LEN * 2);
    const xm = (x0 + x1) * 0.5;
    const ym = (getBridgeY(x0) + getBridgeY(x1)) * 0.5;
    const len = Math.hypot(x1 - x0, getBridgeY(x1) - getBridgeY(x0));
    const tilt = Math.atan2(getBridgeY(x1) - getBridgeY(x0), x1 - x0);

    const plank = new THREE.Mesh(new THREE.BoxGeometry(len + 0.08, 0.28, BRIDGE_HALF_W * 2), woodMat);
    plank.position.set(xm, ym - 0.12, BRIDGE_Z);
    plank.rotation.z = tilt;
    plank.castShadow = true;
    plank.receiveShadow = true;
    bridgeGroup.add(plank);

    if (i % 2 === 0) {
      [-BRIDGE_HALF_W + 0.16, BRIDGE_HALF_W - 0.16].forEach((oz) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.05, 0.32), brickMat);
        post.position.set(xm, ym + 0.45, BRIDGE_Z + oz);
        bridgeGroup.add(post);
      });
    }
  }
  [-4.6, 4.6].forEach((ox) => {
    [-BRIDGE_HALF_W + 0.2, BRIDGE_HALF_W - 0.2].forEach((oz) => {
      const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.52, 2.5, 6), brickMat);
      pier.position.set(BRIDGE_X + ox, 0.35, BRIDGE_Z + oz);
      bridgeGroup.add(pier);
    });
  });
  [-BRIDGE_HALF_LEN + 0.6, BRIDGE_HALF_LEN - 0.6].forEach((ox) => {
    const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 6), brickMat);
    lp.position.set(BRIDGE_X + ox, 1.1, BRIDGE_Z - BRIDGE_HALF_W + 0.16);
    const fl = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    fl.position.set(BRIDGE_X + ox, 2.35, BRIDGE_Z - BRIDGE_HALF_W + 0.16);
    bridgeGroup.add(lp, fl);
    animatedFlames.push({ mesh: fl, phase: Math.random() * 10 });
    registerLight(BRIDGE_X + ox, 2.5, BRIDGE_Z - BRIDGE_HALF_W + 0.16, 0xff8833, 22, 18);
  });
  scene.add(bridgeGroup);

  // --- 5. GIANT TIERED MOONFALL WATERFALL ---
  [
    { x: -31, y: 7.5, z: -24.5, sx: 6.2, sy: 8.5, sz: 4.5 },
    { x: -17, y: 7.2, z: -24.5, sx: 6.0, sy: 8.2, sz: 4.5 },
    { x: -24, y: 9.5, z: -26.5, sx: 8.5, sy: 7.5, sz: 4.2 },
    { x: -28.2, y: 3.4, z: -21.5, sx: 3.2, sy: 3.6, sz: 2.8 },
    { x: -19.8, y: 3.2, z: -21.5, sx: 3.2, sy: 3.5, sz: 2.8 },
    { x: -33.5, y: 2.6, z: -18.5, sx: 3.4, sy: 2.8, sz: 3.2 },
    { x: -15.2, y: 2.2, z: -18.2, sx: 2.8, sy: 2.4, sz: 2.6 },
    { x: -24, y: 4.2, z: -22.0, sx: 2.2, sy: 2.4, sz: 1.8 },
  ].forEach((b) => {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 1), rockMat);
    m.position.set(b.x, b.y, b.z);
    m.scale.set(b.sx, b.sy, b.sz);
    m.rotation.set(Math.random() * 0.4, Math.random() * 3, Math.random() * 0.4);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    if (b.y < 8.5) colliders.push({ x: b.x, z: b.z, r: Math.max(b.sx, b.sz) * 0.7 });
  });

  [[-28.5, 4.8, -20.5], [-19.4, 4.5, -20.4], [-31.0, 2.2, -16.8], [-16.2, 1.8, -16.5]].forEach(([mx, my, mz]) => {
    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 1), mossMat);
    bush.scale.set(1.8, 0.7, 1.2);
    bush.position.set(mx, my, mz);
    scene.add(bush);
  });

  const wfTex = createWaterfallTexture();
  const wfMat = new THREE.MeshBasicMaterial({ map: wfTex, color: 0xdff5ff, transparent: true, opacity: 0.86, side: THREE.DoubleSide });
  [
    { x: -24.0, y: 7.4, z: -22.5, w: 6.2, h: 14.5, rx: 0.16 },
    { x: -26.4, y: 4.4, z: -20.9, w: 3.1, h: 9.0, rx: 0.22 },
    { x: -21.6, y: 4.2, z: -20.9, w: 3.1, h: 8.6, rx: 0.22 },
  ].forEach((s) => {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), wfMat);
    sheet.position.set(s.x, s.y, s.z);
    sheet.rotation.x = -s.rx;
    scene.add(sheet);
  });
  registerLight(-24, 10, -16, 0x99d6ff, 40, 30);

  const wfDropCount = 320;
  const wfDropGeo = new THREE.BufferGeometry();
  const wfDropPos = new Float32Array(wfDropCount * 3);
  for (let i = 0; i < wfDropCount; i++) {
    wfDropPos[i * 3] = -24 + (Math.random() - 0.5) * 9.5;
    wfDropPos[i * 3 + 1] = Math.random() * 14.5;
    wfDropPos[i * 3 + 2] = -21.2 + Math.random() * 4.2;
  }
  wfDropGeo.setAttribute('position', new THREE.BufferAttribute(wfDropPos, 3));
  const wfDrops = new THREE.Points(wfDropGeo, new THREE.PointsMaterial({ color: 0xeef9ff, size: 0.32, transparent: true, opacity: 0.88 }));
  scene.add(wfDrops);

  const mistTex = createMistTexture();
  const wfMistClouds = [];
  for (let i = 0; i < 16; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: mistTex, color: 0xdcf0ff, transparent: true, opacity: 0.44, depthWrite: false })
    );
    const bx = -24 + (Math.random() - 0.5) * 14;
    const bz = -19.5 + Math.random() * 7.5;
    sp.position.set(bx, 1.0 + Math.random() * 2.8, bz);
    const sc = 4.5 + Math.random() * 5.0;
    sp.scale.set(sc, sc * 0.72, 1);
    scene.add(sp);
    wfMistClouds.push({ sp, bx, bz, phase: Math.random() * 10 });
  }

  // Moonfall Ancient Shrine Crystal
  const shrineGroup = new THREE.Group();
  const shrineBase = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.7, 6), brickMat);
  shrineBase.position.y = 0.35;
  const shrineCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), new THREE.MeshBasicMaterial({ color: 0x55ffee }));
  shrineCrystal.position.y = 2.1;
  shrineGroup.add(shrineBase, shrineCrystal);
  shrineGroup.position.set(SHRINE_POS.x, getGroundY(SHRINE_POS.x, SHRINE_POS.z), SHRINE_POS.z);
  scene.add(shrineGroup);

  // --- 6. CITADEL GATEHOUSE & NORTHERN KEEP ---
  [
    { w: 4.0, h: 9.0, d: 3.2, x: -5.5, y: 4.5, z: -22 },
    { w: 4.0, h: 7.8, d: 3.2, x: 5.5, y: 3.9, z: -22 },
    { w: 15.0, h: 2.2, d: 2.8, x: 0, y: 7.2, z: -22 },
    { w: 8.0, h: 4.6, d: 2.2, x: -11.5, y: 2.3, z: -22 },
    { w: 8.0, h: 4.6, d: 2.2, x: 11.5, y: 2.3, z: -22 },
  ].forEach((p) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), brickMat);
    m.position.set(p.x, p.y, p.z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  });
  colliders.push({ x: -5.5, z: -22, r: 2.3 }, { x: 5.5, z: -22, r: 2.3 }, { x: -11.5, z: -22, r: 3.6 }, { x: 11.5, z: -22, r: 3.6 });

  for (let bx = -14.5; bx <= 14.5; bx += 2.2) {
    const topY = Math.abs(bx) < 7.5 ? 9.0 : 5.0;
    const merlon = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 2.5), brickMat);
    merlon.position.set(bx, topY, -22);
    scene.add(merlon);
  }

  [
    { w: 4.4, h: 10.5, d: 3.6, x: -6.5, y: 5.25, z: -76 },
    { w: 4.4, h: 9.2, d: 3.6, x: 6.5, y: 4.6, z: -76 },
    { w: 17.0, h: 2.4, d: 3.0, x: 0, y: 8.2, z: -76 },
  ].forEach((p) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), brickMat);
    m.position.set(p.x, p.y, p.z);
    m.castShadow = true;
    scene.add(m);
  });

  [[-3.8, 12], [3.8, 12], [-3.6, -19.2], [3.6, -19.2], [-4.5, -67], [4.5, -67]].forEach(([tx, tz]) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.54, 1.35, 6), rockMat);
    base.position.y = 0.68;
    const fl = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    fl.position.y = 1.72;
    g.add(base, fl);
    g.position.set(tx, getGroundY(tx, tz), tz);
    scene.add(g);
    animatedFlames.push({ mesh: fl, phase: Math.random() * 10 });
    registerLight(tx, 2.3, tz, 0xff7722, 24, 19);
  });

  // =========================================================
  // 7. ASHENBROOK VILLAGE (WIDE OPEN PLAZA — NO OBSTRUCTIONS!)
  // =========================================================
  const villageGroup = new THREE.Group();
  scene.add(villageGroup);

  function addWindow(parent, x, y, z, ry = 0) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.9), glowWinMat);
    win.position.set(x, y, z);
    win.rotation.y = ry;
    parent.add(win);
  }

  // HOUSE 1: BLACKSMITH'S FORGE
  const forge = new THREE.Group();
  forge.position.set(-12.5, 0, -32);
  const fWalls = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.6, 5.2), brickMat);
  fWalls.position.y = 1.8;
  fWalls.castShadow = true;
  const fRoof = new THREE.Mesh(new THREE.ConeGeometry(5.1, 2.6, 4), slateRoofMat);
  fRoof.position.y = 4.9;
  fRoof.rotation.y = Math.PI / 4;
  const fChimney = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.8, 1.2), brickMat);
  fChimney.position.set(-2.2, 3.2, -1.6);
  const fCanopy = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.25, 4.2), woodMat);
  fCanopy.position.set(4.1, 3.0, 0);
  fCanopy.rotation.z = -0.22;
  const fHearth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.6), rockMat);
  fHearth.position.set(3.4, 0.55, -1.0);
  const fCoal = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.35, 1.1), emberMat);
  fCoal.position.set(3.4, 1.15, -1.0);
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.72, 0.52), new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.75, roughness: 0.4 }));
  anvil.position.set(4.3, 0.36, 0.9);
  forge.add(fWalls, fRoof, fChimney, fCanopy, fHearth, fCoal, anvil);
  addWindow(forge, 3.12, 2.0, 1.4, Math.PI / 2);
  villageGroup.add(forge);
  colliders.push({ x: -12.5, z: -32, r: 4.1 });
  registerLight(-8.8, 2.0, -32.8, 0xff6b22, 26, 20);

  // HOUSE 2: TWO-STORY TIMBER TAVERN
  const tavern = new THREE.Group();
  tavern.position.set(12.5, 0, -33);
  const tBase = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.0, 5.6), brickMat);
  tBase.position.y = 1.5;
  tBase.castShadow = true;
  const tUpper = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.8, 6.4), plasterMat);
  tUpper.position.y = 4.4;
  tUpper.castShadow = true;
  const tBeam = new THREE.Mesh(new THREE.BoxGeometry(7.35, 0.28, 6.55), woodMat);
  tBeam.position.y = 3.05;
  const tRoof = new THREE.Mesh(new THREE.ConeGeometry(6.0, 3.2, 4), warmRoofMat);
  tRoof.position.y = 7.4;
  tRoof.rotation.y = Math.PI / 4;
  const tSignPost = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.14), woodMat);
  tSignPost.position.set(-4.0, 2.8, 1.6);
  const tSign = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.75, 0.95), woodMat);
  tSign.position.set(-4.6, 2.35, 1.6);
  tavern.add(tBase, tUpper, tBeam, tRoof, tSignPost, tSign);
  addWindow(tavern, -3.62, 4.4, -1.2, -Math.PI / 2);
  addWindow(tavern, -3.62, 4.4, 1.2, -Math.PI / 2);
  addWindow(tavern, -3.22, 1.6, 0, -Math.PI / 2);
  villageGroup.add(tavern);
  colliders.push({ x: 12.5, z: -33, r: 4.3 });
  registerLight(8.5, 3.2, -33, 0xffaa44, 24, 20);

  // HOUSE 3: VILLAGE WINDMILL
  const mill = new THREE.Group();
  mill.position.set(-14.0, 0, -45);
  const mTower = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 3.0, 8.2, 10), plasterMat);
  mTower.position.y = 4.1;
  mTower.castShadow = true;
  const mBase = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.3, 2.2, 10), brickMat);
  mBase.position.y = 1.1;
  const mCap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.6, 10), slateRoofMat);
  mCap.position.y = 9.5;
  const windmillBlades = new THREE.Group();
  windmillBlades.position.set(2.35, 7.1, 0);
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xb8b2a2, roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.x = (i * Math.PI) / 2;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.4, 0.16), woodMat);
    spar.position.y = 2.2;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 3.4), sailMat);
    cloth.rotation.y = Math.PI / 2;
    cloth.position.set(0.08, 2.5, 0.45);
    arm.add(spar, cloth);
    windmillBlades.add(arm);
  }
  mill.add(mTower, mBase, mCap, windmillBlades);
  villageGroup.add(mill);
  colliders.push({ x: -14.0, z: -45, r: 3.5 });

  // HOUSE 4: HERBALIST'S MOSSY COTTAGE
  const herb = new THREE.Group();
  herb.position.set(13.0, 0, -45);
  const hBody = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 3.2, 8), rockMat);
  hBody.position.y = 1.6;
  hBody.castShadow = true;
  const hRoof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 2.9, 8), mossMat);
  hRoof.position.y = 4.55;
  const gardenBed = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.32, 2.0), new THREE.MeshStandardMaterial({ color: 0x2b2016 }));
  gardenBed.position.set(-4.3, 0.16, 0.6);
  const herbPlants = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.4, 1.5), new THREE.MeshStandardMaterial({ color: 0x2e6b3d }));
  herbPlants.position.set(-4.3, 0.4, 0.6);
  herb.add(hBody, hRoof, gardenBed, herbPlants);
  addWindow(herb, -3.22, 1.7, -0.5, -Math.PI / 2);
  villageGroup.add(herb);
  colliders.push({ x: 13.0, z: -45, r: 3.7 });

  // HOUSE 5: VILLAGE CHAPEL & BELLHOUSE
  const chapel = new THREE.Group();
  chapel.position.set(-12.0, 0, -56);
  const cNave = new THREE.Mesh(new THREE.BoxGeometry(5.8, 4.2, 4.4), brickMat);
  cNave.position.y = 2.1;
  cNave.castShadow = true;
  const cRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 3.9, 5.9, 3), slateRoofMat);
  cRoof.rotation.z = Math.PI / 2;
  cRoof.rotation.x = Math.PI / 6;
  cRoof.position.y = 5.2;
  const cTower = new THREE.Mesh(new THREE.BoxGeometry(2.0, 7.6, 2.0), brickMat);
  cTower.position.set(2.2, 3.8, 0);
  const cSpire = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.8, 4), slateRoofMat);
  cSpire.position.set(2.2, 9.0, 0);
  cSpire.rotation.y = Math.PI / 4;
  chapel.add(cNave, cRoof, cTower, cSpire);
  addWindow(chapel, 3.22, 2.4, 0, Math.PI / 2);
  villageGroup.add(chapel);
  colliders.push({ x: -12.0, z: -56, r: 3.9 });

  // HOUSE 6: WATCHMAN'S L-SHAPED COTTAGE
  const watch = new THREE.Group();
  watch.position.set(12.0, 0, -55);
  const wMain = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.4, 4.4), plasterMat);
  wMain.position.y = 1.7;
  wMain.castShadow = true;
  const wWing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.0, 3.4), brickMat);
  wWing.position.set(-1.5, 1.5, 2.8);
  const wRoof1 = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.5, 4), warmRoofMat);
  wRoof1.position.y = 4.65;
  wRoof1.rotation.y = Math.PI / 4;
  const wRoof2 = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.0, 4), slateRoofMat);
  wRoof2.position.set(-1.5, 4.0, 2.8);
  wRoof2.rotation.y = Math.PI / 4;
  watch.add(wMain, wWing, wRoof1, wRoof2);
  addWindow(watch, -2.82, 1.8, -0.6, -Math.PI / 2);
  villageGroup.add(watch);
  colliders.push({ x: 12.0, z: -55, r: 4.0 });

  // Animated Villagers (positioned neatly by the buildings, keeping the main plaza wide open)
  const villagers = [];
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd1b399, roughness: 0.85 });

  function createVillager(x, z, tunicHex, job, extra = {}) {
    const g = new THREE.Group();
    const tunicMat = new THREE.MeshStandardMaterial({ color: tunicHex, roughness: 0.85 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.22), new THREE.MeshStandardMaterial({ color: 0x2b2926 }));
    legL.position.set(-0.15, 0.34, 0);
    const legR = legL.clone();
    legR.position.x = 0.15;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 0.36), tunicMat);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skinMat);
    head.position.y = 1.66;

    const armR = new THREE.Group();
    armR.position.set(0.38, 1.32, 0);
    const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.18), tunicMat);
    armMesh.position.y = -0.26;
    armR.add(armMesh);

    if (job === 'smith') {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), woodMat);
      handle.position.set(0, -0.52, 0.22);
      handle.rotation.x = Math.PI / 2;
      const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.18), new THREE.MeshStandardMaterial({ color: 0x3b424d }));
      hammerHead.position.set(0, -0.52, 0.48);
      armR.add(handle, hammerHead);
    } else if (job === 'chopper') {
      const axeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), woodMat);
      axeHandle.position.set(0, -0.52, 0.28);
      axeHandle.rotation.x = Math.PI / 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.24), new THREE.MeshStandardMaterial({ color: 0xaab4c0 }));
      blade.position.set(0, -0.52, 0.6);
      armR.add(axeHandle, blade);
    } else if (job === 'patrol') {
      const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glowWinMat);
      lantern.position.set(0, -0.56, 0.18);
      armR.add(lantern);
    } else if (job === 'carrier') {
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 6), woodMat);
      bucket.position.set(0, -0.62, 0);
      armR.add(bucket);
    }

    g.add(legL, legR, torso, head, armR);
    g.position.set(x, 0, z);
    villageGroup.add(g);
    villagers.push({ g, legL, legR, armR, job, homeX: x, homeZ: z, phase: Math.random() * 10, ...extra });
  }

  createVillager(-7.2, -31.1, 0x5c2e26, 'smith', { facing: -Math.PI / 2 });
  createVillager(-8.9, -44.2, 0x3a5236, 'chopper', { facing: -0.6 });
  createVillager(7.8, -44.4, 0x4b5e3c, 'farmer', { facing: Math.PI / 2 });
  createVillager(7.8, -36.0, 0x3b4d63, 'carrier', { ax: 7.8, az: -35.5, bx: 7.8, bz: -42.0 });
  createVillager(-7.8, -51.5, 0x6b4f35, 'merchant', { facing: Math.PI / 2 });
  createVillager(0, -27.5, 0x2d3a4a, 'patrol', { ax: -5.5, az: -27.5, bx: 5.5, bz: -27.5 });

  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.55, 7), woodMat);
  stump.position.set(-9.6, 0.28, -44.8);
  villageGroup.add(stump);

  // =========================================================
  // 8. DESERT MONUMENT (SUNKEN SAND TEMPLE) & SNOW MONUMENT (FROST SANCTUM)
  // =========================================================
  // --- A. ANCIENT SUNKEN SAND TEMPLE (Sunscorch Barrens) ---
  const temple = new THREE.Group();
  temple.position.set(DESERT_TEMPLE_POS.x, 0.2, DESERT_TEMPLE_POS.z);

  // 4-Tier Stepped Sandstone Ziggurat
  [
    { w: 14, h: 1.5, d: 14, y: 0.75 },
    { w: 10.6, h: 1.6, d: 10.6, y: 2.3 },
    { w: 7.4, h: 1.7, d: 7.4, y: 3.95 },
    { w: 4.4, h: 2.2, d: 4.4, y: 5.9 },
  ].forEach((tier) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(tier.w, tier.h, tier.d), sandstoneMat);
    m.position.y = tier.y;
    m.castShadow = true;
    m.receiveShadow = true;
    temple.add(m);
  });

  // Grand Western Staircase leading up the Temple
  for (let s = 0; s < 7; s++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5 + s * 0.45, 3.8), sandstoneMat);
    step.position.set(-7.6 + s * 0.75, (0.5 + s * 0.45) * 0.5, 0);
    temple.add(step);
  }

  // Sun Altar Flame atop the Ziggurat
  const sunFlame = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), emberMat);
  sunFlame.position.set(0, 7.8, 0);
  temple.add(sunFlame);
  animatedFlames.push({ mesh: sunFlame, phase: 2.2 });
  registerLight(DESERT_TEMPLE_POS.x, 8.2, DESERT_TEMPLE_POS.z, 0xff8c2b, 32, 28);

  // Flanking Sandstone Obelisks & Broken Colonnade Pillars
  [
    [-11.5, -5.5, 6.2],
    [-11.5, 5.5, 6.2],
    [-16.5, -5.5, 3.6],
    [-16.5, 5.5, 4.4],
    [11.0, -7.5, 4.0],
    [10.5, 8.0, 2.8],
  ].forEach(([ox, oz, oh]) => {
    const ob = new THREE.Mesh(new THREE.BoxGeometry(1.3, oh, 1.3), sandstoneMat);
    ob.position.set(ox, oh / 2, oz);
    ob.castShadow = true;
    temple.add(ob);
    if (oh > 5) {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.4, 4), sandstoneMat);
      tip.position.set(ox, oh + 0.7, oz);
      tip.rotation.y = Math.PI / 4;
      temple.add(tip);
    }
    colliders.push({ x: DESERT_TEMPLE_POS.x + ox, z: DESERT_TEMPLE_POS.z + oz, r: 1.0 });
  });

  // Half-buried Ancient Sandstone Archway to the South of the Temple
  const archL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.8, 1.4), sandstoneMat);
  archL.position.set(-4.5, 2.4, 13.5);
  const archR = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.2, 1.4), sandstoneMat);
  archR.position.set(1.5, 2.1, 13.5);
  const archTop = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.1, 1.6), sandstoneMat);
  archTop.position.set(-1.5, 4.7, 13.5);
  archTop.rotation.z = -0.08;
  temple.add(archL, archR, archTop);

  scene.add(temple);
  colliders.push({ x: DESERT_TEMPLE_POS.x, z: DESERT_TEMPLE_POS.z, r: 7.4 });

  // --- B. SHIVERPEAK FROST SANCTUM (Runestone Circle + Ruined Snow Watchtower) ---
  const sanctum = new THREE.Group();
  sanctum.position.set(SNOW_MONUMENT_POS.x, 0.2, SNOW_MONUMENT_POS.z);

  const frostStoneMat = new THREE.MeshStandardMaterial({ color: 0x5c6e7d, roughness: 0.88, flatShading: true });
  const snowCapMat = new THREE.MeshStandardMaterial({ color: 0xd9ebf7, roughness: 0.78 });

  // Circular Frost-Rimed Stone Dais
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 7.6, 0.65, 12), frostStoneMat);
  dais.position.y = 0.32;
  dais.receiveShadow = true;
  sanctum.add(dais);

  // Central Frozen Hearth & Floating Ice Shard
  const altar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 1.2, 6), frostStoneMat);
  altar.position.y = 1.1;
  const iceShard = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), frostRuneMat);
  iceShard.position.y = 2.9;
  sanctum.add(altar, iceShard);
  animatedFlames.push({ mesh: iceShard, phase: 5.5 });
  registerLight(SNOW_MONUMENT_POS.x, 3.6, SNOW_MONUMENT_POS.z, 0x77ddff, 30, 26);

  // 7 Towering Nordic Runestone Monoliths arranged around the Dais
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2;
    const rx = Math.cos(ang) * 8.2;
    const rz = Math.sin(ang) * 8.2;
    const h = 4.2 + (i % 3) * 1.4;
    const mono = new THREE.Group();
    mono.position.set(rx, 0, rz);
    mono.rotation.y = -ang;
    mono.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.08;

    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.3, h, 0.75), frostStoneMat);
    slab.position.y = h / 2;
    slab.castShadow = true;
    const runeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.18, h * 0.55, 0.8), frostRuneMat);
    runeStrip.position.y = h * 0.52;
    const snowTop = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.32, 0.8), snowCapMat);
    snowTop.position.y = h + 0.1;
    mono.add(slab, runeStrip, snowTop);
    sanctum.add(mono);
    colliders.push({ x: SNOW_MONUMENT_POS.x + rx, z: SNOW_MONUMENT_POS.z + rz, r: 1.0 });
  }

  // Ruined Frost Watchtower nearby (NW edge of the sanctum)
  const fTower = new THREE.Group();
  fTower.position.set(-13.5, 0, -10.0);
  const ftBase = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.3, 6.2, 8), brickMat);
  ftBase.position.y = 3.1;
  ftBase.castShadow = true;
  const ftSnow = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.45, 8), snowCapMat);
  ftSnow.position.y = 6.25;
  const brokenWall = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.4, 1.1), brickMat);
  brokenWall.position.set(4.5, 1.2, 1.5);
  brokenWall.rotation.y = 0.25;
  fTower.add(ftBase, ftSnow, brokenWall);
  sanctum.add(fTower);
  colliders.push({ x: SNOW_MONUMENT_POS.x - 13.5, z: SNOW_MONUMENT_POS.z - 10.0, r: 3.4 });

  scene.add(sanctum);
  colliders.push({ x: SNOW_MONUMENT_POS.x, z: SNOW_MONUMENT_POS.z, r: 1.9 });

  // =========================================================
  // 9. BIOME-SPECIFIC TREES, CACTI & ROCKS (DE-CLUTTERED SNOW!)
  // =========================================================
  const trunkDark = new THREE.MeshStandardMaterial({ color: 0x291d14, roughness: 0.95 });
  const pineMats = [0x11291a, 0x163621, 0x1d452a].map((h) => new THREE.MeshStandardMaterial({ color: h, roughness: 0.9, flatShading: true }));
  const snowPineMats = [0x2a444d, 0x6b8b9c, 0xc7dce8].map((h) => new THREE.MeshStandardMaterial({ color: h, roughness: 0.85, flatShading: true }));
  const jungleLeafMat = new THREE.MeshStandardMaterial({ color: 0x164a2b, roughness: 0.85, flatShading: true });
  const swampWoodMat = new THREE.MeshStandardMaterial({ color: 0x302b24, roughness: 0.95 });
  const swampGlowMat = new THREE.MeshBasicMaterial({ color: 0x44ffbb });
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x355c37, roughness: 0.88 });
  const desertRockMat = new THREE.MeshStandardMaterial({ color: 0x7a593a, roughness: 0.92, flatShading: true });
  const iceRockMat = new THREE.MeshStandardMaterial({ color: 0x9fc2d9, roughness: 0.45, metalness: 0.15, flatShading: true });

  function makePine(scale, frosty) {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.34, 2.4, 6), trunkDark);
    tr.position.y = 1.2;
    t.add(tr);
    const mats = frosty ? snowPineMats : pineMats;
    for (let i = 0; i < 4; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.45 - i * 0.26, 2.3 - i * 0.15, 7), mats[i % mats.length]);
      cone.position.y = 2.3 + i * 1.35;
      cone.castShadow = i === 0;
      t.add(cone);
    }
    t.scale.set(scale * 0.9, scale * 1.22, scale * 0.9);
    return t;
  }

  function makeJungleTree(scale) {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 4.8, 6), trunkDark);
    tr.position.y = 2.4;
    tr.rotation.z = (Math.random() - 0.5) * 0.18;
    t.add(tr);
    for (let i = 0; i < 3; i++) {
      const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8 - i * 0.3, 1), jungleLeafMat);
      cap.scale.set(1.35, 0.55, 1.35);
      cap.position.set((Math.random() - 0.5) * 0.9, 4.8 + i * 0.95, (Math.random() - 0.5) * 0.9);
      t.add(cap);
    }
    t.scale.setScalar(scale);
    return t;
  }

  function makeSwampTree(scale) {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.55, 4.0, 6), swampWoodMat);
    tr.position.y = 2.0;
    tr.rotation.z = (Math.random() - 0.5) * 0.25;
    t.add(tr);
    const br1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 2.2, 5), swampWoodMat);
    br1.position.set(0.7, 3.3, 0.2);
    br1.rotation.z = -0.9;
    const br2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 2.0, 5), swampWoodMat);
    br2.position.set(-0.65, 2.9, -0.3);
    br2.rotation.z = 0.85;
    const shroom = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.22, 6), swampGlowMat);
    shroom.position.set(0.55, 0.22, 0.45);
    t.add(br1, br2, shroom);
    t.scale.setScalar(scale);
    return t;
  }

  function makeCactus(scale) {
    const c = new THREE.Group();
    const main = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 2.8, 6), cactusMat);
    main.position.y = 1.4;
    const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.1, 6), cactusMat);
    arm1.position.set(0.45, 1.65, 0);
    arm1.rotation.z = -0.45;
    const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.95, 6), cactusMat);
    arm2.position.set(-0.42, 1.25, 0);
    arm2.rotation.z = 0.45;
    c.add(main, arm1, arm2);
    c.scale.setScalar(scale);
    return c;
  }

  const placedSnowProps = [];
  for (let i = 0; i < 135; i++) {
    const px = (Math.random() - 0.5) * 168;
    const pz = (Math.random() - 0.5) * 164;

    if (getWaterDistance(px, pz) < 3.4) continue;
    if (Math.abs(px) < 19 && pz < -18 && pz > -78) continue;
    if (Math.abs(px) < 7.5 && pz > -24 && pz < 30) continue;
    if (Math.abs(pz - BRIDGE_Z) < 6 && px < 2 && px > BRIDGE_X - 11) continue;
    if (Math.hypot(px - WATERFALL_POOL.x, pz - WATERFALL_POOL.z) < 15.5) continue;
    if (Math.hypot(px - SHRINE_POS.x, pz - SHRINE_POS.z) < 6.5) continue;
    if (Math.hypot(px - DESERT_TEMPLE_POS.x, pz - DESERT_TEMPLE_POS.z) < 20) continue;
    if (Math.hypot(px - SNOW_MONUMENT_POS.x, pz - SNOW_MONUMENT_POS.z) < 18) continue;

    const b = getBiomeWeights(px, pz);
    const py = getGroundY(px, pz);
    let obj = null;
    let colR = 1.0;

    if (b.desert > 0.45) {
      if (Math.random() < 0.55) {
        obj = makeCactus(0.85 + Math.random() * 0.65);
        colR = 0.6;
      } else {
        const sc = 1.2 + Math.random() * 1.8;
        obj = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 0), desertRockMat);
        obj.scale.set(sc * 1.4, sc * 0.95, sc);
        obj.position.y = sc * 0.4;
        colR = sc * 1.1;
      }
    } else if (b.steppe > 0.45) {
      const sc = 0.9 + Math.random() * 1.1;
      obj = Math.random() < 0.45 ? makeSwampTree(0.75) : new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), desertRockMat);
      if (obj.isMesh) { obj.scale.set(sc * 1.2, sc * 0.6, sc); obj.position.y = sc * 0.3; }
      colR = 0.9;
    } else if (b.ice > 0.4 || b.frost > 0.45) {
      // Keep the snowy highlands airy & uncluttered (minimum 11-unit spacing)
      if (placedSnowProps.length > 16 || placedSnowProps.some((p) => Math.hypot(p.x - px, p.z - pz) < 11.5)) continue;
      placedSnowProps.push({ x: px, z: pz });
      if (Math.random() < 0.58) {
        obj = makePine(0.9 + Math.random() * 0.5, true);
      } else {
        const sc = 1.0 + Math.random() * 1.2;
        obj = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 0), iceRockMat);
        obj.scale.set(sc, sc * 1.4, sc);
        obj.position.y = sc * 0.6;
      }
    } else if (b.swamp > 0.45) {
      obj = makeSwampTree(0.9 + Math.random() * 0.6);
    } else if (b.jungle > 0.45) {
      obj = makeJungleTree(0.95 + Math.random() * 0.6);
      colR = 1.2;
    } else {
      if (Math.random() < 0.78) {
        obj = makePine(0.95 + Math.random() * 0.65, false);
      } else {
        const sc = 0.8 + Math.random() * 1.1;
        obj = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 1), rockMat);
        obj.scale.set(sc * 1.2, sc * 0.65, sc);
        obj.position.y = sc * 0.35;
        colR = sc * 0.85;
      }
    }

    if (obj) {
      obj.position.x = px;
      obj.position.z = pz;
      obj.position.y += py;
      obj.rotation.y = Math.random() * Math.PI * 2;
      scene.add(obj);
      colliders.push({ x: px, z: pz, r: colR });
    }
  }

  // --- 10. 7,000 BIOME-TINTED GPU WIND-PHYSICS GRASS BLADES ---
  const grassUniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.85, 0.52).normalize() },
    uWindStr: { value: 1.0 },
    uPlayerPos: { value: new THREE.Vector3(0, 0, 12) },
  };

  const grassCount = 7000;
  const bladeGeo = new THREE.ConeGeometry(0.07, 0.74, 3);
  bladeGeo.translate(0, 0.37, 0);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  bladeMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassUniforms.uTime;
    shader.uniforms.uWindDir = grassUniforms.uWindDir;
    shader.uniforms.uWindStr = grassUniforms.uWindStr;
    shader.uniforms.uPlayerPos = grassUniforms.uPlayerPos;

    shader.vertexShader =
      `
      uniform float uTime;
      uniform vec2 uWindDir;
      uniform float uWindStr;
      uniform vec3 uPlayerPos;
      ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      float tipW = clamp(transformed.y / 0.74, 0.0, 1.0);
      tipW = tipW * tipW;
      float wave = sin(dot(mvPosition.xz, uWindDir) * 0.24 - uTime * 3.1) * 0.5 + 0.5;
      float gust = 0.65 + 0.35 * sin(dot(mvPosition.xz, uWindDir) * 0.08 - uTime * 1.15);
      vec2 windBend = uWindDir * (0.14 + wave * 0.44 * gust) * uWindStr * tipW;
      vec2 away = mvPosition.xz - uPlayerPos.xz;
      float pDist = length(away);
      float push = smoothstep(2.6, 0.25, pDist) * tipW * 0.75;
      vec2 pushVec = (pDist > 0.001 ? normalize(away) : vec2(1.0, 0.0)) * push;

      mvPosition.xz += windBend + pushVec;
      mvPosition.y -= (length(windBend) + push) * 0.26;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
      `
    );
  };

  const grassMesh = new THREE.InstancedMesh(bladeGeo, bladeMat, grassCount);
  grassMesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const gCol = new THREE.Color();

  for (let i = 0; i < grassCount; i++) {
    let gx = (Math.random() - 0.5) * 166;
    let gz = (Math.random() - 0.5) * 162;
    let b = getBiomeWeights(gx, gz);
    const invalid =
      b.desert > 0.55 ||
      b.ice > 0.5 ||
      getWaterDistance(gx, gz) < 1.2 ||
      isOnBridge(gx, gz) ||
      (Math.abs(gx) < 2.8 && gz > -68 && gz < 30) ||
      Math.hypot(gx, gz + 40) < 7.8;

    if (invalid) {
      gx = (Math.random() - 0.5) * 85;
      gz = -10 + Math.random() * 58;
      if (getWaterDistance(gx, gz) < 1.2 || Math.abs(gx) < 2.8) gx += 12;
      b = getBiomeWeights(gx, gz);
    }

    const s = (0.65 + Math.random() * 1.05) * (b.jungle > 0.4 ? 1.35 : 1.0);
    dummy.position.set(gx, getGroundY(gx, gz), gz);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(i, dummy.matrix);

    if (b.steppe > 0.4) gCol.setHex(0x6e5c39);
    else if (b.frost > 0.35) gCol.setHex(0x4b6a70);
    else if (b.swamp > 0.4) gCol.setHex(0x283d29);
    else if (b.jungle > 0.4) gCol.setHex(0x165930);
    else gCol.setHex(Math.random() > 0.5 ? 0x225732 : 0x194226);

    grassMesh.setColorAt(i, gCol);
  }
  grassMesh.instanceMatrix.needsUpdate = true;
  grassMesh.instanceColor.needsUpdate = true;
  scene.add(grassMesh);

  // --- 11. BIOME-AWARE WEATHER PARTICLES ---
  const weatherCount = 340;
  const weatherGeo = new THREE.BufferGeometry();
  const weatherPos = new Float32Array(weatherCount * 3);
  for (let i = 0; i < weatherCount; i++) {
    weatherPos[i * 3] = (Math.random() - 0.5) * 64;
    weatherPos[i * 3 + 1] = Math.random() * 20;
    weatherPos[i * 3 + 2] = (Math.random() - 0.5) * 64;
  }
  weatherGeo.setAttribute('position', new THREE.BufferAttribute(weatherPos, 3));
  const weatherMat = new THREE.PointsMaterial({ color: 0xbce2ff, size: 0.21, transparent: true, opacity: 0.85 });
  const weatherPoints = new THREE.Points(weatherGeo, weatherMat);
  scene.add(weatherPoints);

  // --- 12. ZERO-LAG WILDLIFE ---
  const deerCoat = new THREE.MeshStandardMaterial({ color: 0x7d5a42, roughness: 0.85 });
  const antlerMat = new THREE.MeshStandardMaterial({ color: 0xd9cdb8, roughness: 0.7 });
  const deerList = [[16, 12], [22, 6], [-11, 20], [-36, 10], [18, -12], [12, 34]].map(([dx, dz]) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.52, 1.25), deerCoat);
    body.position.y = 1.05;
    const neckPivot = new THREE.Group();
    neckPivot.position.set(0, 1.18, 0.55);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.26), deerCoat);
    neck.position.set(0, 0.32, 0.14);
    neck.rotation.x = 0.35;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.48), deerCoat);
    head.position.set(0, 0.62, 0.36);
    const antL = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.45, 4), antlerMat);
    antL.position.set(-0.14, 0.88, 0.24);
    antL.rotation.z = 0.45;
    const antR = antL.clone();
    antR.position.x = 0.14;
    antR.rotation.z = -0.45;
    neckPivot.add(neck, head, antL, antR);
    g.add(body, neckPivot);
    const legs = [[-0.18, 0.42], [0.18, 0.42], [-0.18, -0.45], [0.18, -0.45]].map(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), deerCoat);
      leg.position.set(lx, 0.45, lz);
      g.add(leg);
      return leg;
    });
    g.position.set(dx, getGroundY(dx, dz), dz);
    scene.add(g);
    return { g, neckPivot, legs, yaw: Math.random() * 6, speed: 0, phase: Math.random() * 10 };
  });

  const rabbitMat = new THREE.MeshStandardMaterial({ color: 0xc2b9ae, roughness: 0.9 });
  const rabbitList = [[8, 16], [14, 2], [-8, 17], [-28, 13], [16, -4]].map(([rx, rz]) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), rabbitMat);
    body.scale.set(0.9, 0.85, 1.25);
    body.position.y = 0.22;
    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), rabbitMat);
    earL.position.set(-0.08, 0.44, 0.16);
    const earR = earL.clone();
    earR.position.x = 0.08;
    g.add(body, earL, earR);
    g.position.set(rx, getGroundY(rx, rz), rz);
    scene.add(g);
    return { g, yaw: Math.random() * 6, hopTimer: Math.random() * 2.5, hopPhase: 0 };
  });

  const birdMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, side: THREE.DoubleSide });
  const wingGeo = new THREE.PlaneGeometry(0.65, 0.22);
  wingGeo.translate(0.32, 0, 0);
  const birds = Array.from({ length: 12 }, (_, i) => {
    const b = new THREE.Group();
    const wL = new THREE.Mesh(wingGeo, birdMat);
    wL.rotation.x = -Math.PI / 2;
    const wR = new THREE.Mesh(wingGeo, birdMat);
    wR.rotation.x = -Math.PI / 2;
    wR.scale.x = -1;
    b.add(wL, wR);
    scene.add(b);
    return {
      g: b, wL, wR,
      cx: -20 + (i % 4) * 20,
      cz: -30 + (i % 3) * 26,
      radius: 12 + Math.random() * 14,
      height: 12 + Math.random() * 7,
      speed: 0.26 + Math.random() * 0.2,
      angle: Math.random() * Math.PI * 2,
      phase: Math.random() * 10,
    };
  });

  const koiGeo = new THREE.ConeGeometry(0.14, 0.58, 4);
  koiGeo.rotateX(Math.PI / 2);
  const koiList = Array.from({ length: 6 }, (_, i) => {
    const k = new THREE.Mesh(koiGeo, new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xff8c42 : 0xffe4b5 }));
    scene.add(k);
    return { mesh: k, r: 2.6 + Math.random() * 4.8, angle: Math.random() * Math.PI * 2, speed: (i % 2 === 0 ? 1 : -1) * (0.35 + Math.random() * 0.25) };
  });

  // =========================================================
  // HIGH-RES CARTOGRAPHIC MAP PRE-RENDERER (RUNS ONCE AT STARTUP)
  // =========================================================
  const mapBiomeColors = {
    meadow: new THREE.Color(0x284d32),
    frost: new THREE.Color(0x526b75),
    ice: new THREE.Color(0xb4cfde),
    swamp: new THREE.Color(0x263d2d),
    jungle: new THREE.Color(0x1c5433),
    steppe: new THREE.Color(0x705d3f),
    desert: new THREE.Color(0xb38c59),
  };

  function drawStaticMinimap(ctx, size) {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const c = new THREE.Color();

    for (let py = 0; py < size; py++) {
      const z = (py / size) * 180 - 90;
      for (let px = 0; px < size; px++) {
        const x = (px / size) * 180 - 90;
        const idx = (py * size + px) * 4;

        const wDist = getWaterDistance(x, z);
        if (isOnBridge(x, z)) {
          c.setHex(0xd9b077);
        } else if (wDist < 0) {
          c.setHex(wDist > -0.9 ? 0x5ab2de : 0x266a96);
        } else if (Math.abs(x) < 2.6 && z > -68 && z < 28) {
          c.setHex(0x8e99a3);
        } else if (Math.abs(z - BRIDGE_Z) < 1.8 && x > BRIDGE_X + 6 && x < 2) {
          c.setHex(0x8e99a3);
        } else if (Math.hypot(x, z + 40) < 7.2) {
          c.setHex(0x7d8891);
        } else {
          blendBiomeColor(c, mapBiomeColors, getBiomeWeights(x, z));
          // Subtle topographic elevation contours
          const h = getGroundY(x, z);
          if (h > 0.3 && Math.abs((h % 0.8) - 0.4) < 0.05) c.multiplyScalar(1.16);
        }

        data[idx] = Math.min(255, Math.floor(c.r * 255));
        data[idx + 1] = Math.min(255, Math.floor(c.g * 255));
        data[idx + 2] = Math.min(255, Math.floor(c.b * 255));
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const toMap = (wx, wz) => [((wx + 90) / 180) * size, ((wz + 90) / 180) * size];

    // Subtle cartography grid
    ctx.strokeStyle = 'rgba(200, 225, 240, 0.09)';
    ctx.lineWidth = 1;
    for (let g = 1; g < 6; g++) {
      const p = (g / 6) * size;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }

    // Village Roofs
    ctx.fillStyle = '#e8c78e';
    [[-12.5, -32], [12.5, -33], [-14.0, -45], [13.0, -45], [-12.0, -56], [12.0, -55]].forEach(([hx, hz]) => {
      const [mx, my] = toMap(hx, hz);
      ctx.fillRect(mx - 3, my - 3, 6, 6);
    });

    // Citadel Gate
    const [gx, gy] = toMap(0, -22);
    ctx.fillStyle = '#e2ecf5';
    ctx.fillRect(gx - 12, gy - 2, 24, 4);

    // Desert Sand Temple Pyramid icon
    const [tx, ty] = toMap(DESERT_TEMPLE_POS.x, DESERT_TEMPLE_POS.z);
    ctx.fillStyle = '#ffbe66';
    ctx.fillRect(tx - 6, ty - 6, 12, 12);
    ctx.fillStyle = '#8c5d2b';
    ctx.fillRect(tx - 3, ty - 3, 6, 6);

    // Snow Sanctum Runestone Ring icon
    const [sx, sy] = toMap(SNOW_MONUMENT_POS.x, SNOW_MONUMENT_POS.z);
    ctx.strokeStyle = '#99f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Waterfall Splash icon
    const [wx, wy] = toMap(WATERFALL_POOL.x, WATERFALL_POOL.z - 5);
    ctx.fillStyle = '#c8f5ff';
    ctx.fillRect(wx - 5, wy - 2.5, 10, 5);

    // Crisp Landmark Labels (drawn cleanly onto the high-res 360px map)
    ctx.font = `bold ${Math.max(9, Math.floor(size / 34))}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    const labels = [
      ['VILLAGE', 0, -42, '#ffe4ad'],
      ['KEEP', 0, -76, '#ff9878'],
      ['FALLS', -24, -27, '#bdf2ff'],
      ['SAND TEMPLE', DESERT_TEMPLE_POS.x, DESERT_TEMPLE_POS.z - 12, '#ffd48a'],
      ['FROST SANCTUM', SNOW_MONUMENT_POS.x, SNOW_MONUMENT_POS.z - 13, '#d4f6ff'],
      ['SWAMP', -38, 52, '#8bc49c'],
      ['JUNGLE', 0, 54, '#6cd48c'],
    ];
    labels.forEach(([txt, lx, lz, col]) => {
      const [mx, my] = toMap(lx, lz);
      ctx.fillStyle = 'rgba(4, 8, 12, 0.78)';
      ctx.fillText(txt, mx + 1, my + 1);
      ctx.fillStyle = col;
      ctx.fillText(txt, mx, my);
    });
  }

  // =========================================================
  // PER-FRAME WORLD UPDATE
  // =========================================================
  let lightSortTimer = 0;

  function updateWorld(dt, t, playerPos, windX, windZ, isPlaying) {
    grassUniforms.uTime.value = t;
    grassUniforms.uWindDir.value.set(windX, windZ);
    grassUniforms.uWindStr.value = 0.85 + Math.sin(t * 0.6) * 0.28;
    grassUniforms.uPlayerPos.value.copy(playerPos);

    wfTex.offset.y += dt * 1.45;
    riverTex.offset.y -= dt * 0.62;
    moonReflection.scale.set(1 + Math.sin(t * 2.4) * 0.04, 1 + Math.cos(t * 2.0) * 0.04, 1);
    shrineCrystal.rotation.y = t * 1.6;
    shrineCrystal.position.y = 2.05 + Math.sin(t * 2.4) * 0.18;
    windmillBlades.rotation.x += dt * 0.72;

    const wfp = wfDrops.geometry.attributes.position.array;
    for (let i = 0; i < wfDropCount; i++) {
      wfp[i * 3 + 1] -= (12 + (i % 5) * 1.4) * dt;
      if (wfp[i * 3 + 1] < 0.15) {
        wfp[i * 3] = -24 + (Math.random() - 0.5) * 9.5;
        wfp[i * 3 + 1] = 14.5;
        wfp[i * 3 + 2] = -21.2 + Math.random() * 4.2;
      }
    }
    wfDrops.geometry.attributes.position.needsUpdate = true;

    wfMistClouds.forEach((m) => {
      m.sp.position.x = m.bx + Math.sin(t * 0.7 + m.phase) * 1.8;
      m.sp.position.y = 1.1 + Math.abs(Math.sin(t * 0.9 + m.phase)) * 2.2;
      m.sp.material.opacity = 0.28 + Math.sin(t * 1.2 + m.phase) * 0.14;
    });

    animatedFlames.forEach((f) => {
      f.mesh.rotation.y = t * 3.2 + f.phase;
      f.mesh.scale.y = 0.88 + Math.sin(t * 14 + f.phase) * 0.2;
    });

    lightSortTimer -= dt;
    if (lightSortTimer <= 0) {
      lightSortTimer = 0.15;
      lightSources.sort((a, b) => a.pos.distanceToSquared(playerPos) - b.pos.distanceToSquared(playerPos));
      for (let i = 0; i < envLightPool.length; i++) {
        const src = lightSources[i];
        envLightPool[i].position.copy(src.pos);
        envLightPool[i].color.setHex(src.color);
        envLightPool[i].distance = src.distance;
        envLightPool[i].intensity = src.intensity + Math.sin(t * 14 + src.phase) * 3.5;
      }
    }

    const curB = getBiomeWeights(playerPos.x, playerPos.z);
    const isSnow = curB.ice + curB.frost > 0.45;
    const isDust = curB.desert + curB.steppe > 0.5;
    const fallSpeed = isSnow ? 3.8 : isDust ? 1.2 : 20.5;
    weatherMat.color.setHex(isSnow ? 0xeaf6ff : isDust ? 0xd9b37c : 0xbce2ff);
    weatherMat.size = isSnow ? 0.28 : isDust ? 0.22 : 0.2;

    const wp = weatherPoints.geometry.attributes.position.array;
    for (let i = 0; i < weatherCount; i++) {
      wp[i * 3] += windX * (isDust ? 5.5 : isSnow ? 1.8 : 0.6) * dt;
      wp[i * 3 + 1] -= fallSpeed * dt;
      wp[i * 3 + 2] += windZ * (isDust ? 5.5 : isSnow ? 1.8 : 0.6) * dt;
      if (wp[i * 3 + 1] < 0 || Math.abs(wp[i * 3] - playerPos.x) > 36 || Math.abs(wp[i * 3 + 2] - playerPos.z) > 36) {
        wp[i * 3] = playerPos.x + (Math.random() - 0.5) * 60;
        wp[i * 3 + 1] = 16 + Math.random() * 6;
        wp[i * 3 + 2] = playerPos.z + (Math.random() - 0.5) * 60;
      }
    }
    weatherPoints.geometry.attributes.position.needsUpdate = true;

    if (playerPos.distanceTo(VILLAGE_CENTER) < 46) {
      villagers.forEach((v) => {
        if (v.job === 'smith' || v.job === 'chopper') {
          v.g.rotation.y = v.facing;
          const swing = Math.sin(t * (v.job === 'smith' ? 5.2 : 3.2) + v.phase);
          v.armR.rotation.x = -1.1 + Math.max(0, swing) * 1.4;
        } else if (v.job === 'farmer') {
          v.g.rotation.y = v.facing;
          v.g.rotation.x = 0.22 + Math.sin(t * 2.2 + v.phase) * 0.14;
          v.armR.rotation.x = -0.6 + Math.sin(t * 4.4 + v.phase) * 0.35;
        } else if (v.job === 'merchant') {
          v.g.rotation.y = v.facing + Math.sin(t * 0.9 + v.phase) * 0.35;
          v.armR.rotation.x = Math.sin(t * 2.4 + v.phase) * 0.25;
        } else if (v.job === 'carrier' || v.job === 'patrol') {
          const cycle = (Math.sin(t * (v.job === 'patrol' ? 0.38 : 0.45) + v.phase) + 1) * 0.5;
          const nx = THREE.MathUtils.lerp(v.ax, v.bx, cycle);
          const nz = THREE.MathUtils.lerp(v.az, v.bz, cycle);
          const dx = nx - v.g.position.x;
          const dz = nz - v.g.position.z;
          if (Math.hypot(dx, dz) > 0.001) v.g.rotation.y = Math.atan2(dx, dz);
          v.g.position.set(nx, 0, nz);
          v.legL.rotation.x = Math.sin(t * 7.5 + v.phase) * 0.45;
          v.legR.rotation.x = -Math.sin(t * 7.5 + v.phase) * 0.45;
        }
      });
    }

    birds.forEach((b) => {
      b.angle += b.speed * dt;
      b.g.position.set(b.cx + Math.cos(b.angle) * b.radius, b.height + Math.sin(t * 1.4 + b.phase) * 1.1, b.cz + Math.sin(b.angle) * b.radius);
      b.g.rotation.y = -b.angle;
      const flap = Math.sin(t * 7.5 + b.phase) * 0.55;
      b.wL.rotation.z = flap;
      b.wR.rotation.z = -flap;
    });

    koiList.forEach((k) => {
      k.angle += k.speed * dt;
      k.mesh.position.set(WATERFALL_POOL.x + Math.cos(k.angle) * k.r, 0.1, WATERFALL_POOL.z + Math.sin(k.angle) * k.r);
      k.mesh.rotation.y = -k.angle + (k.speed > 0 ? 0 : Math.PI);
    });

    deerList.forEach((d) => {
      const dist = d.g.position.distanceTo(playerPos);
      if (dist > 45) return;
      if (dist < 8.5 && isPlaying) {
        const awayYaw = Math.atan2(d.g.position.x - playerPos.x, d.g.position.z - playerPos.z);
        let diff = awayYaw - d.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        d.yaw += THREE.MathUtils.clamp(diff, -3.5 * dt, 3.5 * dt);
        d.speed = THREE.MathUtils.lerp(d.speed, 5.2, 1 - Math.exp(-4 * dt));
      } else {
        d.speed = THREE.MathUtils.lerp(d.speed, 0, 1 - Math.exp(-3 * dt));
      }
      if (d.speed > 0.2) {
        const nx = THREE.MathUtils.clamp(d.g.position.x + Math.sin(d.yaw) * d.speed * dt, -82, 82);
        const nz = THREE.MathUtils.clamp(d.g.position.z + Math.cos(d.yaw) * d.speed * dt, -82, 82);
        if (!isInWater(nx, nz)) d.g.position.set(nx, getGroundY(nx, nz), nz);
        d.g.rotation.y = d.yaw;
        d.neckPivot.rotation.x = THREE.MathUtils.lerp(d.neckPivot.rotation.x, 0, 0.1);
        d.legs.forEach((l, idx) => { l.rotation.x = Math.sin(t * 11 + idx * 1.6) * 0.45; });
      } else {
        d.neckPivot.rotation.x = THREE.MathUtils.lerp(d.neckPivot.rotation.x, Math.max(0, Math.sin(t * 0.45 + d.phase)) * 0.95, 0.05);
        d.legs.forEach((l) => { l.rotation.x *= 0.85; });
      }
    });

    rabbitList.forEach((rb) => {
      const dist = rb.g.position.distanceTo(playerPos);
      if (dist > 38) return;
      rb.hopTimer -= dt;
      if (rb.hopTimer <= 0) {
        rb.hopTimer = 1.6 + Math.random() * 2.0;
        rb.hopPhase = 1.0;
        rb.yaw = dist < 7 ? Math.atan2(rb.g.position.x - playerPos.x, rb.g.position.z - playerPos.z) : rb.yaw + (Math.random() - 0.5) * 2.0;
        rb.g.rotation.y = rb.yaw;
      }
      if (rb.hopPhase > 0) {
        rb.hopPhase = Math.max(0, rb.hopPhase - dt * 2.4);
        const nx = THREE.MathUtils.clamp(rb.g.position.x + Math.sin(rb.yaw) * 2.8 * dt, -80, 80);
        const nz = THREE.MathUtils.clamp(rb.g.position.z + Math.cos(rb.yaw) * 2.8 * dt, -80, 80);
        if (!isInWater(nx, nz)) { rb.g.position.x = nx; rb.g.position.z = nz; }
        rb.g.position.y = getGroundY(rb.g.position.x, rb.g.position.z) + Math.sin(rb.hopPhase * Math.PI) * 0.48;
      }
    });
  }

  return { colliders, shrineGroup, shrineCrystal, drawStaticMinimap, updateWorld };
}