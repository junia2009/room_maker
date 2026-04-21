import { FURNITURE_DEFS } from './constants.js';
import { $, parseNumber } from './utils.js';

export class EditorController {
  constructor({ stateManager, floorplan, roomScene, callbacks = {} }) {
    this.stateManager = stateManager;
    this.floorplan = floorplan;
    this.roomScene = roomScene;
    this.callbacks = callbacks;
    this.dom = this.collectDom();
    this.roomInfoReasons = new Set(['reset', 'loadProjectData', 'setRoomDimensions']);
    this.roomControlReasons = new Set(['reset', 'loadProjectData', 'setRoomDimensions']);
    this.openingControlReasons = new Set(['reset', 'loadProjectData', 'setDoorConfig', 'setWindowConfig']);
    this.materialControlReasons = new Set(['reset', 'loadProjectData', 'setColor', 'setSnapEnabled', 'setSnapSize']);
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
    ]);
    this.floorplanReasons = new Set([
      'reset',
      'loadProjectData',
      'setRoomDimensions',
      'setDoorConfig',
      'setWindowConfig',
      'setColor',
      'selectFurniture',
      'addFurniture',
      'removeFurniture',
      'duplicateFurniture',
      'updateSelectedSize',
      'updateSelectedRotation',
      'rotateSelectedBy',
      'resetSelectedSize',
      'moveFurniture',
    ]);
    this.sceneReasons = new Set([
      'reset',
      'loadProjectData',
      'setRoomDimensions',
      'setDoorConfig',
      'setWindowConfig',
      'setColor',
      'addFurniture',
      'removeFurniture',
      'duplicateFurniture',
      'updateSelectedSize',
      'updateSelectedRotation',
      'rotateSelectedBy',
      'resetSelectedSize',
      'moveFurniture',
    ]);
  }

  collectDom() {
    return {
      app: $('app'),
      projectName: $('projectName'),
      roomInfoBox: $('roomInfoBox'),
      roomDims: $('roomDims'),
      roomWidth: $('roomWidth'),
      roomDepth: $('roomDepth'),
      roomHeight: $('roomHeight'),
      doorWall: $('doorWall'),
      doorPos: $('doorPos'),
      doorPosVal: $('doorPosVal'),
      doorWidth: $('doorWidth'),
      windowWall: $('windowWall'),
      windowPos: $('windowPos'),
      windowPosVal: $('windowPosVal'),
      windowW: $('windowW'),
      windowH: $('windowH'),
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
    this.renderFromState();
  }

  hide() {
    this.dom.app.classList.add('hidden');
    this.roomScene.deactivate();
  }

  bindEvents() {
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
        this.stateManager.setRoomDimensions({
          w: parseNumber(this.dom.roomWidth.value, 6000),
          d: parseNumber(this.dom.roomDepth.value, 5000),
          h: parseNumber(this.dom.roomHeight.value, 2400),
        });
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

    this.dom.doorWall.addEventListener('change', () => {
      this.stateManager.setDoorConfig({ wall: this.dom.doorWall.value });
    });
    this.dom.doorPos.addEventListener('input', () => {
      this.stateManager.setDoorConfig({ pos: parseNumber(this.dom.doorPos.value, 50) });
    });
    this.dom.doorWidth.addEventListener('input', () => {
      this.stateManager.setDoorConfig({ width: parseNumber(this.dom.doorWidth.value, 800) });
    });

    this.dom.windowWall.addEventListener('change', () => {
      this.stateManager.setWindowConfig({ wall: this.dom.windowWall.value });
    });
    this.dom.windowPos.addEventListener('input', () => {
      this.stateManager.setWindowConfig({ pos: parseNumber(this.dom.windowPos.value, 50) });
    });
    this.dom.windowW.addEventListener('input', () => {
      this.stateManager.setWindowConfig({ w: parseNumber(this.dom.windowW.value, 1800) });
    });
    this.dom.windowH.addEventListener('input', () => {
      this.stateManager.setWindowConfig({ h: parseNumber(this.dom.windowH.value, 1200) });
    });

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

    $('btnSave').addEventListener('click', () => this.callbacks.onSaveRequested?.());
    $('btnExport').addEventListener('click', () => this.callbacks.onExportRequested?.());
    $('btnBackTop').addEventListener('click', () => this.callbacks.onBackRequested?.());

    window.addEventListener('keydown', event => this.handleKeyboard(event));
    window.addEventListener('resize', () => this.handleResize());
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
    if (this.dom.app.classList.contains('hidden')) return;

    if (!reason || this.floorplanReasons.has(reason)) {
      this.floorplan.draw();
    }
    if (this.stateManager.state.viewMode === '3d' && (!reason || this.sceneReasons.has(reason))) {
      this.roomScene.buildScene();
    }
  }

  updateRoomInfo() {
    const room = this.stateManager.state.room;
    const sqm = (room.w * room.d) / 1e6;
    const jou = sqm / 1.62;
    this.dom.roomInfoBox.textContent = `${sqm.toFixed(1)} ㎡ ｜ ${jou.toFixed(1)} 畳`;
    this.dom.roomDims.textContent = `${room.w} × ${room.d} mm`;
  }

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
  }

  syncUIFromState() {
    this.syncRoomControls();
    this.syncOpeningControls();
    this.syncMaterialControls();
  }

  syncRoomControls() {
    const state = this.stateManager.state;
    this.dom.roomWidth.value = state.room.w;
    this.dom.roomDepth.value = state.room.d;
    this.dom.roomHeight.value = state.room.h;
  }

  syncOpeningControls() {
    const state = this.stateManager.state;
    this.dom.doorWall.value = state.door.wall;
    this.dom.doorPos.value = state.door.pos;
    this.dom.doorPosVal.textContent = `${state.door.pos}%`;
    this.dom.doorWidth.value = state.door.width;
    this.dom.windowWall.value = state.window.wall;
    this.dom.windowPos.value = state.window.pos;
    this.dom.windowPosVal.textContent = `${state.window.pos}%`;
    this.dom.windowW.value = state.window.w;
    this.dom.windowH.value = state.window.h;
  }

  syncMaterialControls() {
    const state = this.stateManager.state;
    this.dom.snapToggle.checked = state.snap;
    this.dom.snapSizeSelect.value = String(state.snapSize);
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