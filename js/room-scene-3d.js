import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FURNITURE_DEFS } from './constants.js';
import { adjustColor } from './utils.js';

export class RoomScene3D {
  constructor(canvas, stateManager) {
    this.canvas = canvas;
    this.stateManager = stateManager;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.initialized = false;
    this.animating = false;
    this.active = false;
  }

  activate() {
    this.active = true;
    this.init();
    this.resize();
    this.buildScene();
    this.startRenderLoop();
  }

  deactivate() {
    this.active = false;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(5, 4, 7);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 25;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 1.0);
    directional.position.set(5, 10, 5);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 30;
    directional.shadow.camera.left = -10;
    directional.shadow.camera.right = 10;
    directional.shadow.camera.top = 10;
    directional.shadow.camera.bottom = -10;
    this.scene.add(directional);

    const fillLight = new THREE.DirectionalLight(0xaac4e0, 0.3);
    fillLight.position.set(-3, 5, -3);
    this.scene.add(fillLight);
  }

  resize() {
    if (!this.renderer) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.renderer.setSize(rect.width, rect.height);
    this.renderer.setPixelRatio(devicePixelRatio);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
  }

  buildScene() {
    if (!this.scene) return;
    this.clearScene();

    const state = this.stateManager.state;
    const room = this.stateManager.getPrimaryRoom() || state.room;
    const roomWidthM = room.w / 1000;
    const roomDepthM = room.d / 1000;
    const roomHeightM = room.h / 1000;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidthM, roomDepthM),
      new THREE.MeshStandardMaterial({ color: state.colors.floor, roughness: 0.8, metalness: 0.0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(roomWidthM / 2, 0, roomDepthM / 2);
    floor.receiveShadow = true;
    this.scene.add(floor);

    ['south', 'north', 'west', 'east'].forEach(wallName => {
      this.buildWall(wallName, roomWidthM, roomHeightM, roomDepthM);
    });

    state.furnitureItems.forEach(item => this.buildFurniture(item));

    if (!state.cameraInitialized3d) {
      state.cameraInitialized3d = true;
      const maxDimension = Math.max(roomWidthM, roomDepthM);
      this.camera.position.set(roomWidthM / 2 + maxDimension * 0.5, roomHeightM * 1.2, roomDepthM + maxDimension * 0.6);
      this.controls.target.set(roomWidthM / 2, roomHeightM * 0.3, roomDepthM / 2);
      this.controls.update();
    }
  }

  clearScene() {
    const removable = [];
    this.scene.children.forEach(object => {
      if (object.isLight || object === this.camera) return;
      removable.push(object);
    });

    removable.forEach(object => {
      object.traverse(child => {
        child.geometry?.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
          else child.material.dispose();
        }
      });
      this.scene.remove(object);
    });
  }

  buildWall(wallName, roomWidthM, roomHeightM, roomDepthM) {
    const state = this.stateManager.state;
    const room = this.stateManager.getActiveRoom() || state.room;
    const thickness = 0.08;
    const isHorizontal = wallName === 'south' || wallName === 'north';
    const wallLengthM = isHorizontal ? roomWidthM : roomDepthM;
    const wallLengthMm = isHorizontal ? room.w : room.d;
    const isVerticalWall = wallName === 'west' || wallName === 'east';
    const openings = this.stateManager.getOpeningsForWall(wallName).map(opening => {
      const centerMm = isVerticalWall ? wallLengthMm * (1 - opening.positionPercent / 100) : wallLengthMm * (opening.positionPercent / 100);
      const openingHeightM = opening.height / 1000;
      const defaultBottomM = opening.kind === 'door' ? 0 : (roomHeightM - openingHeightM) * 0.5 + 0.3;
      const bottomM = opening.bottomOffset == null ? defaultBottomM : opening.bottomOffset / 1000;
      return {
        startM: (centerMm - opening.width / 2) / 1000,
        endM: (centerMm + opening.width / 2) / 1000,
        bottomM,
        topM: bottomM + openingHeightM,
        type: opening.kind,
        subtype: opening.subtype,
      };
    });

    if (openings.length === 0) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(wallLengthM, roomHeightM, thickness),
        new THREE.MeshStandardMaterial({ color: state.colors.wall, roughness: 0.9 })
      );
      this.positionWall(mesh, wallName, roomWidthM, roomHeightM, roomDepthM, thickness);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return;
    }

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(wallLengthM, 0);
    shape.lineTo(wallLengthM, roomHeightM);
    shape.lineTo(0, roomHeightM);
    shape.lineTo(0, 0);

    openings.forEach(opening => {
      const hole = new THREE.Path();
      hole.moveTo(Math.max(0, opening.startM), Math.max(0, opening.bottomM));
      hole.lineTo(Math.min(wallLengthM, opening.endM), Math.max(0, opening.bottomM));
      hole.lineTo(Math.min(wallLengthM, opening.endM), Math.min(roomHeightM, opening.topM));
      hole.lineTo(Math.max(0, opening.startM), Math.min(roomHeightM, opening.topM));
      hole.lineTo(Math.max(0, opening.startM), Math.max(0, opening.bottomM));
      shape.holes.push(hole);
    });

    const wall = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: state.colors.wall, roughness: 0.9, side: THREE.DoubleSide })
    );
    wall.receiveShadow = true;

    switch (wallName) {
      case 'south':
        wall.position.set(0, 0, roomDepthM);
        break;
      case 'north':
        wall.position.set(0, 0, 0);
        break;
      case 'west':
        wall.rotation.y = Math.PI / 2;
        wall.position.set(0, 0, roomDepthM);
        break;
      case 'east':
        wall.rotation.y = Math.PI / 2;
        wall.position.set(roomWidthM, 0, roomDepthM);
        break;
    }

    this.scene.add(wall);
    openings.filter(opening => opening.type === 'window').forEach(opening => {
      this.buildWindowGlass(wallName, opening, roomWidthM, roomDepthM);
    });
  }

  buildWindowGlass(wallName, opening, roomWidthM, roomDepthM) {
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(opening.endM - opening.startM, opening.topM - opening.bottomM),
      new THREE.MeshPhysicalMaterial({
        color: opening.subtype === 'fix' ? 0x9fd9f5 : 0x88bbdd,
        transparent: true,
        opacity: opening.subtype === 'sweepout' ? 0.45 : 0.3,
        roughness: 0.05,
        metalness: 0.1,
        side: THREE.DoubleSide,
      })
    );

    const centerX = (opening.startM + opening.endM) / 2;
    const centerY = (opening.bottomM + opening.topM) / 2;
    switch (wallName) {
      case 'south':
        glass.position.set(centerX, centerY, roomDepthM);
        break;
      case 'north':
        glass.position.set(centerX, centerY, 0);
        break;
      case 'west':
        glass.rotation.y = Math.PI / 2;
        glass.position.set(0, centerY, roomDepthM - centerX);
        break;
      case 'east':
        glass.rotation.y = Math.PI / 2;
        glass.position.set(roomWidthM, centerY, roomDepthM - centerX);
        break;
    }

    this.scene.add(glass);
  }

  positionWall(mesh, wallName, roomWidthM, roomHeightM, roomDepthM, thickness) {
    switch (wallName) {
      case 'south':
        mesh.position.set(roomWidthM / 2, roomHeightM / 2, roomDepthM + thickness / 2);
        break;
      case 'north':
        mesh.position.set(roomWidthM / 2, roomHeightM / 2, -thickness / 2);
        break;
      case 'west':
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(-thickness / 2, roomHeightM / 2, roomDepthM / 2);
        break;
      case 'east':
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(roomWidthM + thickness / 2, roomHeightM / 2, roomDepthM / 2);
        break;
    }
  }

  buildFurniture(item) {
    const definition = FURNITURE_DEFS[item.type];
    if (!definition) return;

    const size = this.stateManager.getItemSize(item);
    const widthM = size.w / 1000;
    const depthM = size.d / 1000;
    const heightM = size.h / 1000;
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(widthM, heightM, depthM),
      new THREE.MeshStandardMaterial({ color: item.customColor || definition.color, roughness: 0.7, metalness: 0.05 })
    );
    body.position.y = heightM / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    this.addFurnitureDetails(group, item.type, widthM, depthM, heightM, definition);
    group.position.set(item.x / 1000, 0, item.y / 1000);
    group.rotation.y = -(item.rotation || 0) * Math.PI / 180;

    if (item.id === this.stateManager.state.selectedId) {
      const edges = new THREE.EdgesGeometry(body.geometry);
      const highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x3a5a3a }));
      highlight.position.y = heightM / 2;
      group.add(highlight);
    }

    this.scene.add(group);
  }

  addFurnitureDetails(group, type, widthM, depthM, heightM, definition) {
    switch (type) {
      case 'sofa': {
        const material = new THREE.MeshStandardMaterial({ color: adjustColor(definition.color, -20), roughness: 0.8 });
        const back = new THREE.Mesh(new THREE.BoxGeometry(widthM, heightM * 0.4, depthM * 0.25), material);
        back.position.set(0, heightM * 0.8, -depthM * 0.35);
        back.castShadow = true;
        group.add(back);
        [-1, 1].forEach(side => {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(widthM * 0.06, heightM * 0.6, depthM), material);
          arm.position.set(side * (widthM * 0.5 - widthM * 0.03), heightM * 0.65, 0);
          arm.castShadow = true;
          group.add(arm);
        });
        break;
      }
      case 'table':
      case 'diningTable':
      case 'desk': {
        const material = new THREE.MeshStandardMaterial({ color: adjustColor(definition.color, -30), roughness: 0.6 });
        const geometry = new THREE.CylinderGeometry(0.025, 0.025, heightM - 0.05);
        [
          [-widthM / 2 + 0.05, -depthM / 2 + 0.05],
          [widthM / 2 - 0.05, -depthM / 2 + 0.05],
          [-widthM / 2 + 0.05, depthM / 2 - 0.05],
          [widthM / 2 - 0.05, depthM / 2 - 0.05],
        ].forEach(([offsetX, offsetZ]) => {
          const leg = new THREE.Mesh(geometry, material);
          leg.position.set(offsetX, (heightM - 0.05) / 2, offsetZ);
          leg.castShadow = true;
          group.add(leg);
        });
        break;
      }
      case 'bed': {
        const material = new THREE.MeshStandardMaterial({ color: adjustColor(definition.color, -20), roughness: 0.8 });
        const headboard = new THREE.Mesh(new THREE.BoxGeometry(widthM, heightM * 1.5, 0.06), material);
        headboard.position.set(0, heightM * 0.75, -depthM / 2 + 0.03);
        headboard.castShadow = true;
        group.add(headboard);
        const pillowMaterial = new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.9 });
        [-1, 1].forEach(side => {
          const pillow = new THREE.Mesh(new THREE.BoxGeometry(widthM * 0.35, 0.08, 0.25), pillowMaterial);
          pillow.position.set(side * widthM * 0.25, heightM + 0.04, -depthM * 0.35);
          group.add(pillow);
        });
        break;
      }
      case 'chair': {
        const material = new THREE.MeshStandardMaterial({ color: adjustColor(definition.color, -15), roughness: 0.7 });
        const back = new THREE.Mesh(new THREE.BoxGeometry(widthM * 0.9, heightM * 0.5, 0.04), material);
        back.position.set(0, heightM * 0.75, -depthM / 2 + 0.02);
        back.castShadow = true;
        group.add(back);
        break;
      }
      case 'plant': {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.04, heightM * 0.5),
          new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 0.9 })
        );
        trunk.position.y = heightM * 0.25;
        group.add(trunk);
        const leaves = new THREE.Mesh(
          new THREE.SphereGeometry(widthM * 0.5, 8, 8),
          new THREE.MeshStandardMaterial({ color: '#4a8a3a', roughness: 0.8 })
        );
        leaves.position.y = heightM * 0.7;
        leaves.castShadow = true;
        group.add(leaves);
        break;
      }
      case 'lamp': {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.02, heightM * 0.85),
          new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.5, roughness: 0.3 })
        );
        pole.position.y = heightM * 0.425;
        group.add(pole);
        const shade = new THREE.Mesh(
          new THREE.ConeGeometry(0.15, 0.2, 16, 1, true),
          new THREE.MeshStandardMaterial({ color: '#f5e8c8', roughness: 0.8, side: THREE.DoubleSide })
        );
        shade.position.y = heightM * 0.9;
        shade.rotation.x = Math.PI;
        group.add(shade);
        break;
      }
      case 'kitchen':
      case 'kitchenSmall': {
        const countertop = new THREE.Mesh(
          new THREE.BoxGeometry(widthM, 0.04, depthM),
          new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.3, metalness: 0.1 })
        );
        countertop.position.y = heightM + 0.02;
        group.add(countertop);
        const sink = new THREE.Mesh(
          new THREE.BoxGeometry(widthM * 0.25, 0.06, depthM * 0.5),
          new THREE.MeshStandardMaterial({ color: '#c0c0c0', roughness: 0.2, metalness: 0.4 })
        );
        sink.position.set(-widthM * 0.2, heightM - 0.01, 0);
        group.add(sink);
        [-0.12, 0.12].forEach(offsetX => {
          const burner = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.01, 16),
            new THREE.MeshStandardMaterial({ color: '#333', roughness: 0.5, metalness: 0.3 })
          );
          burner.position.set(widthM * 0.25 + offsetX, heightM + 0.04, 0);
          group.add(burner);
        });
        break;
      }
      case 'cupboard': {
        const material = new THREE.MeshStandardMaterial({ color: adjustColor(definition.color, -10), roughness: 0.7 });
        for (let index = 1; index <= 3; index += 1) {
          const shelf = new THREE.Mesh(new THREE.BoxGeometry(widthM * 0.95, 0.02, depthM * 0.9), material);
          shelf.position.y = heightM * (index / 4);
          group.add(shelf);
        }
        break;
      }
      case 'washMachine': {
        const drum = new THREE.Mesh(
          new THREE.CylinderGeometry(widthM * 0.3, widthM * 0.3, 0.02, 24),
          new THREE.MeshStandardMaterial({ color: '#ccc', roughness: 0.2, metalness: 0.3 })
        );
        drum.rotation.x = Math.PI / 2;
        drum.position.set(0, heightM * 0.45, depthM / 2 + 0.01);
        group.add(drum);
        break;
      }
    }
  }

  startRenderLoop() {
    if (this.animating) return;
    this.animating = true;

    const loop = () => {
      if (!this.active) {
        this.animating = false;
        return;
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };

    loop();
  }
}