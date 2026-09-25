# Partscope

A browser-based 3D print measurement workspace built with React, TypeScript, Vite, and Three.js. Models are processed locally; no backend or account is required.

## Run locally

Use Node.js 22.13 or newer (Node 22 LTS recommended).

```sh
npm install
npm run dev
```

Open the local address printed in the terminal.

## Deploy to Vercel

1. Push this directory to a Git repository and import it into Vercel.
2. Select **Vite** as the framework and **Node.js 22.x** as the runtime.
3. Use `npm run build` as the build command and `dist` as the output directory. These settings are already in `vercel.json`.
4. Deploy. No environment variables, databases, or API keys are needed.

Alternatively, run `npx vercel` from this directory and follow the login/project prompts. See [Vercel's Vite documentation](https://vercel.com/docs/frameworks/frontend/vite).

## Features

- Import binary/ASCII STL, OBJ, GLTF, GLB, and 3MF.
- Orbit, pan, zoom, fit, and top/front/right views.
- Overall X/Y/Z bounding dimensions with dimension lines in the preview.
- Automatic circular hole-rim detection and selectable diameter annotations.
- Two-point distance and three-point diameter tools; points snap to nearby mesh vertices within 12 screen pixels.
- Millimeters, centimeters, meters, micrometers, inches, and feet.
- Independent source-unit selection and display-unit conversion.
- Grid, wireframe, and overlay toggles.
- Download the current preview as a PNG with visible measurements.
- Responsive workspace with an included 90 × 60 × 8 mm sample plate.

## Units and import details

STL and OBJ do not encode a physical unit. They default to meters; confirm **Source scale** after import. GLTF/GLB use meters and Y-up, which is converted to Z-up for the build space. 3MF units are read from metadata. Changing **Display units** changes labels only. Changing **Source scale** changes the physical interpretation of model coordinates.

For multi-file GLTF, select the model and all referenced `.bin` and texture files together. Local assets resolve by relative path or unique filename. Remote asset fetching is blocked. Models using Draco, Meshopt, or KTX2 compression must be exported uncompressed. OBJ geometry is previewed with a neutral material; MTL is unnecessary. 3MF mixed-unit packages are rejected rather than silently mismeasured. Files are limited to 100 MB combined.

Measurements use static triangulated mesh geometry in the model's axes, not a minimum oriented bounding box or animation pose. Material appearance, animation, CAD constraints, and printability analysis are outside this app's scope.

## Measurement limits

Automatic detection requires a closed circular sharp rim of at least 12 segments with an inward-facing wall, planar within a small tolerance and within 1.2% radial fit tolerance. It may miss chamfers, intersecting holes, reversed normals, low-resolution meshes, and curved surfaces. Coaxial rims of the same radius are grouped; this can also group separate coaxial bores. Detection is skipped above 180,000 triangles to keep the page usable. Manual measurement remains available.

Three-point diameters depend on the points chosen. Use three well-separated vertices on the same rim. Results are mesh estimates, not machining tolerances or calibration certificates.

## Verification

```sh
npm test
npm run build
```

Tests cover known hole dimensions, circle fitting, degenerate points, unit conversion, transformed/instanced meshes, external cylinder rejection, and import fixtures. `npm run build` checks TypeScript and generates the static production files.

An optional feature-detected WebMCP surface exposes `read_model_dimensions` and `set_display_unit`. It is ignored in browsers without WebMCP. No supported WebMCP validation context was available during development; these optional contracts have not been runtime-verified.
