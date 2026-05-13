# Castle Codebase Overview

## Architecture

A **3D first-person medieval castle explorer** built with Three.js. No external build tools — pure ES6 modules loaded via import map.

```
castle/
├── index.html          ← Entry point, all UI/CSS
└── museum/
    ├── main.js         ← Game loop, input, portal logic
    ├── layout.js       ← Castle topology (tile grid, rooms, corridors)
    ├── scene.js        ← Three.js geometry, materials, room props
    ├── player.js       ← Tile-based movement state machine
    ├── minimap.js      ← Canvas minimap with fog-of-war
    ├── textures.js     ← Procedural texture generation (no image files)
    ├── tweaks-panel.jsx← Dev/debug panel (React, not wired up)
    └── bundle.js       ← Monolithic fallback (legacy, not used)
```

---

## Room Layout

```
  THRONE ROOM  (north)
       |
  ARMORY — HUB — LIBRARY
       |
  PORTAL ROOM  (south, links to wasapok.com via iframe)
```

Each room is 7×7 tiles (hub is 5×5), connected by 2-tile-wide corridors.

---

## Key Systems

| System | File | Notes |
|---|---|---|
| Tile grid | `layout.js` | `grid[y][x]` — 0=floor, 1=wall, -1=void |
| Variable ceilings | `layout.js` | Per-tile `ceilH` — hub/library are taller |
| Movement | `player.js` | Smooth tween between tiles, bump anim on walls |
| Sprint | `player.js` | Double-tap forward; FOV expands, headbob increases |
| Textures | `textures.js` | All procedural (stone, cobble, fire, stained glass, banners) — cached after first use |
| Portal | `main.js` | Iframe preloads at ≤4 tiles, fades in at ≤1.5, goes fullscreen when standing on it facing south |
| Minimap | `minimap.js` | Line-of-sight discovery up to 6 tiles |

---

## Input

- **Keyboard:** W/S (move), A/D (turn), Q/E (strafe), Shift (sprint)
- **Mobile:** Fixed D-pad + RUN button rendered in `index.html`

---

## Key Technical Decisions

- **Tile-based movement:** Discrete grid with smooth interpolated camera (feels responsive while maintaining grid snapping)
- **Procedural textures:** Eliminates asset dependencies, all generated on first use and cached
- **Instanced meshes:** Efficient rendering of many walls/ceilings
- **Variable ceiling heights:** Creates spatial drama (tall hub, tall library with stained glass)
- **Torch sprite flicker:** Real-time sine-based randomness, not animation sheet
- **Portal iframe fade:** Progressive visibility rather than hard cut, immersive transition
