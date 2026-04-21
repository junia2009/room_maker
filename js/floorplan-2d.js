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
    this.dragRoom = null;
    this.dragRoomOffset = null;
    this.dragOpening = null;   // { opening, room, wallName, isHorizontal }
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
    const rooms = this.stateManager.state.rooms;
    if (!rooms || rooms.length === 0) {
      const room = this.stateManager.getPrimaryRoom() || this.stateManager.state.room;
      const canvasWidth = this.canvas.width / devicePixelRatio;
      const canvasHeight = this.canvas.height / devicePixelRatio;
      const padding = Math.min(canvasWidth, canvasHeight) * 0.08 + 40;
      this.view.scale = Math.min((canvasWidth - padding) / room.w, (canvasHeight - padding) / room.d);
      this.view.cx = room.w / 2;
      this.view.cy = room.d / 2;
      return;
    }
    const minX = Math.min(...rooms.map(r => r.x));
    const minY = Math.min(...rooms.map(r => r.y));
    const maxX = Math.max(...rooms.map(r => r.x + r.w));
    const maxY = Math.max(...rooms.map(r => r.y + r.d));
    const totalW = maxX - minX;
    const totalH = maxY - minY;
    const canvasWidth = this.canvas.width / devicePixelRatio;
    const canvasHeight = this.canvas.height / devicePixelRatio;
    const padding = Math.min(canvasWidth, canvasHeight) * 0.08 + 40;
    this.view.scale = Math.min((canvasWidth - padding) / totalW, (canvasHeight - padding) / totalH);
    this.view.cx = minX + totalW / 2;
    this.view.cy = minY + totalH / 2;
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
    const rooms = this.stateManager.state.rooms;
    const activeId = this.stateManager.state.activeRoomId;
    if (rooms.length > 1) this.drawRoomConnections(rooms);
    rooms.forEach(room => this.drawSingleRoom(room, room.id === activeId));
    this.stateManager.state.furnitureItems.forEach(item => this.drawFurniture(item));
    if (this.stateManager.state.showDimensions !== false) {
      rooms.forEach(room => this.drawDimensions(room));
    }
    this.drawSelectedDistances();
    this.drawCompass(canvasWidth, canvasHeight);
  }

  handlePointerDown(event) {
    const position = this.getCanvasPosition(event);
    const world = this.screenToWorld(position.x, position.y);

    // 開口部ドラッグ（最優先）
    const hitOp = this.hitTestOpening(world.x, world.y);
    if (hitOp) {
      this.stateManager._saveSnapshot();
      this.dragOpening = hitOp;
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.style.cursor = 'ew-resize';
      return;
    }

    const hit = this.hitTestFurniture(world.x, world.y);

    if (hit) {
      if (event.shiftKey) {
        // Shift+クリック: 複数選択
        this.stateManager.toggleMultiSelect(hit.id);
      } else {
        // 通常クリック: 単独選択
        this.stateManager.clearMultiSelect();
        this.stateManager.selectFurniture(hit.id);
        // グループの場合はグループ全体を選択
        const group = this.stateManager.getGroupOf(hit.id);
        if (group) {
          group.memberIds.forEach(mid => {
            if (mid !== hit.id) this.stateManager.toggleMultiSelect(mid);
          });
          this.stateManager.toggleMultiSelect(hit.id);
          this.stateManager.selectFurniture(null);
        }
      }
      if (!event.shiftKey) {
        const group = this.stateManager.getGroupOf(hit.id);
        if (!group) {
          this.dragItem = hit;
          this.dragOffset.x = hit.x - world.x;
          this.dragOffset.y = hit.y - world.y;
          this.canvas.setPointerCapture(event.pointerId);
          this.canvas.style.cursor = 'grabbing';
        } else {
          // グループ全体ドラッグ: multiSelectIds を使う
          this._dragGroupStart = { worldX: world.x, worldY: world.y };
          this._dragGroupBasePositions = this.stateManager.state.multiSelectIds.map(id => {
            const item = this.stateManager.state.furnitureItems.find(f => f.id === id);
            return { id, x: item.x, y: item.y };
          });
          this.canvas.setPointerCapture(event.pointerId);
          this.canvas.style.cursor = 'grabbing';
        }
      }
      return;
    }

    const hitRoom = this.hitTestRoom(world.x, world.y);
    if (hitRoom && hitRoom.id !== this.stateManager.state.activeRoomId) {
      this.stateManager.setActiveRoomId(hitRoom.id);
      return;
    }

    // Shift+ドラッグ でアクティブ部屋を移動
    if (event.shiftKey && hitRoom && hitRoom.id === this.stateManager.state.activeRoomId) {
      this.dragRoom = hitRoom;
      this.dragRoomOffset = { x: hitRoom.x - world.x, y: hitRoom.y - world.y };
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.style.cursor = 'move';
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

    if (this._dragGroupStart) {
      const dx = this.snapValue(world.x - this._dragGroupStart.worldX);
      const dy = this.snapValue(world.y - this._dragGroupStart.worldY);
      this._dragGroupBasePositions.forEach(({ id, x, y }) => {
        this.stateManager.moveFurniture(id, { x: x + dx, y: y + dy }, { silent: true });
      });
      this.draw();
      return;
    }

    if (this.dragOpening) {
      const { opening, room, isHorizontal } = this.dragOpening;
      const wallLength = isHorizontal ? room.w : room.d;
      const localPos = isHorizontal ? (world.x - room.x) : (world.y - room.y);
      const halfW = opening.width / 2;
      const clampedPos = Math.max(halfW, Math.min(wallLength - halfW, localPos));
      opening.positionPercent = (clampedPos / wallLength) * 100;
      this.draw();
      return;
    }

    if (this.dragRoom) {
      const newX = this.snapValue(world.x + this.dragRoomOffset.x);
      const newY = this.snapValue(world.y + this.dragRoomOffset.y);
      // ステートを直接更新して silent draw
      const room = this.stateManager.state.rooms.find(r => r.id === this.dragRoom.id);
      if (room) {
        room.x = newX;
        room.y = newY;
        this.draw();
      }
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

    const hitFurniture = this.hitTestFurniture(world.x, world.y);
    if (hitFurniture) {
      this.canvas.style.cursor = 'grab';
    } else {
      const hitRoom = this.hitTestRoom(world.x, world.y);
      this.canvas.style.cursor = (hitRoom && event.shiftKey) ? 'move' : 'default';
    }
  }

  handlePointerUp() {
    if (this.dragOpening) {
      const { opening } = this.dragOpening;
      this.stateManager.updateOpening(opening.id, { positionPercent: opening.positionPercent });
      this.dragOpening = null;
    }
    if (this.dragItem) {
      this.stateManager.moveFurniture(this.dragItem.id, {
        x: this.dragItem.x,
        y: this.dragItem.y,
      });
      this.stateManager.commitMove();
    }
    if (this._dragGroupStart) {
      this._dragGroupBasePositions.forEach(({ id }) => {
        const item = this.stateManager.state.furnitureItems.find(f => f.id === id);
        if (item) this.stateManager.moveFurniture(id, { x: item.x, y: item.y }, { silent: true });
      });
      this.stateManager.commitMove();
      this._dragGroupStart = null;
      this._dragGroupBasePositions = null;
    }
    if (this.dragRoom) {
      this.stateManager._saveSnapshot();
      this.stateManager.emitChange('setRoomDimensions', { rooms: this.stateManager.state.rooms });
      this.dragRoom = null;
      this.dragRoomOffset = null;
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

  hitTestRoom(worldX, worldY) {
    const rooms = this.stateManager.state.rooms;
    for (let i = rooms.length - 1; i >= 0; i--) {
      const room = rooms[i];
      if (worldX >= room.x && worldX <= room.x + room.w && worldY >= room.y && worldY <= room.y + room.d) {
        return room;
      }
    }
    return null;
  }

  hitTestFurniture(worldX, worldY) {    const items = this.stateManager.state.furnitureItems;
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

  hitTestOpening(worldX, worldY) {
    const rooms = this.stateManager.state.rooms;
    const threshold = Math.max(80, 120 / this.view.scale);
    for (const room of rooms) {
      for (const opening of this.stateManager.state.openings.filter(o => o.roomId === room.id)) {
        const isHorizontal = opening.wall === 'north' || opening.wall === 'south';
        const wallLength = isHorizontal ? room.w : room.d;
        const posOnWall = wallLength * (opening.positionPercent / 100);
        let wx, wy;
        if (opening.wall === 'north')  { wx = room.x + posOnWall; wy = room.y; }
        else if (opening.wall === 'south') { wx = room.x + posOnWall; wy = room.y + room.d; }
        else if (opening.wall === 'west')  { wx = room.x; wy = room.y + posOnWall; }
        else                                { wx = room.x + room.w; wy = room.y + posOnWall; }

        const dist = Math.hypot(worldX - wx, worldY - wy);
        if (dist < threshold) {
          return { opening, room, wallName: opening.wall, isHorizontal };
        }
      }
    }
    return null;
  }

  drawGrid(canvasWidth, canvasHeight) {
    if (!this.stateManager.state.showGrid) return;
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

  drawSingleRoom(room, isActive = false) {
    const state = this.stateManager.state;
    const { w, d } = room;
    const topLeft = this.worldToScreen(room.x, room.y);
    const bottomRight = this.worldToScreen(room.x + w, room.y + d);
    const roomWidth = bottomRight.x - topLeft.x;
    const roomHeight = bottomRight.y - topLeft.y;

    this.ctx.fillStyle = state.colors.floor;
    this.ctx.fillRect(topLeft.x, topLeft.y, roomWidth, roomHeight);

    this.ctx.strokeStyle = adjustColor(state.colors.floor, -15);
    this.ctx.lineWidth = 0.5;
    for (let y = 0; y <= d; y += 200) {
      const screenY = this.worldToScreen(room.x, room.y + y).y;
      this.ctx.beginPath();
      this.ctx.moveTo(topLeft.x, screenY);
      this.ctx.lineTo(bottomRight.x, screenY);
      this.ctx.stroke();
    }

    if (isActive) {
      this.ctx.strokeStyle = '#3a5a3a';
      this.ctx.lineWidth = 2.5;
      this.ctx.strokeRect(topLeft.x, topLeft.y, roomWidth, roomHeight);
    }

    const wallPx = Math.max(4, this.mmToPx(state.wallThickness || 120));
    this.drawWallWithOpening(room, 'south', topLeft.x, bottomRight.y - wallPx / 2, roomWidth, wallPx);
    this.drawWallWithOpening(room, 'north', topLeft.x, topLeft.y - wallPx / 2, roomWidth, wallPx);
    this.drawWallWithOpening(room, 'west', topLeft.x - wallPx / 2, topLeft.y, wallPx, roomHeight);
    this.drawWallWithOpening(room, 'east', bottomRight.x - wallPx / 2, topLeft.y, wallPx, roomHeight);

    const showLabel = this.stateManager.state.rooms.length > 1 || this.stateManager.state.showRoomLabel;
    if (showLabel) {
      this.ctx.fillStyle = isActive ? '#3a5a3a' : '#888';
      this.ctx.font = `bold ${Math.max(11, this.mmToPx(200))}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText(room.name || room.id, (topLeft.x + bottomRight.x) / 2, topLeft.y + 6);
    }
  }

  drawWallWithOpening(room, wallName, x, y, w, h) {
    const state = this.stateManager.state;
    const isHorizontal = wallName === 'south' || wallName === 'north';
    const wallLength = isHorizontal ? room.w : room.d;
    const openings = this.stateManager.getOpeningsForWall(wallName, room.id).map(opening => ({
      start: wallLength * (opening.positionPercent / 100) - opening.width / 2,
      end: wallLength * (opening.positionPercent / 100) + opening.width / 2,
      kind: opening.kind,
      subtype: opening.subtype,
    }));

    openings.sort((left, right) => left.start - right.start);
    this.ctx.fillStyle = '#555';

    let position = 0;
    for (const opening of openings) {
      const gapStart = Math.max(0, opening.start);
      const gapEnd = Math.min(wallLength, opening.end);
      if (position < gapStart) {
        this.drawWallSegment(room, x, y, w, h, position, gapStart, isHorizontal);
      }
      this.drawOpeningMarker(room, wallName, x, y, w, h, gapStart, gapEnd, isHorizontal, opening);
      position = gapEnd;
    }

    if (position < wallLength) {
      this.drawWallSegment(room, x, y, w, h, position, wallLength, isHorizontal);
    }
  }

  drawWallSegment(room, baseX, baseY, baseW, baseH, fromMm, toMm, isHorizontal) {
    const roomTopLeft = this.worldToScreen(room.x, room.y);
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

  drawOpeningMarker(room, wallName, baseX, baseY, baseW, baseH, fromMm, toMm, isHorizontal, opening) {
    const roomTopLeft = this.worldToScreen(room.x, room.y);
    const lineWidth = Math.max(2, baseH * 0.4);
    const isDoor = opening.kind === 'door';

    if (isHorizontal) {
      const screenX = roomTopLeft.x + this.mmToPx(fromMm);
      const screenWidth = this.mmToPx(toMm - fromMm);
      const centerY = baseY + baseH / 2;
      if (isDoor) {
        this.drawDoorMarkerHorizontal(wallName, screenX, centerY, screenWidth, opening.subtype);
        return;
      }

      this.drawWindowMarkerHorizontal(screenX, centerY, screenWidth, lineWidth, opening.subtype);
      return;
    }

    const screenY = roomTopLeft.y + this.mmToPx(fromMm);
    const screenHeight = this.mmToPx(toMm - fromMm);
    const centerX = baseX + baseW / 2;
    if (isDoor) {
      this.drawDoorMarkerVertical(wallName, centerX, screenY, screenHeight, opening.subtype);
      return;
    }

    this.drawWindowMarkerVertical(centerX, screenY, screenHeight, lineWidth, opening.subtype);
  }

  drawDoorMarkerHorizontal(wallName, screenX, centerY, screenWidth, subtype) {
    this.ctx.strokeStyle = '#888';
    this.ctx.lineWidth = 1.5;

    if (subtype === 'sliding') {
      this.ctx.beginPath();
      this.ctx.moveTo(screenX, centerY - 3);
      this.ctx.lineTo(screenX + screenWidth, centerY - 3);
      this.ctx.moveTo(screenX, centerY + 3);
      this.ctx.lineTo(screenX + screenWidth * 0.72, centerY + 3);
      this.ctx.stroke();
      return;
    }

    if (subtype === 'bifold') {
      this.ctx.beginPath();
      this.ctx.moveTo(screenX, centerY);
      this.ctx.lineTo(screenX + screenWidth * 0.5, centerY + (wallName === 'south' ? -screenWidth * 0.45 : screenWidth * 0.45));
      this.ctx.lineTo(screenX + screenWidth, centerY);
      this.ctx.stroke();
      return;
    }

    if (subtype === 'entrance') {
      this.ctx.lineWidth = 2;
    }

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
  }

  drawDoorMarkerVertical(wallName, centerX, screenY, screenHeight, subtype) {
    this.ctx.strokeStyle = '#888';
    this.ctx.lineWidth = 1.5;

    if (subtype === 'sliding') {
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - 3, screenY);
      this.ctx.lineTo(centerX - 3, screenY + screenHeight);
      this.ctx.moveTo(centerX + 3, screenY);
      this.ctx.lineTo(centerX + 3, screenY + screenHeight * 0.72);
      this.ctx.stroke();
      return;
    }

    if (subtype === 'bifold') {
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, screenY);
      this.ctx.lineTo(centerX + (wallName === 'west' ? screenHeight * 0.45 : -screenHeight * 0.45), screenY + screenHeight * 0.5);
      this.ctx.lineTo(centerX, screenY + screenHeight);
      this.ctx.stroke();
      return;
    }

    if (subtype === 'entrance') {
      this.ctx.lineWidth = 2;
    }

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
  }

  drawWindowMarkerHorizontal(screenX, centerY, screenWidth, lineWidth, subtype) {
    this.ctx.strokeStyle = '#4a90d9';
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(screenX, centerY);
    this.ctx.lineTo(screenX + screenWidth, centerY);
    this.ctx.stroke();

    if (subtype === 'fix') {
      this.ctx.strokeStyle = '#8fd0ff';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(screenX + screenWidth * 0.2, centerY - 4);
      this.ctx.lineTo(screenX + screenWidth * 0.8, centerY + 4);
      this.ctx.stroke();
      return;
    }

    if (subtype === 'casement') {
      this.ctx.strokeStyle = '#80b8f0';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(screenX + screenWidth * 0.15, centerY);
      this.ctx.lineTo(screenX + screenWidth * 0.5, centerY - 8);
      this.ctx.lineTo(screenX + screenWidth * 0.85, centerY);
      this.ctx.stroke();
      return;
    }

    if (subtype === 'sweepout') {
      this.ctx.strokeStyle = '#7bc6ff';
      this.ctx.lineWidth = lineWidth * 0.55;
      this.ctx.beginPath();
      this.ctx.moveTo(screenX, centerY - 5);
      this.ctx.lineTo(screenX + screenWidth, centerY - 5);
      this.ctx.stroke();
      return;
    }

    this.ctx.strokeStyle = '#80b8f0';
    this.ctx.lineWidth = lineWidth * 0.5;
    this.ctx.beginPath();
    this.ctx.moveTo(screenX, centerY);
    this.ctx.lineTo(screenX + screenWidth, centerY);
    this.ctx.stroke();
  }

  drawWindowMarkerVertical(centerX, screenY, screenHeight, lineWidth, subtype) {
    this.ctx.strokeStyle = '#4a90d9';
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, screenY);
    this.ctx.lineTo(centerX, screenY + screenHeight);
    this.ctx.stroke();

    if (subtype === 'fix') {
      this.ctx.strokeStyle = '#8fd0ff';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - 4, screenY + screenHeight * 0.2);
      this.ctx.lineTo(centerX + 4, screenY + screenHeight * 0.8);
      this.ctx.stroke();
      return;
    }

    if (subtype === 'casement') {
      this.ctx.strokeStyle = '#80b8f0';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, screenY + screenHeight * 0.15);
      this.ctx.lineTo(centerX + 8, screenY + screenHeight * 0.5);
      this.ctx.lineTo(centerX, screenY + screenHeight * 0.85);
      this.ctx.stroke();
      return;
    }

    if (subtype === 'sweepout') {
      this.ctx.strokeStyle = '#7bc6ff';
      this.ctx.lineWidth = lineWidth * 0.55;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - 5, screenY);
      this.ctx.lineTo(centerX - 5, screenY + screenHeight);
      this.ctx.stroke();
      return;
    }

    this.ctx.strokeStyle = '#80b8f0';
    this.ctx.lineWidth = lineWidth * 0.5;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, screenY);
    this.ctx.lineTo(centerX, screenY + screenHeight);
    this.ctx.stroke();

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
    const multiSelected = this.stateManager.state.multiSelectIds.includes(item.id);
    const inGroup = !!this.stateManager.getGroupOf(item.id);

    this.ctx.save();
    this.ctx.translate(center.x, center.y);
    this.ctx.rotate(rotation);

    this.ctx.fillStyle = 'rgba(0,0,0,0.08)';
    this.ctx.fillRect(-pixelWidth / 2 + 2, -pixelDepth / 2 + 2, pixelWidth, pixelDepth);

    const baseColor = item.customColor || definition.color;
    this.ctx.fillStyle = selected ? adjustColor(baseColor, 20) : (multiSelected ? adjustColor(baseColor, 10) : baseColor);
    this.ctx.fillRect(-pixelWidth / 2, -pixelDepth / 2, pixelWidth, pixelDepth);

    this.ctx.strokeStyle = selected ? '#3a5a3a' : (multiSelected ? '#4a7c4a' : (inGroup ? '#6aaa6a' : 'rgba(0,0,0,0.2)'));
    this.ctx.lineWidth = selected ? 2 : (multiSelected ? 2 : (inGroup ? 1.5 : 1));
    if (multiSelected) this.ctx.setLineDash([4, 3]);
    this.ctx.strokeRect(-pixelWidth / 2, -pixelDepth / 2, pixelWidth, pixelDepth);
    this.ctx.setLineDash([]);

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

  drawDimensions(room) {
    const topLeft = this.worldToScreen(room.x, room.y);
    const bottomRight = this.worldToScreen(room.x + room.w, room.y + room.d);

    // 各壁の開口部を取得（位置順、mm 単位の [start, end]）
    const wallOpenings = wallName => {
      const isHorizontal = wallName === 'south' || wallName === 'north';
      const length = isHorizontal ? room.w : room.d;
      return this.stateManager.getOpeningsForWall(wallName, room.id)
        .map(op => ({
          start: length * (op.positionPercent / 100) - op.width / 2,
          end: length * (op.positionPercent / 100) + op.width / 2,
          kind: op.kind,
        }))
        .filter(seg => seg.end > 0 && seg.start < length)
        .sort((a, b) => a.start - b.start);
    };

    // チェーン分割: [0, op1.start, op1.end, op2.start, ..., length] のユニーク配列
    const chainSplits = (length, openings) => {
      const points = [0, length];
      openings.forEach(op => {
        points.push(Math.max(0, op.start));
        points.push(Math.min(length, op.end));
      });
      const sorted = [...new Set(points.map(p => Math.round(p)))].sort((a, b) => a - b);
      return sorted;
    };

    const OUTER_OFFSET = 38;
    const CHAIN_OFFSET = 16;

    // 上辺 (north): X 方向のチェーン+総寸法
    {
      const ops = wallOpenings('north');
      if (ops.length > 0) {
        const splits = chainSplits(room.w, ops);
        for (let i = 0; i < splits.length - 1; i++) {
          const sx = this.worldToScreen(room.x + splits[i], room.y).x;
          const ex = this.worldToScreen(room.x + splits[i + 1], room.y).x;
          const isOpening = ops.some(op => Math.round(op.start) <= splits[i] && splits[i + 1] <= Math.round(op.end));
          this.drawHorizontalDim(sx, ex, topLeft.y - CHAIN_OFFSET, splits[i + 1] - splits[i], isOpening ? '#4a90d9' : '#999');
        }
      }
      this.drawHorizontalDim(topLeft.x, bottomRight.x, topLeft.y - OUTER_OFFSET, room.w, '#666');
    }

    // 下辺 (south)
    {
      const ops = wallOpenings('south');
      if (ops.length > 0) {
        const splits = chainSplits(room.w, ops);
        for (let i = 0; i < splits.length - 1; i++) {
          const sx = this.worldToScreen(room.x + splits[i], room.y).x;
          const ex = this.worldToScreen(room.x + splits[i + 1], room.y).x;
          const isOpening = ops.some(op => Math.round(op.start) <= splits[i] && splits[i + 1] <= Math.round(op.end));
          this.drawHorizontalDim(sx, ex, bottomRight.y + CHAIN_OFFSET, splits[i + 1] - splits[i], isOpening ? '#4a90d9' : '#999', true);
        }
      }
      this.drawHorizontalDim(topLeft.x, bottomRight.x, bottomRight.y + OUTER_OFFSET, room.w, '#666', true);
    }

    // 左辺 (west)
    {
      const ops = wallOpenings('west');
      if (ops.length > 0) {
        const splits = chainSplits(room.d, ops);
        for (let i = 0; i < splits.length - 1; i++) {
          const sy = this.worldToScreen(room.x, room.y + splits[i]).y;
          const ey = this.worldToScreen(room.x, room.y + splits[i + 1]).y;
          const isOpening = ops.some(op => Math.round(op.start) <= splits[i] && splits[i + 1] <= Math.round(op.end));
          this.drawVerticalDim(topLeft.x - CHAIN_OFFSET, sy, ey, splits[i + 1] - splits[i], isOpening ? '#4a90d9' : '#999');
        }
      }
      this.drawVerticalDim(topLeft.x - OUTER_OFFSET, topLeft.y, bottomRight.y, room.d, '#666');
    }

    // 右辺 (east)
    {
      const ops = wallOpenings('east');
      if (ops.length > 0) {
        const splits = chainSplits(room.d, ops);
        for (let i = 0; i < splits.length - 1; i++) {
          const sy = this.worldToScreen(room.x, room.y + splits[i]).y;
          const ey = this.worldToScreen(room.x, room.y + splits[i + 1]).y;
          const isOpening = ops.some(op => Math.round(op.start) <= splits[i] && splits[i + 1] <= Math.round(op.end));
          this.drawVerticalDim(bottomRight.x + CHAIN_OFFSET, sy, ey, splits[i + 1] - splits[i], isOpening ? '#4a90d9' : '#999', true);
        }
      }
      this.drawVerticalDim(bottomRight.x + OUTER_OFFSET, topLeft.y, bottomRight.y, room.d, '#666', true);
    }
  }

  drawHorizontalDim(x1, x2, screenY, valueMm, color = '#666', labelBelow = false) {
    if (Math.abs(x2 - x1) < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.beginPath();
    ctx.moveTo(x1, screenY);
    ctx.lineTo(x2, screenY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, screenY - 4);
    ctx.lineTo(x1, screenY + 4);
    ctx.moveTo(x2, screenY - 4);
    ctx.lineTo(x2, screenY + 4);
    ctx.stroke();
    const cx = (x1 + x2) / 2;
    const ty = labelBelow ? screenY + 10 : screenY - 10;
    const label = `${Math.round(valueMm)}`;
    const w = ctx.measureText(label).width + 6;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(cx - w / 2, ty - 7, w, 14);
    ctx.fillStyle = color;
    ctx.fillText(label, cx, ty);
    ctx.restore();
  }

  drawVerticalDim(screenX, y1, y2, valueMm, color = '#666', labelRight = false) {
    if (Math.abs(y2 - y1) < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.beginPath();
    ctx.moveTo(screenX, y1);
    ctx.lineTo(screenX, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(screenX - 4, y1);
    ctx.lineTo(screenX + 4, y1);
    ctx.moveTo(screenX - 4, y2);
    ctx.lineTo(screenX + 4, y2);
    ctx.stroke();
    const cy = (y1 + y2) / 2;
    const tx = labelRight ? screenX + 10 : screenX - 10;
    const label = `${Math.round(valueMm)}`;
    ctx.save();
    ctx.translate(tx, cy);
    ctx.rotate(-Math.PI / 2);
    const w = ctx.measureText(label).width + 6;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-w / 2, -7, w, 14);
    ctx.fillStyle = color;
    ctx.fillText(label, 0, 0);
    ctx.restore();
    ctx.restore();
  }

  // 隣接・接触する部屋の間に接続インジケーターを描画
  drawRoomConnections(rooms) {
    const TOUCH_TOLERANCE = 80; // mm 単位
    const ctx = this.ctx;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i], b = rooms[j];
        // 各辺の重なりを調べる
        const segments = [];
        // A右 / B左
        if (Math.abs((a.x + a.w) - b.x) <= TOUCH_TOLERANCE) {
          const y1 = Math.max(a.y, b.y), y2 = Math.min(a.y + a.d, b.y + b.d);
          if (y2 > y1) segments.push({ x1: a.x + a.w, y1, x2: a.x + a.w, y2 });
        }
        // A左 / B右
        if (Math.abs(a.x - (b.x + b.w)) <= TOUCH_TOLERANCE) {
          const y1 = Math.max(a.y, b.y), y2 = Math.min(a.y + a.d, b.y + b.d);
          if (y2 > y1) segments.push({ x1: a.x, y1, x2: a.x, y2 });
        }
        // A下 / B上
        if (Math.abs((a.y + a.d) - b.y) <= TOUCH_TOLERANCE) {
          const x1 = Math.max(a.x, b.x), x2 = Math.min(a.x + a.w, b.x + b.w);
          if (x2 > x1) segments.push({ x1, y1: a.y + a.d, x2, y2: a.y + a.d });
        }
        // A上 / B下
        if (Math.abs(a.y - (b.y + b.d)) <= TOUCH_TOLERANCE) {
          const x1 = Math.max(a.x, b.x), x2 = Math.min(a.x + a.w, b.x + b.w);
          if (x2 > x1) segments.push({ x1, y1: a.y, x2, y2: a.y });
        }
        segments.forEach(seg => {
          const s1 = this.worldToScreen(seg.x1, seg.y1);
          const s2 = this.worldToScreen(seg.x2, seg.y2);
          ctx.save();
          ctx.strokeStyle = 'rgba(80,160,80,0.6)';
          ctx.lineWidth = 4;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        });
      }
    }
  }

  drawCompass(canvasWidth, canvasHeight) {
    const angle = ((this.stateManager.state.northAngle || 0) * Math.PI) / 180;
    const cx = canvasWidth - 36;
    const cy = 36;
    const r = 20;
    const { ctx } = this;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.35, 0);
    ctx.lineTo(0, r * 0.4);
    ctx.lineTo(-r * 0.35, 0);
    ctx.closePath();
    ctx.fillStyle = '#e05050';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.lineTo(r * 0.35, 0);
    ctx.lineTo(0, -r * 0.4);
    ctx.lineTo(-r * 0.35, 0);
    ctx.closePath();
    ctx.fillStyle = '#ccc';
    ctx.fill();

    ctx.restore();

    ctx.fillStyle = '#e05050';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelX = cx + Math.sin(angle) * (r + 10);
    const labelY = cy - Math.cos(angle) * (r + 10);
    ctx.fillText('北', labelX, labelY);
  }

  drawSelectedDistances() {
    const item = this.stateManager.getSelectedItem();
    if (!item) return;
    const room = this.stateManager.state.rooms.find(r => r.id === this.stateManager.state.activeRoomId)
      || this.stateManager.getPrimaryRoom();
    if (!room) return;

    const size = this.stateManager.getItemSize(item);
    const rotation = (item.rotation || 0) % 360;
    const swapped = rotation === 90 || rotation === 270;
    const hw = (swapped ? size.d : size.w) / 2;
    const hd = (swapped ? size.w : size.d) / 2;

    const dLeft   = item.x - hw - room.x;
    const dRight  = (room.x + room.w) - (item.x + hw);
    const dTop    = item.y - hd - room.y;
    const dBottom = (room.y + room.d) - (item.y + hd);

    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,120,220,0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const drawDim = (fromX, fromY, toX, toY, label) => {
      const f = this.worldToScreen(fromX, fromY);
      const t = this.worldToScreen(toX, toY);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      const mx = (f.x + t.x) / 2;
      const my = (f.y + t.y) / 2;
      ctx.setLineDash([]);
      const tw = ctx.measureText(label).width + 6;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(mx - tw / 2, my - 8, tw, 16);
      ctx.fillStyle = '#0050b3';
      ctx.fillText(label, mx, my);
      ctx.setLineDash([3, 3]);
    };

    drawDim(room.x, item.y, item.x - hw, item.y, `${Math.round(dLeft)}`);
    drawDim(item.x + hw, item.y, room.x + room.w, item.y, `${Math.round(dRight)}`);
    drawDim(item.x, room.y, item.x, item.y - hd, `${Math.round(dTop)}`);
    drawDim(item.x, item.y + hd, item.x, room.y + room.d, `${Math.round(dBottom)}`);

    ctx.restore();
  }

  exportPng() {
    const canvasWidth = this.canvas.width / devicePixelRatio;
    const canvasHeight = this.canvas.height / devicePixelRatio;
    const offscreen = document.createElement('canvas');
    offscreen.width = Math.round(canvasWidth * devicePixelRatio);
    offscreen.height = Math.round(canvasHeight * devicePixelRatio);
    const offCtx = offscreen.getContext('2d');
    offCtx.scale(devicePixelRatio, devicePixelRatio);
    const savedCtx = this.ctx;
    this.ctx = offCtx;
    this.draw();
    this.ctx = savedCtx;
    return offscreen.toDataURL('image/png');
  }
}