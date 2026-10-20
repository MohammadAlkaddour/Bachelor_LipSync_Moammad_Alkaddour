export function inspectMorphTargets(character) {
  const rows = [];

  character.traverse((object) => {
    if (!object.isMesh) return;

    const influences = object.morphTargetInfluences;
    if (!influences || influences.length === 0) return;

    const dictionary = object.morphTargetDictionary || {};
    const morphTargetNames = Object.keys(dictionary).sort(
      (a, b) => dictionary[a] - dictionary[b]
    );

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    const materialNames = materials
      .map((material) => material?.name || '(unnamed material)')
      .join(', ');

    const vertexCount = object.geometry?.attributes?.position?.count ?? null;

    rows.push({
      meshName: object.name || '(unnamed mesh)',
      materialName: materialNames,
      morphTargetCount: influences.length,
      morphTargetNames: morphTargetNames.join(', '),
      vertexCount,
    });

    console.group(`Morph-target mesh: ${object.name || '(unnamed)'}`);
    console.log('material:', materialNames);
    console.log('morph target count:', influences.length);
    console.log('morph target names:', morphTargetNames);
    console.log('vertex count:', vertexCount);
    console.groupEnd();
  });

  console.log(`Morph-target meshes found: ${rows.length}`);
  console.table(rows);

  return rows;
}
