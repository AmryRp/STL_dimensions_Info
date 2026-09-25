import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Upload,
  ArrowUpRight,
  Scan,
  Ruler,
  CircleDashed,
  RotateCcw,
  Layers3,
  Download,
  X,
  Check,
  ChevronDown,
  MousePointer2,
  ShieldCheck,
  CircleHelp,
  Move3D,
  Maximize,
  LoaderCircle,
  Plus,
} from 'lucide-react';
import * as T from 'three';
import ModelViewer, {
  type Measurement,
  type ViewerApi,
  type View,
} from '../components/model-viewer';
import {
  demoModel,
  circleFromThree,
  UNITS,
  formatLength,
  type Unit,
  type Model,
} from '../lib/measurement';
import { loadModel } from '../lib/load-model';

export default function App() {
  const [model, setModel] = useState<Model | null>(null);
  const [name, setName] = useState('Mounting plate'),
    [isDemo, setIsDemo] = useState(true),
    [bytes, setBytes] = useState(0);
  const [unit, setUnit] = useState<Unit>('mm'),
    [sourceUnit, setSourceUnit] = useState<Unit>('m');
  const [precision, setPrecision] = useState(3),
    [fixedPrecision, setFixedPrecision] = useState(true);
  const [note, setNote] = useState('Default scale in meters. Confirm or change source scale below.');
  const [dimensions, setDimensions] = useState(true),
    [holes, setHoles] = useState(true),
    [grid, setGrid] = useState(true),
    [wireframe, setWireframe] = useState(false);
  const [selected, setSelected] = useState<number | null>(0),
    [mode, setMode] = useState<'orbit' | 'distance' | 'diameter'>('orbit');
  const [picked, setPicked] = useState<T.Vector3[]>([]),
    [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [dragging, setDragging] = useState(false),
    [help, setHelp] = useState(false),
    [view, setView] = useState<View>('iso');
  const input = useRef<HTMLInputElement>(null),
    api = useRef<ViewerApi | null>(null),
    loading = useRef(false),
    counter = useRef(0);
  useEffect(() => {
    setModel(demoModel());
  }, []);
  useEffect(() => () => model?.geometry.dispose(), [model]);
  const fmt = (value: number) =>
    formatLength(value * UNITS[sourceUnit], unit, precision, fixedPrecision);
  const load = async (files: File[]) => {
    if (loading.current || !files.length) return;
    loading.current = true;
    setBusy(true);
    setError('');
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const result = await loadModel(files);
      setModel(result.model);
      setName(result.name);
      setBytes(result.bytes);
      setSourceUnit(result.sourceUnit);
      setNote(result.note);
      setIsDemo(false);
      setSelected(null);
      setMeasurements([]);
      setPicked([]);
      setMode('orbit');
      setView('iso');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load this model.');
    } finally {
      setBusy(false);
      loading.current = false;
    }
  };
  const selectMode = (next: typeof mode) => {
    setMode(next);
    setPicked([]);
    setError('');
  };
  const onPick = useCallback(
    (point: T.Vector3) => {
      const points = [...picked, point];
      setError('');
      if (mode === 'distance' && points.length === 2) {
        setMeasurements((prev) => [
          ...prev,
          {
            id: ++counter.current,
            kind: 'distance',
            value: points[0].distanceTo(points[1]),
            points,
            delta: new T.Vector3().subVectors(points[1], points[0]),
          },
        ]);
        setPicked([]);
      } else if (mode === 'diameter' && points.length === 3) {
        const circle = circleFromThree(
          ...(points as [T.Vector3, T.Vector3, T.Vector3]),
        );
        if (!circle) {
          setError(
            'These points are too close or form a straight line. Pick three spaced points on one circular rim.',
          );
          setPicked([]);
          return;
        }
        setMeasurements((prev) => [
          ...prev,
          {
            id: ++counter.current,
            kind: 'diameter',
            value: circle.radius * 2,
            points,
            circle,
          },
        ]);
        setPicked([]);
      } else setPicked(points);
    },
    [mode, picked],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPicked([]);
        setMode('orbit');
        setHelp(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  // Optional WebMCP surface shares the exact state shown in the inspector.
  useEffect(() => {
    type Context = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: 'read_model_dimensions',
        description:
          'Read the loaded mesh overall dimensions and detected hole diameters in the current display unit.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => ({
          name,
          unit,
          precision,
          dimensions: model?.size
            .toArray()
            .map((v) => (v * UNITS[sourceUnit]) / UNITS[unit]),
          leftToRight: model
            ? (model.size.x * UNITS[sourceUnit]) / UNITS[unit]
            : 0,
          frontToBack: model
            ? (model.size.y * UNITS[sourceUnit]) / UNITS[unit]
            : 0,
          topToBottom: model
            ? (model.size.z * UNITS[sourceUnit]) / UNITS[unit]
            : 0,
          holeDiameters: model?.holes.map(
            (h) => (h.radius * 2 * UNITS[sourceUnit]) / UNITS[unit],
          ),
          selectedHole:
            selected !== null && model?.holes[selected]
              ? {
                  index: selected + 1,
                  diameter:
                    (model.holes[selected].radius * 2 * UNITS[sourceUnit]) /
                    UNITS[unit],
                  radius:
                    (model.holes[selected].radius * UNITS[sourceUnit]) /
                    UNITS[unit],
                  circumference:
                    (2 *
                      Math.PI *
                      model.holes[selected].radius *
                      UNITS[sourceUnit]) /
                    UNITS[unit],
                  center: {
                    x:
                      (model.holes[selected].center.x * UNITS[sourceUnit]) /
                      UNITS[unit],
                    y:
                      (model.holes[selected].center.y * UNITS[sourceUnit]) /
                      UNITS[unit],
                    z:
                      (model.holes[selected].center.z * UNITS[sourceUnit]) /
                      UNITS[unit],
                  },
                }
              : null,
        }),
      },
      {
        name: 'select_hole',
        description:
          'Select a detected hole by 1-based index (or null to deselect) to inspect its detailed measurements.',
        inputSchema: {
          type: 'object',
          properties: {
            index: { type: ['integer', 'null'], minimum: 1 },
          },
          required: ['index'],
          additionalProperties: false,
        },
        execute: async (input: unknown) => {
          const idx = (input as { index?: number | null })?.index;
          if (idx === null || idx === undefined) {
            setSelected(null);
            return { selected: null };
          }
          if (!model || idx < 1 || idx > model.holes.length)
            throw new Error(
              `Hole index out of range. 1 to ${model?.holes.length ?? 0}`,
            );
          setSelected(idx - 1);
          setHoles(true);
          return { selected: idx };
        },
      },
      {
        name: 'set_display_unit',
        description:
          'Change the displayed measurement unit without resizing the model.',
        inputSchema: {
          type: 'object',
          properties: { unit: { type: 'string', enum: Object.keys(UNITS) } },
          required: ['unit'],
          additionalProperties: false,
        },
        execute: async (input: unknown) => {
          const value = (input as { unit?: string })?.unit;
          if (!value || !Object.hasOwn(UNITS, value))
            throw new Error('Unsupported unit');
          setUnit(value as Unit);
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          return { unit: value };
        },
      },
      {
        name: 'set_precision',
        description:
          'Set measurement decimal precision (1 to 4) and fixed decimal display.',
        inputSchema: {
          type: 'object',
          properties: {
            decimals: { type: 'number', minimum: 0, maximum: 6 },
            fixed: { type: 'boolean' },
          },
          required: ['decimals'],
          additionalProperties: false,
        },
        execute: async (input: unknown) => {
          const val = input as { decimals?: number; fixed?: boolean };
          if (typeof val.decimals === 'number') {
            setPrecision(Math.max(0, Math.min(6, Math.round(val.decimals))));
          }
          if (typeof val.fixed === 'boolean') {
            setFixedPrecision(val.fixed);
          }
          return { precision: val.decimals, fixed: val.fixed ?? fixedPrecision };
        },
      },
    ];
    for (const tool of tools)
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Browser implementation is optional. */
      }
    return () => lifecycle.abort();
  }, [model, name, unit, sourceUnit, precision, fixedPrecision]);
  const chooseView = (next: View) => {
    setView(next);
    api.current?.view(next);
  };
  return (
    <div
      className="app-shell"
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes('Files')) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void load(Array.from(event.dataTransfer.files));
      }}
    >
      <header className="topbar">
        <a className="brand" href="/" aria-label="Partscope home">
          <span className="brand-icon">
            <Box size={23} />
          </span>
          <span>
            partscope<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-title">
          <span className="divider" />
          3D measurement studio
        </div>
        <div className="top-actions">
          <span className="privacy">
            <span className="status-dot" />
            Files stay on your device
          </span>
          <button
            className="icon-button help-button"
            aria-label="Measurement guide"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={20} />
          </button>
          <button
            className="primary-button"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            <Upload size={17} />
            Import model
          </button>
        </div>
      </header>
      <input
        ref={input}
        type="file"
        multiple
        accept=".stl,.obj,.glb,.gltf,.3mf,.bin,.png,.jpg,.jpeg,.webp,.ktx2"
        className="visually-hidden"
        aria-label="Import model files"
        onChange={(event) => {
          void load(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <main className="workspace">
        <section className="preview-panel" aria-label="3D preview">
          <div className="preview-heading">
            <div>
              <div className="eyebrow">MODEL WORKSPACE</div>
              <h1>
                {name} {isDemo && <span className="sample-badge">SAMPLE</span>}
              </h1>
            </div>
            <button
              className="quiet-button export"
              onClick={() => api.current?.export()}
              disabled={!model || busy}
            >
              <Download size={16} />
              Save image
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="viewport">
            <div className="canvas-caption">
              <span className="status-dot" />{' '}
              {busy ? 'Reading model…' : 'Perspective preview'}
              <span className="caption-divider">/</span>
              <span>{wireframe ? 'Wireframe' : 'Solid'}</span>
            </div>
            {model && (
              <ModelViewer
                model={model}
                unit={unit}
                scale={UNITS[sourceUnit]}
                precision={precision}
                fixedPrecision={fixedPrecision}
                dimensions={dimensions}
                showHoles={holes}
                grid={grid}
                wireframe={wireframe}
                selected={selected}
                onSelectHole={setSelected}
                mode={mode}
                picked={picked}
                measurements={measurements}
                onPick={onPick}
                onError={setError}
                api={api}
              />
            )}
            <div className="view-switcher" aria-label="Camera views">
              {(['iso', 'top', 'front', 'right'] as const).map((v) => (
                <button
                  key={v}
                  className={view === v ? 'active' : ''}
                  onClick={() => chooseView(v)}
                >
                  {v === 'iso' ? '3D' : v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
              <button
                aria-label="Fit model in view"
                onClick={() => chooseView(view)}
              >
                <Maximize size={16} />
              </button>
            </div>
            <div className="viewport-tools">
              <button
                title="Rotate and navigate"
                aria-label="Rotate and navigate"
                aria-pressed={mode === 'orbit'}
                className={mode === 'orbit' ? 'active' : ''}
                onClick={() => selectMode('orbit')}
              >
                <MousePointer2 size={19} />
              </button>
              <span />
              <button
                title="Measure two points"
                aria-label="Measure distance"
                aria-pressed={mode === 'distance'}
                className={mode === 'distance' ? 'active' : ''}
                onClick={() => selectMode('distance')}
              >
                <Ruler size={20} />
              </button>
              <button
                title="Measure a circle with three points"
                aria-label="Measure diameter"
                aria-pressed={mode === 'diameter'}
                className={mode === 'diameter' ? 'active' : ''}
                onClick={() => selectMode('diameter')}
              >
                <CircleDashed size={20} />
              </button>
              <span />
              <button
                title="Reset view"
                aria-label="Reset view"
                onClick={() => chooseView('iso')}
              >
                <RotateCcw size={18} />
              </button>
            </div>
            <div className="axis-widget">
              <span className="axis-z">Z</span>
              <Move3D size={42} strokeWidth={1.2} />
              <span className="axis-x">X</span>
              <span className="axis-y">Y</span>
            </div>
            {mode !== 'orbit' && (
              <div className="measure-prompt">
                <span className="status-dot" />
                {mode === 'distance'
                  ? `Select ${picked.length === 0 ? 'first' : 'second'} point on the model`
                  : `Select rim point ${picked.length + 1} of 3`}
                <button
                  onClick={() => selectMode('orbit')}
                  aria-label="Stop measuring"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {busy && (
              <div className="loading-cover">
                <LoaderCircle className="spin" size={30} />
                <strong>Reading your model</strong>
                <span>Preparing geometry and circular features…</span>
              </div>
            )}
          </div>
          <div className="viewport-footer">
            <span>
              <MousePointer2 size={14} />
              Drag to orbit <i /> Scroll to zoom <i /> Right-drag to pan
            </span>
            <span className="mesh-status">
              <span className="status-dot" />
              {model
                ? new Intl.NumberFormat().format(model.triangles)
                : '—'}{' '}
              triangles
            </span>
          </div>
          <div className="import-strip">
            <div className="import-glyph">
              <Layers3 size={23} />
            </div>
            <div>
              <strong>Your next print, from every angle.</strong>
              <p>
                Drop a model anywhere, or{' '}
                <button onClick={() => input.current?.click()}>
                  browse files
                </button>
              </p>
            </div>
            <span className="formats">STL · 3MF · OBJ · GLB · GLTF</span>
          </div>
        </section>
        <aside className="inspector">
          <div className="inspector-heading">
            <span>
              <Scan size={18} />
              Inspector
            </span>
            <span className="live-tag">LIVE</span>
          </div>
          <section className="inspector-section units-section">
            <div className="section-heading">
              <h2>Display units & precision</h2>
              <Ruler size={16} />
            </div>
            <div className="unit-control">
              <div className="unit-pills">
                {(['mm', 'cm', 'm'] as Unit[]).map((u) => (
                  <button
                    className={unit === u ? 'active' : ''}
                    key={u}
                    onClick={() => setUnit(u)}
                  >
                    {u}
                  </button>
                ))}
              </div>
              <div className="select-wrap">
                <select
                  aria-label="Other display units"
                  value={['mm', 'cm', 'm'].includes(unit) ? '' : unit}
                  onChange={(e) => setUnit(e.target.value as Unit)}
                >
                  <option value="" disabled>
                    More
                  </option>
                  <option value="µm">µm</option>
                  <option value="in">inches</option>
                  <option value="ft">feet</option>
                </select>
                <ChevronDown size={13} />
              </div>
            </div>
            <div className="precision-control">
              <span className="precision-label">Precision</span>
              <div className="precision-pills">
                {[
                  { label: '0.1', value: 1 },
                  { label: '0.01', value: 2 },
                  { label: '0.001', value: 3 },
                  { label: '0.0001', value: 4 },
                ].map((p) => (
                  <button
                    className={precision === p.value ? 'active' : ''}
                    key={p.value}
                    onClick={() => setPrecision(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="toggle-row precision-toggle">
              <span>Show exact decimals</span>
              <input
                type="checkbox"
                checked={fixedPrecision}
                onChange={(e) => setFixedPrecision(e.target.checked)}
              />
              <span className="toggle" aria-hidden="true" />
            </label>
          </section>
          <section className="inspector-section">
            <div className="section-heading">
              <h2>Overall dimensions</h2>
              <span className="tiny-label">BOUNDING BOX</span>
            </div>
            <div className="dimensions-list">
              {[
                {
                  axis: 'x' as const,
                  label: 'Left to Right',
                  secondary: 'Width · X',
                  badge: 'X',
                },
                {
                  axis: 'y' as const,
                  label: 'Front to Back',
                  secondary: 'Depth · Y',
                  badge: 'Y',
                },
                {
                  axis: 'z' as const,
                  label: 'Top to Bottom',
                  secondary: 'Height · Z',
                  badge: 'Z',
                },
              ].map(({ axis, label, secondary, badge }) => (
                <div key={axis} className="dimension-row">
                  <span className={`axis-badge ${axis}`}>{badge}</span>
                  <div className="dimension-info">
                    <span className="dimension-direction">{label}</span>
                    <span className="dimension-sub">{secondary}</span>
                  </div>
                  <strong>
                    {model ? fmt(model.size[axis]) : '—'}
                    <small>{unit}</small>
                  </strong>
                </div>
              ))}
            </div>
            {model && (
              <div className="bbox-summary">
                <span className="bbox-label">Bounding box (W × D × H)</span>
                <span className="bbox-value">
                  {fmt(model.size.x)} × {fmt(model.size.y)} × {fmt(model.size.z)} {unit}
                </span>
              </div>
            )}
            <p className="section-note">
              Precision bounding box aligned to model axes: X (left–right), Y (front–back), Z (top–bottom).
            </p>
          </section>
          <section className="inspector-section holes-section">
            <div className="section-heading">
              <h2>
                Circular holes{' '}
                <span className="count-badge">{model?.holes.length ?? 0}</span>
              </h2>
              <span className="detected-label">
                <span className="status-dot" />
                Detected
              </span>
            </div>
            <div className="hole-list">
              {model?.holes.map((hole, index) => (
                <button
                  className={`hole-row ${selected === index ? 'selected' : ''}`}
                  key={index}
                  onClick={() => {
                    setSelected(index === selected ? null : index);
                    setHoles(true);
                  }}
                >
                  <span className="hole-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>Hole {index + 1}</span>
                  <strong>
                    Ø {fmt(hole.radius * 2)}
                    <small>{unit}</small>
                  </strong>
                  {selected === index ? (
                    <Check size={14} />
                  ) : (
                    <span className="hole-check" />
                  )}
                </button>
              ))}
            </div>
            {selected !== null && model?.holes[selected] && (() => {
              const h = model.holes[selected];
              const diam = h.radius * 2;
              const rad = h.radius;
              const circum = 2 * Math.PI * rad;
              const radInDisplayUnit = (rad * UNITS[sourceUnit]) / UNITS[unit];
              const area = Math.PI * radInDisplayUnit * radInDisplayUnit;
              const areaFormatted = new Intl.NumberFormat('en', {
                minimumFractionDigits: fixedPrecision ? precision : 0,
                maximumFractionDigits: precision,
              }).format(area);

              const fromLeft = h.center.x + model.size.x / 2;
              const fromRight = model.size.x / 2 - h.center.x;
              const fromFront = h.center.y + model.size.y / 2;
              const fromBack = model.size.y / 2 - h.center.y;
              const fromBottom = h.center.z;
              const fromTop = model.size.z - h.center.z;

              return (
                <div className="selected-hole-card">
                  <div className="selected-hole-header">
                    <div className="selected-hole-title">
                      <span className="hole-badge">Hole {selected + 1}</span>
                      <span className="selected-hole-tag">Selected Hole</span>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setSelected(null)}
                      title="Deselect hole"
                    >
                      Deselect
                    </button>
                  </div>

                  <div className="selected-hole-grid">
                    <div className="hole-stat">
                      <span className="stat-label">Diameter (Ø)</span>
                      <strong className="stat-value highlight">
                        {fmt(diam)} <small>{unit}</small>
                      </strong>
                    </div>
                    <div className="hole-stat">
                      <span className="stat-label">Radius (R)</span>
                      <strong className="stat-value">
                        {fmt(rad)} <small>{unit}</small>
                      </strong>
                    </div>
                    <div className="hole-stat">
                      <span className="stat-label">Circumference</span>
                      <strong className="stat-value">
                        {fmt(circum)} <small>{unit}</small>
                      </strong>
                    </div>
                    <div className="hole-stat">
                      <span className="stat-label">Cross Area</span>
                      <strong className="stat-value">
                        {areaFormatted} <small>{unit}²</small>
                      </strong>
                    </div>
                  </div>

                  <div className="selected-hole-coords">
                    <span className="coords-title">Center Coordinates</span>
                    <div className="coords-row">
                      <span>X: <strong>{fmt(h.center.x)} {unit}</strong></span>
                      <span>Y: <strong>{fmt(h.center.y)} {unit}</strong></span>
                      <span>Z: <strong>{fmt(h.center.z)} {unit}</strong></span>
                    </div>
                  </div>

                  <div className="selected-hole-offsets">
                    <span className="coords-title">Offsets to Outer Edges</span>
                    <div className="offsets-grid">
                      <div><span>Left (X-):</span> <strong>{fmt(fromLeft)} {unit}</strong></div>
                      <div><span>Right (X+):</span> <strong>{fmt(fromRight)} {unit}</strong></div>
                      <div><span>Front (Y-):</span> <strong>{fmt(fromFront)} {unit}</strong></div>
                      <div><span>Back (Y+):</span> <strong>{fmt(fromBack)} {unit}</strong></div>
                      <div><span>Bottom (Z-):</span> <strong>{fmt(fromBottom)} {unit}</strong></div>
                      <div><span>Top (Z+):</span> <strong>{fmt(fromTop)} {unit}</strong></div>
                    </div>
                  </div>

                  <div className="selected-hole-actions">
                    <button
                      type="button"
                      className="outline-button full"
                      onClick={() => {
                        const newMeasurement: Measurement = {
                          id: ++counter.current,
                          kind: 'diameter',
                          value: h.radius * 2,
                          points: h.points,
                          circle: h,
                        };
                        setMeasurements((prev) => [...prev, newMeasurement]);
                      }}
                    >
                      <Plus size={14} /> Pin diameter to measurements
                    </button>
                    <button
                      type="button"
                      className="outline-button full"
                      onClick={() => {
                        selectMode('distance');
                        setPicked([h.center.clone()]);
                      }}
                    >
                      <Ruler size={14} /> Measure distance from center
                    </button>
                  </div>
                </div>
              );
            })()}
            {!model?.holes.length && (
              <p className="empty-holes">
                {model?.detectionSkipped
                  ? 'Auto-detection is skipped for meshes over 180,000 triangles. Use the diameter tool.'
                  : 'No circular hole rims detected. Use the three-point diameter tool to measure a rim.'}
              </p>
            )}
            <p className="section-note">
              Estimated from circular mesh rims. Chamfers, rough meshes, and
              curved openings may need manual measurement.
            </p>
            <button
              className={`outline-button full ${mode === 'diameter' ? 'selected' : ''}`}
              onClick={() =>
                selectMode(mode === 'diameter' ? 'orbit' : 'diameter')
              }
            >
              <CircleDashed size={16} />
              Measure diameter manually
              <ArrowUpRight size={14} />
            </button>
          </section>
          <section className="inspector-section">
            <div className="section-heading">
              <h2>Preview overlays</h2>
              <Layers3 size={16} />
            </div>
            {[
              { label: 'Dimensions', state: dimensions, set: setDimensions },
              { label: 'Hole diameters', state: holes, set: setHoles },
              { label: 'Build grid', state: grid, set: setGrid },
              { label: 'Wireframe', state: wireframe, set: setWireframe },
            ].map((item) => (
              <label className="toggle-row" key={item.label}>
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={item.state}
                  onChange={(e) => item.set(e.target.checked)}
                />
                <span className="toggle" aria-hidden="true" />
              </label>
            ))}
          </section>
          <section className="inspector-section source-section">
            <div className="section-heading">
              <h2>Source scale</h2>
              <div className="select-wrap">
                <select
                  aria-label="Source model unit"
                  value={sourceUnit}
                  onChange={(e) => setSourceUnit(e.target.value as Unit)}
                >
                  {Object.keys(UNITS).map((u) => (
                    <option value={u} key={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </div>
            </div>
            <p className="section-note">
              {note} One model unit = {UNITS[sourceUnit]} mm.
            </p>
          </section>
          {measurements.length > 0 && (
            <section className="inspector-section">
              <div className="section-heading">
                <h2>Manual measurements</h2>
                <button
                  className="text-button"
                  onClick={() => setMeasurements([])}
                >
                  Clear
                </button>
              </div>
              {measurements.map((m, i) => (
                <div className="manual-item" key={m.id}>
                  <div className="manual-row">
                    <span>
                      {m.kind === 'diameter' ? 'Ø' : 'Distance'} {i + 1}
                    </span>
                    <strong>
                      {fmt(m.value)} <small>{unit}</small>
                    </strong>
                    <button
                      aria-label={`Remove measurement ${i + 1}`}
                      onClick={() =>
                        setMeasurements((prev) =>
                          prev.filter((x) => x.id !== m.id),
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {m.delta && (
                    <div className="manual-delta">
                      <span>L↔R: {fmt(Math.abs(m.delta.x))} {unit}</span>
                      <span>F↗B: {fmt(Math.abs(m.delta.y))} {unit}</span>
                      <span>T↕B: {fmt(Math.abs(m.delta.z))} {unit}</span>
                    </div>
                  )}
                </div>
              ))}
              <p className="section-note">
                Points snap to nearby triangle vertices. Pick three spaced
                points on the same rim for a diameter.
              </p>
            </section>
          )}
          <div className="inspector-bottom">
            <ShieldCheck size={16} />
            <span>Local processing. No account needed.</span>
          </div>
        </aside>
      </main>
      <footer className="app-footer">
        <span>
          PARTSCOPE <span>/</span> MADE FOR THE DETAILS
        </span>
        <span>
          {isDemo
            ? 'Sample: 90 × 60 × 8 mm mounting plate'
            : `${name} · ${(bytes / 1024 / 1024).toFixed(2)} MB`}
          <span className="footer-separator" />
          Mesh measurements are approximate
        </span>
      </footer>
      {error && (
        <div className="error-toast" role="alert">
          <CircleHelp size={20} />
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error">
            <X size={18} />
          </button>
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <div>
            <Upload size={40} />
            <h2>Drop your model here</h2>
            <p>STL, OBJ, GLB, GLTF, or 3MF · up to 100 MB</p>
            <p>For GLTF, include its .bin and texture files.</p>
          </div>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              autoFocus
              onClick={() => setHelp(false)}
              aria-label="Close guide"
            >
              <X size={20} />
            </button>
            <div className="eyebrow">A QUICK GUIDE</div>
            <h2 id="help-title">Measure with confidence.</h2>
            <p>
              <strong>Import your model.</strong> Select STL, OBJ, GLB, GLTF, or
              3MF. For multi-file GLTF, select its .bin and images together.
              Static triangle geometry is measured; animations and materials are
              not previewed.
            </p>
            <p>
              <strong>Confirm source scale.</strong> Source scale defaults to
              meters. 3MF units come from the file metadata. Change source scale
              if your exporter used different units.
            </p>
            <p>
              <strong>Inspect holes.</strong> Automatic detection finds circular
              rims with inward-facing walls. It can miss chamfers, coarse
              meshes, or intersecting features. Opposite openings on the same
              axis and diameter are grouped.
            </p>
            <p>
              <strong>Measure manually.</strong> Use the ruler for a straight
              distance between two surface points. Use the circle tool to pick
              three well-spaced points on one rim. Nearby vertices snap within
              12 screen pixels. Press Escape to cancel.
            </p>
            <p>
              <strong>Save your view.</strong> Export an image with the visible
              measurements. These are mesh estimates, not manufacturing
              tolerances or a printability check.
            </p>
            <button
              className="primary-button full"
              onClick={() => setHelp(false)}
            >
              Got it
              <Check size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
