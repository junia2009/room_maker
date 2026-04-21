export const STORAGE_KEY = 'roommaker_layouts';
export const PRIMARY_ROOM_ID = 'room-1';

export const WALL_LABELS = {
  south: '南',
  north: '北',
  west: '西',
  east: '東',
};

export const OPENING_PRESETS = {
  door: {
    single: { label: '片開きドア', width: 800, height: 2100, bottomOffset: 0 },
    sliding: { label: '引き戸', width: 1600, height: 2100, bottomOffset: 0 },
    bifold: { label: '折れ戸', width: 900, height: 2000, bottomOffset: 0 },
    entrance: { label: '玄関ドア', width: 900, height: 2100, bottomOffset: 0 },
  },
  window: {
    sliding: { label: '引違い窓', width: 1800, height: 1100, bottomOffset: 900 },
    fix: { label: 'FIX窓', width: 1200, height: 900, bottomOffset: 1100 },
    casement: { label: '縦すべり窓', width: 700, height: 1100, bottomOffset: 1000 },
    sweepout: { label: '掃き出し窓', width: 1800, height: 2000, bottomOffset: 0 },
  },
};

export const DEFAULT_STATE = {
  room: { w: 6000, d: 5000, h: 2400 },
  colors: { floor: '#c8a876', wall: '#f5f0e8', ceiling: '#ffffff' },
  door: { wall: 'south', pos: 50, width: 800 },
  window: { wall: 'north', pos: 50, w: 1800, h: 1200 },
  furnitureItems: [],
  selectedId: null,
  nextId: 1,
  snap: true,
  snapSize: 50,
  viewMode: '2d',
  currentProjectId: null,
  cameraInitialized3d: false,
  activeRoomId: PRIMARY_ROOM_ID,
  nextRoomNumber: 2,
  showGrid: true,
  northAngle: 0,
  showRoomLabel: false,
  furnitureGroups: [],  // [{id, memberIds:[]}]
  multiSelectIds: [],   // 複数選択中のID一覧
  wallThickness: 120,   // mm
};

export function createDefaultRoom(overrides = {}) {
  return {
    id: PRIMARY_ROOM_ID,
    name: 'メインルーム',
    x: 0,
    y: 0,
    w: DEFAULT_STATE.room.w,
    d: DEFAULT_STATE.room.d,
    h: DEFAULT_STATE.room.h,
    ...overrides,
  };
}

export function createRectWalls(room) {
  return [
    { id: `${room.id}-south`, roomId: room.id, wall: 'south', x1: room.x, y1: room.y + room.d, x2: room.x + room.w, y2: room.y + room.d, thickness: 120 },
    { id: `${room.id}-north`, roomId: room.id, wall: 'north', x1: room.x, y1: room.y, x2: room.x + room.w, y2: room.y, thickness: 120 },
    { id: `${room.id}-west`, roomId: room.id, wall: 'west', x1: room.x, y1: room.y, x2: room.x, y2: room.y + room.d, thickness: 120 },
    { id: `${room.id}-east`, roomId: room.id, wall: 'east', x1: room.x + room.w, y1: room.y, x2: room.x + room.w, y2: room.y + room.d, thickness: 120 },
  ];
}

export function createDefaultOpenings(room = createDefaultRoom()) {
  return [
    {
      id: `${room.id}-door-1`,
      roomId: room.id,
      kind: 'door',
      subtype: 'single',
      wall: DEFAULT_STATE.door.wall,
      positionPercent: DEFAULT_STATE.door.pos,
      width: DEFAULT_STATE.door.width,
      height: 2100,
      bottomOffset: 0,
    },
    {
      id: `${room.id}-window-1`,
      roomId: room.id,
      kind: 'window',
      subtype: 'sliding',
      wall: DEFAULT_STATE.window.wall,
      positionPercent: DEFAULT_STATE.window.pos,
      width: DEFAULT_STATE.window.w,
      height: DEFAULT_STATE.window.h,
      bottomOffset: 900,
    },
  ];
}

export function getOpeningPreset(kind, subtype) {
  const presets = OPENING_PRESETS[kind] || {};
  if (subtype && presets[subtype]) return presets[subtype];
  return Object.values(presets)[0] || null;
}

export function getOpeningTypeLabel(kind, subtype) {
  return getOpeningPreset(kind, subtype)?.label || (kind === 'door' ? 'ドア' : '窓');
}

export const FURNITURE_DEFS = {
  sofa:         { name: 'ソファ', w: 1800, d: 800, h: 750, color: '#8b7355' },
  table:        { name: 'テーブル', w: 1000, d: 600, h: 400, color: '#a08060' },
  tv:           { name: 'テレビ台', w: 1200, d: 400, h: 500, color: '#5a4a3a' },
  bookshelf:    { name: '本棚', w: 800, d: 350, h: 1800, color: '#a08060' },
  rug:          { name: 'ラグ', w: 2000, d: 1400, h: 10, color: '#c0a888' },
  plant:        { name: '観葉植物', w: 400, d: 400, h: 1200, color: '#5a8a4a' },
  lamp:         { name: 'フロアランプ', w: 350, d: 350, h: 1500, color: '#d4c8a0' },
  diningTable:  { name: 'ダイニングテーブル', w: 1500, d: 800, h: 720, color: '#906a3a' },
  chair:        { name: 'チェア', w: 450, d: 450, h: 800, color: '#a08060' },
  bed:          { name: 'ベッド', w: 1400, d: 2000, h: 450, color: '#d0c0a0' },
  wardrobe:     { name: 'ワードローブ', w: 1000, d: 550, h: 2000, color: '#7a6a5a' },
  desk:         { name: 'デスク', w: 1200, d: 600, h: 730, color: '#a08060' },
  fridge:       { name: '冷蔵庫', w: 650, d: 650, h: 1700, color: '#d0d0d0' },
  kitchen:      { name: 'システムキッチン', w: 2550, d: 650, h: 850, color: '#e0e0e0' },
  kitchenSmall: { name: 'ミニキッチン', w: 1500, d: 600, h: 850, color: '#e0e0e0' },
  cupboard:     { name: '食器棚', w: 800, d: 450, h: 1800, color: '#a08060' },
  microwave:    { name: '電子レンジ', w: 500, d: 400, h: 350, color: '#c0c0c0' },
  washMachine:  { name: '洗濯機', w: 600, d: 600, h: 1000, color: '#e8e8e8' },
  bathtub:      { name: 'バスタブ', w: 1600, d: 800, h: 600, color: '#d0e8f0' },
  shower:       { name: 'シャワーユニット', w: 900, d: 900, h: 2200, color: '#c8e0ee' },
  toilet:       { name: 'トイレ', w: 400, d: 700, h: 800, color: '#f0f0f0' },
  washBasin:    { name: '洗面台', w: 750, d: 550, h: 850, color: '#e8e8f0' },
  washBasinWide:{ name: '洗面化粧台(W)', w: 1200, d: 550, h: 850, color: '#e8e8f0' },
  urinalUnit:   { name: 'ユニットバス', w: 1616, d: 1316, h: 2200, color: '#d8ecf8' },
  wall1000:     { name: '壁 1m', w: 1000, d: 120, h: 2400, color: '#888888' },
  wall1500:     { name: '壁 1.5m', w: 1500, d: 120, h: 2400, color: '#888888' },
  wall2000:     { name: '壁 2m', w: 2000, d: 120, h: 2400, color: '#888888' },
  wall3000:     { name: '壁 3m', w: 3000, d: 120, h: 2400, color: '#888888' },
  wallHalf:     { name: '半壁 1m', w: 1000, d: 120, h: 1200, color: '#999999' },
  customBox:    { name: 'カスタムボックス', w: 1000, d: 1000, h: 500, color: '#c0b090' },
  stairStraight:{ name: '直階段', w: 900, d: 3000, h: 2800, color: '#c8b89a' },
  stairL:       { name: 'L型階段', w: 2000, d: 2000, h: 2800, color: '#c8b89a' },
  stairSpiral:  { name: 'らせん階段', w: 1200, d: 1200, h: 2800, color: '#c8b89a' },
  entryPorch:   { name: '玄関ポーチ', w: 1800, d: 1200, h: 300, color: '#b0a090' },
  hallway:      { name: '土間・廊下', w: 1800, d: 1800, h: 10, color: '#c4b8a8' },
};