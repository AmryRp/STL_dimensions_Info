import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import {
  demoModel,
  prepareModel,
  circleFromThree,
  UNITS,
  formatLength,
} from '../lib/measurement';
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-4, `${actual} != ${expected}`);

test('sample dimensions and five bores are derived from mesh geometry', () => {
  const m = demoModel();
  assert.deepEqual(m.size.toArray(), [90, 60, 8]);
  assert.equal(m.holes.length, 5);
  const diameters = m.holes.map((h) => h.radius * 2).sort((a, b) => a - b);
  [6, 6, 6, 6, 28].forEach((d, i) => close(diameters[i], d));
  m.geometry.dispose();
});
test('three-point diameter works in an arbitrary 3D plane', () => {
  const matrix = new T.Matrix4()
    .makeRotationAxis(new T.Vector3(1, 2, 3).normalize(), 0.73)
    .setPosition(35, 80, -12);
  const points = [0, 1.9, 4.7].map((a) =>
    new T.Vector3(7 * Math.cos(a), 7 * Math.sin(a), 0).applyMatrix4(matrix),
  );
  const c = circleFromThree(...(points as [T.Vector3, T.Vector3, T.Vector3]))!;
  close(c.radius * 2, 14);
  close(c.center.distanceTo(new T.Vector3(35, 80, -12)), 0);
  assert.equal(
    circleFromThree(
      new T.Vector3(),
      new T.Vector3(1, 0, 0),
      new T.Vector3(2, 0, 0),
    ),
    null,
  );
});
test('world-space transforms and instances are included in the bounds', () => {
  const mesh = new T.Mesh(new T.BoxGeometry(10, 20, 30));
  mesh.scale.set(2, 3, 4);
  mesh.position.set(80, -60, 42);
  const root = new T.Group();
  root.add(mesh);
  const m = prepareModel(root);
  assert.deepEqual(m.size.toArray(), [20, 60, 120]);
  m.geometry.dispose();
  const instances = new T.InstancedMesh(
    new T.BoxGeometry(2, 2, 2),
    new T.MeshBasicMaterial(),
    2,
  );
  instances.setMatrixAt(1, new T.Matrix4().makeTranslation(10, 0, 0));
  const n = prepareModel(instances);
  assert.deepEqual(n.size.toArray(), [12, 2, 2]);
  n.geometry.dispose();
});
test('outer cylinders are not classified as holes', () => {
  const m = prepareModel(new T.Mesh(new T.CylinderGeometry(5, 5, 10, 64)));
  assert.equal(m.holes.length, 0);
  m.geometry.dispose();
});
test('STL binary and ASCII retain dimensions and hole topology', () => {
  const source = demoModel(),
    mesh = new T.Mesh(source.geometry),
    exporter = new STLExporter();
  for (const binary of [false, true]) {
    const data = binary
      ? exporter.parse(mesh, { binary: true })
      : exporter.parse(mesh);
    const g = new STLLoader().parse(
      typeof data === 'string' ? data : (data.buffer as ArrayBuffer),
    );
    const m = prepareModel(new T.Mesh(g));
    assert.equal(m.holes.length, 5);
    assert.deepEqual(m.size.toArray(), [90, 60, 8]);
    m.geometry.dispose();
    g.dispose();
  }
  source.geometry.dispose();
});
test('OBJ round-trip retains dimensions and hole topology', () => {
  const source = demoModel();
  const text = new OBJExporter().parse(new T.Mesh(source.geometry));
  const m = prepareModel(new OBJLoader().parse(text));
  assert.equal(m.holes.length, 5);
  assert.deepEqual(m.size.toArray(), [90, 60, 8]);
  m.geometry.dispose();
  source.geometry.dispose();
});
test('source scale and output scale convert independently', () => {
  assert.equal(UNITS.m / UNITS.mm, 1000);
  assert.equal(formatLength(90, 'cm'), '9');
  assert.equal(formatLength(25.4, 'in'), '1');
  assert.equal(formatLength(0.008 * UNITS.m, 'mm'), '8');
});
test('invalid and empty geometry fail intentionally', () => {
  assert.throws(() => prepareModel(new T.Group()), /No triangle/);
  const geometry = new T.BufferGeometry().setAttribute(
    'position',
    new T.Float32BufferAttribute([NaN, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  assert.throws(
    () => prepareModel(new T.Mesh(geometry)),
    /invalid coordinates/,
  );
});
