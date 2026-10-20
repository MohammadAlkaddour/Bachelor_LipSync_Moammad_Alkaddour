import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class ModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
  }

  // Bypass the HTTP cache so load timings do not depend on earlier visits.
  async loadModel(path) {
    const downloadStart = performance.now();
    const response = await fetch(path, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`Failed to load model: ${path} (${response.status})`);
    }

    const data = await response.arrayBuffer();
    const parseStart = performance.now();
    const resourcePath = path.slice(0, path.lastIndexOf('/') + 1);
    const gltf = await this.loader.parseAsync(data, resourcePath);
    const parseEnd = performance.now();

    return {
      gltf,
      bytes: data.byteLength,
      timings: {
        downloadMs: parseStart - downloadStart,
        parseMs: parseEnd - parseStart,
      },
    };
  }
}
