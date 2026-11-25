import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// 26-step density ramp tuned for dark-fantasy foliage, stone, and bright magic
const CHARS = " .'`,-:;~=+*!ivcxnu08#W%$@";

function createCharAtlas() {
  const cellW = 24;
  const cellH = 38;
  const canvas = document.createElement('canvas');
  canvas.width = cellW * CHARS.length;
  canvas.height = cellH;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 31px "Consolas", "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < CHARS.length; i++) {
    ctx.fillText(CHARS[i], i * cellW + cellW / 2, cellH / 2 + 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createAsciiPass(width, height, cellW = 5.5, cellH = 9.0) {
  const atlas = createCharAtlas();

  const shader = {
    uniforms: {
      tDiffuse: { value: null },
      tAtlas: { value: atlas },
      uResolution: { value: new THREE.Vector2(width, height) },
      uCellSize: { value: new THREE.Vector2(cellW, cellH) },
      uCharCount: { value: CHARS.length },
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
      uniform float uFlash;
      varying vec2 vUv;

      vec3 sampleSrgb(vec2 uv) {
        vec3 lin = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
        return pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2));
      }

      float getLum(vec3 c) {
        return dot(c, vec3(0.299, 0.587, 0.114));
      }

      void main() {
        vec2 grid = floor(uResolution / uCellSize);
        vec2 stepUv = 1.0 / grid;
        vec2 cellUv = (floor(vUv * grid) + 0.5) / grid;
        vec2 localUv = fract(vUv * grid);

        vec3 col = sampleSrgb(cellUv);
        float lum = getLum(col);

        // Clean silhouette edge boost so ruins, trees, and characters read sharply
        float lL = getLum(sampleSrgb(cellUv - vec2(stepUv.x, 0.0)));
        float lR = getLum(sampleSrgb(cellUv + vec2(stepUv.x, 0.0)));
        float lU = getLum(sampleSrgb(cellUv + vec2(0.0, stepUv.y)));
        float lD = getLum(sampleSrgb(cellUv - vec2(0.0, stepUv.y)));
        float edge = clamp((abs(lL - lR) + abs(lU - lD)) * 1.45, 0.0, 0.35);

        // Deep shadows drop to dark space; midtones & highlights span the full ramp
        float contrast = smoothstep(0.03, 0.92, lum * 1.25);
        float density = clamp(pow(contrast, 0.78) + edge, 0.0, 0.999);
        float charIndex = floor(density * uCharCount);

        vec2 atlasUv = vec2((charIndex + localUv.x) / uCharCount, localUv.y);
        float glyph = texture2D(tAtlas, atlasUv).r;

        // Crisp dark-fantasy color grading on a near-black terminal canvas
        vec3 graded = mix(vec3(lum), col, 1.18);
        vec3 bg = vec3(0.012, 0.016, 0.022);
        vec3 fg = graded * (1.35 + edge * 0.65) + vec3(0.02);
        vec3 finalColor = mix(bg, fg, glyph);

        // Soft bloom halo around torches, moon reflection, and magic orbs
        vec2 bOff = stepUv * 2.2;
        vec3 b1 = sampleSrgb(vUv + vec2(bOff.x, 0.0));
        vec3 b2 = sampleSrgb(vUv - vec2(bOff.x, 0.0));
        vec3 b3 = sampleSrgb(vUv + vec2(0.0, bOff.y));
        vec3 b4 = sampleSrgb(vUv - vec2(0.0, bOff.y));
        vec3 glow = max(b1 - 0.58, 0.0) + max(b2 - 0.58, 0.0) + max(b3 - 0.58, 0.0) + max(b4 - 0.58, 0.0);
        finalColor += glow * 0.42;

        finalColor = mix(finalColor, vec3(1.0), uFlash);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  };

  return new ShaderPass(shader);
} 