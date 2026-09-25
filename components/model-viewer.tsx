import { useEffect, useRef } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  type Model,
  type Circle,
  type Unit,
  formatLength,
} from '../lib/measurement';

export type Measurement = {
  id: number;
  kind: 'distance' | 'diameter';
  value: number;
  points: T.Vector3[];
  circle?: Circle;
  delta?: T.Vector3;
};
export type View = 'iso' | 'top' | 'front' | 'right';
export type ViewerApi = { view: (view: View) => void; export: () => void };
type Props = {
  model: Model;
  unit: Unit;
  scale: number;
  precision?: number;
  fixedPrecision?: boolean;
  dimensions: boolean;
  showHoles: boolean;
  wireframe: boolean;
  grid: boolean;
  selected: number | null;
  onSelectHole?: (index: number | null) => void;
  mode: 'orbit' | 'distance' | 'diameter';
  picked: T.Vector3[];
  measurements: Measurement[];
  onPick: (point: T.Vector3) => void;
  onError: (message: string) => void;
  api: React.RefObject<ViewerApi | null>;
};
type Label = {
  point: T.Vector3;
  text: string;
  color: string;
  element: HTMLDivElement;
};

export default function ModelViewer(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const container = host.current!;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      props.onError(
        '3D preview requires WebGL2. Enable hardware acceleration or try another browser.',
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor('#171e21');
    container.appendChild(renderer.domElement);
    const scene = new T.Scene();
    const max = Math.max(...props.model.size.toArray());
    const target = new T.Vector3(0, 0, props.model.size.z / 2);
    const camera = new T.PerspectiveCamera(
      38,
      1,
      Math.max(max / 10000, 1e-8),
      max * 100,
    );
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.copy(target);
    controls.maxDistance = max * 15;
    controls.minDistance = max * 0.02;
    const setView = (view: View) => {
      const direction = {
        iso: [1, -1.4, 1.25],
        top: [0, -0.0001, 1],
        front: [0, -1, 0],
        right: [1, 0, 0],
      }[view];
      const distance = (max * 1.7) / Math.min(camera.aspect, 1);
      camera.position
        .copy(target)
        .add(new T.Vector3(...direction).normalize().multiplyScalar(distance));
      controls.target.copy(target);
      controls.update();
    };
    scene.add(new T.HemisphereLight(0xe5f4ff, 0x4a5660, 2.5));
    for (const [position, intensity] of [
      [[1, -2, 3], 3],
      [[-2, 1, 1], 1.5],
    ] as [number[], number][]) {
      const light = new T.DirectionalLight(0xffffff, intensity);
      light.position
        .set(...(position as [number, number, number]))
        .multiplyScalar(max);
      scene.add(light);
    }
    const material = new T.MeshStandardMaterial({
      color: 0x9baeb0,
      metalness: 0.25,
      roughness: 0.36,
      side: T.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const mesh = new T.Mesh(props.model.geometry, material);
    scene.add(mesh);
    const edges = new T.LineSegments(
      new T.EdgesGeometry(props.model.geometry, 35),
      new T.LineBasicMaterial({
        color: 0x52696a,
        transparent: true,
        opacity: 0.45,
      }),
    );
    scene.add(edges);
    const grid = new T.GridHelper(max * 3, 30, 0x475255, 0x2c3639);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -max * 0.003;
    scene.add(grid);
    const annotations = new T.Group();
    scene.add(annotations);
    let labels: Label[] = [],
      signature = '';
    const disposeAnnotations = () => {
      annotations.traverse((obj) => {
        if (obj instanceof T.Mesh || obj instanceof T.Line) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
      annotations.clear();
      labels.forEach((l) => l.element.remove());
      labels = [];
    };
    const line = (points: T.Vector3[], color: string) => {
      annotations.add(
        new T.Line(
          new T.BufferGeometry().setFromPoints(points),
          new T.LineBasicMaterial({
            color,
            depthTest: false,
            transparent: true,
            opacity: 0.9,
          }),
        ),
      );
    };
    const label = (
      point: T.Vector3,
      text: string,
      color: string,
      onClick?: () => void,
    ) => {
      const element = document.createElement('div');
      element.className = 'dimension-label';
      element.textContent = text;
      element.style.color = color;
      if (onClick) {
        element.style.cursor = 'pointer';
        element.style.pointerEvents = 'auto';
        element.addEventListener('click', (e) => {
          e.stopPropagation();
          onClick();
        });
      }
      container.appendChild(element);
      labels.push({ point, text, color, element });
    };
    const dimension = (
      a: T.Vector3,
      b: T.Vector3,
      text: string,
      color: string,
      extension?: T.Vector3[],
    ) => {
      line([a, b], color);
      const direction = b.clone().sub(a).normalize();
      let side = new T.Vector3()
        .crossVectors(direction, new T.Vector3(0, 0, 1))
        .normalize();
      if (side.length() < 0.5) side.set(1, 0, 0);
      const arrow = max * 0.018;
      for (const [point, sign] of [
        [a, 1],
        [b, -1],
      ] as [T.Vector3, number][]) {
        const base = point.clone().addScaledVector(direction, arrow * sign);
        line(
          [
            base.clone().addScaledVector(side, arrow * 0.35),
            point,
            base.clone().addScaledVector(side, -arrow * 0.35),
          ],
          color,
        );
      }
      if (extension) {
        line([extension[0], a], color);
        line([extension[1], b], color);
      }
      label(a.clone().add(b).multiplyScalar(0.5), text, color);
    };
    const circle = (c: Circle, color: string) => {
      const u = c.points[0].clone().sub(c.center).normalize(),
        v = new T.Vector3().crossVectors(c.normal, u).normalize();
      const points = Array.from({ length: 97 }, (_, i) =>
        c.center
          .clone()
          .addScaledVector(u, c.radius * Math.cos((i * Math.PI) / 48))
          .addScaledVector(v, c.radius * Math.sin((i * Math.PI) / 48)),
      );
      line(points, color);
    };
    const updateAnnotations = () => {
      const p = latest.current;
      const key = JSON.stringify([
        p.unit,
        p.scale,
        p.precision,
        p.fixedPrecision,
        p.dimensions,
        p.showHoles,
        p.selected,
        p.picked.map((v) => v.toArray()),
        p.measurements.map((m) => m.id),
      ]);
      material.wireframe = p.wireframe;
      edges.visible = !p.wireframe;
      grid.visible = p.grid;
      if (key === signature) return;
      signature = key;
      disposeAnnotations();
      const fmt = (value: number) =>
        `${formatLength(value * p.scale, p.unit, p.precision ?? 3, p.fixedPrecision ?? true)} ${p.unit}`;
      const { x, y, z } = p.model.size,
        gap = max * 0.14;
      if (p.dimensions) {
        dimension(
          new T.Vector3(-x / 2, -y / 2 - gap, 0),
          new T.Vector3(x / 2, -y / 2 - gap, 0),
          `Left ↔ Right (X)  ${fmt(x)}`,
          '#c8f386',
          [new T.Vector3(-x / 2, -y / 2, 0), new T.Vector3(x / 2, -y / 2, 0)],
        );
        dimension(
          new T.Vector3(x / 2 + gap, -y / 2, 0),
          new T.Vector3(x / 2 + gap, y / 2, 0),
          `Front ↗ Back (Y)  ${fmt(y)}`,
          '#85cefa',
          [new T.Vector3(x / 2, -y / 2, 0), new T.Vector3(x / 2, y / 2, 0)],
        );
        dimension(
          new T.Vector3(-x / 2 - gap, y / 2, 0),
          new T.Vector3(-x / 2 - gap, y / 2, z),
          `Top ↕ Bottom (Z)  ${fmt(z)}`,
          '#e8b7fc',
          [new T.Vector3(-x / 2, y / 2, 0), new T.Vector3(-x / 2, y / 2, z)],
        );
      }
      if (p.showHoles)
        p.model.holes.forEach((c, i) => {
          const isSelected = p.selected === i;
          const color = isSelected ? '#ffffff' : '#c8f386';
          circle(c, color);
          if (isSelected) {
            // Draw crosshair at center
            const u = c.points[0].clone().sub(c.center).normalize();
            const v = new T.Vector3().crossVectors(c.normal, u).normalize();
            const arm = c.radius * 0.45;
            line(
              [
                c.center.clone().addScaledVector(u, -arm),
                c.center.clone().addScaledVector(u, arm),
              ],
              '#ffffff',
            );
            line(
              [
                c.center.clone().addScaledVector(v, -arm),
                c.center.clone().addScaledVector(v, arm),
              ],
              '#ffffff',
            );
            // Center point dot
            const centerDot = new T.Mesh(
              new T.SphereGeometry(max * 0.006),
              new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false }),
            );
            centerDot.position.copy(c.center);
            annotations.add(centerDot);

            // Prominent diameter dimension across the hole
            const d1 = c.center.clone().addScaledVector(u, -c.radius);
            const d2 = c.center.clone().addScaledVector(u, c.radius);
            dimension(
              d1,
              d2,
              `Hole ${i + 1} Ø ${fmt(c.radius * 2)}`,
              '#ffffff',
            );

            const centerLabelLoc = c.center
              .clone()
              .addScaledVector(c.normal, max * 0.07);
            label(
              centerLabelLoc,
              `Center: (${fmt(c.center.x)}, ${fmt(c.center.y)}, ${fmt(c.center.z)})`,
              '#ffffff',
            );
          } else {
            const location = c.center
              .clone()
              .addScaledVector(c.normal, max * 0.06);
            label(
              location,
              `${String(i + 1).padStart(2, '0')} · Ø ${fmt(c.radius * 2)}`,
              color,
              () => p.onSelectHole?.(i),
            );
          }
        });
      p.picked.forEach((point, i) => {
        const dot = new T.Mesh(
          new T.SphereGeometry(max * 0.007),
          new T.MeshBasicMaterial({ color: 0xffce82, depthTest: false }),
        );
        dot.position.copy(point);
        annotations.add(dot);
        label(point, `${i + 1}`, '#ffce82');
      });
      for (const m of p.measurements) {
        if (m.circle) {
          circle(m.circle, '#ffce82');
          label(m.circle.center, `Ø ${fmt(m.value)}`, '#ffce82');
        } else dimension(m.points[0], m.points[1], fmt(m.value), '#ffce82');
      }
    };
    const project = (point: T.Vector3) => point.clone().project(camera);
    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      controls.update();
      updateAnnotations();
      renderer.render(scene, camera);
      for (const l of labels) {
        const p = project(l.point);
        l.element.hidden = p.z > 1 || p.z < -1;
        l.element.style.left = `${(p.x * 0.5 + 0.5) * container.clientWidth}px`;
        l.element.style.top = `${(-p.y * 0.5 + 0.5) * container.clientHeight}px`;
      }
    };
    const observer = new ResizeObserver(() => {
      const w = container.clientWidth,
        h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    observer.observe(container);
    camera.aspect = container.clientWidth / container.clientHeight;
    setView('iso');
    render();
    let down = [0, 0];
    const pointerDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const pointerUp = (e: PointerEvent) => {
      if (
        Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 ||
        e.button !== 0
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect(),
        ray = new T.Raycaster();
      ray.setFromCamera(
        new T.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      if (latest.current.mode === 'orbit') {
        if (!latest.current.showHoles || !latest.current.model?.holes.length)
          return;
        let bestHole: number | null = null;
        let bestDist = Infinity;
        latest.current.model.holes.forEach((hole, idx) => {
          const s = project(hole.center);
          if (s.z > -1 && s.z < 1) {
            const px = (s.x * 0.5 + 0.5) * rect.width;
            const py = (-s.y * 0.5 + 0.5) * rect.height;
            const d = Math.hypot(
              e.clientX - rect.left - px,
              e.clientY - rect.top - py,
            );
            if (d < 35 && d < bestDist) {
              bestDist = d;
              bestHole = idx;
            }
          }
          const plane = new T.Plane().setFromNormalAndCoplanarPoint(
            hole.normal,
            hole.center,
          );
          const hitPt = new T.Vector3();
          if (ray.ray.intersectPlane(plane, hitPt)) {
            const rDist = hitPt.distanceTo(hole.center);
            if (rDist <= hole.radius * 1.3) {
              const camDist = hitPt.distanceTo(camera.position);
              if (camDist < bestDist) {
                bestDist = camDist;
                bestHole = idx;
              }
            }
          }
        });
        if (bestHole !== null) {
          latest.current.onSelectHole?.(bestHole);
        }
        return;
      }
      const hit = ray.intersectObject(mesh)[0];
      if (!hit) return;
      // Snap to a nearby triangle vertex for repeatable rim measurements.
      let point = hit.point;
      if (hit.face) {
        const pos = mesh.geometry.getAttribute('position');
        let best = 12;
        for (const i of [hit.face.a, hit.face.b, hit.face.c]) {
          const v = new T.Vector3().fromBufferAttribute(pos, i),
            s = project(v);
          const d = Math.hypot(
            (s.x * 0.5 + 0.5) * rect.width - (e.clientX - rect.left),
            (-s.y * 0.5 + 0.5) * rect.height - (e.clientY - rect.top),
          );
          if (d < best) {
            best = d;
            point = v;
          }
        }
      }
      latest.current.onPick(point.clone());
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    props.api.current = {
      view: setView,
      export: () => {
        renderer.render(scene, camera);
        const canvas = document.createElement('canvas');
        canvas.width = renderer.domElement.width;
        canvas.height = renderer.domElement.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(renderer.domElement, 0, 0);
        const ratio = canvas.width / container.clientWidth;
        ctx.font = `600 ${13 * ratio}px system-ui`;
        ctx.textAlign = 'center';
        for (const l of labels) {
          const p = project(l.point);
          if (p.z > 1 || p.z < -1) continue;
          const x = (p.x * 0.5 + 0.5) * canvas.width,
            y = (-p.y * 0.5 + 0.5) * canvas.height,
            width = ctx.measureText(l.text).width;
          ctx.fillStyle = '#172023';
          ctx.fillRect(
            x - width / 2 - 7 * ratio,
            y - 12 * ratio,
            width + 14 * ratio,
            24 * ratio,
          );
          ctx.fillStyle = l.color;
          ctx.fillText(l.text, x, y + 4 * ratio);
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = '#c5f16a';
        ctx.fillText('PARTSCOPE / DIMENSION PREVIEW', 20 * ratio, 30 * ratio);
        const anchor = document.createElement('a');
        anchor.download = 'partscope-dimensions.png';
        anchor.href = canvas.toDataURL('image/png');
        anchor.click();
      },
    };
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposeAnnotations();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.remove();
      renderer.dispose();
      material.dispose();
      edges.geometry.dispose();
      (edges.material as T.Material).dispose();
      grid.geometry.dispose();
      (grid.material as T.Material).dispose();
      props.api.current = null;
    };
  }, [props.model]);
  return (
    <div
      ref={host}
      className={`three-stage ${props.mode !== 'orbit' ? 'measuring' : ''}`}
      role="img"
      aria-label="Interactive 3D model. Drag to rotate, scroll to zoom, right-drag to pan. Use the view buttons for preset angles."
    />
  );
}
