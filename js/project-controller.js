import { $, escapeHtml, formatDate } from './utils.js';

export class ProjectController {
  constructor({ projectStore, callbacks = {} }) {
    this.projectStore = projectStore;
    this.callbacks = callbacks;
    this.dom = this.collectDom();
  }

  collectDom() {
    return {
      topScreen: $('top-screen'),
      savedList: $('savedList'),
      emptyMsg: $('emptyMsg'),
      fileImport: $('fileImport'),
    };
  }

  init() {
    $('btnNewProject').addEventListener('click', () => this.callbacks.onNewRequested?.());
    $('btnImportFile').addEventListener('click', () => this.dom.fileImport.click());
    this.dom.fileImport.addEventListener('change', event => this.importProjectFile(event));
  }

  show() {
    this.dom.topScreen.classList.remove('hidden');
  }

  hide() {
    this.dom.topScreen.classList.add('hidden');
  }

  renderSavedList() {
    const layouts = this.projectStore.getAllLayouts();
    this.dom.savedList.innerHTML = '';

    if (layouts.length === 0) {
      this.dom.emptyMsg.classList.remove('hidden');
      return;
    }

    this.dom.emptyMsg.classList.add('hidden');
    layouts.forEach(layout => {
      this.dom.savedList.appendChild(this.createSavedCard(layout));
    });
  }

  createSavedCard(layout) {
    const card = document.createElement('div');
    card.className = 'saved-card';
    card.innerHTML = `
      <div class="saved-card-info">
        <div class="saved-card-name">${escapeHtml(layout.name)}</div>
        <div class="saved-card-meta">${this.getLayoutMetaText(layout)}</div>
      </div>
      <div class="saved-card-actions">
        <button class="saved-card-btn open-btn" data-id="${layout.id}">開く</button>
        <button class="saved-card-btn danger del-btn" data-id="${layout.id}">削除</button>
      </div>`;

    card.querySelector('.saved-card-info').addEventListener('click', () => this.callbacks.onOpenRequested?.(layout.id));
    card.querySelector('.open-btn').addEventListener('click', event => {
      event.stopPropagation();
      this.callbacks.onOpenRequested?.(layout.id);
    });
    card.querySelector('.del-btn').addEventListener('click', event => {
      event.stopPropagation();
      if (!confirm(`「${layout.name}」を削除しますか？`)) return;
      this.projectStore.deleteLayout(layout.id);
      this.renderSavedList();
      this.callbacks.onToast?.('削除しました');
    });

    return card;
  }

  getLayoutMetaText(layout) {
    const roomInfo = layout.data?.room
      ? `${(layout.data.room.w / 1000).toFixed(1)}m × ${(layout.data.room.d / 1000).toFixed(1)}m`
      : '';
    const furnitureCount = layout.data?.furnitureItems?.length || 0;
    return `${roomInfo} ・ 家具${furnitureCount}点 ・ ${formatDate(layout.updatedAt)}`;
  }

  importProjectFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = loadEvent => {
      try {
        const layout = this.projectStore.importLayoutFromText(file.name, loadEvent.target.result);
        this.renderSavedList();
        this.callbacks.onToast?.('インポートしました');
        this.callbacks.onImported?.(layout.id);
      } catch {
        this.callbacks.onToast?.('ファイルの読込に失敗しました');
      }
    };

    reader.readAsText(file);
    event.target.value = '';
  }
}