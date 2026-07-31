(function () {
  'use strict';

  // --- Configuration ---
  var COLS = 64;
  var ROWS = 48;
  var CANVAS_W = 640;
  var CANVAS_H = 480;
  var GRID_CELL = 16; // fixed grid cell size in px for grid lines & coord math

  // --- Tile type definitions ---
  var TILE_TYPES = [
    { id: 0, name: 'Grass',     color: '#4a7', walkable: true  },
    { id: 1, name: 'Water',     color: '#26d', walkable: false },
    { id: 2, name: 'Wall',      color: '#666', walkable: false },
    { id: 3, name: 'Spawn',     color: '#eee', walkable: true  },
    { id: 4, name: 'EnemySpawn',color: '#c33', walkable: true  }
  ];

  // --- Camera state (Raylib-style projection) ---
  var camX = 0, camY = 0;
  var camDirX = 1, camDirY = 0;
  var camRightX = 0, camRightY = 1;
  var cameraMoving = false;
  var cameraInterval = null;
  var CAM_SPEED = 2; // pixels per tick

  // --- Editor state ---
  var tileSize = GRID_CELL;       // per-tile placement size for selected type
  var cols = COLS;
  var rows = ROWS;
  var tiles = null;               // 2D array [row][col]
  var selectedTile = 0;
  var wallOrient = 'h';           // 'h' or 'v'
  var wallLength = 1;
  var waterCols = 2;
  var waterRows = 2;
  var isMouseDown = false;
  var lastPlacedCol = -1;
  var lastPlacedRow = -1;
  var hoverCol = -1;
  var hoverRow = -1;
  var mapData = null;             // loaded from file
  var placementSizes = {};        // { tileId: placementSizePx }
  var keysDown = {};              // track pressed keys

  // --- DOM refs ---
  var canvas = document.getElementById('map-canvas');
  var ctx = canvas.getContext('2d');
  var infoText = document.getElementById('info-text');
  var tileBtns = document.querySelectorAll('.tile-btn');
  var wallLenInput = document.getElementById('wall-length');
  var waterColsInput = document.getElementById('water-cols');
  var waterRowsInput = document.getElementById('water-rows');
  var tileSizeInput = document.getElementById('tile-size');
  var orientHBtn = document.getElementById('orient-h');
  var orientVBtn = document.getElementById('orient-v');
  var btnSave = document.getElementById('btn-save');
  var btnStartOver = document.getElementById('btn-start-over');
  var btnUpload = document.getElementById('btn-upload');
  var fileInput = document.getElementById('file-input');
  var wallSection = document.getElementById('wall-section');
  var waterSection = document.getElementById('water-section');

  // --- Initialize grid ---
  function createEmptyGrid() {
    var g = [];
    for (var r = 0; r < rows; r++) {
      g.push(Array(cols).fill(0));
    }
    return g;
  }

  // --- Camera helpers ---
  function centerCamera() {
    camX = (CANVAS_W - COLS * GRID_CELL) / 2;
    camY = (CANVAS_H - ROWS * GRID_CELL) / 2;
  }

  function startCameraPanning() {
    if (cameraInterval) return;
    cameraMoving = true;
    cameraInterval = setInterval(function () {
      if (!cameraMoving) return;
      camX += camDirX * CAM_SPEED;
      camY += camDirY * CAM_SPEED;
      clampCamera();
      drawGrid();
    }, 16);
  }

  function stopCameraPanning() {
    cameraMoving = false;
    if (cameraInterval) {
      clearInterval(cameraInterval);
      cameraInterval = null;
    }
  }

  function clampCamera() {
    var maxLeft = 0;
    var maxTop = 0;
    var maxRight = COLS * GRID_CELL - CANVAS_W;
    var maxBottom = ROWS * GRID_CELL - CANVAS_H;
    if (camX > maxLeft) camX = maxLeft;
    if (camY > maxTop) camY = maxTop;
    if (camX < maxRight) camX = maxRight;
    if (camY < maxBottom) camY = maxBottom;
  }

  function screenToGrid(screenX, screenY) {
    var worldX = screenX - camX;
    var worldY = screenY - camY;
    return {
      col: Math.floor(worldX / GRID_CELL),
      row: Math.floor(worldY / GRID_CELL)
    };
  }

  function gridToScreen(col, row) {
    return {
      x: col * GRID_CELL + camX,
      y: row * GRID_CELL + camY
    };
  }

  function isCellVisible(col, row) {
    var pos = gridToScreen(col, row);
    return pos.x + GRID_CELL > 0 && pos.x < CANVAS_W &&
           pos.y + GRID_CELL > 0 && pos.y < CANVAS_H;
  }

  // --- Grid operations ---
  function setTile(col, row, id) {
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      tiles[row][col] = id;
    }
  }

  function getTile(col, row) {
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      return tiles[row][col];
    }
    return null;
  }

  function cellFromMouse(e) {
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var cell = screenToGrid(x, y);
    return {
      col: Math.max(0, Math.min(cols - 1, cell.col)),
      row: Math.max(0, Math.min(rows - 1, cell.row))
    };
  }

  // --- Drawing ---
  function drawTile(col, row, tileId) {
    var size = placementSizes[tileId] || tileSize;
    var pos = gridToScreen(col, row);
    var cx = pos.x + (GRID_CELL - size) / 2;
    var cy = pos.y + (GRID_CELL - size) / 2;
    var def = TILE_TYPES[tileId] || TILE_TYPES[0];

    ctx.fillStyle = def.color;
    ctx.fillRect(cx, cy, size, size);

    // Draw spawn/enemy indicators
    if (tileId === 3 || tileId === 4) {
      ctx.beginPath();
      ctx.arc(cx + size / 2, cy + size / 2, size / 3, 0, Math.PI * 2);
      ctx.fillStyle = tileId === 3 ? '#fff' : '#f44';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw wall pattern
    if (tileId === 2) {
      ctx.fillStyle = '#888';
      var pad = Math.max(2, Math.floor(size * 0.12));
      ctx.fillRect(cx + pad, cy + pad, size - pad * 2, size - pad * 2);
    }
  }

  function drawGrid() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Draw all tiles (visibility skip is a minor optimization; draw all)
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (isCellVisible(c, r)) {
          drawTile(c, r, tiles[r][c]);
        }
      }
    }

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    // Vertical lines
    for (var c = 0; c <= COLS; c++) {
      var linePos = gridToScreen(c, 0);
      ctx.moveTo(linePos.x, 0);
      ctx.lineTo(linePos.x, CANVAS_H);
    }
    // Horizontal lines
    for (var r = 0; r <= ROWS; r++) {
      var linePos2 = gridToScreen(0, r);
      ctx.moveTo(0, linePos2.y);
      ctx.lineTo(CANVAS_W, linePos2.y);
    }
    ctx.stroke();

    // Draw hover highlight
    if (hoverCol >= 0 && hoverRow >= 0 && hoverCol < COLS && hoverRow < ROWS) {
      var hPos = gridToScreen(hoverCol, hoverRow);
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = 2;
      ctx.strokeRect(hPos.x, hPos.y, GRID_CELL, GRID_CELL);
    }
  }

  // --- Placement helpers ---
  function placeSingle(col, row) {
    setTile(col, row, selectedTile);
  }

  function placeWall(startCol, startRow) {
    if (wallOrient === 'h') {
      for (var i = 0; i < wallLength && (startCol + i) < COLS; i++) {
        setTile(startCol + i, startRow, 2);
      }
      lastPlacedCol = startCol + wallLength;
      lastPlacedRow = startRow;
    } else {
      for (var j = 0; j < wallLength && (startRow + j) < ROWS; j++) {
        setTile(startCol, startRow + j, 2);
      }
      lastPlacedCol = startCol;
      lastPlacedRow = startRow + wallLength;
    }
  }

  function placeWater(startCol, startRow) {
    var endCol = Math.min(startCol + waterCols - 1, COLS - 1);
    var endRow = Math.min(startRow + waterRows - 1, ROWS - 1);
    for (var r = startRow; r <= endRow; r++) {
      for (var c = startCol; c <= endCol; c++) {
        setTile(c, r, 1);
      }
    }
    lastPlacedCol = startCol + waterCols;
    lastPlacedRow = startRow + waterRows;
  }

  function placeTile(col, row) {
    if (selectedTile === 2) {
      placeWall(col, row);
    } else if (selectedTile === 1) {
      placeWater(col, row);
    } else {
      placeSingle(col, row);
      lastPlacedCol = col;
      lastPlacedRow = row;
    }
  }

  function repeatPlacement(hoverCol, hoverRow) {
    if (lastPlacedCol < 0 || lastPlacedRow < 0) {
      placeTile(hoverCol, hoverRow);
      return;
    }
    if (selectedTile === 2) {
      if (wallOrient === 'h') {
        for (var i = 0; i < wallLength && lastPlacedCol + i < COLS; i++) {
          setTile(lastPlacedCol + i, lastPlacedRow, 2);
        }
        lastPlacedCol += wallLength;
      } else {
        for (var j = 0; j < wallLength && lastPlacedRow + j < ROWS; j++) {
          setTile(lastPlacedCol, lastPlacedRow + j, 2);
        }
        lastPlacedRow += wallLength;
      }
    } else if (selectedTile === 1) {
      for (var r = lastPlacedRow; r < lastPlacedRow + waterRows && r < ROWS; r++) {
        for (var c = lastPlacedCol; c < lastPlacedCol + waterCols && c < COLS; c++) {
          setTile(c, r, 1);
        }
      }
      lastPlacedCol += waterCols;
      lastPlacedRow += waterRows;
    } else {
      placeSingle(hoverCol, hoverRow);
      lastPlacedCol = hoverCol;
      lastPlacedRow = hoverRow;
    }
  }

  // --- Event handlers ---

  // Keyboard — camera panning (multi-key support)
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT') return;
    keysDown[e.key] = true;
    if (updateCameraDirection()) {
      e.preventDefault();
      startCameraPanning();
    }
  });

  document.addEventListener('keyup', function (e) {
    delete keysDown[e.key];
    if (!updateCameraDirection()) {
      stopCameraPanning();
    }
  });

  function updateCameraDirection() {
    var dx = 0, dy = 0;
    if (keysDown['ArrowRight'] || keysDown['d']) dx += 1;
    if (keysDown['ArrowLeft']  || keysDown['a']) dx -= 1;
    if (keysDown['ArrowUp']    || keysDown['w']) dy -= 1;
    if (keysDown['ArrowDown']  || keysDown['s']) dy += 1;
    if (dx !== 0 || dy !== 0) {
      var len = Math.sqrt(dx * dx + dy * dy);
      camDirX = dx / len;
      camDirY = dy / len;
      return true;
    }
    camDirX = 0; camDirY = 0;
    return false;
  }

  canvas.addEventListener('mousedown', function (e) {
    e.preventDefault();
    isMouseDown = true;
    var cell = cellFromMouse(e);
    placeTile(cell.col, cell.row);
    lastPlacedCol = cell.col;
    lastPlacedRow = cell.row;
  });

  canvas.addEventListener('mousemove', function (e) {
    var cell = cellFromMouse(e);
    hoverCol = cell.col;
    hoverRow = cell.row;
    infoText.textContent = 'Cell: <span>' + cell.col + ', ' + cell.row + '</span> — Tile: <span>' + TILE_TYPES[selectedTile].name + '</span>';
    if (isMouseDown) {
      repeatPlacement(cell.col, cell.row);
    }
  });

  canvas.addEventListener('mouseup', function () {
    isMouseDown = false;
  });

  canvas.addEventListener('mouseleave', function () {
    hoverCol = -1;
    hoverRow = -1;
    isMouseDown = false;
  });

  canvas.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  // Tile type buttons
  tileBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tileBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      selectedTile = parseInt(btn.getAttribute('data-tile'));
      tileSize = placementSizes[selectedTile] || GRID_CELL;
      tileSizeInput.value = tileSize;
      updateToolbarVisibility();
      infoText.textContent = 'Selected: <span>' + TILE_TYPES[selectedTile].name + '</span> (placement size: ' + tileSize + 'px) — Click to place';
      drawGrid();
    });
  });

  // Wall orientation
  orientHBtn.addEventListener('click', function () {
    wallOrient = 'h';
    orientHBtn.classList.add('active');
    orientVBtn.classList.remove('active');
  });
  orientVBtn.addEventListener('click', function () {
    wallOrient = 'v';
    orientVBtn.classList.add('active');
    orientHBtn.classList.remove('active');
  });

  // Wall length
  wallLenInput.addEventListener('change', function () {
    wallLength = Math.max(1, Math.min(COLS, parseInt(this.value) || 1));
    this.value = wallLength;
  });

  // Water size
  waterColsInput.addEventListener('change', function () {
    waterCols = Math.max(1, Math.min(COLS, parseInt(this.value) || 1));
    this.value = waterCols;
  });
  waterRowsInput.addEventListener('change', function () {
    waterRows = Math.max(1, Math.min(ROWS, parseInt(this.value) || 1));
    this.value = waterRows;
  });

  // Placement size
  tileSizeInput.addEventListener('change', function () {
    var newVal = Math.max(4, Math.min(64, parseInt(this.value) || GRID_CELL));
    tileSizeInput.value = newVal;
    tileSize = newVal;
    placementSizes[selectedTile] = newVal;
    drawGrid();
  });

  function updateToolbarVisibility() {
    if (selectedTile === 2) {
      wallSection.style.display = 'flex';
      waterSection.style.display = 'none';
    } else if (selectedTile === 1) {
      wallSection.style.display = 'none';
      waterSection.style.display = 'flex';
    } else {
      wallSection.style.display = 'none';
      waterSection.style.display = 'none';
    }
  }

  // Save — POST only, no download
  btnSave.addEventListener('click', function () {
    var sizesCopy = {};
    for (var k in placementSizes) sizesCopy[k] = placementSizes[k];
    mapData = {
      width: cols,
      height: rows,
      tileSize: tileSize,
      placementSizes: sizesCopy,
      tiles: tiles
    };
    fetch('/editor-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapData)
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        infoText.textContent = 'Saved to server!';
      })
      .catch(function () {
        infoText.textContent = 'Save failed — server may be down';
      });
  });

  // Start Over — confirm then reset
  btnStartOver.addEventListener('click', function () {
    if (confirm('Reset to empty grid?')) {
      tiles = createEmptyGrid();
      lastPlacedCol = -1;
      lastPlacedRow = -1;
      centerCamera();
      drawGrid();
      infoText.textContent = 'Reset to empty grid';
    }
  });

  // Upload file
  btnUpload.addEventListener('click', function () {
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        uploadAndLoad(data, file.name);
      } catch (err) {
        infoText.textContent = 'Invalid JSON: <span>' + err.message + '</span>';
      }
    };
    reader.readAsText(file);
  });

  function uploadAndLoad(data, filename) {
    fetch('/editor-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) { return r.json(); })
      .then(function (res) {
        loadMapData(data);
        infoText.textContent = 'Uploaded <span>' + filename + '</span> and saved to server!';
      })
      .catch(function () {
        infoText.textContent = 'Upload failed — server may be down';
      });
  }

  function loadMapData(data) {
    if (data && Array.isArray(data.tiles)) {
      tiles = data.tiles;
      if (data.width) cols = data.width;
      if (data.height) rows = data.height;
      // Restore placement sizes if present
      if (data.placementSizes) {
        placementSizes = {};
        for (var k in data.placementSizes) {
          placementSizes[parseInt(k)] = data.placementSizes[k];
        }
        tileSize = placementSizes[selectedTile] || GRID_CELL;
        tileSizeInput.value = tileSize;
      }
      if (data.tileSize) tileSizeInput.value = data.tileSize;
      centerCamera();
      lastPlacedCol = -1;
      lastPlacedRow = -1;
      infoText.textContent = 'Map loaded: <span>' + cols + 'x' + rows + ' tiles</span> — Click to place';
      drawGrid();
    } else {
      infoText.textContent = 'Invalid map data — <span>needs a tiles array</span>';
    }
  }

  // --- Init ---
  tiles = createEmptyGrid();
  centerCamera();
  drawGrid();
  infoText.textContent = 'Ready — <span>Click to place tiles</span>';

})();
