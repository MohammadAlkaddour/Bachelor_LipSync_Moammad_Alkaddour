import { RHUBARB_POSE_MAP } from '../config/rhubarbPoseMap.js';

const VALID_RHUBARB_VALUES = new Set(Object.keys(RHUBARB_POSE_MAP));
const MAX_LISTED_ERRORS = 5;

// Throws on unusable data; non-fatal issues are returned as warnings
export function validateRhubarbData(data, source) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    throw new Error(`Invalid Rhubarb JSON (${source}): not a JSON object`);
  }

  const rawDuration = data.metadata?.duration;
  const duration = Number(rawDuration);

  if (!Number.isFinite(duration) || duration <= 0) {
    errors.push(`metadata.duration is invalid (${JSON.stringify(rawDuration)})`);
  }

  if (!Array.isArray(data.mouthCues)) {
    errors.push('"mouthCues" is missing');
  } else if (data.mouthCues.length === 0) {
    errors.push('"mouthCues" is empty');
  }

  const mouthCues = [];

  for (const [index, cue] of (Array.isArray(data.mouthCues) ? data.mouthCues : []).entries()) {
    const start = Number(cue?.start);
    const end = Number(cue?.end);
    const value = cue?.value;

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      errors.push(`cue ${index}: start/end are not numbers (${cue?.start}, ${cue?.end})`);
      continue;
    }

    if (end <= start) {
      errors.push(`cue ${index}: end ${end} is not after start ${start}`);
    }

    if (!VALID_RHUBARB_VALUES.has(value)) {
      errors.push(`cue ${index}: unknown Rhubarb value ${JSON.stringify(value)}`);
    }

    const previous = mouthCues[mouthCues.length - 1];

    if (previous && start < previous.end - 1e-6) {
      warnings.push(`cue ${index} starts before the previous cue ends`);
    }

    mouthCues.push({ start, end, value });
  }

  if (errors.length > 0) {
    const listed = errors.slice(0, MAX_LISTED_ERRORS).map((e) => `- ${e}`);

    if (errors.length > MAX_LISTED_ERRORS) {
      listed.push(`- … ${errors.length - MAX_LISTED_ERRORS} more`);
    }

    throw new Error(`Invalid Rhubarb JSON (${source}):\n${listed.join('\n')}`);
  }

  const lastEnd = mouthCues[mouthCues.length - 1].end;

  if (Math.abs(lastEnd - duration) > 0.05) {
    warnings.push(
      `last cue ends at ${lastEnd.toFixed(2)} s but metadata.duration is ${duration.toFixed(2)} s`
    );
  }

  const usedValues = [...new Set(mouthCues.map((cue) => cue.value))].sort();

  return { duration, mouthCues, usedValues, warnings };
}
