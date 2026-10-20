import * as THREE from 'three';

export const POSE_FRAME_IDLE_CLIP = 'anim_lipshape_idle';
export const POSE_FRAME_ATTACK_SPEED = 22;
export const POSE_FRAME_RELEASE_SPEED = 16;

// Blender poses are authored at full strength, so unlisted poses use 1.0.
export const POSE_FRAME_STRENGTH = {};

export class PoseFrameController {
  constructor(root, animations, options = {}) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);

    this.attackSpeed = options.attackSpeed ?? POSE_FRAME_ATTACK_SPEED;
    this.releaseSpeed = options.releaseSpeed ?? POSE_FRAME_RELEASE_SPEED;
    this.poseStrength = {
      ...POSE_FRAME_STRENGTH,
      ...(options.poseStrength || {}),
    };

    this.actions = new Map();
    this.currentWeights = {};
    this.targetWeights = {};

    for (const clip of animations) {
      const action = this.mixer.clipAction(clip);

      // Poses are single-keyframe clips; a paused action still applies its pose by weight.
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      action.paused = true;
      action.time = clip.duration;
      action.setEffectiveWeight(0);

      this.actions.set(clip.name, action);
      this.currentWeights[clip.name] = 0;
      this.targetWeights[clip.name] = 0;
    }

    if (this.actions.has(POSE_FRAME_IDLE_CLIP)) {
      this.currentWeights[POSE_FRAME_IDLE_CLIP] = 1;
      this.targetWeights[POSE_FRAME_IDLE_CLIP] = 1;
    }

    this.applyWeightsToActions();
  }

  getPoseNames() {
    return Array.from(this.actions.keys());
  }

  hasPose(name) {
    return this.actions.has(name);
  }

  getPoseStrength(name) {
    return this.poseStrength[name] ?? 1;
  }

  setPose(name) {
    const clipName = name ?? POSE_FRAME_IDLE_CLIP;

    if (!this.actions.has(clipName)) {
      console.warn(`PoseFrameController: unknown pose "${clipName}"`);
      return false;
    }

    const targets = {};

    if (clipName !== POSE_FRAME_IDLE_CLIP) {
      targets[clipName] = this.getPoseStrength(clipName);
    }

    this.setTargetWeights(targets);
    return true;
  }

  // Idle takes the remaining weight so the rig never falls back to its bind pose.
  setTargetWeights(weights) {
    let speechSum = 0;

    for (const name of this.actions.keys()) {
      this.targetWeights[name] = 0;
    }

    for (const [name, value] of Object.entries(weights)) {
      if (name !== POSE_FRAME_IDLE_CLIP && this.actions.has(name)) {
        this.targetWeights[name] = value;
        speechSum += value;
      }
    }

    if (this.actions.has(POSE_FRAME_IDLE_CLIP)) {
      this.targetWeights[POSE_FRAME_IDLE_CLIP] = Math.max(0, 1 - speechSum);
    }
  }

  resetToNeutral() {
    for (const name of this.actions.keys()) {
      const weight = name === POSE_FRAME_IDLE_CLIP ? 1 : 0;
      this.currentWeights[name] = weight;
      this.targetWeights[name] = weight;
    }

    this.applyWeightsToActions();
  }

  getRankedWeights() {
    return Object.entries(this.currentWeights)
      .map(([name, weight]) => ({ name, weight }))
      .sort((a, b) => b.weight - a.weight);
  }

  update(deltaTime) {
    if (deltaTime > 0) {
      for (const name of this.actions.keys()) {
        const current = this.currentWeights[name];
        const target = this.targetWeights[name];
        const speed = target > current ? this.attackSpeed : this.releaseSpeed;
        const alpha = 1 - Math.exp(-speed * deltaTime);
        this.currentWeights[name] = current + (target - current) * alpha;
      }

      this.applyWeightsToActions();
    }

    this.mixer.update(deltaTime);
  }

  applyWeightsToActions() {
    for (const [name, action] of this.actions) {
      action.setEffectiveWeight(this.currentWeights[name]);
    }
  }
}
