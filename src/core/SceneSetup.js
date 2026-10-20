import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneSetup {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );

    this.camera.position.set(0, 1.5, 4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 1.4, 0);
    this.controls.minDistance = 1.0;
    this.controls.maxDistance = 8.0;
    this.controls.update();

    this.fixedRenderSize = null;

    this.addLights();
    this.addResizeHandler();
  }

  addLights() {
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(2, 4, 3);
    this.scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);
  }

  addResizeHandler() {
    window.addEventListener('resize', () => {
      if (this.fixedRenderSize) {
        return;
      }

      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  setFixedRenderSize(width, height) {
    this.fixedRenderSize = {
      pixelRatio: this.renderer.getPixelRatio(),
      aspect: this.camera.aspect,
    };

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  clearFixedRenderSize() {
    if (!this.fixedRenderSize) {
      return;
    }

    this.renderer.setPixelRatio(this.fixedRenderSize.pixelRatio);
    this.fixedRenderSize = null;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  lockCamera(preset) {
    const previous = {
      fov: this.camera.fov,
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      enableDamping: this.controls.enableDamping,
    };

    this.controls.enabled = false;
    // Without damping, no residual orbit motion is applied after locking.
    this.controls.enableDamping = false;
    this.camera.fov = preset.fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(...preset.position);
    this.controls.target.set(...preset.target);
    this.controls.update();

    return previous;
  }

  unlockCamera(previous) {
    this.camera.fov = previous.fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(previous.position);
    this.controls.target.copy(previous.target);
    this.controls.enableDamping = previous.enableDamping;
    this.controls.enabled = true;
    this.controls.update();
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
