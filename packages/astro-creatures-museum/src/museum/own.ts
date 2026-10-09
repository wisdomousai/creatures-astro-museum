// A building of the site's own (museum({ building }), plan/authored.ts): the file as it
// was made, shown whole, in the museum's look. Its materials named for the kit's roles
// (Wall, Trim, Floor, Brass…) are the look's; any others stay as they were made. Its
// floors (NAV_<room>) are what a click walks to.
import { Box3, type Material, type Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Plan } from '../plan/types';
import type { Materials } from './materials';

const ROLES = new Set([
  'Wall',
  'Trim',
  'Frame',
  'Plinth',
  'Wood',
  'Velvet',
  'Brass',
  'Glow',
  'Floor',
  'Dark',
]);

export async function ownBuilding(
  plan: Plan,
  materials: Materials,
): Promise<{ group: Object3D; floors: Object3D[] }> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(plan.building!);
  const group = gltf.scene;
  const floors: Object3D[] = [];
  group.updateMatrixWorld(true);
  const box = new Box3();
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const swap = (mat: Material) => {
      const role = mat.name.replace(/\.\d+$/, '');
      return ROLES.has(role) ? materials.role(role) : mat;
    };
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    // (The sun shines in from above: what's up at the ceiling would shade the whole floor.)
    m.castShadow = !o.name.startsWith('NAV_') && box.setFromObject(m).min.y < plan.height - 0.3;
    m.receiveShadow = true;
    if (o.name.startsWith('NAV_')) {
      o.userData.floor = o.name.slice(4);
      floors.push(o);
    }
  });
  return { group, floors };
}
