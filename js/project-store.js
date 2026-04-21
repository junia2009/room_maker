import { STORAGE_KEY } from './constants.js';
import { createProjectId } from './utils.js';

export class ProjectStore {
  createTimestamp() {
    return new Date().toISOString();
  }

  getAllLayouts() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  saveAllLayouts(layouts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  }

  createLayout(name, data) {
    const timestamp = this.createTimestamp();
    return {
      id: createProjectId(),
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      data,
    };
  }

  createAndAddLayout(name, data) {
    return this.addLayout(this.createLayout(name, data));
  }

  normalizeProjectData(data = {}) {
    return {
      room: data.room,
      rooms: Array.isArray(data.rooms) ? data.rooms : undefined,
      walls: Array.isArray(data.walls) ? data.walls : undefined,
      openings: Array.isArray(data.openings) ? data.openings : undefined,
      colors: data.colors,
      door: data.door,
      window: data.window,
      furnitureItems: Array.isArray(data.furnitureItems) ? data.furnitureItems : [],
      nextId: data.nextId || 1,
    };
  }

  createImportedLayout(fileName, importedData) {
    const name = importedData?.name || fileName.replace(/\.json$/i, '');
    return this.createLayout(name, this.normalizeProjectData(importedData));
  }

  createImportedLayoutFromText(fileName, text) {
    const importedData = JSON.parse(text);
    return this.createImportedLayout(fileName, importedData);
  }

  importLayoutFromText(fileName, text) {
    return this.addLayout(this.createImportedLayoutFromText(fileName, text));
  }

  updateLayout(id, name, data) {
    const layouts = this.getAllLayouts();
    const index = layouts.findIndex(layout => layout.id === id);
    if (index === -1) return false;

    layouts[index].name = name;
    layouts[index].updatedAt = this.createTimestamp();
    layouts[index].data = data;
    this.saveAllLayouts(layouts);
    return true;
  }

  addLayout(layout) {
    const layouts = this.getAllLayouts();
    layouts.unshift(layout);
    this.saveAllLayouts(layouts);
    return layout;
  }

  findLayout(id) {
    return this.getAllLayouts().find(layout => layout.id === id) || null;
  }

  deleteLayout(id) {
    const layouts = this.getAllLayouts().filter(layout => layout.id !== id);
    this.saveAllLayouts(layouts);
  }
}