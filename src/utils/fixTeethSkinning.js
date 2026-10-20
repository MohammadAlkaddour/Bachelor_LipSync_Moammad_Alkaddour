import * as THREE from 'three';

// three.js strips the "." from "c_teeth_top.x"
const UPPER_TEETH_BONE_PREFIX = 'c_teeth_top';
const LOWER_TEETH_BONE_PREFIX = 'c_teeth_bot';

const UPPER = 1;
const LOWER = 2;

// Mixed teeth weights stretch the gums on jaw open, so keep only the dominant bone group
export function fixTeethSkinning(character) {
  character.traverse((object) => {
    if (!object.isSkinnedMesh) return;

    const result = fixMesh(object);

    if (result) {
      console.log(
        `Teeth skinning corrected on "${object.name}": ` +
          `${result.upperVertices} vertices → upper teeth, ` +
          `${result.lowerVertices} vertices → lower teeth, ` +
          `${result.removedTriangles} connecting triangles removed.`
      );
    }
  });
}

function fixMesh(mesh) {
  const { geometry, skeleton } = mesh;
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;

  if (!skinIndex || !skinWeight) return null;

  const boneGroups = skeleton.bones.map((bone) => {
    if (bone.name.startsWith(UPPER_TEETH_BONE_PREFIX)) return UPPER;
    if (bone.name.startsWith(LOWER_TEETH_BONE_PREFIX)) return LOWER;
    return 0;
  });

  const vertexSides = new Uint8Array(skinIndex.count);
  let upperVertices = 0;
  let lowerVertices = 0;

  for (let i = 0; i < skinIndex.count; i++) {
    let upperWeight = 0;
    let lowerWeight = 0;

    for (let k = 0; k < skinIndex.itemSize; k++) {
      const group = boneGroups[skinIndex.getComponent(i, k)];
      const weight = skinWeight.getComponent(i, k);
      if (group === UPPER) upperWeight += weight;
      if (group === LOWER) lowerWeight += weight;
    }

    if (upperWeight === 0 && lowerWeight === 0) continue;

    const side = upperWeight >= lowerWeight ? UPPER : LOWER;
    vertexSides[i] = side;

    if (upperWeight > 0 && lowerWeight > 0) {
      keepOnlyGroup(skinIndex, skinWeight, i, boneGroups, side);
      if (side === UPPER) upperVertices++;
      else lowerVertices++;
    }
  }

  if (upperVertices + lowerVertices === 0) return null;

  skinWeight.needsUpdate = true;

  return {
    upperVertices,
    lowerVertices,
    removedTriangles: removeConnectingTriangles(geometry, vertexSides),
  };
}

function keepOnlyGroup(skinIndex, skinWeight, vertex, boneGroups, side) {
  let total = 0;

  for (let k = 0; k < skinIndex.itemSize; k++) {
    if (boneGroups[skinIndex.getComponent(vertex, k)] === side) {
      total += skinWeight.getComponent(vertex, k);
    }
  }

  for (let k = 0; k < skinIndex.itemSize; k++) {
    const keep = boneGroups[skinIndex.getComponent(vertex, k)] === side;
    skinWeight.setComponent(vertex, k, keep ? skinWeight.getComponent(vertex, k) / total : 0);
  }
}

function removeConnectingTriangles(geometry, vertexSides) {
  const index = geometry.index;

  // Removing triangles would shift multi-material group ranges.
  if (!index || geometry.groups.length > 1) return 0;

  const kept = [];
  let removed = 0;

  for (let t = 0; t < index.count; t += 3) {
    const a = vertexSides[index.getX(t)];
    const b = vertexSides[index.getX(t + 1)];
    const c = vertexSides[index.getX(t + 2)];
    const sides = (a | b | c) & (UPPER | LOWER);

    if (sides === (UPPER | LOWER)) {
      removed++;
      continue;
    }

    kept.push(index.getX(t), index.getX(t + 1), index.getX(t + 2));
  }

  if (removed > 0) {
    geometry.setIndex(kept);
  }

  return removed;
}
