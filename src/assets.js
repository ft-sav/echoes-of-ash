import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { loadModel } from './modelLoader.js';

function createForestFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#122118';
  ctx.fillRect(0, 0, 512, 512);

  // Fine organic dark grass strokes (reads like lush mossy ASCII)
  const tones = ['#183020', '#21422a', '#0e1b13', '#295033', '#15291c'];
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = tones[Math.floor(Math.random() * tones.length)];
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillRect(x, y, 1.5, 4 + Math.random() * 5);
  }

  // Worn cobblestone trail
  for (let y = 0; y < 512; y += 13) {
    const cx = 256 + Math.sin(y * 0.025) * 24;
    for (let j = -2; j <= 2; j++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#3a434d' : '#2b323a';
      ctx.fillRect(cx + j * 13 + (Math.random() - 0.5) * 4, y, 10, 8);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function createStoneBrickTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#1c2228'; // Dark mortar gaps
  ctx.fillRect(0, 0, 256, 256);

  const rows = 10;
  const rowH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 24;
    for (let x = -24; x < 280; x += 48) {
      const shade = 75 + Math.floor(Math.random() * 48);
      ctx.fillStyle = `rgb(${shade}, ${shade + 6}, ${shade + 14})`;
      ctx.fillRect(x + offset + 2, r * rowH + 2, 44, rowH - 4);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createWaterOverlayTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#081826';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = i % 4 === 0 ? '#5c9ec4' : '#183f5c';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 12 + Math.random() * 26, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createFogTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(170, 200, 225, 0.38)');
  grad.addColorStop(0.55, 'rgba(120, 155, 185, 0.14)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Tall slender dark-fantasy cypress/spruce trees (like the reel's custom tree grid)
function createDarkTree(scale = 1) {
  const tree = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x332419, roughness: 0.95 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 2.2, 6), trunkMat);
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  tree.add(trunk);

  const leafShades = [0x142e1d, 0x1b3d26, 0x224d30, 0x2a5c3a];
  for (let i = 0; i < 5; i++) {
    const r = 1.35 - i * 0.22;
    const h = 2.0 - i * 0.12;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(r, h, 7),
      new THREE.MeshStandardMaterial({
        color: leafShades[i % leafShades.length],
        roughness: 0.9,
        flatShading: true,
      })
    );
    cone.position.y = 2.1 + i * 1.15;
    cone.rotation.y = i * 0.9 + Math.random();
    cone.castShadow = true;
    cone.receiveShadow = true;
    tree.add(cone);
  }

  tree.scale.set(scale * 0.9, scale * 1.15, scale * 0.9);
  return tree;
}

function createMossyRock(scale = 1) {
  const mesh = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.9, 1),
    new THREE.MeshStandardMaterial({
      color: Math.random() > 0.5 ? 0x4b5561 : 0x3d4a47,
      roughness: 0.92,
      flatShading: true,
    })
  );
  mesh.scale.set(scale * 1.15, scale * 0.65, scale);
  mesh.rotation.set(Math.random(), Math.random() * 3, Math.random());
  mesh.position.y = scale * 0.35;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createBrazier(x, z) {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x454e59, roughness: 0.85 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.52, 1.3, 6), stone);
  base.position.y = 0.65;
  base.castShadow = true;
  group.add(base);

  const flame = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.38, 0),
    new THREE.MeshBasicMaterial({ color: 0xffb347 })
  );
  flame.position.y = 1.65;
  group.add(flame);

  const light = new THREE.PointLight(0xff7722, 24, 17, 1.2);
  light.position.y = 2.2;
  group.add(light);

  group.position.set(x, 0, z);
  return { group, flame, light, phase: Math.random() * 10 };
}

export function buildEnvironment(scene) {
  const colliders = [];

  // 1. Textured Forest Ground (receives crisp real-time shadows)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ map: createForestFloorTexture(), roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 2. REAL-TIME REFLECTIVE POND (Knight, Trees, Cliff & Moon reflect live!)
  const pondGeo = new THREE.CircleGeometry(7.2, 32);
  const reflector = new Reflector(pondGeo, {
    clipBias: 0.003,
    textureWidth: 512,
    textureHeight: 512,
    color: 0x5c7f99,
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(-10.5, 0.04, 3.2);
  scene.add(reflector);

  // Animated water ripple veil floating just above the mirror
  const waterTex = createWaterOverlayTexture();
  const waterVeil = new THREE.Mesh(
    new THREE.CircleGeometry(7.25, 32),
    new THREE.MeshBasicMaterial({ map: waterTex, transparent: true, opacity: 0.32 })
  );
  waterVeil.rotation.x = -Math.PI / 2;
  waterVeil.position.set(-10.5, 0.06, 3.2);
  scene.add(waterVeil);

  // Bright Moon positioned directly in the sky reflection angle of the pond
  const skyMoon = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xeaf6ff })
  );
  skyMoon.position.set(-11.5, 16.5, -12.5);
  scene.add(skyMoon);

  // 3. Waterfall Cliff & Cascade behind the Pond
  const brickTex = createStoneBrickTexture();
  const cliff = new THREE.Mesh(
    new THREE.DodecahedronGeometry(4.4, 1),
    new THREE.MeshStandardMaterial({ color: 0x3b444f, roughness: 0.95, flatShading: true })
  );
  cliff.scale.set(1.65, 1.35, 0.85);
  cliff.position.set(-12.2, 3.0, -3.5);
  cliff.castShadow = true;
  cliff.receiveShadow = true;
  scene.add(cliff);
  colliders.push({ x: -12.2, z: -3.5, r: 3.8 });

  const waterfallMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 5.8),
    new THREE.MeshBasicMaterial({ map: waterTex, color: 0xcceeff, transparent: true, opacity: 0.78 })
  );
  waterfallMesh.position.set(-11.2, 2.9, -0.3);
  waterfallMesh.rotation.y = 0.25;
  scene.add(waterfallMesh);

  const splashCount = 90;
  const splashGeo = new THREE.BufferGeometry();
  const splashPos = new Float32Array(splashCount * 3);
  for (let i = 0; i < splashCount; i++) {
    splashPos[i * 3] = -11.2 + (Math.random() - 0.5) * 3.0;
    splashPos[i * 3 + 1] = Math.random() * 5.6;
    splashPos[i * 3 + 2] = -0.1 + (Math.random() - 0.5) * 1.4;
  }
  splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
  const waterfallParticles = new THREE.Points(
    splashGeo,
    new THREE.PointsMaterial({ color: 0xe6f7ff, size: 0.34 })
  );
  scene.add(waterfallParticles);

  // 4. Weathered Brick Castle Gatehouse (North Arena)
  const stoneMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 });
  const castleParts = [
    { w: 3.6, h: 8.0, d: 2.8, x: -4.8, y: 4.0, z: -13.5 },
    { w: 3.6, h: 6.8, d: 2.8, x: 4.8, y: 3.4, z: -13.5 },
    { w: 13.2, h: 2.0, d: 2.6, x: 0, y: 6.5, z: -13.5 },
    { w: 6.0, h: 4.8, d: 2.2, x: -9.5, y: 2.4, z: -13.5 },
    { w: 6.0, h: 4.2, d: 2.2, x: 9.5, y: 2.1, z: -13.5 },
  ];
  castleParts.forEach((p) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), stoneMat);
    m.position.set(p.x, p.y, p.z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  });
  colliders.push({ x: -4.8, z: -13.5, r: 2.2 }, { x: 4.8, z: -13.5, r: 2.2 });

  for (let bx = -11.5; bx <= 11.5; bx += 2.0) {
    const topY = Math.abs(bx) < 6.6 ? 8.0 : 5.2;
    const merlon = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 2.5), stoneMat);
    merlon.position.set(bx, topY, -13.5);
    merlon.castShadow = true;
    scene.add(merlon);
  }

  // Ruined Stone Pillars (replaced cleanly if your KayKit pillar.gltf is in public/models/)
  [[-6.8, -4.5], [6.8, -4.5], [7.8, 4.2], [-5.2, 10.2], [5.8, 10.2]].forEach(([px, pz]) => {
    const h = 3.2 + Math.random() * 1.8;
    const fallbackPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.72, h, 8), stoneMat);
    fallbackPillar.position.set(px, h / 2, pz);
    fallbackPillar.castShadow = true;
    fallbackPillar.receiveShadow = true;
    scene.add(fallbackPillar);

    const kayPillar = loadModel('pillar.gltf', h, () => { fallbackPillar.visible = false; });
    kayPillar.position.set(px, 0, pz);
    scene.add(kayPillar);
    colliders.push({ x: px, z: pz, r: 0.95 });
  });

  // Load your KayKit Barrels next to torches & ruins
  [[-4.4, 7.2], [4.5, 6.8], [-3.8, -11.4], [4.2, -11.2]].forEach(([bx, bz]) => {
    const barrel = loadModel('barrel_large.gltf', 1.25);
    barrel.position.set(bx, 0, bz);
    barrel.rotation.y = Math.random() * 3;
    scene.add(barrel);
  });

  // 5. Four Warm Flickering Braziers
  const torches = [
    createBrazier(-3.4, 7.2),
    createBrazier(3.4, 7.2),
    createBrazier(-3.1, -11.0),
    createBrazier(3.1, -11.0),
  ];
  torches.forEach((t) => scene.add(t.group));

  // 6. Dense Tall Dark-Fantasy Pine Border
  const treeCoords = [
    [-16, -15], [-11, -16], [12, -16], [16, -14],
    [-18, -9], [-17, -4], [12, -10], [15, -7], [17, -3], [13, -1],
    [15, 4], [12, 7], [16, 10], [11, 13], [14, 15], [7, 16],
    [-17, 9], [-14, 13], [-9, 15], [-12, 17], [-4, 17], [3, 17],
    [10, -4], [-8, -9], [9, -11], [18, 2], [-19, 2], [-18, 14],
  ];
  treeCoords.forEach(([tx, tz]) => {
    const tree = createDarkTree(0.95 + Math.random() * 0.5);
    tree.position.set(tx, 0, tz);
    scene.add(tree);
    colliders.push({ x: tx, z: tz, r: 1.0 });
  });

  // 7. Mossy Rocks
  [[-7.2, 1.0], [-5.4, 4.6], [-8.0, 8.8], [8.5, -1.5], [10.2, 2.5], [4.5, 12.2], [-3.8, -6.8], [9.5, 9.0]].forEach(([rx, rz]) => {
    const sc = 0.7 + Math.random() * 0.75;
    const rock = createMossyRock(sc);
    rock.position.x = rx;
    rock.position.z = rz;
    scene.add(rock);
    colliders.push({ x: rx, z: rz, r: sc * 0.85 });
  });

  // 8. 1,600 Fine Dark-Green Swaying Grass Tufts (NO neon yellow cones!)
  const grassCount = 1600;
  const bladeGeo = new THREE.ConeGeometry(0.09, 0.55, 3);
  bladeGeo.translate(0, 0.27, 0);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const grassMesh = new THREE.InstancedMesh(bladeGeo, bladeMat, grassCount);
  grassMesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const grassData = [];

  for (let i = 0; i < grassCount; i++) {
    let gx = (Math.random() - 0.5) * 42;
    let gz = (Math.random() - 0.5) * 40;
    const inPond = Math.hypot(gx + 10.5, gz - 3.2) < 7.6;
    const onPath = Math.abs(gx) < 2.2 && gz > -11 && gz < 13;
    if (inPond || onPath) gx = (Math.random() > 0.5 ? 1 : -1) * (4.5 + Math.random() * 14);

    const s = 0.65 + Math.random() * 1.05;
    dummy.position.set(gx, 0, gz);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(i, dummy.matrix);

    const shades = [0x1b4528, 0x245733, 0x2f6b3e, 0x163820];
    color.setHex(shades[Math.floor(Math.random() * shades.length)]);
    grassMesh.setColorAt(i, color);
    grassData.push({ x: gx, z: gz, s, phase: Math.random() * Math.PI * 2 });
  }
  grassMesh.instanceMatrix.needsUpdate = true;
  grassMesh.instanceColor.needsUpdate = true;
  scene.add(grassMesh);

  // 9. Drifting Low-Lying Atmospheric Fog Wisps (like the reel's "Fog testing")
  const fogTex = createFogTexture();
  const fogWisps = [];
  for (let i = 0; i < 14; i++) {
    const wisp = new THREE.Mesh(
      new THREE.PlaneGeometry(9 + Math.random() * 6, 9 + Math.random() * 6),
      new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, opacity: 0.45, depthWrite: false })
    );
    wisp.rotation.x = -Math.PI / 2;
    wisp.position.set((Math.random() - 0.5) * 32, 0.35 + Math.random() * 0.4, (Math.random() - 0.5) * 28);
    scene.add(wisp);
    fogWisps.push({ mesh: wisp, speed: 0.35 + Math.random() * 0.45 });
  }

  return { waterTex, torches, waterfallParticles, grassMesh, grassData, fogWisps, colliders };
}

// --- Full Articulated Knight (Always Visible — Never an Empty Capsule) ---
export function createKnight() {
  const group = new THREE.Group();
  const builtIn = new THREE.Group();

  const armorMat = new THREE.MeshStandardMaterial({ color: 0xcbd8e6, roughness: 0.3, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x242c36, roughness: 0.7 });
  const capeMat = new THREE.MeshStandardMaterial({ color: 0xb82438, roughness: 0.85, side: THREE.DoubleSide });

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.74, 0.28), darkMat);
  leftLeg.position.set(-0.2, 0.37, 0);
  leftLeg.castShadow = true;

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.74, 0.28), darkMat);
  rightLeg.position.set(0.2, 0.37, 0);
  rightLeg.castShadow = true;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.9, 0.48), armorMat);
  torso.position.y = 1.15;
  torso.castShadow = true;

  const pauldronL = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 8), armorMat);
  pauldronL.position.set(-0.5, 1.46, 0);
  const pauldronR = pauldronL.clone();
  pauldronR.position.x = 0.5;

  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.56, 0.54), armorMat);
  helm.position.y = 1.88;
  helm.castShadow = true;

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.1, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x66ffee })
  );
  visor.position.set(0, 1.89, 0.27);

  const plume = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.48), capeMat);
  plume.position.set(0, 2.24, -0.05);

  const cape = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.1, 0.08), capeMat);
  cape.position.set(0, 1.02, -0.34);
  cape.rotation.x = 0.22;
  cape.castShadow = true;

  builtIn.add(leftLeg, rightLeg, torso, pauldronL, pauldronR, helm, visor, plume, cape);
  group.add(builtIn);

  // Only swaps if you later add Knight.glb into public/models/
  const customModel = loadModel('Knight.glb', 2.2, () => { builtIn.visible = false; });
  group.add(customModel);

  // Glowing Resonance Shield + Parry Ring
  const shieldMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.85, 0.68),
    new THREE.MeshStandardMaterial({ color: 0x55ffee, emissive: 0x116666, roughness: 0.25 })
  );
  shieldMesh.position.set(-0.66, 1.12, 0.24);
  group.add(shieldMesh);

  const shieldRing = new THREE.Mesh(
    new THREE.RingGeometry(1.25, 1.75, 28),
    new THREE.MeshBasicMaterial({ color: 0x66ffee, side: THREE.DoubleSide, transparent: true, opacity: 0 })
  );
  shieldRing.rotation.x = -Math.PI / 2;
  shieldRing.position.y = 0.14;
  group.add(shieldRing);

  const playerLight = new THREE.PointLight(0xaad8ff, 12, 10, 1.2);
  playerLight.position.set(0, 2.4, 0.5);
  group.add(playerLight);

  const shieldGlow = new THREE.PointLight(0x55ffee, 0, 12, 1);
  shieldGlow.position.set(0, 1.3, 0);
  group.add(shieldGlow);

  return { group, leftLeg, rightLeg, cape, shieldMesh, shieldRing, shieldGlow };
}

// --- Full Articulated Skeleton Warrior Mob ---
export function createSkeleton(x, z) {
  const group = new THREE.Group();
  const builtIn = new THREE.Group();

  const boneMat = new THREE.MeshStandardMaterial({ color: 0xe3dfd3, roughness: 0.7 });
  const cloakMat = new THREE.MeshStandardMaterial({ color: 0x213026, roughness: 0.9 });

  const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.75, 6), boneMat);
  leftLeg.position.set(-0.18, 0.37, 0);
  leftLeg.castShadow = true;

  const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.75, 6), boneMat);
  rightLeg.position.set(0.18, 0.37, 0);
  rightLeg.castShadow = true;

  const ribs = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.8, 0.36), cloakMat);
  ribs.position.y = 1.1;
  ribs.castShadow = true;

  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.46), boneMat);
  skull.position.y = 1.74;
  skull.castShadow = true;

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x66ff66 });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), eyeMat);
  eyeL.position.set(-0.11, 1.76, 0.23);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.11;

  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6), new THREE.MeshStandardMaterial({ color: 0x4d3524 }));
  staff.position.set(0.5, 1.2, 0.25);

  const staffOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0x55ff44 }));
  staffOrb.position.set(0.5, 2.25, 0.25);

  builtIn.add(leftLeg, rightLeg, ribs, skull, eyeL, eyeR, staff, staffOrb);
  group.add(builtIn);

  const customModel = loadModel('Skeleton_Mage.glb', 2.1, () => { builtIn.visible = false; });
  group.add(customModel);

  group.position.set(x, 0, z);
  return { group, leftLeg, rightLeg, hp: 2, maxHp: 2, fireTimer: 1.5 + Math.random() * 1.5 };
}

// --- Towering Horned Warden Boss ---
export function createWarden(x, z) {
  const group = new THREE.Group();
  const builtIn = new THREE.Group();

  const ironMat = new THREE.MeshStandardMaterial({ color: 0x473540, roughness: 0.45, metalness: 0.55 });
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5522 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 2.7, 8), ironMat);
  body.position.y = 1.35;
  body.castShadow = true;

  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.6, 0.95), ironMat);
  shoulders.position.y = 2.55;
  shoulders.castShadow = true;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.85, 0.82), ironMat);
  head.position.y = 3.2;
  head.castShadow = true;

  const hornGeo = new THREE.ConeGeometry(0.18, 1.05, 5);
  const hornL = new THREE.Mesh(hornGeo, ironMat);
  hornL.position.set(-0.52, 3.78, 0);
  hornL.rotation.z = 0.45;
  const hornR = hornL.clone();
  hornR.position.x = 0.52;
  hornR.rotation.z = -0.45;

  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.1), emberMat);
  eyeL.position.set(-0.19, 3.25, 0.42);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.19;

  builtIn.add(body, shoulders, head, hornL, hornR, eyeL, eyeR);
  group.add(builtIn);

  const customModel = loadModel('Skeleton_Warrior.glb', 3.5, () => { builtIn.visible = false; });
  group.add(customModel);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.65, 0.09, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xff8822 })
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 4.05;
  group.add(halo);

  const bossLight = new THREE.PointLight(0xff4d11, 28, 18, 1.2);
  bossLight.position.set(0, 3.2, 1.2);
  group.add(bossLight);

  group.position.set(x, 0, z);
  return { group, halo, hp: 6, maxHp: 6, fireTimer: 1.6, ringTimer: 4.5 };
}