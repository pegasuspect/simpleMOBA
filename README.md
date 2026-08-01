# simpleMOBA


## Todo List
- [ ] Map Editor
- [ ] Path Finding
- [ ] Chat to build backend for sockets. [Chat location](https://raw.githubusercontent.com/pegasuspect/simpleMOBA/main/screenshots/2023-04-25_17-08-40.png)
- [ ] If chat is working use the logic to build mulltiplayer moving circles

### Map Editor TODOS
#### Phase-1: Create the Editor Page & Preview
1. Implement the same UI with camera movement, with a different route for map editor.
1. Place a default spawn point Indicated as (X) where the player spawns in the actual game.
1. Allow moving the map with arrow keys.
1. Put a toggle button wth label; Preview, to run the game with the map in the editor. Essentially, starting the game on the editor's page.
1. Once the toggle is switched back, ensure the game stops, player(s) are removed and previos state of the editor is shown with the spawn point.

#### Phase-2: Create Endpoints for Map Data
1. Create `GET /map-state` that reads and returns the contents of `map-state.json`
1. Create an enpoint for `POST /save-map` which overrides `map-state.json`

#### Phase-3: Add Editor Toolbar with Default Objects; Spawn, Map Area
1. Add a toolbar on the top, outside the game area.
1. Toolbar should have 1 button and an input for map area, initially. There will be about 4-5 buttons/controls at least later on so account for that space.
1. Read the map state from the server. Place the map's objects on the editor. There will be spawn locaiton and map size initially. If they don't exist set them to whatever is used in the game.
1. Add a button called [Spawn].
    1. If spawn data was returned from `GET /map-state` replace this button's text with 'Remove Spawn'. If "Remove Spawn" is pressed:
        1. Remove the spawn location from current map state.
        1. Disable all other controls.
        1. Replace button label "Remove Spawn" with "Place Spawn".
        1. While moving the mouse over the map area move the spawn location with mouse.
        1. Once clicked place spaw location and restore the button label as "Remove Spawn" again.
    1. Otherwise, if there wasn't spawn data from the GET endpoint, and follow steps at Phase-3 4.1.1-5
1. Add a text input.
    1. If map size data is returned from `GET /map-state` then set the inputs value to it. Otherwise, set it's value to a default. Set the default to whatever current game runs in pixels.
    1. Validate that it always has 2 integers devided by 'x'.
    1. The size reads `${length}x${width}`.

#### Phase-4: Add Wall Control
1. Add a button caller [Walls]
1. If this button is pushed swith to wall placement mode, and keep the button pressed.
1. Wall Placement Mode:
    1. This mode should add walls to the map by drawing a line. When moving the mouse nothing happens. After one click it places a start location, then moving the mouse around should draw a line between start location and the current mouse location until a second click is pressed which sets the end location. Save this onto map state object as a new wall between start location and end location.
    1. Save the new wall object to the server with `POST /save-map`
1. Once the Preview is toggled make sure the player cannot go over the wall boundaries. So update the collision logic for that if it needs update.
    

# Next Meeting
Create a chat client for the game using sockets on
1. AWS
2. Vultr

Compare the cost and maybe performance.

## Useful Links
- https://gabrielgambetta.com/client-server-game-architecture.html
