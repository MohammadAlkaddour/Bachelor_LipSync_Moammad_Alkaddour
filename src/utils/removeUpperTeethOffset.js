// three.js strips the "." from "c_teeth_top.x"
const UPPER_TEETH_BONE_PREFIX = 'c_teeth_top';
const VALUE_TOLERANCE = 1e-6;

// Only removed when identical in every clip, i.e. a constant offset with no viseme data
export function removeUpperTeethOffset(clips) {
  const trackNames = new Set(
    clips.flatMap((clip) =>
      clip.tracks
        .map((track) => track.name)
        .filter((name) => name.startsWith(UPPER_TEETH_BONE_PREFIX))
    )
  );

  for (const name of trackNames) {
    if (!isConstantAcrossClips(clips, name)) {
      console.warn(
        `Upper-teeth track "${name}" differs between Pose-Frame clips; ` +
          'upper-teeth tracks were kept unchanged.'
      );
      return [];
    }
  }

  for (const clip of clips) {
    clip.tracks = clip.tracks.filter((track) => !trackNames.has(track.name));
  }

  if (trackNames.size > 0) {
    console.log(
      `Removed ${trackNames.size} constant upper-teeth tracks from ${clips.length} Pose-Frame clips:`,
      [...trackNames]
    );
  }

  return [...trackNames];
}

function isConstantAcrossClips(clips, trackName) {
  let reference = null;

  for (const clip of clips) {
    const track = clip.tracks.find((t) => t.name === trackName);

    if (!track) return false;

    const values = track.values;
    const size = track.getValueSize();

    for (let offset = 0; offset < values.length; offset += size) {
      const key = values.slice(offset, offset + size);

      if (!reference) {
        reference = key;
        continue;
      }

      for (let i = 0; i < size; i++) {
        if (Math.abs(key[i] - reference[i]) > VALUE_TOLERANCE) return false;
      }
    }
  }

  return true;
}
