import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ============================================================
   STATE
   ============================================================ */
const state = {
  room: { w: 6000, d: 5000, h: 2400 },          // mm
  colors: { floor: '#c8a876', wall: '#f5f0e8', ceiling: '#ffffff' },
  door: { wall: 'south', pos: 50, width: 800 },
  window: { wall: 'north', pos: 50, w: 1800, h: 1200 },
  furnitureItems: [],
  selectedId: null,
  nextId: 1,
  snap: true,
  snapSize: 50,     // mm
  viewMode: '2d',   // '2d' | '3d'
  currentProjectId: null,
};

/* ============================================================
   FURNITURE DEFINITIONS (mm)
   ============================================================ */
const FURNITURE_DEFS = {
  sofa:         { name: 'ソファ',           w: 1800, d: 800,  h: 750,  color: '#8b7355' },
  table:        { name: 'テーブル',         w: 1000, d: 600,  h: 400,  color: '#a08060' },
  tv:           { name: 'テレビ台',         w: 1200, d: 400,  h: 500,  color: '#5a4a3a' },
  bookshelf:    { name: '本棚',             w: 800,  d: 350,  h: 1800, color: '#a08060' },
  rug:          { name: 'ラグ',             w: 2000, d: 1400, h: 10,   color: '#c0a888' },
  plant:        { name: '観葉植物',         w: 400,  d: 400,  h: 1200, color: '#5a8a4a' },
  lamp:         { name: 'フロアランプ',     w: 350,  d: 350,  h: 1500, color: '#d4c8a0' },
  diningTable:  { name: 'ダイニングテーブル', w: 1500, d: 800,  h: 720,  color: '#906a3a' },
  chair:        { name: 'チェア',           w: 450,  d: 450,  h: 800,  color: '#a08060' },
  bed:          { name: 'ベッド',           w: 1400, d: 2000, h: 450,  color: '#d0c0a0' },
  wardrobe:     { name: 'ワードローブ',     w: 1000, d: 550,  h: 2000, color: '#7a6a5a' },
  desk:         { name: 'デスク',           w: 1200, d: 600,  h: 730,  color: '#a08060' },
  fridge:       { name: '冷蔵庫',           w: 650,  d: 650,  h: 1700, color: '#d0d0d0' },
};

/* ============================================================
   DOM REFS
   ============================================================ */
const $  = id => document.getElementById(id);
const canvas2d = $('canvas2d');
const ctx = canvas2d.getContext('2d');
const canvas3d = $('canvas3d');

/* ============================================================
   2D FLOORPLAN
   ============================================================ */
let view2d = { cx: 0, cy: 0, scale: 0.1, dragging: false, dragStart: null, panStart: null };
let dragItem = null;
let dragOffset = { x: 0, y: 0 };

function mmToPx(mm) { return mm * view2d.scale; }
function pxToMm(px) { return px / view2d.scale; }

function worldToScreen(xMm, yMm) {
  const cw = canvas2d.width, ch = canvas2d.height;
  return {
    x: cw / 2 + (xMm - view2d.cx) * view2d.scale,
    y: ch / 2 + (yMm - view2d.cy) * view2d.scale,
  };
}

function screenToWorld(sx, sy) {
  const cw = canvas2d.width, ch = canvas2d.height;
  return {
    x: (sx - cw / 2) / view2d.scale + view2d.cx,
    y: (sy - ch / 2) / view2d.scale + view2d.cy,
  };
}

function fitView() {
  const cw = canvas2d.width, ch = canvas2d.height;
  const pad = 120;
  const scaleX = (cw - pad) / state.room.w;
  const scaleY = (ch - pad) / state.room.d;
  view2d.scale = Math.min(scaleX, scaleY);
  view2d.cx = state.room.w / 2;
  view2d.cy = state.room.d / 2;
}

function resizeCanvas2d() {
  const rect = canvas2d.parentElement.getBoundingClientRect();
  canvas2d.width = rect.width * devicePixelRatio;
  canvas2d.height = rect.height * devicePixelRatio;
  canvas2d.style.width = rect.width + 'px';
  canvas2d.style.height = rect.height + 'px';
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

/* ----------- Draw 2D ----------- */
function draw2d() {
  const cw = canvas2d.width / devicePixelRatio;
  const ch = canvas2d.height / devicePixelRatio;
  ctx.clearRect(0, 0, cw, ch);

  // Background
  ctx.fillStyle = '#e8e8e4';
  ctx.fillRect(0, 0, cw, ch);

  // Grid
  drawGrid(cw, ch);

  // Room
  drawRoom(cw, ch);

  // Furniture
  state.furnitureItems.forEach(item => drawFurniture2d(item));

  // Dimensions
  drawDimensions();
}

function drawGrid(cw, ch) {
  const gridMm = 500; // 500mm grid
  const topLeft = screenToWorld(0, 0);
  const botRight = screenToWorld(cw, ch);
  const startX = Math.floor(topLeft.x / gridMm) * gridMm;
  const startY = Math.floor(topLeft.y / gridMm) * gridMm;

  ctx.strokeStyle = '#d8d8d4';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let x = startX; x <= botRight.x; x += gridMm) {
    const sx = worldToScreen(x, 0).x;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, ch);
  }
  for (let y = startY; y <= botRight.y; y += gridMm) {
    const sy = worldToScreen(0, y).y;
    ctx.moveTo(0, sy);
    ctx.lineTo(cw, sy);
  }
  ctx.stroke();
}

function drawRoom() {
  const { w, d } = state.room;
  const tl = worldToScreen(0, 0);
  const br = worldToScreen(w, d);
  const rw = br.x - tl.x;
  const rh = br.y - tl.y;

  // Floor fill
  ctx.fillStyle = state.colors.floor;
  ctx.fillRect(tl.x, tl.y, rw, rh);

  // Floor pattern (simple lines for wood effect)
  ctx.strokeStyle = adjustColor(state.colors.floor, -15);
  ctx.lineWidth = 0.5;
  const plankMm = 200;
  for (let y = 0; y <= d; y += plankMm) {
    const sy = worldToScreen(0, y).y;
    ctx.beginPath();
    ctx.moveTo(tl.x, sy);
    ctx.lineTo(br.x, sy);
    ctx.stroke();
  }

  // Walls
  const wallPx = Math.max(6, mmToPx(120));
  ctx.fillStyle = '#555';

  // Draw walls with openings
  drawWallWithOpening('south', tl.x, br.y - wallPx / 2, rw, wallPx);
  drawWallWithOpening('north', tl.x, tl.y - wallPx / 2, rw, wallPx);
  drawWallWithOpening('west', tl.x - wallPx / 2, tl.y, wallPx, rh);
  drawWallWithOpening('east', br.x - wallPx / 2, tl.y, wallPx, rh);
}

function drawWallWithOpening(wallName, x, y, w, h) {
  const { room, door, window: win } = state;
  const isHorizontal = (wallName === 'south' || wallName === 'north');
  const wallLen = isHorizontal ? room.w : room.d;

  // Collect openings on this wall
  const openings = [];
  if (door.wall === wallName) {
    const dw = door.width;
    const center = wallLen * (door.pos / 100);
    openings.push({ start: center - dw / 2, end: center + dw / 2, type: 'door' });
  }
  if (win.wall === wallName) {
    const ww = win.w;
    const center = wallLen * (win.pos / 100);
    openings.push({ start: center - ww / 2, end: center + ww / 2, type: 'window' });
  }

  openings.sort((a, b) => a.start - b.start);

  // Draw wall segments
  ctx.fillStyle = '#555';
  let pos = 0;
  for (const op of openings) {
    const gapStart = Math.max(0, op.start);
    const gapEnd = Math.min(wallLen, op.end);
    if (pos < gapStart) {
      drawWallSegment(wallName, x, y, w, h, pos, gapStart, isHorizontal);
    }
    // Draw opening marker
    drawOpeningMarker(wallName, x, y, w, h, gapStart, gapEnd, isHorizontal, op.type);
    pos = gapEnd;
  }
  if (pos < wallLen) {
    drawWallSegment(wallName, x, y, w, h, pos, wallLen, isHorizontal);
  }
}

function drawWallSegment(wallName, baseX, baseY, baseW, baseH, fromMm, toMm, isHorizontal) {
  const roomTL = worldToScreen(0, 0);
  if (isHorizontal) {
    const sx = roomTL.x + mmToPx(fromMm);
    const sw = mmToPx(toMm - fromMm);
    ctx.fillRect(sx, baseY, sw, baseH);
  } else {
    const sy = roomTL.y + mmToPx(fromMm);
    const sh = mmToPx(toMm - fromMm);
    ctx.fillRect(baseX, sy, baseW, sh);
  }
}

function drawOpeningMarker(wallName, baseX, baseY, baseW, baseH, fromMm, toMm, isHorizontal, type) {
  const roomTL = worldToScreen(0, 0);
  const lineW = Math.max(2, baseH * 0.4);

  if (isHorizontal) {
    const sx = roomTL.x + mmToPx(fromMm);
    const sw = mmToPx(toMm - fromMm);
    const cy = baseY + baseH / 2;

    if (type === 'door') {
      // Door arc
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const radius = sw;
      const startAngle = wallName === 'south' ? Math.PI : 0;
      const endAngle = wallName === 'south' ? Math.PI * 1.5 : Math.PI * 0.5;
      ctx.arc(sx, cy, radius, startAngle, endAngle);
      ctx.stroke();
      // Door line
      ctx.beginPath();
      ctx.moveTo(sx, cy);
      ctx.lineTo(sx, cy + (wallName === 'south' ? -radius : radius));
      ctx.stroke();
    } else {
      // Window: double line
      ctx.strokeStyle = '#4a90d9';
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(sx, cy);
      ctx.lineTo(sx + sw, cy);
      ctx.stroke();
      ctx.strokeStyle = '#80b8f0';
      ctx.lineWidth = lineW * 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, cy);
      ctx.lineTo(sx + sw, cy);
      ctx.stroke();
    }
  } else {
    const sy = roomTL.y + mmToPx(fromMm);
    const sh = mmToPx(toMm - fromMm);
    const cx = baseX + baseW / 2;

    if (type === 'door') {
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const radius = sh;
      const startAngle = wallName === 'west' ? -Math.PI * 0.5 : Math.PI * 0.5;
      const endAngle = wallName === 'west' ? 0 : Math.PI;
      ctx.arc(cx, sy, radius, startAngle, endAngle);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, sy);
      ctx.lineTo(cx + (wallName === 'west' ? radius : -radius), sy);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#4a90d9';
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(cx, sy);
      ctx.lineTo(cx, sy + sh);
      ctx.stroke();
      ctx.strokeStyle = '#80b8f0';
      ctx.lineWidth = lineW * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, sy);
      ctx.lineTo(cx, sy + sh);
      ctx.stroke();
    }
  }
}

function drawFurniture2d(item) {
  const def = FURNITURE_DEFS[item.type];
  if (!def) return;
  const size = getItemSize(item);
  const cx = worldToScreen(item.x, item.y);
  const rot = (item.rotation || 0) * Math.PI / 180;

  ctx.save();
  ctx.translate(cx.x, cx.y);
  ctx.rotate(rot);

  const pw = mmToPx(size.w);
  const pd = mmToPx(size.d);

  const selected = item.id === state.selectedId;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(-pw / 2 + 2, -pd / 2 + 2, pw, pd);

  // Body
  ctx.fillStyle = selected ? adjustColor(def.color, 20) : def.color;
  ctx.fillRect(-pw / 2, -pd / 2, pw, pd);

  // Border
  ctx.strokeStyle = selected ? '#3a5a3a' : 'rgba(0,0,0,0.2)';
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeRect(-pw / 2, -pd / 2, pw, pd);

  // Selection handles
  if (selected) {
    ctx.fillStyle = '#3a5a3a';
    const hs = 4;
    [[-pw/2, -pd/2], [pw/2, -pd/2], [-pw/2, pd/2], [pw/2, pd/2]].forEach(([hx, hy]) => {
      ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
    });
  }

  // Label
  const fontSize = Math.max(9, Math.min(12, pw / 6));
  ctx.fillStyle = selected ? '#1a3a1a' : 'rgba(0,0,0,0.5)';
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = def.name;
  if (pw > 30) {
    ctx.fillText(label, 0, -fontSize * 0.5);
    // Show dimensions
    ctx.font = `${Math.max(8, fontSize - 2)}px sans-serif`;
    ctx.fillStyle = selected ? '#2a4a2a' : 'rgba(0,0,0,0.35)';
    ctx.fillText(`${size.w}×${size.d}`, 0, fontSize * 0.5);
  }

  // Direction indicator (front of furniture)
  ctx.fillStyle = selected ? '#3a5a3a' : 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.moveTo(-6, -pd / 2);
  ctx.lineTo(6, -pd / 2);
  ctx.lineTo(0, -pd / 2 - 6);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawDimensions() {
  const { w, d } = state.room;
  const tl = worldToScreen(0, 0);
  const br = worldToScreen(w, d);

  ctx.fillStyle = '#666';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Top dimension
  const topY = tl.y - 18;
  ctx.beginPath();
  ctx.moveTo(tl.x, topY);
  ctx.lineTo(br.x, topY);
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Ticks
  ctx.beginPath();
  ctx.moveTo(tl.x, topY - 4);
  ctx.lineTo(tl.x, topY + 4);
  ctx.moveTo(br.x, topY - 4);
  ctx.lineTo(br.x, topY + 4);
  ctx.stroke();
  ctx.fillText(`${w} mm`, (tl.x + br.x) / 2, topY - 10);

  // Left dimension
  const leftX = tl.x - 18;
  ctx.beginPath();
  ctx.moveTo(leftX, tl.y);
  ctx.lineTo(leftX, br.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(leftX - 4, tl.y);
  ctx.lineTo(leftX + 4, tl.y);
  ctx.moveTo(leftX - 4, br.y);
  ctx.lineTo(leftX + 4, br.y);
  ctx.stroke();
  ctx.save();
  ctx.translate(leftX - 10, (tl.y + br.y) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${d} mm`, 0, 0);
  ctx.restore();
}

/* ----------- 2D Interaction ----------- */
function getCanvasPos(e) {
  const rect = canvas2d.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function hitTestFurniture(worldX, worldY) {
  // Iterate in reverse so top items are hit first
  for (let i = state.furnitureItems.length - 1; i >= 0; i--) {
    const item = state.furnitureItems[i];
    const def = FURNITURE_DEFS[item.type];
    if (!def) continue;
    const size = getItemSize(item);
    const rot = -(item.rotation || 0) * Math.PI / 180;
    const dx = worldX - item.x;
    const dy = worldY - item.y;
    // Rotate point into item's local space
    const lx = dx * Math.cos(rot) - dy * Math.sin(rot);
    const ly = dx * Math.sin(rot) + dy * Math.cos(rot);
    if (Math.abs(lx) <= size.w / 2 && Math.abs(ly) <= size.d / 2) {
      return item;
    }
  }
  return null;
}

function snapValue(v) {
  if (!state.snap) return v;
  return Math.round(v / state.snapSize) * state.snapSize;
}

function clampToRoom(item) {
  const size = getItemSize(item);
  const rot = (item.rotation || 0) % 360;
  // 90° or 270° rotation swaps W and D for bounding box
  const swapped = (rot === 90 || rot === 270);
  const halfW = (swapped ? size.d : size.w) / 2;
  const halfD = (swapped ? size.w : size.d) / 2;
  item.x = Math.max(halfW, Math.min(state.room.w - halfW, item.x));
  item.y = Math.max(halfD, Math.min(state.room.d - halfD, item.y));
}

canvas2d.addEventListener('pointerdown', e => {
  const pos = getCanvasPos(e);
  const world = screenToWorld(pos.x, pos.y);
  const hit = hitTestFurniture(world.x, world.y);

  if (hit) {
    selectFurniture(hit.id);
    dragItem = hit;
    dragOffset.x = hit.x - world.x;
    dragOffset.y = hit.y - world.y;
    canvas2d.setPointerCapture(e.pointerId);
    canvas2d.style.cursor = 'grabbing';
  } else {
    selectFurniture(null);
    // Pan
    view2d.dragging = true;
    view2d.dragStart = { x: pos.x, y: pos.y };
    view2d.panStart = { cx: view2d.cx, cy: view2d.cy };
    canvas2d.style.cursor = 'move';
  }
});

canvas2d.addEventListener('pointermove', e => {
  const pos = getCanvasPos(e);
  const world = screenToWorld(pos.x, pos.y);

  if (dragItem) {
    dragItem.x = snapValue(world.x + dragOffset.x);
    dragItem.y = snapValue(world.y + dragOffset.y);
    clampToRoom(dragItem);
    draw2d();
  } else if (view2d.dragging) {
    const dx = (pos.x - view2d.dragStart.x) / view2d.scale;
    const dy = (pos.y - view2d.dragStart.y) / view2d.scale;
    view2d.cx = view2d.panStart.cx - dx;
    view2d.cy = view2d.panStart.cy - dy;
    draw2d();
  } else {
    const hit = hitTestFurniture(world.x, world.y);
    canvas2d.style.cursor = hit ? 'grab' : 'default';
  }
});

canvas2d.addEventListener('pointerup', () => {
  if (dragItem) {
    dragItem = null;
    canvas2d.style.cursor = 'default';
  }
  view2d.dragging = false;
  canvas2d.style.cursor = 'default';
});

canvas2d.addEventListener('wheel', e => {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  const pos = getCanvasPos(e);
  const worldBefore = screenToWorld(pos.x, pos.y);
  view2d.scale *= zoomFactor;
  view2d.scale = Math.max(0.02, Math.min(0.5, view2d.scale));
  const worldAfter = screenToWorld(pos.x, pos.y);
  view2d.cx += worldBefore.x - worldAfter.x;
  view2d.cy += worldBefore.y - worldAfter.y;
  draw2d();
}, { passive: false });

/* ============================================================
   3D VIEW
   ============================================================ */
let scene, camera3d, renderer, controls3d;
let threeInited = false;

function init3d() {
  if (threeInited) return;
  threeInited = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  camera3d = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera3d.position.set(5, 4, 7);
  camera3d.lookAt(0, 0, 0);

  controls3d = new OrbitControls(camera3d, canvas3d);
  controls3d.enableDamping = true;
  controls3d.dampingFactor = 0.08;
  controls3d.maxPolarAngle = Math.PI * 0.48;
  controls3d.minDistance = 2;
  controls3d.maxDistance = 25;

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(5, 10, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 30;
  dirLight.shadow.camera.left = -10;
  dirLight.shadow.camera.right = 10;
  dirLight.shadow.camera.top = 10;
  dirLight.shadow.camera.bottom = -10;
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0xaac4e0, 0.3);
  fillLight.position.set(-3, 5, -3);
  scene.add(fillLight);
}

function resize3d() {
  if (!renderer) return;
  const rect = canvas3d.parentElement.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  renderer.setPixelRatio(devicePixelRatio);
  camera3d.aspect = rect.width / rect.height;
  camera3d.updateProjectionMatrix();
}

function build3dScene() {
  if (!scene) return;
  // Clear scene objects (keep lights and camera)
  const toRemove = [];
  scene.children.forEach(obj => {
    if (obj.isLight || obj === camera3d) return;
    toRemove.push(obj);
  });
  toRemove.forEach(o => {
    o.traverse(child => {
      child.geometry?.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
    scene.remove(o);
  });

  const wM = state.room.w / 1000;
  const dM = state.room.d / 1000;
  const hM = state.room.h / 1000;

  // Floor
  const floorGeo = new THREE.PlaneGeometry(wM, dM);
  const floorMat = new THREE.MeshStandardMaterial({
    color: state.colors.floor,
    roughness: 0.8,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(wM / 2, 0, dM / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // Walls
  buildWall3d('south', wM, hM, dM);
  buildWall3d('north', wM, hM, dM);
  buildWall3d('west', wM, hM, dM);
  buildWall3d('east', wM, hM, dM);

  // Furniture
  state.furnitureItems.forEach(item => buildFurniture3d(item, wM, dM));

  // Position camera only on first build
  if (!state._3dCameraInited) {
    state._3dCameraInited = true;
    const maxDim = Math.max(wM, dM);
    camera3d.position.set(wM / 2 + maxDim * 0.5, hM * 1.2, dM + maxDim * 0.6);
    controls3d.target.set(wM / 2, hM * 0.3, dM / 2);
    controls3d.update();
  }
}

function buildWall3d(wallName, wM, hM, dM) {
  const thickness = 0.08;
  const wallColor = state.colors.wall;
  const { door, window: win, room } = state;

  const wallLen = (wallName === 'south' || wallName === 'north') ? wM : dM;
  const wallLenMm = (wallName === 'south' || wallName === 'north') ? room.w : room.d;

  // Collect openings
  const openings = [];
  const isVerticalWall = (wallName === 'west' || wallName === 'east');
  if (door.wall === wallName) {
    const cMm = isVerticalWall
      ? wallLenMm * (1 - door.pos / 100)
      : wallLenMm * (door.pos / 100);
    const halfW = door.width / 2;
    openings.push({
      startM: (cMm - halfW) / 1000,
      endM: (cMm + halfW) / 1000,
      bottomM: 0,
      topM: 2.1,
      type: 'door'
    });
  }
  if (win.wall === wallName) {
    const cMm = isVerticalWall
      ? wallLenMm * (1 - win.pos / 100)
      : wallLenMm * (win.pos / 100);
    const halfW = win.w / 2;
    const winHM = win.h / 1000;
    const sillM = (hM - winHM) * 0.5 + 0.3;
    openings.push({
      startM: (cMm - halfW) / 1000,
      endM: (cMm + halfW) / 1000,
      bottomM: sillM,
      topM: sillM + winHM,
      type: 'window'
    });
  }

  if (openings.length === 0) {
    // Simple wall
    const geo = new THREE.BoxGeometry(wallLen, hM, thickness);
    const mat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    positionWall(mesh, wallName, wM, hM, dM, thickness);
    mesh.receiveShadow = true;
    scene.add(mesh);
  } else {
    // Wall with openings using shape
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(wallLen, 0);
    shape.lineTo(wallLen, hM);
    shape.lineTo(0, hM);
    shape.lineTo(0, 0);

    for (const op of openings) {
      const s = Math.max(0, op.startM);
      const e = Math.min(wallLen, op.endM);
      const b = Math.max(0, op.bottomM);
      const t = Math.min(hM, op.topM);
      const hole = new THREE.Path();
      hole.moveTo(s, b);
      hole.lineTo(e, b);
      hole.lineTo(e, t);
      hole.lineTo(s, t);
      hole.lineTo(s, b);
      shape.holes.push(hole);
    }

    const extSettings = { depth: thickness, bevelEnabled: false };
    const geo = new THREE.ExtrudeGeometry(shape, extSettings);
    const mat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;

    // Position
    switch (wallName) {
      case 'south':
        mesh.position.set(0, 0, dM);
        break;
      case 'north':
        mesh.position.set(0, 0, 0);
        break;
      case 'west':
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(0, 0, dM);
        break;
      case 'east':
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(wM, 0, dM);
        break;
    }
    scene.add(mesh);

    // Window glass
    for (const op of openings) {
      if (op.type === 'window') {
        const gw = op.endM - op.startM;
        const gh = op.topM - op.bottomM;
        const glassGeo = new THREE.PlaneGeometry(gw, gh);
        const glassMat = new THREE.MeshPhysicalMaterial({
          color: 0x88bbdd,
          transparent: true,
          opacity: 0.3,
          roughness: 0.05,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
        const glass = new THREE.Mesh(glassGeo, glassMat);
        const centerX = (op.startM + op.endM) / 2;
        const centerY = (op.bottomM + op.topM) / 2;
        switch (wallName) {
          case 'south':
            glass.position.set(centerX, centerY, dM);
            break;
          case 'north':
            glass.position.set(centerX, centerY, 0);
            break;
          case 'west':
            glass.rotation.y = Math.PI / 2;
            glass.position.set(0, centerY, dM - centerX);
            break;
          case 'east':
            glass.rotation.y = Math.PI / 2;
            glass.position.set(wM, centerY, dM - centerX);
            break;
        }
        scene.add(glass);
      }
    }
  }
}

function positionWall(mesh, wallName, wM, hM, dM, thickness) {
  switch (wallName) {
    case 'south':
      mesh.position.set(wM / 2, hM / 2, dM + thickness / 2);
      break;
    case 'north':
      mesh.position.set(wM / 2, hM / 2, -thickness / 2);
      break;
    case 'west':
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(-thickness / 2, hM / 2, dM / 2);
      break;
    case 'east':
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(wM + thickness / 2, hM / 2, dM / 2);
      break;
  }
}

function buildFurniture3d(item, roomWm, roomDm) {
  const def = FURNITURE_DEFS[item.type];
  if (!def) return;

  const size = getItemSize(item);
  const wM = size.w / 1000;
  const dM = size.d / 1000;
  const hM = size.h / 1000;

  const group = new THREE.Group();

  // Main body
  const geo = new THREE.BoxGeometry(wM, hM, dM);
  const mat = new THREE.MeshStandardMaterial({
    color: def.color,
    roughness: 0.7,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = hM / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Add details based on type
  addFurnitureDetails(group, item.type, wM, dM, hM, def);

  // Position in room (convert from mm to meters)
  const xM = item.x / 1000;
  const zM = item.y / 1000;
  group.position.set(xM, 0, zM);
  group.rotation.y = -(item.rotation || 0) * Math.PI / 180;

  // Highlight selected
  if (item.id === state.selectedId) {
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x3a5a3a, linewidth: 2 }));
    line.position.y = hM / 2;
    group.add(line);
  }

  scene.add(group);
}

function addFurnitureDetails(group, type, wM, dM, hM, def) {
  switch (type) {
    case 'sofa': {
      // Back cushion
      const backGeo = new THREE.BoxGeometry(wM, hM * 0.4, dM * 0.25);
      const backMat = new THREE.MeshStandardMaterial({ color: adjustColor(def.color, -20), roughness: 0.8 });
      const back = new THREE.Mesh(backGeo, backMat);
      back.position.set(0, hM * 0.8, -dM * 0.35);
      back.castShadow = true;
      group.add(back);
      // Arm rests
      for (const side of [-1, 1]) {
        const armGeo = new THREE.BoxGeometry(wM * 0.06, hM * 0.6, dM);
        const arm = new THREE.Mesh(armGeo, backMat);
        arm.position.set(side * (wM * 0.5 - wM * 0.03), hM * 0.65, 0);
        arm.castShadow = true;
        group.add(arm);
      }
      break;
    }
    case 'table':
    case 'diningTable':
    case 'desk': {
      // Legs
      const legGeo = new THREE.CylinderGeometry(0.025, 0.025, hM - 0.05);
      const legMat = new THREE.MeshStandardMaterial({ color: adjustColor(def.color, -30), roughness: 0.6 });
      const offsets = [
        [-wM / 2 + 0.05, -dM / 2 + 0.05],
        [wM / 2 - 0.05, -dM / 2 + 0.05],
        [-wM / 2 + 0.05, dM / 2 - 0.05],
        [wM / 2 - 0.05, dM / 2 - 0.05],
      ];
      for (const [ox, oz] of offsets) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(ox, (hM - 0.05) / 2, oz);
        leg.castShadow = true;
        group.add(leg);
      }
      break;
    }
    case 'bed': {
      // Headboard
      const hbGeo = new THREE.BoxGeometry(wM, hM * 1.5, 0.06);
      const hbMat = new THREE.MeshStandardMaterial({ color: adjustColor(def.color, -20), roughness: 0.8 });
      const hb = new THREE.Mesh(hbGeo, hbMat);
      hb.position.set(0, hM * 0.75, -dM / 2 + 0.03);
      hb.castShadow = true;
      group.add(hb);
      // Pillow
      const pillowGeo = new THREE.BoxGeometry(wM * 0.35, 0.08, 0.25);
      const pillowMat = new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.9 });
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(pillowGeo, pillowMat);
        p.position.set(side * wM * 0.25, hM + 0.04, -dM * 0.35);
        group.add(p);
      }
      break;
    }
    case 'chair': {
      // Back
      const cbGeo = new THREE.BoxGeometry(wM * 0.9, hM * 0.5, 0.04);
      const cbMat = new THREE.MeshStandardMaterial({ color: adjustColor(def.color, -15), roughness: 0.7 });
      const cb = new THREE.Mesh(cbGeo, cbMat);
      cb.position.set(0, hM * 0.75, -dM / 2 + 0.02);
      cb.castShadow = true;
      group.add(cb);
      break;
    }
    case 'plant': {
      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(0.03, 0.04, hM * 0.5);
      const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 0.9 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = hM * 0.25;
      group.add(trunk);
      // Leaves
      const leafGeo = new THREE.SphereGeometry(wM * 0.5, 8, 8);
      const leafMat = new THREE.MeshStandardMaterial({ color: '#4a8a3a', roughness: 0.8 });
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = hM * 0.7;
      leaf.castShadow = true;
      group.add(leaf);
      break;
    }
    case 'lamp': {
      // Pole
      const poleGeo = new THREE.CylinderGeometry(0.015, 0.02, hM * 0.85);
      const poleMat = new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.5, roughness: 0.3 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = hM * 0.425;
      group.add(pole);
      // Shade
      const shadeGeo = new THREE.ConeGeometry(0.15, 0.2, 16, 1, true);
      const shadeMat = new THREE.MeshStandardMaterial({ color: '#f5e8c8', roughness: 0.8, side: THREE.DoubleSide });
      const shade = new THREE.Mesh(shadeGeo, shadeMat);
      shade.position.y = hM * 0.9;
      shade.rotation.x = Math.PI;
      group.add(shade);
      break;
    }
  }
}

/* ============================================================
   FURNITURE MANAGEMENT
   ============================================================ */
function getItemSize(item) {
  const def = FURNITURE_DEFS[item.type];
  return {
    w: item.w ?? def?.w ?? 500,
    d: item.d ?? def?.d ?? 500,
    h: item.h ?? def?.h ?? 500,
  };
}

function addFurniture(type) {
  const def = FURNITURE_DEFS[type];
  if (!def) return;
  const item = {
    id: state.nextId++,
    type,
    x: state.room.w / 2,
    y: state.room.d / 2,
    rotation: 0,
    w: def.w,
    d: def.d,
    h: def.h,
  };
  state.furnitureItems.push(item);
  selectFurniture(item.id);
  refresh();
}

function selectFurniture(id) {
  state.selectedId = id;
  updateSelectedPanel();
  draw2d();
}

function removeFurniture(id) {
  state.furnitureItems = state.furnitureItems.filter(f => f.id !== id);
  if (state.selectedId === id) {
    state.selectedId = null;
    updateSelectedPanel();
  }
  refresh();
}

function duplicateFurniture(id) {
  const orig = state.furnitureItems.find(f => f.id === id);
  if (!orig) return;
  const copy = { ...orig, id: state.nextId++, x: orig.x + 300, y: orig.y + 300,
    w: orig.w, d: orig.d, h: orig.h };
  clampToRoom(copy);
  state.furnitureItems.push(copy);
  selectFurniture(copy.id);
  refresh();
}

function updateSelectedPanel() {
  const panel = $('selectedPanel');
  const item = state.furnitureItems.find(f => f.id === state.selectedId);
  if (!item) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  const def = FURNITURE_DEFS[item.type];
  $('selName').textContent = def?.name || item.type;
  $('selRotation').value = item.rotation || 0;
  $('selRotVal').textContent = (item.rotation || 0) + '°';
  const size = getItemSize(item);
  $('selW').value = size.w;
  $('selD').value = size.d;
  $('selH').value = size.h;
  $('selSizeDisplay').textContent = `W${size.w} × D${size.d} × H${size.h} mm`;
}

/* ============================================================
   UI WIRING
   ============================================================ */
function refresh() {
  updateRoomInfo();
  draw2d();
  if (state.viewMode === '3d') build3dScene();
}

function updateRoomInfo() {
  const sqm = (state.room.w * state.room.d) / 1e6;
  const jou = sqm / 1.62;
  $('roomInfoBox').textContent = `${sqm.toFixed(1)} ㎡ ｜ ${jou.toFixed(1)} 畳`;
  $('roomDims').textContent = `${state.room.w} × ${state.room.d} mm`;
}

// Step tabs
document.querySelectorAll('.step-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.step-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.step-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    $('step-' + tab.dataset.step).classList.add('active');
  });
});

// View tabs
$('tabFloorplan').addEventListener('click', () => switchView('2d'));
$('tab3D').addEventListener('click', () => switchView('3d'));

function switchView(mode) {
  state.viewMode = mode;
  $('tabFloorplan').classList.toggle('active', mode === '2d');
  $('tab3D').classList.toggle('active', mode === '3d');
  canvas2d.classList.toggle('hidden', mode === '3d');
  canvas3d.classList.toggle('hidden', mode === '2d');

  if (mode === '3d') {
    init3d();
    resize3d();
    build3dScene();
    startRenderLoop();
  } else {
    resizeCanvas2d();
    draw2d();
  }
}

let animating = false;
function startRenderLoop() {
  if (animating) return;
  animating = true;
  function loop() {
    if (state.viewMode !== '3d') { animating = false; return; }
    controls3d.update();
    renderer.render(scene, camera3d);
    requestAnimationFrame(loop);
  }
  loop();
}

// Room size inputs
['roomWidth', 'roomDepth', 'roomHeight'].forEach(id => {
  $(id).addEventListener('input', () => {
    state.room.w = parseInt($('roomWidth').value) || 6000;
    state.room.d = parseInt($('roomDepth').value) || 5000;
    state.room.h = parseInt($('roomHeight').value) || 2400;
    state._3dCameraInited = false;
    refresh();
  });
});

// Templates
document.querySelectorAll('.template-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.room.w = parseInt(btn.dataset.w);
    state.room.d = parseInt(btn.dataset.d);
    $('roomWidth').value = state.room.w;
    $('roomDepth').value = state.room.d;
    state._3dCameraInited = false;
    fitView();
    refresh();
  });
});

// Door controls
$('doorWall').addEventListener('change', () => { state.door.wall = $('doorWall').value; refresh(); });
$('doorPos').addEventListener('input', () => {
  state.door.pos = parseInt($('doorPos').value);
  $('doorPosVal').textContent = state.door.pos + '%';
  refresh();
});
$('doorWidth').addEventListener('input', () => { state.door.width = parseInt($('doorWidth').value) || 800; refresh(); });

// Window controls
$('windowWall').addEventListener('change', () => { state.window.wall = $('windowWall').value; refresh(); });
$('windowPos').addEventListener('input', () => {
  state.window.pos = parseInt($('windowPos').value);
  $('windowPosVal').textContent = state.window.pos + '%';
  refresh();
});
$('windowW').addEventListener('input', () => { state.window.w = parseInt($('windowW').value) || 1800; refresh(); });
$('windowH').addEventListener('input', () => { state.window.h = parseInt($('windowH').value) || 1200; refresh(); });

// Material swatches
function setupSwatches(containerId, colorKey) {
  const container = $(containerId);
  container.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      container.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      state.colors[colorKey] = sw.dataset.color;
      refresh();
    });
  });
}
setupSwatches('floorSwatches', 'floor');
setupSwatches('wallSwatches', 'wall');
setupSwatches('ceilingSwatches', 'ceiling');

// Furniture catalog
document.querySelectorAll('.catalog-item').forEach(btn => {
  btn.addEventListener('click', () => {
    addFurniture(btn.dataset.type);
    // Switch to furniture step if not already
    document.querySelectorAll('.step-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.step-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.step-tab[data-step="furniture"]').classList.add('active');
    $('step-furniture').classList.add('active');
  });
});

// Selected furniture controls
// Size inputs
['selW', 'selD', 'selH'].forEach(inputId => {
  $(inputId).addEventListener('input', () => {
    const item = state.furnitureItems.find(f => f.id === state.selectedId);
    if (!item) return;
    const val = parseInt($(inputId).value);
    if (!val || val < 10) return;
    if (inputId === 'selW') item.w = val;
    if (inputId === 'selD') item.d = val;
    if (inputId === 'selH') item.h = val;
    clampToRoom(item);
    $('selSizeDisplay').textContent = `W${item.w} × D${item.d} × H${item.h} mm`;
    refresh();
  });
});
$('btnResetSize').addEventListener('click', () => {
  const item = state.furnitureItems.find(f => f.id === state.selectedId);
  if (!item) return;
  const def = FURNITURE_DEFS[item.type];
  if (!def) return;
  item.w = def.w;
  item.d = def.d;
  item.h = def.h;
  updateSelectedPanel();
  refresh();
});

$('selRotation').addEventListener('input', () => {
  const item = state.furnitureItems.find(f => f.id === state.selectedId);
  if (!item) return;
  item.rotation = parseInt($('selRotation').value);
  $('selRotVal').textContent = item.rotation + '°';
  refresh();
});
$('btnRotate90').addEventListener('click', () => {
  const item = state.furnitureItems.find(f => f.id === state.selectedId);
  if (!item) return;
  item.rotation = (item.rotation + 90) % 360;
  $('selRotation').value = item.rotation;
  $('selRotVal').textContent = item.rotation + '°';
  refresh();
});
$('btnDuplicate').addEventListener('click', () => {
  if (state.selectedId) duplicateFurniture(state.selectedId);
});
$('btnDelete').addEventListener('click', () => {
  if (state.selectedId) removeFurniture(state.selectedId);
});

// Zoom buttons
$('btnZoomIn').addEventListener('click', () => {
  view2d.scale *= 1.2;
  view2d.scale = Math.min(0.5, view2d.scale);
  draw2d();
});
$('btnZoomOut').addEventListener('click', () => {
  view2d.scale *= 0.8;
  view2d.scale = Math.max(0.02, view2d.scale);
  draw2d();
});
$('btnFitView').addEventListener('click', () => { fitView(); draw2d(); });

// Snap toggle
$('snapToggle').addEventListener('change', () => {
  state.snap = $('snapToggle').checked;
});
$('snapSizeSelect').addEventListener('change', () => {
  state.snapSize = parseInt($('snapSizeSelect').value, 10);
});

// Save / Load  (localStorage)
const STORAGE_KEY = 'roommaker_layouts';

function getAllLayouts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveAllLayouts(layouts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
}

function buildProjectData() {
  return {
    room: { ...state.room },
    colors: { ...state.colors },
    door: { ...state.door },
    window: { ...state.window },
    furnitureItems: state.furnitureItems.map(f => ({ ...f })),
    nextId: state.nextId,
  };
}
function loadProjectData(data) {
  if (data.room) Object.assign(state.room, data.room);
  if (data.colors) Object.assign(state.colors, data.colors);
  if (data.door) Object.assign(state.door, data.door);
  if (data.window) Object.assign(state.window, data.window);
  if (data.furnitureItems) state.furnitureItems = data.furnitureItems;
  if (data.nextId) state.nextId = data.nextId;
  syncUIFromState();
  fitView();
  refresh();
}

function saveCurrentProject() {
  if (!state.currentProjectId) return;
  const layouts = getAllLayouts();
  const idx = layouts.findIndex(l => l.id === state.currentProjectId);
  if (idx === -1) return;
  layouts[idx].name = $('projectName').value.trim() || '無題';
  layouts[idx].updatedAt = new Date().toISOString();
  layouts[idx].data = buildProjectData();
  saveAllLayouts(layouts);
  showToast('保存しました');
}

$('btnSave').addEventListener('click', () => saveCurrentProject());

// Export JSON file
$('btnExport').addEventListener('click', () => {
  const data = buildProjectData();
  data.name = $('projectName').value.trim() || '無題';
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (data.name || 'room_layout') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('JSONをエクスポートしました');
});

/* ============================================================
   TOP SCREEN / PROJECT MANAGEMENT
   ============================================================ */
function showTopScreen() {
  $('top-screen').classList.remove('hidden');
  $('app').classList.add('hidden');
  state.currentProjectId = null;
  renderSavedList();
}

function showEditor() {
  $('top-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
  state._3dCameraInited = false;
}

function resetState() {
  Object.assign(state.room, { w: 6000, d: 5000, h: 2400 });
  Object.assign(state.colors, { floor: '#c8a876', wall: '#f5f0e8', ceiling: '#ffffff' });
  Object.assign(state.door, { wall: 'south', pos: 50, width: 800 });
  Object.assign(state.window, { wall: 'north', pos: 50, w: 1800, h: 1200 });
  state.furnitureItems = [];
  state.selectedId = null;
  state.nextId = 1;
}

function createNewProject() {
  resetState();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const layout = {
    id,
    name: '新しい間取り',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    data: buildProjectData(),
  };
  const layouts = getAllLayouts();
  layouts.unshift(layout);
  saveAllLayouts(layouts);
  state.currentProjectId = id;
  $('projectName').value = layout.name;
  syncUIFromState();
  showEditor();
  resizeCanvas2d();
  fitView();
  refresh();
}

function openProject(id) {
  const layouts = getAllLayouts();
  const layout = layouts.find(l => l.id === id);
  if (!layout) { showToast('データが見つかりません'); return; }
  resetState();
  state.currentProjectId = id;
  $('projectName').value = layout.name;
  loadProjectData(layout.data);
  showEditor();
  resizeCanvas2d();
  fitView();
  refresh();
}

function deleteProject(id) {
  const layouts = getAllLayouts().filter(l => l.id !== id);
  saveAllLayouts(layouts);
  renderSavedList();
  showToast('削除しました');
}

function formatDate(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderSavedList() {
  const list = $('savedList');
  const empty = $('emptyMsg');
  const layouts = getAllLayouts();
  list.innerHTML = '';
  if (layouts.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  layouts.forEach(l => {
    const card = document.createElement('div');
    card.className = 'saved-card';
    const roomInfo = l.data && l.data.room
      ? `${(l.data.room.w/1000).toFixed(1)}m × ${(l.data.room.d/1000).toFixed(1)}m`
      : '';
    const furnitureCount = l.data && l.data.furnitureItems ? l.data.furnitureItems.length : 0;
    card.innerHTML = `
      <div class="saved-card-info">
        <div class="saved-card-name">${escapeHtml(l.name)}</div>
        <div class="saved-card-meta">${roomInfo} ・ 家具${furnitureCount}点 ・ ${formatDate(l.updatedAt)}</div>
      </div>
      <div class="saved-card-actions">
        <button class="saved-card-btn open-btn" data-id="${l.id}">開く</button>
        <button class="saved-card-btn danger del-btn" data-id="${l.id}">削除</button>
      </div>`;
    card.querySelector('.saved-card-info').addEventListener('click', () => openProject(l.id));
    card.querySelector('.open-btn').addEventListener('click', e => { e.stopPropagation(); openProject(l.id); });
    card.querySelector('.del-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`「${l.name}」を削除しますか？`)) deleteProject(l.id);
    });
    list.appendChild(card);
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Top screen buttons
$('btnNewProject').addEventListener('click', () => createNewProject());
$('btnBackTop').addEventListener('click', () => {
  saveCurrentProject();
  showTopScreen();
});

// Import JSON on top screen
$('btnImportFile').addEventListener('click', () => $('fileImport').click());
$('fileImport').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const layout = {
        id,
        name: data.name || file.name.replace(/\.json$/i, ''),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: {
          room: data.room,
          colors: data.colors,
          door: data.door,
          window: data.window,
          furnitureItems: data.furnitureItems || [],
          nextId: data.nextId || 1,
        },
      };
      const layouts = getAllLayouts();
      layouts.unshift(layout);
      saveAllLayouts(layouts);
      renderSavedList();
      showToast('インポートしました');
    } catch {
      showToast('ファイルの読込に失敗しました');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

function syncUIFromState() {
  $('roomWidth').value = state.room.w;
  $('roomDepth').value = state.room.d;
  $('roomHeight').value = state.room.h;
  $('doorWall').value = state.door.wall;
  $('doorPos').value = state.door.pos;
  $('doorPosVal').textContent = state.door.pos + '%';
  $('doorWidth').value = state.door.width;
  $('windowWall').value = state.window.wall;
  $('windowPos').value = state.window.pos;
  $('windowPosVal').textContent = state.window.pos + '%';
  $('windowW').value = state.window.w;
  $('windowH').value = state.window.h;
}

// Keyboard shortcuts
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  const item = state.furnitureItems.find(f => f.id === state.selectedId);

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (state.selectedId) { e.preventDefault(); removeFurniture(state.selectedId); }
  }
  if (e.key === 'r' || e.key === 'R') {
    if (item) {
      item.rotation = (item.rotation + 90) % 360;
      updateSelectedPanel();
      refresh();
    }
  }
  if (e.key === 'Escape') {
    selectFurniture(null);
    draw2d();
  }
  if ((e.key === 'd' || e.key === 'D') && e.ctrlKey) {
    e.preventDefault();
    if (state.selectedId) duplicateFurniture(state.selectedId);
  }
  if (e.key === 's' && e.ctrlKey) {
    e.preventDefault();
    saveCurrentProject();
  }
  // Arrow nudge
  if (item && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const step = e.shiftKey ? 50 : 250;
    if (e.key === 'ArrowLeft') item.x -= step;
    if (e.key === 'ArrowRight') item.x += step;
    if (e.key === 'ArrowUp') item.y -= step;
    if (e.key === 'ArrowDown') item.y += step;
    clampToRoom(item);
    refresh();
  }
});

/* ============================================================
   TOAST
   ============================================================ */
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

/* ============================================================
   UTILITY
   ============================================================ */
function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/* ============================================================
   INIT
   ============================================================ */
function initSwatchColors() {
  document.querySelectorAll('.swatch').forEach(sw => {
    const color = sw.dataset.color;
    if (color) sw.querySelector('span').style.background = color;
  });
}

function init() {
  initSwatchColors();
  showTopScreen();
}

window.addEventListener('resize', () => {
  if ($('app').classList.contains('hidden')) return;
  if (state.viewMode === '2d') {
    resizeCanvas2d();
    draw2d();
  } else {
    resize3d();
  }
});

init();
