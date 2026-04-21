import { FURNITURE_DEFS, WALL_LABELS, getOpeningPreset, getOpeningTypeLabel } from './constants.js';
import { $, escapeHtml, parseNumber } from './utils.js';

export class EditorController {
  constructor({ stateManager, floorplan, roomScene, callbacks = {} }) {
    this.stateManager = stateManager;
    this.floorplan = floorplan;
    this.roomScene = roomScene;
    this.callbacks = callbacks;
    this.dom = this.collectDom();
    this.activeDoorOpeningId = null;
    this.activeWindowOpeningId = null;
    this.roomInfoReasons = new Set(['reset', 'loadProjectData', 'setRoomDimensions', 'setActiveRoomId', 'addRoom', 'removeRoom']);
    this.roomControlReasons = new Set(['reset', 'loadProjectData', 'setRoomDimensions', 'addRoom', 'removeRoom', 'setActiveRoomId']);
    this.openingControlReasons = new Set(['reset', 'loadProjectData', 'setDoorConfig', 'setWindowConfig', 'addOpening', 'updateOpening', 'removeOpening', 'setActiveRoomId', 'addRoom', 'removeRoom']);
    this.materialControlReasons = new Set(['reset', 'loadProjectData', 'setColor', 'setSnapEnabled', 'setSnapSize', 'setShowGrid', 'setNorthAngle', 'setShowRoomLabel', 'setShowDimensions']);
    this.roomListReasons = new Set(['reset', 'loadProjectData', 'addRoom', 'removeRoom', 'setActiveRoomId', 'setRoomDimensions', 'updateRoomName']);
    this.selectionReasons = new Set([
      'reset',
      'loadProjectData',
      'selectFurniture',
      'addFurniture',
      'removeFurniture',
      'duplicateFurniture',
      'updateSelectedSize',
      'updateSelectedRotation',
      'rotateSelectedBy',
      'resetSelectedSize',
      'setFurnitureColor',
      'undo',
      'redo',
    ]);
    this.floorplanReasons = new Set([
      'reset', 'loadProjectData', 'setRoomDimensions',
      'setDoorConfig', 'setWindowConfig',
      'addOpening', 'updateOpening', 'removeOpening',
      'setColor', 'selectFurniture',
      'addFurniture', 'removeFurniture', 'duplicateFurniture',
      'updateSelectedSize', 'updateSelectedRotation', 'rotateSelectedBy', 'resetSelectedSize',
      'moveFurniture', 'addRoom', 'removeRoom', 'setActiveRoomId',
      'setShowGrid', 'setNorthAngle', 'setFurnitureColor', 'undo', 'redo', 'setShowRoomLabel', 'setShowDimensions',
      'multiSelect', 'groupSelected', 'ungroupSelected', 'setWallThickness',
    ]);
    this.sceneReasons = new Set([
      'reset', 'loadProjectData', 'setRoomDimensions',
      'setDoorConfig', 'setWindowConfig',
      'addOpening', 'updateOpening', 'removeOpening',
      'setColor',
      'addFurniture', 'removeFurniture', 'duplicateFurniture',
      'updateSelectedSize', 'updateSelectedRotation', 'rotateSelectedBy', 'resetSelectedSize',
      'moveFurniture', 'addRoom', 'removeRoom', 'setActiveRoomId',
    ]);
  }

  collectDom() {
    return {
      roomList: $('roomList'),
      btnAddRoom: $('btnAddRoom'),
      btnRemoveRoom: $('btnRemoveRoom'),
      app: $('app'),
      projectName: $('projectName'),
      roomInfoBox: $('roomInfoBox'),
      roomDims: $('roomDims'),
      roomWidth: $('roomWidth'),
      roomDepth: $('roomDepth'),
      roomHeight: $('roomHeight'),
      doorSelect: $('doorSelect'),
      btnAddDoor: $('btnAddDoor'),
      btnRemoveDoor: $('btnRemoveDoor'),
      doorType: $('doorType'),
      doorWall: $('doorWall'),
      doorPos: $('doorPos'),
      doorPosVal: $('doorPosVal'),
      doorWidth: $('doorWidth'),
      doorHeight: $('doorHeight'),
      windowSelect: $('windowSelect'),
      btnAddWindow: $('btnAddWindow'),
      btnRemoveWindow: $('btnRemoveWindow'),
      windowType: $('windowType'),
      windowWall: $('windowWall'),
      windowPos: $('windowPos'),
      windowPosVal: $('windowPosVal'),
      windowW: $('windowW'),
      windowH: $('windowH'),
      windowBottom: $('windowBottom'),
      tabFloorplan: $('tabFloorplan'),
      tab3D: $('tab3D'),
      canvas2d: $('canvas2d'),
      canvas3d: $('canvas3d'),
      selectedPanel: $('selectedPanel'),
      selName: $('selName'),
      selW: $('selW'),
      selD: $('selD'),
      selH: $('selH'),
      selRotation: $('selRotation'),
      selRotVal: $('selRotVal'),
      selSizeDisplay: $('selSizeDisplay'),
      snapToggle: $('snapToggle'),
      snapSizeSelect: $('snapSizeSelect'),
      gridToggle: $('gridToggle'),
      roomLabelToggle: $('roomLabelToggle'),
      dimensionsToggle: $('dimensionsToggle'),
      northAngle: $('northAngle'),
      northAngleVal: $('northAngleVal'),
      allRoomsArea: $('allRoomsArea'),
      btnUndo: $('btnUndo'),
      btnRedo: $('btnRedo'),
      selColor: $('selColor'),
      btnResetColor: $('btnResetColor'),
    };
  }

  init() {
    this.initSwatchColors();
    this.floorplan.bindEvents();
    this.stateManager.subscribe(change => this.renderFromState(change));
    this.bindEvents();
  }

  show() {
    this.dom.app.classList.remove('hidden');
    this.stateManager.setCameraNeedsReset();
  }

  hide() {
    this.dom.app.classList.add('hidden');
    this.roomScene.deactivate();
  }

  bindEvents() {
    this.dom.btnAddRoom.addEventListener('click', () => {
      const room = this.stateManager.addRoom();
      if (room) {
        this.floorplan.fitView();
        this.floorplan.draw();
      }
    });

    $('btnAddLRoom').addEventListener('click', () => {
      // L字型: 2つの矩形部屋を隣接配置
      const r1 = this.stateManager.addRoom({ w: 4000, d: 6000, name: 'L字-A' });
      const r2 = this.stateManager.addRoom({ w: 4000, d: 3000, name: 'L字-B' });
      if (r1 && r2) {
        // r2を r1の右下に配置
        const state = this.stateManager.state;
        const room1 = state.rooms.find(r => r.id === r1.id);
        const room2 = state.rooms.find(r => r.id === r2.id);
        if (room1 && room2) {
          room2.x = room1.x + room1.w;
          room2.y = room1.y + room1.d - room2.d;
          this.stateManager.emitChange('setRoomDimensions', {});
        }
        this.floorplan.fitView();
        this.floorplan.draw();
      }
    });
    this.dom.btnRemoveRoom.addEventListener('click', () => {
      const activeRoom = this.stateManager.getActiveRoom();
      if (!activeRoom || this.stateManager.state.rooms.length <= 1) return;
      this.stateManager.removeRoom(activeRoom.id);
    });

    document.querySelectorAll('.step-tab').forEach(tab => {
      tab.addEventListener('click', () => this.activateStep(tab.dataset.step));
    });

    this.dom.tabFloorplan.addEventListener('click', () => this.switchView('2d'));
    this.dom.tab3D.addEventListener('click', () => this.switchView('3d'));
    this.dom.projectName.addEventListener('change', () => {
      this.callbacks.onProjectNameCommitted?.(this.dom.projectName.value);
    });

    ['roomWidth', 'roomDepth', 'roomHeight'].forEach(id => {
      $(id).addEventListener('input', () => {
        const w = parseNumber(this.dom.roomWidth.value, null);
        const d = parseNumber(this.dom.roomDepth.value, null);
        const h = parseNumber(this.dom.roomHeight.value, null);
        if (w === null || d === null || h === null) return;
        if (w < 500 || d < 500 || h < 500) return;
        this.stateManager.setRoomDimensions({ w, d, h });
      });
    });

    document.querySelectorAll('.template-btn').forEach(button => {
      button.addEventListener('click', () => {
        this.stateManager.setRoomDimensions({
          w: parseNumber(button.dataset.w, this.stateManager.state.room.w),
          d: parseNumber(button.dataset.d, this.stateManager.state.room.d),
        });
        this.floorplan.fitView();
        this.floorplan.draw();
      });
    });

    this.dom.doorSelect.addEventListener('change', () => {
      this.activeDoorOpeningId = this.dom.doorSelect.value;
      this.syncOpeningControls();
    });
    this.dom.btnAddDoor.addEventListener('click', () => {
      const opening = this.stateManager.addOpening('door');
      if (opening) this.activeDoorOpeningId = opening.id;
    });
    this.dom.btnRemoveDoor.addEventListener('click', () => {
      if (!this.activeDoorOpeningId) return;
      if (this.stateManager.removeOpening(this.activeDoorOpeningId)) {
        this.activeDoorOpeningId = null;
      }
    });
    this.dom.doorType.addEventListener('change', () => {
      const preset = getOpeningPreset('door', this.dom.doorType.value);
      this.updateActiveOpening('door', {
        subtype: this.dom.doorType.value,
        width: preset?.width,
        height: preset?.height,
        bottomOffset: preset?.bottomOffset,
      });
    });
    this.dom.doorWall.addEventListener('change', () => this.updateActiveOpening('door', { wall: this.dom.doorWall.value }));
    this.dom.doorPos.addEventListener('input', () => this.updateActiveOpening('door', { positionPercent: parseNumber(this.dom.doorPos.value, 50) }));
    this.dom.doorWidth.addEventListener('input', () => this.updateActiveOpening('door', { width: parseNumber(this.dom.doorWidth.value, 800) }));
    this.dom.doorHeight.addEventListener('input', () => this.updateActiveOpening('door', { height: parseNumber(this.dom.doorHeight.value, 2100) }));

    this.dom.windowSelect.addEventListener('change', () => {
      this.activeWindowOpeningId = this.dom.windowSelect.value;
      this.syncOpeningControls();
    });
    this.dom.btnAddWindow.addEventListener('click', () => {
      const opening = this.stateManager.addOpening('window');
      if (opening) this.activeWindowOpeningId = opening.id;
    });
    this.dom.btnRemoveWindow.addEventListener('click', () => {
      if (!this.activeWindowOpeningId) return;
      if (this.stateManager.removeOpening(this.activeWindowOpeningId)) {
        this.activeWindowOpeningId = null;
      }
    });
    this.dom.windowType.addEventListener('change', () => {
      const preset = getOpeningPreset('window', this.dom.windowType.value);
      this.updateActiveOpening('window', {
        subtype: this.dom.windowType.value,
        width: preset?.width,
        height: preset?.height,
        bottomOffset: preset?.bottomOffset,
      });
    });
    this.dom.windowWall.addEventListener('change', () => this.updateActiveOpening('window', { wall: this.dom.windowWall.value }));
    this.dom.windowPos.addEventListener('input', () => this.updateActiveOpening('window', { positionPercent: parseNumber(this.dom.windowPos.value, 50) }));
    this.dom.windowW.addEventListener('input', () => this.updateActiveOpening('window', { width: parseNumber(this.dom.windowW.value, 1800) }));
    this.dom.windowH.addEventListener('input', () => this.updateActiveOpening('window', { height: parseNumber(this.dom.windowH.value, 1200) }));
    this.dom.windowBottom.addEventListener('input', () => this.updateActiveOpening('window', { bottomOffset: parseNumber(this.dom.windowBottom.value, 900) }));

    this.setupSwatches('floorSwatches', 'floor');
    this.setupSwatches('wallSwatches', 'wall');
    this.setupSwatches('ceilingSwatches', 'ceiling');

    document.querySelectorAll('.catalog-item').forEach(button => {
      button.addEventListener('click', () => {
        this.stateManager.addFurniture(button.dataset.type);
        this.activateStep('furniture');
      });
    });

    ['selW', 'selD', 'selH'].forEach(id => {
      $(id).addEventListener('input', () => {
        const value = parseNumber($(id).value, 0);
        if (value < 10) return;
        const dimension = id === 'selW' ? 'w' : id === 'selD' ? 'd' : 'h';
        this.stateManager.updateSelectedSize(dimension, value);
      });
    });

    $('btnResetSize').addEventListener('click', () => {
      this.stateManager.resetSelectedSize();
    });
    this.dom.selRotation.addEventListener('input', () => {
      const rotation = parseNumber(this.dom.selRotation.value, 0);
      this.stateManager.updateSelectedRotation(rotation);
    });
    $('btnRotate90').addEventListener('click', () => {
      this.stateManager.rotateSelectedBy(90);
    });
    $('btnDuplicate').addEventListener('click', () => {
      const selected = this.stateManager.state.selectedId;
      if (!selected) return;
      this.stateManager.duplicateFurniture(selected);
    });
    $('btnDelete').addEventListener('click', () => {
      const selected = this.stateManager.state.selectedId;
      if (!selected) return;
      this.stateManager.removeFurniture(selected);
    });

    this.dom.selColor.addEventListener('input', () => {
      const selected = this.stateManager.state.selectedId;
      if (!selected) return;
      this.stateManager.setFurnitureColor(selected, this.dom.selColor.value);
    });
    $('btnResetColor').addEventListener('click', () => {
      const selected = this.stateManager.state.selectedId;
      if (!selected) return;
      this.stateManager.resetFurnitureColor(selected);
    });

    $('btnGroup').addEventListener('click', () => {
      this.stateManager.groupSelected();
      this.updateGroupControls();
      this.floorplan.draw();
    });
    $('btnUngroup').addEventListener('click', () => {
      this.stateManager.ungroupSelected();
      this.updateGroupControls();
      this.floorplan.draw();
    });

    $('btnZoomIn').addEventListener('click', () => this.floorplan.zoomIn());
    $('btnZoomOut').addEventListener('click', () => this.floorplan.zoomOut());
    $('btnFitView').addEventListener('click', () => {
      this.floorplan.fitView();
      this.floorplan.draw();
    });

    this.dom.snapToggle.addEventListener('change', () => {
      this.stateManager.setSnapEnabled(this.dom.snapToggle.checked);
    });
    this.dom.snapSizeSelect.addEventListener('change', () => {
      this.stateManager.setSnapSize(parseNumber(this.dom.snapSizeSelect.value, 50));
    });

    $('btnExportPng').addEventListener('click', () => this.exportPng());
    $('btnPrint').addEventListener('click', () => this.printFloorplan());
    $('btnUndo').addEventListener('click', () => this.stateManager.undo());
    $('btnRedo').addEventListener('click', () => this.stateManager.redo());

    // 家具カタログ検索
    $('catalogSearch').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('#step-furniture .catalog-item').forEach(btn => {
        const name = btn.querySelector('.catalog-name')?.textContent.toLowerCase() || '';
        const type = (btn.dataset.type || '').toLowerCase();
        btn.classList.toggle('hidden', q !== '' && !name.includes(q) && !type.includes(q));
      });
      // セクション見出しを、配下に表示アイテムがなければ隠す
      document.querySelectorAll('#step-furniture .catalog-section-header').forEach(h => {
        let sib = h.nextElementSibling;
        let anyVisible = false;
        while (sib && !sib.classList.contains('catalog-section-header')) {
          if (sib.classList.contains('furniture-catalog')) {
            if ([...sib.querySelectorAll('.catalog-item')].some(b => !b.classList.contains('hidden'))) {
              anyVisible = true;
            }
          }
          sib = sib.nextElementSibling;
        }
        h.classList.toggle('hidden-section', !anyVisible);
      });
    });
    $('btnSave').addEventListener('click', () => this.callbacks.onSaveRequested?.());
    $('btnExport').addEventListener('click', () => this.callbacks.onExportRequested?.());
    $('btnBackTop').addEventListener('click', () => this.callbacks.onBackRequested?.());

    this.dom.gridToggle.addEventListener('change', () => {
      this.stateManager.setShowGrid(this.dom.gridToggle.checked);
    });
    this.dom.roomLabelToggle.addEventListener('change', () => {
      this.stateManager.setShowRoomLabel(this.dom.roomLabelToggle.checked);
    });
    this.dom.dimensionsToggle.addEventListener('change', () => {
      this.stateManager.setShowDimensions(this.dom.dimensionsToggle.checked);
    });
    const wallRange = document.getElementById('wallThicknessRange');
    const wallVal = document.getElementById('wallThicknessVal');
    if (wallRange) {
      wallRange.addEventListener('input', () => {
        wallVal.textContent = wallRange.value;
        this.stateManager.setWallThickness(parseInt(wallRange.value, 10));
      });
    }
    this.dom.northAngle.addEventListener('input', () => {
      const angle = parseNumber(this.dom.northAngle.value, 0);
      this.stateManager.setNorthAngle(angle);
    });
    document.querySelectorAll('.north-presets .template-btn').forEach(button => {
      button.addEventListener('click', () => {
        this.stateManager.setNorthAngle(parseNumber(button.dataset.north, 0));
      });
    });

    window.addEventListener('keydown', event => this.handleKeyboard(event));
    window.addEventListener('resize', () => this.handleResize());
  }

  exportPng() {
    const dataUrl = this.floorplan.exportPng();
    const name = (this.dom.projectName.value || '間取り').replace(/[\\/:*?"<>|]/g, '_');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${name}.png`;
    a.click();
  }

  printFloorplan() {
    const dataUrl = this.floorplan.exportPng();
    const name = this.dom.projectName.value || '間取り図';
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>${name}</title>
      <style>body{margin:0;display:flex;flex-direction:column;align-items:center;font-family:sans-serif}
        img{max-width:100%;page-break-inside:avoid}
        h1{font-size:16px;margin:8px 0}
        @media print{h1{margin:0}}</style></head><body>
      <h1>${name}</h1><img src="${dataUrl}"></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  setProjectName(name) {
    this.dom.projectName.value = name;
  }

  activateStep(step) {
    document.querySelectorAll('.step-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.step === step);
    });
    document.querySelectorAll('.step-content').forEach(content => {
      content.classList.toggle('active', content.id === `step-${step}`);
    });
  }

  switchView(mode) {
    this.stateManager.setViewMode(mode, { silent: true });
    this.dom.tabFloorplan.classList.toggle('active', mode === '2d');
    this.dom.tab3D.classList.toggle('active', mode === '3d');
    this.dom.canvas2d.classList.toggle('hidden', mode === '3d');
    this.dom.canvas3d.classList.toggle('hidden', mode === '2d');

    if (mode === '3d') {
      this.roomScene.activate();
      return;
    }

    this.roomScene.deactivate();
    this.floorplan.resize();
    this.floorplan.draw();
  }

  renderFromState(change = null) {
    const reason = change?.reason;

    this.dom.btnUndo.disabled = !this.stateManager.canUndo;
    this.dom.btnRedo.disabled = !this.stateManager.canRedo;

    if (!reason || this.roomListReasons.has(reason)) {
      this.renderRoomList();
    }
    if (!reason || this.roomInfoReasons.has(reason)) {
      this.updateRoomInfo();
    }
    if (!reason || this.roomControlReasons.has(reason)) {
      this.syncRoomControls();
    }
    if (!reason || this.openingControlReasons.has(reason)) {
      this.syncOpeningControls();
    }
    if (!reason || this.materialControlReasons.has(reason)) {
      this.syncMaterialControls();
    }
    if (!reason || this.selectionReasons.has(reason)) {
      this.updateSelectedPanel();
    }
    if (reason === 'multiSelect' || reason === 'groupSelected' || reason === 'ungroupSelected') {
      this.updateGroupControls();
    }
    if (this.dom.app.classList.contains('hidden')) return;

    if (!reason || this.floorplanReasons.has(reason)) {
      this.floorplan.draw();
    }
    if (this.stateManager.state.viewMode === '3d' && (!reason || this.sceneReasons.has(reason))) {
      this.roomScene.buildScene();
    }
  }

  renderRoomList() {
    const focused = document.activeElement;
    if (focused && focused.classList.contains('room-list-name-input')) return;

    const rooms = this.stateManager.state.rooms;
    const activeId = this.stateManager.state.activeRoomId;
    this.dom.roomList.innerHTML = rooms.map(room => {
      const isActive = room.id === activeId;
      const w = (room.w / 1000).toFixed(1);
      const d = (room.d / 1000).toFixed(1);
      return `<div class="room-list-item${isActive ? ' active' : ''}" data-room-id="${escapeHtml(room.id)}">
        <input class="room-list-name-input" type="text" value="${escapeHtml(room.name || room.id)}" data-room-id="${escapeHtml(room.id)}" title="クリックして名前を変更">
        <span class="room-list-item-dims">${w}×${d}m</span>
      </div>`;
    }).join('');
    this.dom.roomList.querySelectorAll('.room-list-item').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.classList.contains('room-list-name-input')) return;
        this.stateManager.setActiveRoomId(item.dataset.roomId);
      });
    });
    this.dom.roomList.querySelectorAll('.room-list-name-input').forEach(input => {
      input.addEventListener('click', e => e.stopPropagation());
      input.addEventListener('focus', () => {
        this.stateManager.setActiveRoomId(input.dataset.roomId, { silent: true });
        this.dom.roomList.querySelectorAll('.room-list-item').forEach(item => {
          item.classList.toggle('active', item.dataset.roomId === input.dataset.roomId);
        });
      });
      input.addEventListener('change', () => {
        const trimmed = input.value.trim();
        if (trimmed) this.stateManager.updateRoomName(input.dataset.roomId, trimmed);
        else input.value = this.stateManager.state.rooms.find(r => r.id === input.dataset.roomId)?.name || '';
      });
    });
    this.dom.btnRemoveRoom.disabled = rooms.length <= 1;
  }

  updateRoomInfo() {
    const room = this.stateManager.getActiveRoom() || this.stateManager.state.room;
    const sqm = (room.w * room.d) / 1e6;
    const jou = sqm / 1.62;
    this.dom.roomInfoBox.textContent = `${sqm.toFixed(1)} ㎡ ｜ ${jou.toFixed(1)} 畳`;
    this.dom.roomDims.textContent = `${room.w} × ${room.d} mm`;
    const rooms = this.stateManager.state.rooms;
    if (rooms.length > 1) {
      let totalSqm = 0;
      const lines = rooms.map(r => {
        const s = (r.w * r.d) / 1e6;
        totalSqm += s;
        return `<span>${escapeHtml(r.name || r.id)}: ${s.toFixed(1)}㎡</span>`;
      });
      lines.push(`<strong>合計: ${totalSqm.toFixed(1)}㎡ ｜ ${(totalSqm / 1.62).toFixed(1)}畔</strong>`);
      this.dom.allRoomsArea.innerHTML = lines.join('');
      this.dom.allRoomsArea.style.display = 'flex';
    } else {
      this.dom.allRoomsArea.style.display = 'none';
    }  }

  updateSelectedPanel() {
    const item = this.stateManager.getSelectedItem();
    if (!item) {
      this.dom.selectedPanel.classList.add('hidden');
      return;
    }

    this.dom.selectedPanel.classList.remove('hidden');
    const definition = FURNITURE_DEFS[item.type];
    const size = this.stateManager.getItemSize(item);
    this.dom.selName.textContent = definition?.name || item.type;
    this.dom.selRotation.value = item.rotation || 0;
    this.dom.selRotVal.textContent = `${item.rotation || 0}°`;
    this.dom.selW.value = size.w;
    this.dom.selD.value = size.d;
    this.dom.selH.value = size.h;
    this.dom.selSizeDisplay.textContent = `W${size.w} × D${size.d} × H${size.h} mm`;

    const defaultColor = definition?.color || '#8b7355';
    this.dom.selColor.value = item.customColor || defaultColor;
    this.updateGroupControls();
  }

  updateGroupControls() {
    const multiIds = this.stateManager.state.multiSelectIds;
    const controls = document.getElementById('groupControls');
    if (!controls) return;
    // 2件以上選択中、またはどれかがグループに属している場合にボタン表示
    const selectedId = this.stateManager.state.selectedId;
    const allSelected = [...multiIds, ...(selectedId ? [selectedId] : [])];
    const hasGroup = allSelected.some(id => !!this.stateManager.getGroupOf(id));
    const canGroup = multiIds.length >= 2 || (multiIds.length >= 1 && selectedId);
    controls.style.display = (canGroup || hasGroup) ? '' : 'none';
    document.getElementById('btnGroup').disabled = !canGroup;
    document.getElementById('btnUngroup').disabled = !hasGroup;
  }

  syncUIFromState() {
    this.syncRoomControls();
    this.syncOpeningControls();
    this.syncMaterialControls();
  }

  syncRoomControls() {
    const room = this.stateManager.getActiveRoom() || this.stateManager.state.room;
    this.dom.roomWidth.value = room.w;
    this.dom.roomDepth.value = room.d;
    this.dom.roomHeight.value = room.h;
  }

  syncOpeningControls() {
    const door = this.resolveActiveOpening('door');
    const windowOpening = this.resolveActiveOpening('window');

    this.renderOpeningSelect('door', this.dom.doorSelect, door?.id);
    this.renderOpeningSelect('window', this.dom.windowSelect, windowOpening?.id);
    const activeRoom = this.stateManager.getActiveRoom();
    this.dom.btnRemoveDoor.disabled = this.stateManager.getOpeningsByKind('door', activeRoom?.id).length <= 1;
    this.dom.btnRemoveWindow.disabled = this.stateManager.getOpeningsByKind('window', activeRoom?.id).length <= 1;

    if (door) {
      this.dom.doorType.value = door.subtype || 'single';
      this.dom.doorWall.value = door.wall;
      this.dom.doorPos.value = door.positionPercent;
      this.dom.doorPosVal.textContent = `${door.positionPercent}%`;
      this.dom.doorWidth.value = door.width;
      this.dom.doorHeight.value = door.height;
    }

    if (windowOpening) {
      this.dom.windowType.value = windowOpening.subtype || 'sliding';
      this.dom.windowWall.value = windowOpening.wall;
      this.dom.windowPos.value = windowOpening.positionPercent;
      this.dom.windowPosVal.textContent = `${windowOpening.positionPercent}%`;
      this.dom.windowW.value = windowOpening.width;
      this.dom.windowH.value = windowOpening.height;
      this.dom.windowBottom.value = windowOpening.bottomOffset ?? 900;
    }
  }

  resolveActiveOpening(kind) {
    const property = kind === 'door' ? 'activeDoorOpeningId' : 'activeWindowOpeningId';
    const activeRoom = this.stateManager.getActiveRoom();
    const openings = this.stateManager.getOpeningsByKind(kind, activeRoom?.id);
    if (openings.length === 0) return null;
    const current = openings.find(entry => entry.id === this[property]);
    if (current) return current;
    this[property] = openings[0].id;
    return openings[0];
  }

  renderOpeningSelect(kind, select, selectedId) {
    const openings = this.stateManager.getOpeningsByKind(kind);
    select.innerHTML = openings.map((opening, index) => {
      const label = this.createOpeningOptionLabel(opening, index);
      return `<option value="${escapeHtml(opening.id)}">${escapeHtml(label)}</option>`;
    }).join('');
    if (selectedId) select.value = selectedId;
  }

  createOpeningOptionLabel(opening, index) {
    const orderLabel = `${opening.kind === 'door' ? 'ドア' : '窓'} ${index + 1}`;
    const typeLabel = getOpeningTypeLabel(opening.kind, opening.subtype);
    const wallLabel = WALL_LABELS[opening.wall] || opening.wall;
    return `${orderLabel}｜${typeLabel}｜${wallLabel} ${opening.positionPercent}%｜${opening.width}mm`;
  }

  updateActiveOpening(kind, updates) {
    const opening = this.resolveActiveOpening(kind);
    if (!opening) return;
    this.stateManager.updateOpening(opening.id, updates);
  }

  syncMaterialControls() {
    const state = this.stateManager.state;
    this.dom.snapToggle.checked = state.snap;
    this.dom.snapSizeSelect.value = String(state.snapSize);
    this.dom.gridToggle.checked = state.showGrid !== false;
    this.dom.roomLabelToggle.checked = state.showRoomLabel === true;
    this.dom.dimensionsToggle.checked = state.showDimensions !== false;
    this.dom.northAngle.value = state.northAngle || 0;
    this.dom.northAngleVal.textContent = `${state.northAngle || 0}°`;
    this.syncSwatchState('floorSwatches', state.colors.floor);
    this.syncSwatchState('wallSwatches', state.colors.wall);
    this.syncSwatchState('ceilingSwatches', state.colors.ceiling);
  }

  initSwatchColors() {
    document.querySelectorAll('.swatch').forEach(swatch => {
      const color = swatch.dataset.color;
      if (color) {
        swatch.querySelector('span').style.background = color;
      }
    });
  }

  setupSwatches(containerId, colorKey) {
    const container = $(containerId);
    container.querySelectorAll('.swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        this.stateManager.setColor(colorKey, swatch.dataset.color);
      });
    });
  }

  syncSwatchState(containerId, color) {
    const container = $(containerId);
    container.querySelectorAll('.swatch').forEach(swatch => {
      swatch.classList.toggle('active', swatch.dataset.color === color);
    });
  }

  handleKeyboard(event) {
    const targetTag = event.target.tagName;
    if (targetTag === 'INPUT' || targetTag === 'SELECT') return;

    if (event.key === 'z' && event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      this.stateManager.undo();
      return;
    }
    if ((event.key === 'y' && event.ctrlKey) || (event.key === 'z' && event.ctrlKey && event.shiftKey)) {
      event.preventDefault();
      this.stateManager.redo();
      return;
    }

    const item = this.stateManager.getSelectedItem();
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.stateManager.state.selectedId) {
      event.preventDefault();
      this.stateManager.removeFurniture(this.stateManager.state.selectedId);
      return;
    }

    if ((event.key === 'r' || event.key === 'R') && item) {
      this.stateManager.rotateSelectedBy(90);
      return;
    }

    if (event.key === 'Escape') {
      this.stateManager.selectFurniture(null);
      return;
    }

    if ((event.key === 'd' || event.key === 'D') && event.ctrlKey) {
      event.preventDefault();
      if (!this.stateManager.state.selectedId) return;
      this.stateManager.duplicateFurniture(this.stateManager.state.selectedId);
      return;
    }

    if (event.key === 's' && event.ctrlKey) {
      event.preventDefault();
      this.callbacks.onSaveRequested?.();
      return;
    }

    if (!item || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;

    event.preventDefault();
    const step = event.shiftKey ? 50 : 250;
    this.stateManager.moveFurniture(item.id, {
      x: item.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
      y: item.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
    });
  }

  handleResize() {
    if (this.dom.app.classList.contains('hidden')) return;
    if (this.stateManager.state.viewMode === '2d') {
      this.floorplan.resize();
      this.floorplan.fitView();
      this.floorplan.draw();
      return;
    }
    this.roomScene.resize();
  }
}