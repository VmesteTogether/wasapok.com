# Gnominium Chunk Viewer

A little browser tool that shows a full overworld **chunk** the way the game
builds one, and lets you reroll through the random possibilities:

- **floor tiles** (`overworldTile1-01..09`, 32×32) laid so **no two identical
  variants ever touch** (up / down / left / right),
- a **glass roof** of 64×64 panes (`overworldGlass-02`, "glass2") overlaid on top,
- **grassy walls** (`overworldWall1-*`) autotiled from a 16-way connection set —
  caps, centres, corners, T-junctions and the `middle_trans` cross — with walls
  that reach a border **opening straight out to the chunk edge** so chunks seam
  together,
- **sprites / decor** scattered on the tiles, each with its own frequency and a
  **spawn box** so nothing ever lands on a wall.

## Running it

Just open **`index.html`** in a browser (double-click it). No server needed —
the assets are baked into `assets.js`.

> If you opened it straight off disk and it says "No assets loaded", run
> `scan-assets.bat` once to (re)build `assets.js`, then refresh.

## Dropping in new art (the modular part)

Everything on screen comes from the four folders under `assets/`. To add or
swap art, drop `.png` files into the right folder and **run `scan-assets.bat`**
(or `scan-assets.ps1`), then refresh the page.

| Folder            | What goes here                        | Naming |
|-------------------|---------------------------------------|--------|
| `assets/tiles`    | floor tile variants                   | `<set>-<variant>.png` — e.g. `overworldTile1-10.png`. Files sharing a prefix form one selectable **tile set**. |
| `assets/walls`    | wall autotile pieces                  | `<theme>-<role>.png` — the **role** is the text after the first dash (see below). Files sharing a prefix form one **wall theme**. |
| `assets/glass`    | glass roof panes (64×64)              | any name; picked from the **Glass** dropdown |
| `assets/sprites`  | decor / scenery / props               | any name; each becomes a row with its own frequency + spawn-box sliders |

### Wall roles

A wall theme needs these 16 pieces (the role = filename after the first dash).
This is exactly the set already in `assets/walls`:

```
01 / 02            isolated / plain block
top_cap  bottom_cap  left_cap  right_cap        (dead ends)
center_vertical  center_horizontal              (straight runs)
left_top_trans  right_top_trans                 (corners)
left_bottom_trans  right_bottom_trans
top_right_left_trans   top_right_bottom_trans    (T-junctions)
top_bottom_left_trans  left_right_bottom_trans
middle_trans                                     (4-way cross)
```

To add a whole new wall theme (say a stone wall), drop
`stoneWall-top_cap.png`, `stoneWall-center_vertical.png`, … into
`assets/walls`, rescan, and pick **stoneWall** from the Theme dropdown.

The mask → piece mapping lives in one table (`AUTOTILE`) at the top of
`main.js`. Toggle **Overlays → Autotile test** to see every piece next to the
connections it's used for; if a new theme's art is rotated differently, that's
the only table to adjust.

## Controls

- **Reroll / Space** — new random chunk. **Seed** reproduces a specific one;
  **Auto-cycle** flips through them on a timer.
- **Chunk → Size** — chunk size in px (default 1024 = 32×32 tiles, same as the
  game's `global.chunk_size`). **Zoom** / **fit** for viewing.
- **Walls → Source** — *Procedural* (rooms + corridors, scales to any size) or
  *Authored templates* (your `rm1`–`rm9`, a fixed 32×32 grid → only at size 1024).
  **Density** controls how much wall the procedural generator lays down.
  **Open walls to chunk edge** toggles the seam behaviour.
- **Sprites** — global density, plus per-sprite **frequency** (0 removes it) and
  **box** size (the spawn footprint tested against walls). **Show spawn boxes**
  draws the footprints; **Keep on reroll** freezes sprite placements.
- **Export PNG** saves the current chunk at native resolution.

## How it maps back to the game

Read from `Documents\gnominium\gnominium`:

- chunk size, streaming and the flip logic → `objects/obj_game/Create_0.gml`,
  `scripts/chunkStreaming`, `scripts/generateChunk`
- wall templates `rm1`–`rm9` → extracted into `templates.js`
- the "don't spawn inside a wall" rule mirrors `generateChunk`'s
  `place_meeting(x, y, obj_wall)` rejection, here done with a spawn box.

Tiles-per-cell floor + the glass roof are **new** here (the game currently draws
one flat `spr_floor`), so this tool doubles as a place to design that look
before porting it into GameMaker.
