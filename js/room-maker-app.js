import { EditorController } from './editor-controller.js';
import { Floorplan2D } from './floorplan-2d.js';
import { ProjectStore } from './project-store.js';
import { ProjectController } from './project-controller.js';
import { RoomScene3D } from './room-scene-3d.js';
import { RoomMakerState } from './state-manager.js';
import { $ } from './utils.js';

export class RoomMakerApp {
  constructor() {
    this.stateManager = new RoomMakerState();
    this.projectStore = new ProjectStore();
    this.floorplan = new Floorplan2D($('canvas2d'), this.stateManager);
    this.roomScene = new RoomScene3D($('canvas3d'), this.stateManager);
    this.editorController = new EditorController({
      stateManager: this.stateManager,
      floorplan: this.floorplan,
      roomScene: this.roomScene,
      callbacks: {
        onSaveRequested: () => this.saveCurrentProject(),
        onExportRequested: () => this.exportCurrentProject(),
        onProjectNameCommitted: () => this.persistCurrentProject({ showToast: false }),
        onBackRequested: () => {
          this.saveCurrentProject();
          this.showTopScreen();
        },
      },
    });
    this.projectController = new ProjectController({
      projectStore: this.projectStore,
      callbacks: {
        onNewRequested: () => this.createNewProject(),
        onOpenRequested: id => this.openProject(id),
        onImported: id => this.openProject(id),
        onToast: message => this.showToast(message),
      },
    });
  }

  init() {
    this.editorController.init();
    this.projectController.init();
    this.showTopScreen();
  }

  getCurrentProjectName() {
    return this.editorController.dom.projectName.value.trim() || '無題';
  }

  persistCurrentProject({ showToast = true } = {}) {
    const projectId = this.stateManager.state.currentProjectId;
    if (!projectId) return false;

    const success = this.projectStore.updateLayout(
      projectId,
      this.getCurrentProjectName(),
      this.stateManager.buildProjectData()
    );
    if (success && showToast) {
      this.showToast('保存しました');
    }
    return success;
  }

  saveCurrentProject() {
    this.persistCurrentProject();
  }

  exportCurrentProject() {
    const data = this.stateManager.buildProjectData();
    data.name = this.getCurrentProjectName();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = (data.name || 'room_layout') + '.json';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    this.showToast('JSONをエクスポートしました');
  }

  showTopScreen() {
    this.stateManager.setCurrentProjectId(null, { silent: true });
    this.projectController.show();
    this.editorController.hide();
    this.projectController.renderSavedList();
  }

  showEditor() {
    this.projectController.hide();
    this.editorController.show();
  }

  initializeEditorSession({ projectId, projectName, projectData }) {
    this.stateManager.reset({ silent: true });
    if (projectData) {
      this.stateManager.loadProjectData(projectData, { silent: true });
    }
    this.stateManager.setCurrentProjectId(projectId, { silent: true });
    this.editorController.setProjectName(projectName);
    this.editorController.syncUIFromState();
    this.showEditor();
    this.editorController.switchView(this.stateManager.state.viewMode);
    this.floorplan.fitView();
    this.editorController.renderFromState();
  }

  createLayoutAndOpen(name, data) {
    const layout = this.projectStore.createAndAddLayout(name, data);
    this.initializeEditorSession({
      projectId: layout.id,
      projectName: layout.name,
      projectData: layout.data,
    });
    return layout;
  }

  createNewProject() {
    this.stateManager.reset({ silent: true });
    this.createLayoutAndOpen('新しい間取り', this.stateManager.buildProjectData());
  }

  openProject(id) {
    const layout = this.projectStore.findLayout(id);
    if (!layout) {
      this.showToast('データが見つかりません');
      return;
    }

    this.initializeEditorSession({
      projectId: id,
      projectName: layout.name,
      projectData: layout.data,
    });
  }

  showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }
}