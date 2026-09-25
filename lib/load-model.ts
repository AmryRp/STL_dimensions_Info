import * as T from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { unzipSync, strFromU8 } from 'three/addons/libs/fflate.module.js';
import { prepareModel, type Unit } from './measurement';

export const SUPPORTED = /\.(stl|obj|gltf|glb|3mf)$/i;
export async function loadModel(files: File[]) {
  const file = files.find((f) => SUPPORTED.test(f.name));
  if (!file) throw new Error('Choose an STL, OBJ, GLTF, GLB, or 3MF model.');
  if (files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024)
    throw new Error('Please use files smaller than 100 MB combined.');
  const extension = file.name.split('.').pop()!.toLowerCase();
  const buffer = await file.arrayBuffer(),
    urls: string[] = [];
  let root: T.Object3D | undefined,
    sourceUnit: Unit = 'm',
    note = 'Unitless format · defaulted to meters. Confirm or change source scale below.';
  try {
    if (extension === 'stl') root = new T.Mesh(new STLLoader().parse(buffer));
    if (extension === 'obj')
      root = new OBJLoader().parse(new TextDecoder().decode(buffer));
    if (extension === '3mf') {
      const archive = unzipSync(new Uint8Array(buffer));
      const documents = Object.keys(archive).filter((k) => /\.model$/i.test(k));
      const unitMap: Record<string, Unit> = {
        micron: 'µm',
        millimeter: 'mm',
        centimeter: 'cm',
        meter: 'm',
        inch: 'in',
        foot: 'ft',
      };
      const units = documents.map(
        (k) =>
          new DOMParser()
            .parseFromString(strFromU8(archive[k]), 'application/xml')
            .documentElement.getAttribute('unit') ?? 'millimeter',
      );
      if (new Set(units).size > 1)
        throw new Error(
          'This 3MF mixes units across parts. Export it in one unit before measuring.',
        );
      if (!unitMap[units[0]])
        throw new Error('The 3MF declares an unsupported unit.');
      sourceUnit = unitMap[units[0]];
      note = 'Source unit read from 3MF metadata.';
      root = new ThreeMFLoader().parse(buffer);
    }
    if (extension === 'gltf' || extension === 'glb') {
      const manager = new T.LoadingManager();
      manager.setURLModifier((url) => {
        if (url.startsWith('data:') || url.startsWith('blob:')) return url;
        const requested = decodeURIComponent(url).replace(/^\.\//, '');
        const matches = files.filter(
          (f) =>
            (f.webkitRelativePath || f.name) === requested ||
            f.name === requested.split('/').pop(),
        );
        if (matches.length !== 1)
          throw new Error(
            `Missing or ambiguous asset: ${requested}. Select the model and its .bin / texture files together.`,
          );
        const local = URL.createObjectURL(matches[0]);
        urls.push(local);
        return local;
      });
      const gltf = await new GLTFLoader(manager).parseAsync(buffer, '');
      root = gltf.scene;
      // glTF uses Y-up, meters. Our measurement/build space is Z-up.
      root.rotation.x -= Math.PI / 2;
      sourceUnit = 'm';
      note =
        'glTF uses meters. Change only if the exporter used a different scale.';
    }
    if (!root) throw new Error('This file could not be read.');
    return {
      model: prepareModel(root),
      name: file.name,
      bytes: file.size,
      sourceUnit,
      note,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to read this model.';
    if (/DRACO|KTX2|Meshopt/i.test(message))
      throw new Error(
        'This model uses compressed geometry or textures. Export an uncompressed GLB/GLTF and try again.',
      );
    throw new Error(message);
  } finally {
    urls.forEach((url) => URL.revokeObjectURL(url));
    root?.traverse((obj) => {
      if (obj instanceof T.Mesh) {
        obj.geometry.dispose();
        for (const material of Array.isArray(obj.material)
          ? obj.material
          : [obj.material]) {
          for (const value of Object.values(material))
            if (value instanceof T.Texture) value.dispose();
          material.dispose();
        }
      }
    });
  }
}
