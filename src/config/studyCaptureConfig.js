// blinded: the mapping of version letter to technique is defined only here
export const STUDY_VERSIONS = {
  A: 'shapeKeys',
  B: 'poseFrames',
};

export const STUDY_VIDEO_CONFIG = {
  sampleId: 'sample01',
  width: 1920,
  height: 1080,
  fps: 60,
  videoBitsPerSecond: 12_000_000,
  settleMs: 1000,
  // keep recording briefly after 'ended' so the last audio gets flushed
  tailMs: 250,
  fileName: (version) => `study_version_${version}.webm`,
};
