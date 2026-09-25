import * as T from 'three';

export const UNITS = {
  mm: 1,
  cm: 10,
  m: 1000,
  µm: 0.001,
  in: 25.4,
  ft: 304.8,
} as const;
export type Unit = keyof typeof UNITS;
export type Circle = {
  center: T.Vector3;
  normal: T.Vector3;
  radius: number;
  points: T.Vector3[];
};
export type Model = {
  geometry: T.BufferGeometry;
  size: T.Vector3;
  holes: Circle[];
  triangles: number;
  detectionSkipped: boolean;
};
export const formatLength = (mm: number, unit: Unit) =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(
    mm / UNITS[unit],
  );

export function circleFromThree(
  a: T.Vector3,
  b: T.Vector3,
  c: T.Vector3,
): Circle | null {
  const u = b.clone().sub(a),
    v = c.clone().sub(a),
    n = new T.Vector3().crossVectors(u, v);
  const d = 2 * n.lengthSq();
  if (d < 1e-12 * Math.max(u.lengthSq() * v.lengthSq(), 1e-20)) return null;
  const offset = new T.Vector3()
    .crossVectors(v, n)
    .multiplyScalar(u.lengthSq())
    .add(new T.Vector3().crossVectors(n, u).multiplyScalar(v.lengthSq()))
    .divideScalar(d);
  const center = a.clone().add(offset);
  return {
    center,
    radius: center.distanceTo(a),
    normal: n.normalize(),
    points: [a, b, c],
  };
}

// Find closed sharp-edge loops, fit circles, and check inward-facing side walls.
// This intentionally excludes outer circular bosses and open arcs.
export function detectHoles(geometry: T.BufferGeometry): Circle[] {
  const pos = geometry.getAttribute('position');
  const box = new T.Box3().setFromBufferAttribute(pos as T.BufferAttribute);
  const tolerance = Math.max(
    box.getSize(new T.Vector3()).length() * 1e-6,
    1e-8,
  );
  const vertices: T.Vector3[] = [],
    ids = new Map<string, number>();
  const vertex = (i: number) => {
    const p = new T.Vector3().fromBufferAttribute(pos, i);
    const key = p
      .toArray()
      .map((x) => Math.round(x / tolerance))
      .join(',');
    if (!ids.has(key)) {
      ids.set(key, vertices.length);
      vertices.push(p);
    }
    return ids.get(key)!;
  };
  type Edge = { a: number; b: number; normals: T.Vector3[] };
  const edges = new Map<string, Edge>();
  const index = geometry.index;
  for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
    const vs = [0, 1, 2].map((j) => vertex(index ? index.getX(i + j) : i + j));
    const normal = new T.Vector3()
      .crossVectors(
        vertices[vs[1]].clone().sub(vertices[vs[0]]),
        vertices[vs[2]].clone().sub(vertices[vs[0]]),
      )
      .normalize();
    for (let j = 0; j < 3; j++) {
      const a = vs[j],
        b = vs[(j + 1) % 3],
        key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const edge = edges.get(key) ?? { a, b, normals: [] };
      edge.normals.push(normal);
      edges.set(key, edge);
    }
  }
  const sharp = [...edges.values()].filter(
    (e) =>
      e.normals.length === 2 &&
      e.normals[0].dot(e.normals[1]) < Math.cos(Math.PI / 6),
  );
  const adjacency = new Map<number, Edge[]>();
  for (const e of sharp)
    for (const v of [e.a, e.b])
      adjacency.set(v, [...(adjacency.get(v) ?? []), e]);
  const visited = new Set<Edge>(),
    circles: Circle[] = [];
  for (const start of sharp) {
    if (visited.has(start)) continue;
    const path: number[] = [start.a],
      loop: Edge[] = [];
    let current = start.a,
      edge: Edge | undefined = start;
    while (edge && !visited.has(edge)) {
      visited.add(edge);
      loop.push(edge);
      current = edge.a === current ? edge.b : edge.a;
      if (current === path[0]) break;
      path.push(current);
      const next: Edge[] = adjacency.get(current) ?? [];
      edge = next.length === 2 ? next.find((e) => !visited.has(e)) : undefined;
    }
    if (current !== path[0] || path.length < 12) continue;
    const points = path.map((id) => vertices[id]);
    const circle = circleFromThree(
      points[0],
      points[Math.floor(points.length / 3)],
      points[Math.floor((points.length * 2) / 3)],
    );
    if (!circle || circle.radius < tolerance * 10) continue;
    if (
      points.some(
        (p) =>
          Math.abs(p.distanceTo(circle.center) - circle.radius) >
            circle.radius * 0.012 ||
          Math.abs(p.clone().sub(circle.center).dot(circle.normal)) >
            tolerance * 4,
      )
    )
      continue;
    let inward = 0,
      walls = 0;
    for (const e of loop)
      for (const normal of e.normals) {
        if (Math.abs(normal.dot(circle.normal)) > 0.35) continue;
        const radial = vertices[e.a]
          .clone()
          .add(vertices[e.b])
          .multiplyScalar(0.5)
          .sub(circle.center)
          .normalize();
        inward += normal.dot(radial);
        walls++;
      }
    if (!walls || inward / walls > -0.7) continue;
    circle.points = points;
    // Opposite openings of a through-hole share an axis and radius.
    if (
      circles.some(
        (c) =>
          Math.abs(c.radius - circle.radius) < tolerance * 10 &&
          Math.abs(c.normal.dot(circle.normal)) > 0.999 &&
          new T.Vector3()
            .crossVectors(c.center.clone().sub(circle.center), circle.normal)
            .length() <
            tolerance * 10,
      )
    )
      continue;
    circles.push(circle);
  }
  return circles.sort((a, b) => b.radius - a.radius);
}

export function prepareModel(root: T.Object3D): Model {
  root.updateMatrixWorld(true);
  const chunks: Float32Array[] = [];
  let count = 0;
  root.traverse((obj) => {
    if (!(obj instanceof T.Mesh) || !obj.geometry.getAttribute('position'))
      return;
    const append = (matrix: T.Matrix4) => {
      const g = obj.geometry.index
        ? obj.geometry.toNonIndexed()
        : obj.geometry.clone();
      g.applyMatrix4(matrix);
      const positions = new Float32Array(g.getAttribute('position').array);
      if (matrix.determinant() < 0) {
        for (let i = 0; i < positions.length; i += 9)
          for (let j = 0; j < 3; j++) {
            const x = positions[i + 3 + j];
            positions[i + 3 + j] = positions[i + 6 + j];
            positions[i + 6 + j] = x;
          }
      }
      chunks.push(positions);
      count += positions.length;
      g.dispose();
    };
    if (obj instanceof T.InstancedMesh) {
      for (let i = 0; i < obj.count; i++) {
        const matrix = new T.Matrix4();
        obj.getMatrixAt(i, matrix);
        append(obj.matrixWorld.clone().multiply(matrix));
      }
    } else append(obj.matrixWorld);
  });
  if (!count) throw new Error('No triangle mesh was found in this file.');
  const positions = new Float32Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    positions.set(chunk, offset);
    offset += chunk.length;
  }
  if (positions.some((x) => !Number.isFinite(x)))
    throw new Error('The model contains invalid coordinates.');
  const geometry = new T.BufferGeometry().setAttribute(
    'position',
    new T.BufferAttribute(positions, 3),
  );
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!,
    size = box.getSize(new T.Vector3()),
    center = box.getCenter(new T.Vector3());
  if (size.length() < 1e-10)
    throw new Error('The model has no measurable size.');
  geometry.translate(-center.x, -center.y, -box.min.z);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const triangles = count / 9,
    detectionSkipped = triangles > 180000;
  return {
    geometry,
    size,
    triangles,
    detectionSkipped,
    holes: detectionSkipped ? [] : detectHoles(geometry),
  };
}

export function demoModel(): Model {
  const shape = new T.Shape();
  const w = 90,
    h = 60,
    r = 7;
  shape.moveTo(r, 0);
  shape.lineTo(w - r, 0);
  shape.quadraticCurveTo(w, 0, w, r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(r, h);
  shape.quadraticCurveTo(0, h, 0, h - r);
  shape.lineTo(0, r);
  shape.quadraticCurveTo(0, 0, r, 0);
  for (const [x, y, radius] of [
    [45, 30, 14],
    [12, 12, 3],
    [78, 12, 3],
    [12, 48, 3],
    [78, 48, 3],
  ]) {
    const hole = new T.Path();
    hole.absarc(x, y, radius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geometry = new T.ExtrudeGeometry(shape, {
    depth: 8,
    bevelEnabled: false,
    curveSegments: 48,
  });
  const model = prepareModel(new T.Mesh(geometry));
  geometry.dispose();
  return model;
}
