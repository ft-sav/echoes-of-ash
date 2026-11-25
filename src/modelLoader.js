import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

/**
 * Loads a .gltf or .glb from /models/ (which maps to public/models/),
 * normalizes its height to `targetHeight`, and places its base at y = 0.
 */
export function loadModel(filename, targetHeight = 2.0, onLoaded = null) {
  const wrapper = new THREE.Group();
  const url = `./models/${filename}`;

  const applyModel = (gltf) => {
    const model = gltf.scene.clone(true);

    // Measure bounding box so we can auto-scale to exact world units
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    if (size.y > 0) {
      const scale = targetHeight / size.y;
      model.scale.setScalar(scale);
    }

    // Re-measure after scaling and sit feet cleanly at y = 0
    const scaledBox = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    scaledBox.getCenter(center);

    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= scaledBox.min.y;

    wrapper.add(model);
    if (onLoaded) onLoaded(model, gltf.animations || []);
  };

  if (cache.has(url)) {
    applyModel(cache.get(url));
    return wrapper;
  }

  loader.load(
    url,
    (gltf) => {
      cache.set(url, gltf);
      applyModel(gltf);
    },
    undefined,
    (err) => {
      console.warn(`[KayKit Loader] Could not load ${url} — keeping fallback mesh.`, err);
    }
  );

  return wrapper;
}