# simpleMOBA

## Map Editor

A standalone map editor is available at `/editor` (or `http://localhost:3000/editor` when the server is running).

### How to use

1. **Select a tile type** from the toolbar: Grass, Water, Wall, Spawn, or Enemy Spawn.
2. **Place tiles** by clicking on the grid. Click and drag to paint continuously.
3. **Wall settings** — when Wall is selected, choose horizontal/vertical orientation and set length (number of tiles). Walls repeat end-to-end as you drag.
4. **Water settings** — set the brush width and height in tiles. Water rectangles repeat as you drag.
5. **Placement size** — change the pixel size (4–64 px) used when placing tiles. Grid cell size stays fixed at 16 px.
6. **Save** — sends the map to the server (writes to `maps/default.json`).
7. **Start Over** — resets the map to an empty grass grid.
8. **Upload** — select a `.json` map file to import it.
9. **Pan** — use arrow keys or WASD to pan the camera across the 64×48 map.

### Map data format

Maps are stored as a 2D array of tile IDs (integers 0–4):

| ID | Type       | Walkable | Description           |
|----|------------|----------|-----------------------|
| 0  | Grass      | Yes      | Default terrain       |
| 1  | Water      | No       | Unwalkable obstacle   |
| 2  | Wall       | No       | Unwalkable obstacle   |
| 3  | Spawn      | Yes      | Player spawn point    |
| 4  | Enemy Spawn| Yes      | Enemy spawn point     |

Example structure:
```json
{
  "width": 64,
  "height": 48,
  "tileSize": 16,
  "tiles": [[0,0,0,...],[...],...]
}
```

### Storage

- Maps are saved to `maps/default.json` on the server.
- The `maps/` directory is created automatically on first save.
- Maps are also broadcast to all connected Socket.IO clients via `mapUpdate` event.

### Limitations (v2)

- No undo/redo
- Single map file (`default.json`)
- No selection/copy/paste
- Camera pan (arrow keys / WASD) supported


## Todo List
- [x] Harita Editoru
- [ ] Path Finding
- [ ] Chat to build backend for sockets. [Chat location](https://raw.githubusercontent.com/pegasuspect/simpleMOBA/main/screenshots/2023-04-25_17-08-40.png)
- [ ] If chat is working use the logic to build mulltiplayer moving circles

# Next Meeting
Create a chat client for the game using sockets on
1. AWS
2. Vultr

Compare the cost and maybe performance.

## Useful Links
- https://gabrielgambetta.com/client-server-game-architecture.html
