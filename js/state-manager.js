import { DEFAULT_STATE, FURNITURE_DEFS } from './constants.js';

function cloneDefaultState() {
  return {
    room: { ...DEFAULT_STATE.room },
    colors: { ...DEFAULT_STATE.colors },
    door: { ...DEFAULT_STATE.door },
    window: { ...DEFAULT_STATE.window },
    furnitureItems: [],
    selectedId: null,
    nextId: DEFAULT_STATE.nextId,
    snap: DEFAULT_STATE.snap,
    snapSize: DEFAULT_STATE.snapSize,
    viewMode: DEFAULT_STATE.viewMode,
    currentProjectId: DEFAULT_STATE.currentProjectId,
    cameraInitialized3d: DEFAULT_STATE.cameraInitialized3d,
  };
}

export class RoomMakerState {
  constructor() {
    this.state = cloneDefaultState();
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitChange(reason, payload) {
    this.listeners.forEach(listener => listener({ reason, payload, state: this.state }));
  }

  reset(options = {}) {
    this.state = cloneDefaultState();
    if (!options.silent) this.emitChange('reset');
  }

  buildProjectData() {
    return {
      room: { ...this.state.room },
      colors: { ...this.state.colors },
      door: { ...this.state.door },
      window: { ...this.state.window },
      furnitureItems: this.state.furnitureItems.map(item => ({ ...item })),
      nextId: this.state.nextId,
    };
  }

  loadProjectData(data = {}, options = {}) {
    if (data.room) Object.assign(this.state.room, data.room);
    if (data.colors) Object.assign(this.state.colors, data.colors);
    if (data.door) Object.assign(this.state.door, data.door);
    if (data.window) Object.assign(this.state.window, data.window);
    this.state.furnitureItems = Array.isArray(data.furnitureItems) ? data.furnitureItems.map(item => ({ ...item })) : [];
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
    Object.assign(this.state.room, room);
    this.setCameraNeedsReset();
    if (!options.silent) this.emitChange('setRoomDimensions', { room: { ...this.state.room } });
  }

  setDoorConfig(door, options = {}) {
    Object.assign(this.state.door, door);
    if (!options.silent) this.emitChange('setDoorConfig', { door: { ...this.state.door } });
  }

  setWindowConfig(windowConfig, options = {}) {
    Object.assign(this.state.window, windowConfig);
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
    const definition = FURNITURE_DEFS[type];
    if (!definition) return null;
    const item = {
      id: this.state.nextId++,
      type,
      x: this.state.room.w / 2,
      y: this.state.room.d / 2,
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
    this.state.furnitureItems = this.state.furnitureItems.filter(item => item.id !== id);
    if (this.state.selectedId === id) {
      this.state.selectedId = null;
    }
    if (!options.silent) this.emitChange('removeFurniture', { id });
  }

  duplicateFurniture(id, options = {}) {
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
    const item = this.getSelectedItem();
    if (!item) return null;
    item[dimension] = value;
    this.clampItemToRoom(item);
    if (!options.silent) this.emitChange('updateSelectedSize', { dimension, value, id: item.id });
    return item;
  }

  updateSelectedRotation(rotation, options = {}) {
    const item = this.getSelectedItem();
    if (!item) return null;
    item.rotation = rotation;
    this.clampItemToRoom(item);
    if (!options.silent) this.emitChange('updateSelectedRotation', { rotation, id: item.id });
    return item;
  }

  rotateSelectedBy(delta, options = {}) {
    const item = this.getSelectedItem();
    if (!item) return null;
    item.rotation = (item.rotation + delta) % 360;
    this.clampItemToRoom(item);
    if (!options.silent) this.emitChange('rotateSelectedBy', { delta, id: item.id });
    return item;
  }

  resetSelectedSize(options = {}) {
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

  clampItemToRoom(item) {
    const size = this.getItemSize(item);
    const rotation = (item.rotation || 0) % 360;
    const swapped = rotation === 90 || rotation === 270;
    const halfWidth = (swapped ? size.d : size.w) / 2;
    const halfDepth = (swapped ? size.w : size.d) / 2;
    item.x = Math.max(halfWidth, Math.min(this.state.room.w - halfWidth, item.x));
    item.y = Math.max(halfDepth, Math.min(this.state.room.d - halfDepth, item.y));
    return item;
  }

  setCameraNeedsReset() {
    this.state.cameraInitialized3d = false;
  }
}