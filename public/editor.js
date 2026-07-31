(function () {
  'use strict';

  // --- Configuration ---
  var COLS = 40;
  var ROWS = 30;
  var CANVAS_W = 640;
  var CANVAS_H = 480;

  // --- Tile type definitions ---
  var TILE_TYPES = [
    { id: 0, name: 'Grass',     color: '#4a7', walkable: true  },
    { id: 1, name: 'Water',     color: '#26d', walkable: false },
    { id: 2, name: 'Wall',      color: '#666', walkable: false },
    { id: 3, name: 'Spawn',     color: '#eee', walkable: true  },
    { id: 4, name: 'EnemySpawn',color: '#c33', walkable: true  }
  ];

  // --- Editor state ---
  var tileSize = 16;
  var cols = 40;
  var rows = 30;
  var tiles = null;           // 2D array [row][col]
  var selectedTile = 0;
  var wallOrient = 'h';       // 'h' or 'v'
  var wallLength = 1;
  var waterCols = 2;
  var waterRows = 2;
  var isMouseDown = false;
  var lastPlacedCol = -1;
  var lastPlacedRow = -1;
  var hoverCol = -1;
  var hoverRow = -1;
  var mapData = null;         // loaded from file

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
  var btnLoadDefault = document.getElementById('btn-load-default');
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
    var col = Math.floor(x / tileSize);
    var row = Math.floor(y / tileSize);
    return { col: Math.max(0, Math.min(cols - 1, col)),
             row: Math.max(0, Math.min(rows - 1, row)) };
  }

  // --- Drawing ---
  function drawTile(col, row, tileId) {
    var x = col * tileSize;
    var y = row * tileSize;
    var def = TILE_TYPES[tileId] || TILE_TYPES[0];

    ctx.fillStyle = def.color;
    ctx.fillRect(x, y, tileSize, tileSize);

    // Draw spawn/enemy indicators
    if (tileId === 3 || tileId === 4) {
      ctx.beginPath();
      ctx.arc(x + tileSize / 2, y + tileSize / 2, tileSize / 3, 0, Math.PI * 2);
      ctx.fillStyle = tileId === 3 ? '#fff' : '#f44';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw wall pattern
    if (tileId === 2) {
      ctx.fillStyle = '#888';
      ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
    }
  }

  function drawGrid() {
    // Draw all tiles
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        drawTile(c, r, tiles[r][c]);
      }
    }

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (var c = 0; c <= cols; c++) {
      ctx.moveTo(c * tileSize, 0);
      ctx.lineTo(c * tileSize, rows * tileSize);
    }
    for (var r = 0; r <= rows; r++) {
      ctx.moveTo(0, r * tileSize);
      ctx.lineTo(cols * tileSize, r * tileSize);
    }
    ctx.stroke();

    // Draw hover highlight
    if (hoverCol >= 0 && hoverRow >= 0 && hoverCol < cols && hoverRow < rows) {
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = 2;
      ctx.strokeRect(hoverCol * tileSize, hoverRow * tileSize, tileSize, tileSize);
    }
  }

  // --- Placement helpers ---
  function placeSingle(col, row) {
    setTile(col, row, selectedTile);
  }

  function placeWall(startCol, startRow) {
    if (wallOrient === 'h') {
      for (var i = 0; i < wallLength && (startCol + i) < cols; i++) {
        setTile(startCol + i, startRow, 2);
      }
      // Next placement continues from the end of this wall
      lastPlacedCol = startCol + wallLength;
      lastPlacedRow = startRow;
    } else {
      for (var j = 0; j < wallLength && (startRow + j) < rows; j++) {
        setTile(startCol, startRow + j, 2);
      }
      lastPlacedCol = startCol;
      lastPlacedRow = startRow + wallLength;
    }
  }

  function placeWater(startCol, startRow) {
    var endCol = Math.min(startCol + waterCols - 1, cols - 1);
    var endRow = Math.min(startRow + waterRows - 1, rows - 1);
    for (var r = startRow; r <= endRow; r++) {
      for (var c = startCol; c <= endCol; c++) {
        setTile(c, r, 1);
      }
    }
    // Next placement continues from bottom-right
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
      // Wall: continue in the same direction
      if (wallOrient === 'h') {
        for (var i = 0; i < wallLength && lastPlacedCol + i < cols; i++) {
          setTile(lastPlacedCol + i, lastPlacedRow, 2);
        }
        lastPlacedCol += wallLength;
      } else {
        for (var j = 0; j < wallLength && lastPlacedRow + j < rows; j++) {
          setTile(lastPlacedCol, lastPlacedRow + j, 2);
        }
        lastPlacedRow += wallLength;
      }
    } else if (selectedTile === 1) {
      // Water: continue from where previous ended
      for (var r = lastPlacedRow; r < lastPlacedRow + waterRows && r < rows; r++) {
        for (var c = lastPlacedCol; c < lastPlacedCol + waterCols && c < cols; c++) {
          setTile(c, r, 1);
        }
      }
      lastPlacedCol += waterCols;
      lastPlacedRow += waterRows;
    } else {
      // Grass/Spawn/Enemy: single cell repeat in drag direction
      placeSingle(hoverCol, hoverRow);
      lastPlacedCol = hoverCol;
      lastPlacedRow = hoverRow;
    }
  }

  // --- Event handlers ---
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
      updateToolbarVisibility();
      infoText.textContent = 'Selected: <span>' + TILE_TYPES[selectedTile].name + '</span> — Click to place';
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
    wallLength = Math.max(1, Math.min(40, parseInt(this.value) || 1));
    this.value = wallLength;
  });

  // Water size
  waterColsInput.addEventListener('change', function () {
    waterCols = Math.max(1, Math.min(40, parseInt(this.value) || 1));
    this.value = waterCols;
  });
  waterRowsInput.addEventListener('change', function () {
    waterRows = Math.max(1, Math.min(30, parseInt(this.value) || 1));
    this.value = waterRows;
  });

  // Tile size
  tileSizeInput.addEventListener('change', function () {
    var newVal = Math.max(4, Math.min(64, parseInt(this.value) || 16));
    tileSizeInput.value = newVal;
    applyTileSize(newVal);
  });

  function applyTileSize(newSize) {
    tileSize = newSize;
    // Resize canvas to fit
    var newW = cols * tileSize;
    var newH = rows * tileSize;
    canvas.width = newW;
    canvas.height = newH;
    drawGrid();
  }

  function updateToolbarVisibility() {
    // Show wall controls only when wall is selected
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

  // Save
  btnSave.addEventListener('click', function () {
    mapData = {
      width: cols,
      height: rows,
      tileSize: tileSize,
      tiles: tiles
    };
    // POST to server
    fetch('/editor-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapData)
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        infoText.textContent = 'Saved to server! — <span>Click to download</span> for local file';
      })
      .catch(function () {
        infoText.textContent = 'Save failed — server may be down';
      });

    // Also download as file
    var blob = new Blob([JSON.stringify(mapData, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'maps/default.json';
    a.click();
  });

  // Load default from server
  btnLoadDefault.addEventListener('click', function () {
    fetch('/editor-data')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        loadMapData(data);
      })
      .catch(function () {
        infoText.textContent = 'Load failed — server may be down';
      });
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
      if (data.tileSize) tileSize = data.tileSize;
      tileSizeInput.value = tileSize;
      applyTileSize(tileSize);
      lastPlacedCol = -1;
      lastPlacedRow = -1;
      infoText.textContent = 'Map loaded: <span>' + cols + 'x' + rows + ' tiles</span> — Click to place';
    } else {
      infoText.textContent = 'Invalid map data — <span>needs a tiles array</span>';
    }
  }

  // --- Init ---
  tiles = createEmptyGrid();
  drawGrid();
  infoText.textContent = 'Ready — <span>Click to place tiles</span>';

})();
