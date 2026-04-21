import { FURNITURE_DEFS } from './constants.js';
import { adjustColor, clamp } from './utils.js';

export class Floorplan2D {
  constructor(canvas, stateManager, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stateManager = stateManager;
    this.callbacks = callbacks;
    this.view = { cx: 0, cy: 0, scale: 0.1, dragging: false, dragStart: null, panStart: null };
    this.dragItem = null;
    this.dragOffset = { x: 0, y: 0 };
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', event => this.handlePointerDown(event));
    this.canvas.addEventListener('pointermove', event => this.handlePointerMove(event));
    this.canvas.addEventListener('pointerup', () => this.handlePointerUp());
    this.canvas.addEventListener('pointerleave', () => this.handlePointerUp());
    this.canvas.addEventListener('wheel', event => this.handleWheel(event), { passive: false });
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * devicePixelRatio;
    this.canvas.height = rect.height * devicePixelRatio;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  fitView() {
    const room = this.stateManager.state.room;
    const canvasWidth = this.canvas.width / devicePixelRatio;
    const canvasHeight = this.canvas.height / devicePixelRatio;
    const padding = Math.min(canvasWidth, canvasHeight) * 0.08 + 40;
    const scaleX = (canvasWidth - padding) / room.w;
    const scaleY = (canvasHeight - padding) / room.d;
    this.view.scale = Math.min(scaleX, scaleY);
    this.view.cx = room.w / 2;
    this.view.cy = room.d / 2;
  }

  zoomIn() {
    this.view.scale = Math.min(0.5, this.view.scale * 1.2);
    this.draw();
  }

  zoomOut() {
    this.view.scale = Math.max(0.02, this.view.scale * 0.8);
    this.draw();
  }

  draw() {
    const canvasWidth = this.canvas.width / devicePixelRatio;
    const canvasHeight = this.canvas.height / devicePixelRatio;
    const { ctx } = this;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#e8e8e4';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    this.drawGrid(canvasWidth, canvasHeight);
    this.drawRoom();
    this.stateManager.state.furnitureItems.forEach(item => this.drawFurniture(item));
    this.drawDimensions();
  }

  handlePointerDown(event) {
    const position = this.getCanvasPosition(event);
    const world = this.screenToWorld(position.x, position.y);
    const hit = this.hitTestFurniture(world.x, world.y);

    if (hit) {
      this.stateManager.selectFurniture(hit.id);
      this.dragItem = hit;
      this.dragOffset.x = hit.x - world.x;
      this.dragOffset.y = hit.y - world.y;
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    this.stateManager.selectFurniture(null);
    this.view.dragging = true;
    this.view.dragStart = { x: position.x, y: position.y };
    this.view.panStart = { cx: this.view.cx, cy: this.view.cy };
    this.canvas.style.cursor = 'move';
  }

  handlePointerMove(event) {
    const position = this.getCanvasPosition(event);
    const world = this.screenToWorld(position.x, position.y);

    if (this.dragItem) {
      this.stateManager.moveFurniture(
        this.dragItem.id,
        {
          x: this.snapValue(world.x + this.dragOffset.x),
          y: this.snapValue(world.y + this.dragOffset.y),
        },
        { silent: true }
      );
      this.draw();
      return;
    }

    if (this.view.dragging) {
      const dx = (position.x - this.view.dragStart.x) / this.view.scale;
      const dy = (position.y - this.view.dragStart.y) / this.view.scale;
      this.view.cx = this.view.panStart.cx - dx;
      this.view.cy = this.view.panStart.cy - dy;
      this.draw();
      return;
    }

    this.canvas.style.cursor = this.hitTestFurniture(world.x, world.y) ? 'grab' : 'default';
  }

  handlePointerUp() {
    if (this.dragItem) {
      this.stateManager.moveFurniture(this.dragItem.id, {
        x: this.dragItem.x,
        y: this.dragItem.y,
      });
    }
    this.dragItem = null;
    this.view.dragging = false;
    this.canvas.style.cursor = 'default';
  }

  handleWheel(event) {
    event.preventDefault();
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const position = this.getCanvasPosition(event);
    const worldBefore = this.screenToWorld(position.x, position.y);
    this.view.scale = clamp(this.view.scale * zoomFactor, 0.02, 0.5);
    const worldAfter = this.screenToWorld(position.x, position.y);
    this.view.cx += worldBefore.x - worldAfter.x;
    this.view.cy += worldBefore.y - worldAfter.y;
    this.draw();
  }

  getCanvasPosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  mmToPx(mm) {
    return mm * this.view.scale;
  }

  worldToScreen(xMm, yMm) {
    const canvasWidth = this.canvas.width / devicePixelRatio;
    const canvasHeight = this.canvas.height / devicePixelRatio;
    return {
      x: canvasWidth / 2 + (xMm - this.view.cx) * this.view.scale,
      y: canvasHeight / 2 + (yMm - this.view.cy) * this.view.scale,
    };
  }

  screenToWorld(screenX, screenY) {
    const canvasWidth = this.canvas.width / devicePixelRatio;
    const canvasHeight = this.canvas.height / devicePixelRatio;
    return {
      x: (screenX - canvasWidth / 2) / this.view.scale + this.view.cx,
      y: (screenY - canvasHeight / 2) / this.view.scale + this.view.cy,
    };
  }

  snapValue(value) {
    const state = this.stateManager.state;
    if (!state.snap) return value;
    return Math.round(value / state.snapSize) * state.snapSize;
  }

  hitTestFurniture(worldX, worldY) {
    const items = this.stateManager.state.furnitureItems;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (!FURNITURE_DEFS[item.type]) continue;

      const size = this.stateManager.getItemSize(item);
      const rotation = -(item.rotation || 0) * Math.PI / 180;
      const dx = worldX - item.x;
      const dy = worldY - item.y;
      const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
      const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
      if (Math.abs(localX) <= size.w / 2 && Math.abs(localY) <= size.d / 2) {
        return item;
      }
    }
    return null;
  }

  drawGrid(canvasWidth, canvasHeight) {
    const gridMm = 500;
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(canvasWidth, canvasHeight);
    const startX = Math.floor(topLeft.x / gridMm) * gridMm;
    const startY = Math.floor(topLeft.y / gridMm) * gridMm;

    this.ctx.strokeStyle = '#d8d8d4';
    this.ctx.lineWidth = 0.5;
    this.ctx.beginPath();

    for (let x = startX; x <= bottomRight.x; x += gridMm) {
      const screenX = this.worldToScreen(x, 0).x;
      this.ctx.moveTo(screenX, 0);
      this.ctx.lineTo(screenX, canvasHeight);
    }

    for (let y = startY; y <= bottomRight.y; y += gridMm) {
      const screenY = this.worldToScreen(0, y).y;
      this.ctx.moveTo(0, screenY);
      this.ctx.lineTo(canvasWidth, screenY);
    }

    this.ctx.stroke();
  }

  drawRoom() {
    const state = this.stateManager.state;
    const { w, d } = state.room;
    const topLeft = this.worldToScreen(0, 0);
    const bottomRight = this.worldToScreen(w, d);
    const roomWidth = bottomRight.x - topLeft.x;
    const roomHeight = bottomRight.y - topLeft.y;

    this.ctx.fillStyle = state.colors.floor;
    this.ctx.fillRect(topLeft.x, topLeft.y, roomWidth, roomHeight);

    this.ctx.strokeStyle = adjustColor(state.colors.floor, -15);
    this.ctx.lineWidth = 0.5;
    for (let y = 0; y <= d; y += 200) {
      const screenY = this.worldToScreen(0, y).y;
      this.ctx.beginPath();
      this.ctx.moveTo(topLeft.x, screenY);
      this.ctx.lineTo(bottomRight.x, screenY);
      this.ctx.stroke();
    }

    const wallPx = Math.max(6, this.mmToPx(120));
    this.drawWallWithOpening('south', topLeft.x, bottomRight.y - wallPx / 2, roomWidth, wallPx);
    this.drawWallWithOpening('north', topLeft.x, topLeft.y - wallPx / 2, roomWidth, wallPx);
    this.drawWallWithOpening('west', topLeft.x - wallPx / 2, topLeft.y, wallPx, roomHeight);
    this.drawWallWithOpening('east', bottomRight.x - wallPx / 2, topLeft.y, wallPx, roomHeight);
  }

  drawWallWithOpening(wallName, x, y, w, h) {
    const state = this.stateManager.state;
    const isHorizontal = wallName === 'south' || wallName === 'north';
    const wallLength = isHorizontal ? state.room.w : state.room.d;
    const openings = [];

    if (state.door.wall === wallName) {
      const center = wallLength * (state.door.pos / 100);
      openings.push({ start: center - state.door.width / 2, end: center + state.door.width / 2, type: 'door' });
    }
    if (state.window.wall === wallName) {
      const center = wallLength * (state.window.pos / 100);
      openings.push({ start: center - state.window.w / 2, end: center + state.window.w / 2, type: 'window' });
    }

    openings.sort((left, right) => left.start - right.start);
    this.ctx.fillStyle = '#555';

    let position = 0;
    for (const opening of openings) {
      const gapStart = Math.max(0, opening.start);
      const gapEnd = Math.min(wallLength, opening.end);
      if (position < gapStart) {
        this.drawWallSegment(x, y, w, h, position, gapStart, isHorizontal);
      }
      this.drawOpeningMarker(wallName, x, y, w, h, gapStart, gapEnd, isHorizontal, opening.type);
      position = gapEnd;
    }

    if (position < wallLength) {
      this.drawWallSegment(x, y, w, h, position, wallLength, isHorizontal);
    }
  }

  drawWallSegment(baseX, baseY, baseW, baseH, fromMm, toMm, isHorizontal) {
    const roomTopLeft = this.worldToScreen(0, 0);
    if (isHorizontal) {
      const screenX = roomTopLeft.x + this.mmToPx(fromMm);
      const screenWidth = this.mmToPx(toMm - fromMm);
      this.ctx.fillRect(screenX, baseY, screenWidth, baseH);
      return;
    }

    const screenY = roomTopLeft.y + this.mmToPx(fromMm);
    const screenHeight = this.mmToPx(toMm - fromMm);
    this.ctx.fillRect(baseX, screenY, baseW, screenHeight);
  }

  drawOpeningMarker(wallName, baseX, baseY, baseW, baseH, fromMm, toMm, isHorizontal, type) {
    const roomTopLeft = this.worldToScreen(0, 0);
    const lineWidth = Math.max(2, baseH * 0.4);

    if (isHorizontal) {
      const screenX = roomTopLeft.x + this.mmToPx(fromMm);
      const screenWidth = this.mmToPx(toMm - fromMm);
      const centerY = baseY + baseH / 2;
      if (type === 'door') {
        this.ctx.strokeStyle = '#888';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        const radius = screenWidth;
        const startAngle = wallName === 'south' ? Math.PI : 0;
        const endAngle = wallName === 'south' ? Math.PI * 1.5 : Math.PI * 0.5;
        this.ctx.arc(screenX, centerY, radius, startAngle, endAngle);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(screenX, centerY);
        this.ctx.lineTo(screenX, centerY + (wallName === 'south' ? -radius : radius));
        this.ctx.stroke();
        return;
      }

      this.ctx.strokeStyle = '#4a90d9';
      this.ctx.lineWidth = lineWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(screenX, centerY);
      this.ctx.lineTo(screenX + screenWidth, centerY);
      this.ctx.stroke();
      this.ctx.strokeStyle = '#80b8f0';
      this.ctx.lineWidth = lineWidth * 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(screenX, centerY);
      this.ctx.lineTo(screenX + screenWidth, centerY);
      this.ctx.stroke();
      return;
    }

    const screenY = roomTopLeft.y + this.mmToPx(fromMm);
    const screenHeight = this.mmToPx(toMm - fromMm);
    const centerX = baseX + baseW / 2;
    if (type === 'door') {
      this.ctx.strokeStyle = '#888';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      const radius = screenHeight;
      const startAngle = wallName === 'west' ? -Math.PI * 0.5 : Math.PI * 0.5;
      const endAngle = wallName === 'west' ? 0 : Math.PI;
      this.ctx.arc(centerX, screenY, radius, startAngle, endAngle);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, screenY);
      this.ctx.lineTo(centerX + (wallName === 'west' ? radius : -radius), screenY);
      this.ctx.stroke();
      return;
    }

    this.ctx.strokeStyle = '#4a90d9';
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, screenY);
    this.ctx.lineTo(centerX, screenY + screenHeight);
    this.ctx.stroke();
    this.ctx.strokeStyle = '#80b8f0';
    this.ctx.lineWidth = lineWidth * 0.5;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, screenY);
    this.ctx.lineTo(centerX, screenY + screenHeight);
    this.ctx.stroke();
  }

  drawFurniture(item) {
    const definition = FURNITURE_DEFS[item.type];
    if (!definition) return;

    const size = this.stateManager.getItemSize(item);
    const center = this.worldToScreen(item.x, item.y);
    const rotation = (item.rotation || 0) * Math.PI / 180;
    const pixelWidth = this.mmToPx(size.w);
    const pixelDepth = this.mmToPx(size.d);
    const selected = item.id === this.stateManager.state.selectedId;

    this.ctx.save();
    this.ctx.translate(center.x, center.y);
    this.ctx.rotate(rotation);

    this.ctx.fillStyle = 'rgba(0,0,0,0.08)';
    this.ctx.fillRect(-pixelWidth / 2 + 2, -pixelDepth / 2 + 2, pixelWidth, pixelDepth);

    this.ctx.fillStyle = selected ? adjustColor(definition.color, 20) : definition.color;
    this.ctx.fillRect(-pixelWidth / 2, -pixelDepth / 2, pixelWidth, pixelDepth);

    this.ctx.strokeStyle = selected ? '#3a5a3a' : 'rgba(0,0,0,0.2)';
    this.ctx.lineWidth = selected ? 2 : 1;
    this.ctx.strokeRect(-pixelWidth / 2, -pixelDepth / 2, pixelWidth, pixelDepth);

    if (selected) {
      this.ctx.fillStyle = '#3a5a3a';
      const handleSize = 4;
      [[-pixelWidth / 2, -pixelDepth / 2], [pixelWidth / 2, -pixelDepth / 2], [-pixelWidth / 2, pixelDepth / 2], [pixelWidth / 2, pixelDepth / 2]].forEach(([handleX, handleY]) => {
        this.ctx.fillRect(handleX - handleSize, handleY - handleSize, handleSize * 2, handleSize * 2);
      });
    }

    const fontSize = Math.max(9, Math.min(12, pixelWidth / 6));
    this.ctx.fillStyle = selected ? '#1a3a1a' : 'rgba(0,0,0,0.5)';
    this.ctx.font = `bold ${fontSize}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    if (pixelWidth > 30) {
      this.ctx.fillText(definition.name, 0, -fontSize * 0.5);
      this.ctx.font = `${Math.max(8, fontSize - 2)}px sans-serif`;
      this.ctx.fillStyle = selected ? '#2a4a2a' : 'rgba(0,0,0,0.35)';
      this.ctx.fillText(`${size.w}×${size.d}`, 0, fontSize * 0.5);
    }

    this.ctx.fillStyle = selected ? '#3a5a3a' : 'rgba(0,0,0,0.25)';
    this.ctx.beginPath();
    this.ctx.moveTo(-6, -pixelDepth / 2);
    this.ctx.lineTo(6, -pixelDepth / 2);
    this.ctx.lineTo(0, -pixelDepth / 2 - 6);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  drawDimensions() {
    const room = this.stateManager.state.room;
    const topLeft = this.worldToScreen(0, 0);
    const bottomRight = this.worldToScreen(room.w, room.d);

    this.ctx.fillStyle = '#666';
    this.ctx.font = '11px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const topY = topLeft.y - 18;
    this.ctx.beginPath();
    this.ctx.moveTo(topLeft.x, topY);
    this.ctx.lineTo(bottomRight.x, topY);
    this.ctx.strokeStyle = '#999';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(topLeft.x, topY - 4);
    this.ctx.lineTo(topLeft.x, topY + 4);
    this.ctx.moveTo(bottomRight.x, topY - 4);
    this.ctx.lineTo(bottomRight.x, topY + 4);
    this.ctx.stroke();
    this.ctx.fillText(`${room.w} mm`, (topLeft.x + bottomRight.x) / 2, topY - 10);

    const leftX = topLeft.x - 18;
    this.ctx.beginPath();
    this.ctx.moveTo(leftX, topLeft.y);
    this.ctx.lineTo(leftX, bottomRight.y);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(leftX - 4, topLeft.y);
    this.ctx.lineTo(leftX + 4, topLeft.y);
    this.ctx.moveTo(leftX - 4, bottomRight.y);
    this.ctx.lineTo(leftX + 4, bottomRight.y);
    this.ctx.stroke();
    this.ctx.save();
    this.ctx.translate(leftX - 10, (topLeft.y + bottomRight.y) / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.fillText(`${room.d} mm`, 0, 0);
    this.ctx.restore();
  }
}