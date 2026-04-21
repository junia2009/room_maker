import { DEFAULT_STATE, FURNITURE_DEFS, createDefaultOpenings, createDefaultRoom, createRectWalls, getOpeningPreset } from './constants.js';

function cloneRoom(room) {
  return { ...room };
}

function cloneOpening(opening) {
  return { ...opening };
}

function cloneWall(wall) {
  return { ...wall };
}

function normalizeOpening(opening, fallbackRoomId, index = 0) {
  const kind = opening.kind === 'window' ? 'window' : 'door';
  const fallbackSubtype = kind === 'door' ? 'single' : 'sliding';
  const subtype = opening.subtype || fallbackSubtype;
  const preset = getOpeningPreset(kind, subtype);
  return {
    id: opening.id || `${fallbackRoomId}-${kind}-${index + 1}`,
    roomId: opening.roomId || fallbackRoomId,
    kind,
    subtype,
    wall: opening.wall || (kind === 'door' ? DEFAULT_STATE.door.wall : DEFAULT_STATE.window.wall),
    positionPercent: opening.positionPercent ?? opening.pos ?? 50,
    width: opening.width ?? opening.w ?? preset?.width ?? (kind === 'door' ? DEFAULT_STATE.door.width : DEFAULT_STATE.window.w),
    height: opening.height ?? opening.h ?? preset?.height ?? (kind === 'door' ? 2100 : DEFAULT_STATE.window.h),
    bottomOffset: opening.bottomOffset ?? preset?.bottomOffset ?? (kind === 'door' ? 0 : 900),
    name: opening.name,
  };
}

function createLegacyDoor(openings) {
  const door = openings.find(entry => entry.kind === 'door');
  if (!door) return { ...DEFAULT_STATE.door };
  return {
    wall: door.wall,
    pos: door.positionPercent,
    width: door.width,
  };
}

function createLegacyWindow(openings) {
  const windowOpening = openings.find(entry => entry.kind === 'window');
  if (!windowOpening) return { ...DEFAULT_STATE.window };
  return {
    wall: windowOpening.wall,
    pos: windowOpening.positionPercent,
    w: windowOpening.width,
    h: windowOpening.height,
  };
}

function createStructureState() {
  const room = createDefaultRoom();
  const openings = createDefaultOpenings(room);
  return {
    room,
    rooms: [room],
    walls: createRectWalls(room),
    openings,
    door: createLegacyDoor(openings),
    window: createLegacyWindow(openings),
  };
}

function cloneDefaultState() {
  const structure = createStructureState();
  return {
    room: { ...structure.room },
    rooms: structure.rooms.map(cloneRoom),
    walls: structure.walls.map(cloneWall),
    openings: structure.openings.map(cloneOpening),
    colors: { ...DEFAULT_STATE.colors },
    door: { ...structure.door },
    window: { ...structure.window },
    furnitureItems: [],
    selectedId: null,
    nextId: DEFAULT_STATE.nextId,
    snap: DEFAULT_STATE.snap,
    snapSize: DEFAULT_STATE.snapSize,
    viewMode: DEFAULT_STATE.viewMode,
    currentProjectId: DEFAULT_STATE.currentProjectId,
    cameraInitialized3d: DEFAULT_STATE.cameraInitialized3d,
    activeRoomId: DEFAULT_STATE.activeRoomId,
    nextRoomNumber: DEFAULT_STATE.nextRoomNumber,
    showGrid: DEFAULT_STATE.showGrid,
    northAngle: DEFAULT_STATE.northAngle,
    showRoomLabel: DEFAULT_STATE.showRoomLabel,
    furnitureGroups: [],
    multiSelectIds: [],
    wallThickness: DEFAULT_STATE.wallThickness,
  };
}

export class RoomMakerState {
  constructor() {
    this.state = cloneDefaultState();
    this.listeners = new Set();
    this._undoStack = [];
    this._redoStack = [];
    this._maxUndo = 60;
    // これらのアクションは Undo スタックに積まない（ナビゲーション系）
    this._noUndoReasons = new Set(['setActiveRoomId', 'setCameraReset', 'selectFurniture', 'updateRoomName']);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _saveSnapshot() {
    const snap = JSON.stringify(this.state);
    this._undoStack.push(snap);
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
    this._redoStack = [];
  }

  undo() {
    if (this._undoStack.length === 0) return false;
    const currentSnap = JSON.stringify(this.state);
    this._redoStack.push(currentSnap);
    this.state = JSON.parse(this._undoStack.pop());
    this.emitChange('undo', null, true);
    return true;
  }

  redo() {
    if (this._redoStack.length === 0) return false;
    const currentSnap = JSON.stringify(this.state);
    this._undoStack.push(currentSnap);
    this.state = JSON.parse(this._redoStack.pop());
    this.emitChange('redo', null, true);
    return true;
  }

  get canUndo() { return this._undoStack.length > 0; }
  get canRedo() { return this._redoStack.length > 0; }

  emitChange(reason, payload, skipSnapshot = false) {
    this.listeners.forEach(listener => listener({ reason, payload, state: this.state }));
  }

  getPrimaryRoom() {
    return this.state.rooms[0] || null;
  }

  getActiveRoom() {
    return this.state.rooms.find(r => r.id === this.state.activeRoomId) || this.getPrimaryRoom();
  }

  getWalls(roomId = this.getPrimaryRoom()?.id) {
    return this.state.walls.filter(wall => wall.roomId === roomId);
  }

  getOpening(kind) {
    return this.state.openings.find(entry => entry.kind === kind) || null;
  }

  getOpeningsByKind(kind, roomId = this.getActiveRoom()?.id) {
    return this.state.openings.filter(entry => entry.roomId === roomId && entry.kind === kind);
  }

  getOpeningsForWall(wallName, roomId = this.getActiveRoom()?.id) {
    return this.state.openings.filter(entry => entry.roomId === roomId && entry.wall === wallName);
  }

  addRoom(options = {}) {
    this._saveSnapshot();
    const lastRoom = this.state.rooms[this.state.rooms.length - 1] || this.getPrimaryRoom();
    const newX = lastRoom ? lastRoom.x + lastRoom.w + 500 : 0;
    const roomNumber = this.state.nextRoomNumber || 2;
    this.state.nextRoomNumber = roomNumber + 1;
    const room = createDefaultRoom({
      id: `room-${Date.now()}`,
      name: `部屋 ${roomNumber}`,
      x: newX,
      y: 0,
    });
    const openings = createDefaultOpenings(room);
    this.state.rooms.push(room);
    openings.forEach(opening => this.state.openings.push(opening));
    this.state.walls = this.state.rooms.flatMap(r => createRectWalls(r));
    this.state.activeRoomId = room.id;
    this.rebuildPrimaryRoomStructure();
    if (!options.silent) this.emitChange('addRoom', { room: cloneRoom(room) });
    return room;
  }

  removeRoom(id, options = {}) {
    this._saveSnapshot();
    if (this.state.rooms.length <= 1) return false;
    const index = this.state.rooms.findIndex(r => r.id === id);
    if (index === -1) return false;
    this.state.rooms.splice(index, 1);
    this.state.openings = this.state.openings.filter(opening => opening.roomId !== id);
    this.state.furnitureItems = this.state.furnitureItems.filter(item => item.roomId !== id);
    this.state.walls = this.state.rooms.flatMap(r => createRectWalls(r));
    if (this.state.activeRoomId === id) {
      this.state.activeRoomId = this.state.rooms[Math.max(0, index - 1)].id;
    }
    this.rebuildPrimaryRoomStructure();
    if (!options.silent) this.emitChange('removeRoom', { id });
    return true;
  }

  setActiveRoomId(id, options = {}) {
    const room = this.state.rooms.find(r => r.id === id);
    if (!room) return;
    this.state.activeRoomId = id;
    if (!options.silent) this.emitChange('setActiveRoomId', { id });
  }

  updateRoomName(id, name, options = {}) {
    const room = this.state.rooms.find(r => r.id === id);
    if (!room) return;
    room.name = name;
    if (!options.silent) this.emitChange('updateRoomName', { id, name });
  }

  replaceRooms(rooms, options = {}) {
    this._saveSnapshot();
    if (!Array.isArray(rooms) || rooms.length === 0) return;
    this.state.rooms = rooms.map(room => cloneRoom(createDefaultRoom(room)));
    this.state.walls = this.state.rooms.flatMap(r => createRectWalls(r));
    this.state.openings = this.state.openings.map(opening => ({
      ...opening,
      roomId: this.state.rooms[0].id,
    }));
    this.state.activeRoomId = this.state.rooms[0].id;
    this.rebuildPrimaryRoomStructure();
    this.setCameraNeedsReset();
    if (!options.silent) this.emitChange('replaceRooms', { rooms: this.state.rooms.map(cloneRoom) });
  }

  replaceOpenings(openings, options = {}) {
    this._saveSnapshot();
    if (!Array.isArray(openings) || openings.length === 0) return;
    const primaryRoom = this.getPrimaryRoom();
    this.state.openings = openings.map((opening, index) => normalizeOpening(opening, primaryRoom?.id || 'room', index));
    this.rebuildPrimaryRoomStructure();
    if (!options.silent) this.emitChange('replaceOpenings', { openings: this.state.openings.map(cloneOpening) });
  }

  upsertOpening(opening, options = {}) {
    this._saveSnapshot();
    if (!opening?.kind) return null;
    const primaryRoom = this.getPrimaryRoom();
    const normalizedOpening = normalizeOpening({
      ...cloneOpening(opening),
      id: opening.id || `${primaryRoom?.id || 'room'}-${opening.kind}-${Date.now()}`,
      roomId: opening.roomId || primaryRoom?.id,
    }, primaryRoom?.id || 'room');
    const index = this.state.openings.findIndex(entry => entry.id === normalizedOpening.id);
    if (index === -1) {
      this.state.openings.push(normalizedOpening);
    } else {
      this.state.openings[index] = normalizedOpening;
    }
    this.rebuildPrimaryRoomStructure();
    if (!options.silent) this.emitChange('upsertOpening', { opening: cloneOpening(normalizedOpening) });
    return normalizedOpening;
  }

  addOpening(kind, options = {}) {
    this._saveSnapshot();
    const primaryRoom = this.getActiveRoom();
    if (!primaryRoom || !['door', 'window'].includes(kind)) return null;
    const openingsOfKind = this.getOpeningsByKind(kind, primaryRoom.id);
    const defaultSubtype = kind === 'door' ? 'single' : 'sliding';
    const preset = getOpeningPreset(kind, defaultSubtype);
    const opening = normalizeOpening({
      id: `${primaryRoom.id}-${kind}-${Date.now()}`,
      roomId: primaryRoom.id,
      kind,
      subtype: defaultSubtype,
      wall: kind === 'door' ? DEFAULT_STATE.door.wall : DEFAULT_STATE.window.wall,
      positionPercent: 50,
      width: preset?.width,
      height: preset?.height,
      bottomOffset: preset?.bottomOffset,
      name: `${kind === 'door' ? 'ドア' : '窓'} ${openingsOfKind.length + 1}`,
    }, primaryRoom.id, openingsOfKind.length);
    this.state.openings.push(opening);
    this.rebuildPrimaryRoomStructure();
    if (!options.silent) this.emitChange('addOpening', { opening: cloneOpening(opening) });
    return opening;
  }

  updateOpening(id, updates, options = {}) {
    this._saveSnapshot();
    const index = this.state.openings.findIndex(entry => entry.id === id);
    if (index === -1) return null;
    const current = this.state.openings[index];
    const opening = normalizeOpening({ ...current, ...updates }, current.roomId, index);
    this.state.openings[index] = opening;
    this.rebuildPrimaryRoomStructure();
    if (!options.silent) this.emitChange('updateOpening', { opening: cloneOpening(opening) });
    return opening;
  }

  removeOpening(id, options = {}) {
    this._saveSnapshot();
    const opening = this.state.openings.find(entry => entry.id === id);
    if (!opening) return false;
    const sameKind = this.getOpeningsByKind(opening.kind, opening.roomId);
    if (sameKind.length <= 1) return false;
    this.state.openings = this.state.openings.filter(entry => entry.id !== id);
    this.rebuildPrimaryRoomStructure();
    if (!options.silent) this.emitChange('removeOpening', { id, kind: opening.kind });
    return true;
  }

  rebuildPrimaryRoomStructure() {
    const room = this.getPrimaryRoom();
    if (!room) return;
    this.state.room = { w: room.w, d: room.d, h: room.h };
    this.state.walls = this.state.rooms.flatMap(r => createRectWalls(r));
    this.state.door = createLegacyDoor(this.state.openings);
    this.state.window = createLegacyWindow(this.state.openings);
  }

  loadLegacyStructure(data = {}) {
    const room = createDefaultRoom(data.room || {});
    const openings = [
      {
        id: `${room.id}-door-1`,
        roomId: room.id,
        kind: 'door',
        subtype: 'single',
        wall: data.door?.wall ?? DEFAULT_STATE.door.wall,
        positionPercent: data.door?.pos ?? DEFAULT_STATE.door.pos,
        width: data.door?.width ?? DEFAULT_STATE.door.width,
        height: 2100,
        bottomOffset: 0,
      },
      {
        id: `${room.id}-window-1`,
        roomId: room.id,
        kind: 'window',
        subtype: 'sliding',
        wall: data.window?.wall ?? DEFAULT_STATE.window.wall,
        positionPercent: data.window?.pos ?? DEFAULT_STATE.window.pos,
        width: data.window?.w ?? DEFAULT_STATE.window.w,
        height: data.window?.h ?? DEFAULT_STATE.window.h,
        bottomOffset: 900,
      },
    ];
    this.state.rooms = [room];
    this.state.openings = openings;
    this.state.walls = createRectWalls(room);
    this.state.activeRoomId = room.id;
    this.rebuildPrimaryRoomStructure();
  }

  reset(options = {}) {
    this.state = cloneDefaultState();
    if (!options.silent) this.emitChange('reset');
  }

  buildProjectData() {
    const primaryRoom = this.getPrimaryRoom();
    return {
      room: primaryRoom ? { w: primaryRoom.w, d: primaryRoom.d, h: primaryRoom.h } : { ...this.state.room },
      rooms: this.state.rooms.map(cloneRoom),
      walls: this.state.walls.map(cloneWall),
      openings: this.state.openings.map(cloneOpening),
      colors: { ...this.state.colors },
      door: { ...this.state.door },
      window: { ...this.state.window },
      furnitureItems: this.state.furnitureItems.map(item => ({ ...item })),
      nextId: this.state.nextId,
      activeRoomId: this.state.activeRoomId,
      nextRoomNumber: this.state.nextRoomNumber,
      showGrid: this.state.showGrid,
      northAngle: this.state.northAngle,
    };
  }

  loadProjectData(data = {}, options = {}) {
    if (data.colors) Object.assign(this.state.colors, data.colors);
    if (Array.isArray(data.rooms) && data.rooms.length > 0) {
      this.state.rooms = data.rooms.map(room => cloneRoom(createDefaultRoom(room)));
      this.state.walls = this.state.rooms.flatMap(r => createRectWalls(r));
      this.state.openings = Array.isArray(data.openings) && data.openings.length > 0
        ? data.openings.map((opening, index) => normalizeOpening(opening, this.state.rooms[0].id, index))
        : createDefaultOpenings(this.state.rooms[0]);
      const savedActiveId = data.activeRoomId;
      this.state.activeRoomId = (savedActiveId && this.state.rooms.find(r => r.id === savedActiveId))
        ? savedActiveId
        : this.state.rooms[0].id;
      if (data.nextRoomNumber) this.state.nextRoomNumber = data.nextRoomNumber;
      if (data.showGrid != null) this.state.showGrid = data.showGrid;
      if (data.northAngle != null) this.state.northAngle = data.northAngle;
      this.rebuildPrimaryRoomStructure();
    } else {
      this.loadLegacyStructure(data);
    }
    this.state.furnitureItems = Array.isArray(data.furnitureItems) ? data.furnitureItems.map(item => ({ ...item })) : [];
    // 旧データ互換: roomId未設定の家具はprimary roomに紐付け
    const primaryId = this.getPrimaryRoom()?.id;
    this.state.furnitureItems.forEach(item => {
      if (!item.roomId || !this.state.rooms.find(r => r.id === item.roomId)) {
        item.roomId = primaryId;
      }
    });
    this.state.nextId = data.nextId || 1;
    this.state.selectedId = null;
    if (!options.silent) this.emitChange('loadProjectData');
  }

  setCurrentProjectId(projectId, options = {}) {
    this.state.currentProjectId = projectId;
    if (!options.silent) this.emitChange('setCurrentProjectId', { projectId });
  }

  setViewMode(viewMode, options = {}) {
    this.state.viewMode = viewMode;
    if (!options.silent) this.emitChange('setViewMode', { viewMode });
  }

  setRoomDimensions(room, options = {}) {
    this._saveSnapshot();
    const activeRoom = this.getActiveRoom();
    if (!activeRoom) return;
    Object.assign(activeRoom, room);
    this.state.walls = this.state.rooms.flatMap(r => createRectWalls(r));
    this.rebuildPrimaryRoomStructure();
    this.setCameraNeedsReset();
    if (!options.silent) this.emitChange('setRoomDimensions', { room: { ...this.state.room }, rooms: this.state.rooms.map(cloneRoom) });
  }

  setDoorConfig(door, options = {}) {
    const doorOpening = this.getOpening('door');
    if (doorOpening) {
      if (door.wall != null) doorOpening.wall = door.wall;
      if (door.pos != null) doorOpening.positionPercent = door.pos;
      if (door.width != null) doorOpening.width = door.width;
    }
    this.rebuildPrimaryRoomStructure();
    if (!options.silent) this.emitChange('setDoorConfig', { door: { ...this.state.door } });
  }

  setWindowConfig(windowConfig, options = {}) {
    const windowOpening = this.getOpening('window');
    if (windowOpening) {
      if (windowConfig.wall != null) windowOpening.wall = windowConfig.wall;
      if (windowConfig.pos != null) windowOpening.positionPercent = windowConfig.pos;
      if (windowConfig.w != null) windowOpening.width = windowConfig.w;
      if (windowConfig.h != null) windowOpening.height = windowConfig.h;
    }
    this.rebuildPrimaryRoomStructure();
    if (!options.silent) this.emitChange('setWindowConfig', { window: { ...this.state.window } });
  }

  setColor(colorKey, color, options = {}) {
    this.state.colors[colorKey] = color;
    if (!options.silent) this.emitChange('setColor', { colorKey, color });
  }

  setSnapEnabled(enabled, options = {}) {
    this.state.snap = enabled;
    if (!options.silent) this.emitChange('setSnapEnabled', { enabled });
  }

  setSnapSize(size, options = {}) {
    this.state.snapSize = size;
    if (!options.silent) this.emitChange('setSnapSize', { size });
  }

  setShowGrid(enabled, options = {}) {
    this.state.showGrid = enabled;
    if (!options.silent) this.emitChange('setShowGrid', { enabled });
  }

  setShowRoomLabel(enabled, options = {}) {
    this.state.showRoomLabel = enabled;
    if (!options.silent) this.emitChange('setShowRoomLabel', { enabled });
  }

  setWallThickness(thickness, options = {}) {
    this._saveSnapshot();
    this.state.wallThickness = Math.max(0, Math.min(500, thickness));
    if (!options.silent) this.emitChange('setWallThickness', { thickness });
  }

  setNorthAngle(angle, options = {}) {
    this.state.northAngle = ((angle % 360) + 360) % 360;
    if (!options.silent) this.emitChange('setNorthAngle', { angle: this.state.northAngle });
  }

  getItemSize(item) {
    const definition = FURNITURE_DEFS[item?.type];
    return {
      w: item?.w ?? definition?.w ?? 500,
      d: item?.d ?? definition?.d ?? 500,
      h: item?.h ?? definition?.h ?? 500,
    };
  }

  getSelectedItem() {
    return this.state.furnitureItems.find(item => item.id === this.state.selectedId) || null;
  }

  addFurniture(type, options = {}) {
    this._saveSnapshot();
    const definition = FURNITURE_DEFS[type];
    if (!definition) return null;
    const room = this.getActiveRoom() || this.getPrimaryRoom() || this.state.room;
    const item = {
      id: this.state.nextId++,
      roomId: room.id,
      type,
      x: room.x + room.w / 2,
      y: room.y + room.d / 2,
      rotation: 0,
      w: definition.w,
      d: definition.d,
      h: definition.h,
    };
    this.state.furnitureItems.push(item);
    this.state.selectedId = item.id;
    if (!options.silent) this.emitChange('addFurniture', { item: { ...item } });
    return item;
  }

  selectFurniture(id, options = {}) {
    this.state.selectedId = id;
    if (!options.silent) this.emitChange('selectFurniture', { id });
    return this.getSelectedItem();
  }

  removeFurniture(id, options = {}) {
    this._saveSnapshot();
    this.state.furnitureItems = this.state.furnitureItems.filter(item => item.id !== id);
    if (this.state.selectedId === id) {
      this.state.selectedId = null;
    }
    if (!options.silent) this.emitChange('removeFurniture', { id });
  }

  duplicateFurniture(id, options = {}) {
    this._saveSnapshot();
    const original = this.state.furnitureItems.find(item => item.id === id);
    if (!original) return null;

    const copy = {
      ...original,
      id: this.state.nextId++,
      x: original.x + 300,
      y: original.y + 300,
    };
    this.clampItemToRoom(copy);
    this.state.furnitureItems.push(copy);
    this.state.selectedId = copy.id;
    if (!options.silent) this.emitChange('duplicateFurniture', { id, copy: { ...copy } });
    return copy;
  }

  updateSelectedSize(dimension, value, options = {}) {
    this._saveSnapshot();
    const item = this.getSelectedItem();
    if (!item) return null;
    item[dimension] = value;
    this.clampItemToRoom(item);
    if (!options.silent) this.emitChange('updateSelectedSize', { dimension, value, id: item.id });
    return item;
  }

  setFurnitureColor(id, color, options = {}) {
    this._saveSnapshot();
    const item = this.state.furnitureItems.find(f => f.id === id);
    if (!item) return;
    item.customColor = color;
    if (!options.silent) this.emitChange('setFurnitureColor', { id, color });
  }

  resetFurnitureColor(id, options = {}) {
    const item = this.state.furnitureItems.find(f => f.id === id);
    if (!item) return;
    delete item.customColor;
    if (!options.silent) this.emitChange('setFurnitureColor', { id, color: null });
  }

  // ===== Multi-select & Group =====
  toggleMultiSelect(id) {
    const arr = this.state.multiSelectIds;
    const idx = arr.indexOf(id);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(id);
    this.emitChange('multiSelect', { ids: [...arr] });
  }
  clearMultiSelect() {
    this.state.multiSelectIds = [];
    this.emitChange('multiSelect', { ids: [] });
  }
  groupSelected() {
    const ids = [...this.state.multiSelectIds];
    if (ids.length < 2) return;
    this._saveSnapshot();
    const groupId = 'g' + Date.now();
    this.state.furnitureGroups.push({ id: groupId, memberIds: ids });
    this.state.multiSelectIds = [];
    this.emitChange('groupSelected', { groupId, ids });
  }
  ungroupSelected() {
    // 選択中のIDが含まれるグループをすべて解除
    const selectedId = this.state.selectedId;
    const multiIds = this.state.multiSelectIds;
    const relevant = id => multiIds.includes(id) || id === selectedId;
    this._saveSnapshot();
    this.state.furnitureGroups = this.state.furnitureGroups.filter(g => !g.memberIds.some(relevant));
    this.emitChange('ungroupSelected', {});
  }
  getGroupOf(id) {
    return this.state.furnitureGroups.find(g => g.memberIds.includes(id)) || null;
  }
  getGroupMembers(groupId) {
    const group = this.state.furnitureGroups.find(g => g.id === groupId);
    if (!group) return [];
    return this.state.furnitureItems.filter(f => group.memberIds.includes(f.id));
  }

  updateSelectedRotation(rotation, options = {}) {
    this._saveSnapshot();
    const item = this.getSelectedItem();
    if (!item) return null;
    item.rotation = rotation;
    this.clampItemToRoom(item);
    if (!options.silent) this.emitChange('updateSelectedRotation', { rotation, id: item.id });
    return item;
  }

  rotateSelectedBy(delta, options = {}) {
    this._saveSnapshot();
    const item = this.getSelectedItem();
    if (!item) return null;
    item.rotation = (item.rotation + delta) % 360;
    this.clampItemToRoom(item);
    if (!options.silent) this.emitChange('rotateSelectedBy', { delta, id: item.id });
    return item;
  }

  resetSelectedSize(options = {}) {
    this._saveSnapshot();
    const item = this.getSelectedItem();
    if (!item) return null;
    const definition = FURNITURE_DEFS[item.type];
    if (!definition) return null;
    item.w = definition.w;
    item.d = definition.d;
    item.h = definition.h;
    this.clampItemToRoom(item);
    if (!options.silent) this.emitChange('resetSelectedSize', { id: item.id });
    return item;
  }

  moveFurniture(id, position, options = {}) {
    const item = this.state.furnitureItems.find(entry => entry.id === id);
    if (!item) return null;
    if (position.x != null) item.x = position.x;
    if (position.y != null) item.y = position.y;
    this.clampItemToRoom(item);
    if (!options.silent) this.emitChange('moveFurniture', { id, position: { x: item.x, y: item.y } });
    return item;
  }

  /** ドラッグ完了時に呼び出す（Undo スタックに積む） */
  commitMove() {
    this._saveSnapshot();
  }

  clampItemToRoom(item) {
    const room = this.getPrimaryRoom() || this.state.room;
    const size = this.getItemSize(item);
    const rotation = (item.rotation || 0) % 360;
    const swapped = rotation === 90 || rotation === 270;
    const halfWidth = (swapped ? size.d : size.w) / 2;
    const halfDepth = (swapped ? size.w : size.d) / 2;
    item.x = Math.max(halfWidth, Math.min(room.w - halfWidth, item.x));
    item.y = Math.max(halfDepth, Math.min(room.d - halfDepth, item.y));
    return item;
  }

  setCameraNeedsReset() {
    this.state.cameraInitialized3d = false;
  }
}