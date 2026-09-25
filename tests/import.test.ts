import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import * as T from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';
import { loadModel } from '../lib/load-model';
import { demoModel } from '../lib/measurement';
const window = new Window();
Object.assign(globalThis, {
  DOMParser: window.DOMParser,
  ProgressEvent: window.ProgressEvent,
});
const positions = new Float32Array([0, 0, 0, 0.09, 0, 0, 0, 0.008, 0.06]);
function gltf(uri?: string) {
  return {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: positions.byteLength, ...(uri ? { uri } : {}) }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [0.09, 0.008, 0.06],
      },
    ],
  };
}
const verify = (size: number[]) => {
  [0.09, 0.06, 0.008].forEach((v, i) =>
    assert.ok(Math.abs(size[i] - v) < 1e-7),
  );
};
test('embedded GLTF uses meters and converts Y-up to Z-up', async () => {
  const uri = `data:application/octet-stream;base64,${Buffer.from(positions.buffer).toString('base64')}`;
  const result = await loadModel([
    new File([JSON.stringify(gltf(uri))], 'part.gltf'),
  ]);
  assert.equal(result.sourceUnit, 'm');
  verify(result.model.size.toArray());
  result.model.geometry.dispose();
});
test('GLTF resolves a selected local binary companion', async () => {
  const result = await loadModel([
    new File([JSON.stringify(gltf('part.bin'))], 'part.gltf'),
    new File([positions.buffer], 'part.bin'),
  ]);
  verify(result.model.size.toArray());
  result.model.geometry.dispose();
});
test('GLTF rejects missing companions with a useful message', async () => {
  await assert.rejects(
    loadModel([new File([JSON.stringify(gltf('missing.bin'))], 'part.gltf')]),
    /Missing or ambiguous asset/,
  );
});
test('binary GLB loads and preserves dimensions', async () => {
  let json = JSON.stringify(gltf());
  while (json.length % 4) json += ' ';
  const encoded = new TextEncoder().encode(json),
    binary = new Uint8Array(positions.buffer);
  const data = new ArrayBuffer(12 + 8 + encoded.length + 8 + binary.length),
    view = new DataView(data);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, data.byteLength, true);
  view.setUint32(12, encoded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(data, 20, encoded.length).set(encoded);
  const start = 20 + encoded.length;
  view.setUint32(start, binary.length, true);
  view.setUint32(start + 4, 0x004e4942, true);
  new Uint8Array(data, start + 8).set(binary);
  const result = await loadModel([new File([data], 'part.glb')]);
  assert.equal(result.sourceUnit, 'm');
  verify(result.model.size.toArray());
  result.model.geometry.dispose();
});
const modelXml = (unit: string) =>
  `<?xml version="1.0"?><model unit="${unit}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="9" y="0" z="0"/><vertex x="0" y="6" z="0.8"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 5 10 15"/></build></model>`;
const relations = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
test('3MF reads declared centimeters and applies build transforms', async () => {
  const zip = zipSync({
    '_rels/.rels': strToU8(relations),
    '3D/3dmodel.model': strToU8(modelXml('centimeter')),
  });
  const result = await loadModel([
    new File([zip as Uint8Array<ArrayBuffer>], 'part.3mf'),
  ]);
  assert.equal(result.sourceUnit, 'cm');
  [9, 6, 0.8].forEach((v, i) =>
    assert.ok(Math.abs(result.model.size.toArray()[i] - v) < 1e-5),
  );
  result.model.geometry.dispose();
});
test('mixed-unit 3MF is rejected rather than assigned a wrong scale', async () => {
  const zip = zipSync({
    '_rels/.rels': strToU8(relations),
    '3D/3dmodel.model': strToU8(modelXml('centimeter')),
    '3D/other.model': strToU8(modelXml('millimeter')),
  });
  await assert.rejects(
    loadModel([new File([zip as Uint8Array<ArrayBuffer>], 'part.3mf')]),
    /mixes units/,
  );
});
test('STL defaults source scale to meter', async () => {
  const source = demoModel(),
    mesh = new T.Mesh(source.geometry),
    data = new STLExporter().parse(mesh, { binary: true });
  const result = await loadModel([
    new File([data.buffer], 'part.stl'),
  ]);
  assert.equal(result.sourceUnit, 'm');
  result.model.geometry.dispose();
  source.geometry.dispose();
});
test('unsupported extension is rejected', async () => {
  await assert.rejects(
    loadModel([new File(['abc'], 'part.txt')]),
    /Choose an STL/,
  );
});
