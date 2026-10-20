// Unlisted shapes fall back to maxInfluence.
export const POSE_STRENGTH = {
  anim_lipshape_PBM: 1.0,
  anim_lipshape_KST: 0.7,
  anim_lipshape_EH_AE: 0.8,
  anim_lipshape_A: 0.85,
  anim_lipshape_AO_ER: 0.82,
  anim_lipshape_UW_OW_W: 0.85,
  anim_lipshape_F_V: 0.9,
  anim_lipshape_L: 0.85,
};

export const SHAPE_KEY_MAX_INFLUENCE = 0.85;
export const SHAPE_KEY_ATTACK_SPEED = 22;
export const SHAPE_KEY_RELEASE_SPEED = 16;

export class ShapeKeyController {
  constructor(root, options = {}) {
    this.root = root;

    this.maxInfluence = options.maxInfluence ?? SHAPE_KEY_MAX_INFLUENCE;
    this.attackSpeed = options.attackSpeed ?? SHAPE_KEY_ATTACK_SPEED;
    this.releaseSpeed = options.releaseSpeed ?? SHAPE_KEY_RELEASE_SPEED;
    this.poseStrength = {
      ...POSE_STRENGTH,
      ...(options.poseStrength || {}),
    };

    this.morphMeshes = [];
    this.shapeNames = [];
    this.currentWeights = {};
    this.targetWeights = {};
    this.activePose = null;

    // Multi-material glTF meshes split into several primitives that must stay in sync.
    root.traverse((object) => {
      if (
        object.isMesh &&
        object.morphTargetDictionary &&
        object.morphTargetInfluences
      ) {
        this.morphMeshes.push(object);
      }
    });

    const nameSet = new Set();

    for (const mesh of this.morphMeshes) {
      for (const name of Object.keys(mesh.morphTargetDictionary)) {
        nameSet.add(name);
      }
    }

    this.shapeNames = Array.from(nameSet).sort();

    for (const name of this.shapeNames) {
      this.currentWeights[name] = 0;
      this.targetWeights[name] = 0;
    }

    this.applyWeightsToMeshes();

    console.log(
      `ShapeKeyController: found ${this.morphMeshes.length} morph-target mesh(es), ` +
        `${this.shapeNames.length} shapes, attack=${this.attackSpeed}, ` +
        `release=${this.releaseSpeed}`
    );
  }

  getShapeNames() {
    return [...this.shapeNames];
  }

  getPoseStrength(name) {
    if (this.poseStrength[name] !== undefined) {
      return this.poseStrength[name];
    }

    return this.maxInfluence;
  }

  getStrongestMorph() {
    let strongestName = null;
    let strongestWeight = 0;

    for (const name of this.shapeNames) {
      const weight = this.currentWeights[name];

      if (weight > strongestWeight) {
        strongestWeight = weight;
        strongestName = name;
      }
    }

    return { name: strongestName, weight: strongestWeight };
  }

  setShape(name, value = this.getPoseStrength(name)) {
    if (!(name in this.currentWeights)) {
      console.warn(`ShapeKeyController: unknown shape "${name}"`);
      return;
    }

    this.currentWeights[name] = value;
    this.targetWeights[name] = value;
    this.applyWeightsToMeshes();
  }

  reset() {
    this.setPose(null);
  }

  setPose(name) {
    const targets = {};

    if (name !== null) {
      if (!(name in this.targetWeights)) {
        console.warn(`ShapeKeyController: unknown pose "${name}"`);
        return;
      }

      targets[name] = this.getPoseStrength(name);
    }

    this.setTargetWeights(targets);
  }

  setTargetWeights(weights) {
    for (const shapeName of this.shapeNames) {
      this.targetWeights[shapeName] = 0;
    }

    for (const [name, value] of Object.entries(weights)) {
      if (name in this.targetWeights) {
        this.targetWeights[name] = value;
      }
    }

    this.activePose = this.findPrimaryTarget();
  }

  findPrimaryTarget() {
    let strongestName = null;
    let strongestWeight = 0;

    for (const name of this.shapeNames) {
      const weight = this.targetWeights[name];

      if (weight > strongestWeight) {
        strongestWeight = weight;
        strongestName = name;
      }
    }

    return strongestName;
  }

  update(deltaTime) {
    if (deltaTime <= 0) {
      return;
    }

    for (const name of this.shapeNames) {
      const current = this.currentWeights[name];
      const target = this.targetWeights[name];
      const speed = target > current ? this.attackSpeed : this.releaseSpeed;
      const alpha = 1 - Math.exp(-speed * deltaTime);
      this.currentWeights[name] = current + (target - current) * alpha;
    }

    this.applyWeightsToMeshes();
  }

  applyWeightsToMeshes() {
    for (const mesh of this.morphMeshes) {
      const dictionary = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;

      for (const name of this.shapeNames) {
        const index = dictionary[name];

        if (index !== undefined) {
          influences[index] = this.currentWeights[name];
        }
      }
    }
  }
}
