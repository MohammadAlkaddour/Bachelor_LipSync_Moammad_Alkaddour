// Counts the model as rendered, i.e. after load-time corrections
export function describeModel(root, clips = []) {
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;
  let morphTargets = 0;
  const bones = new Set();
  const materials = new Set();
  const textures = new Set();

  root.traverse((object) => {
    if (!object.isMesh) return;

    const geometry = object.geometry;
    const position = geometry.attributes.position;

    meshes++;
    vertices += position.count;
    triangles += (geometry.index ? geometry.index.count : position.count) / 3;
    morphTargets += geometry.morphAttributes.position?.length ?? 0;
    object.skeleton?.bones.forEach((bone) => bones.add(bone));

    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);

      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });

  return {
    meshes,
    vertices,
    triangles,
    morphTargets,
    bones: bones.size,
    materials: materials.size,
    textures: textures.size,
    animationClips: clips.length,
    animationTracks: clips.reduce((sum, clip) => sum + clip.tracks.length, 0),
  };
}
