import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSET_PATHS } from '../src/config/assetPaths.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_FILE = path.join(ROOT, 'src/config/assetMetrics.json');

const EVALUATED_MODELS = {
  shapeKeys: ASSET_PATHS.models.shapeKeyCharacter01,
  poseFrames: ASSET_PATHS.models.poseFrameCharacter01,
};

export async function generateAssetMetrics() {
  const metrics = {};

  for (const [mode, urlPath] of Object.entries(EVALUATED_MODELS)) {
    const filePath = path.join(ROOT, 'public', urlPath);
    const data = await readFile(filePath);

    metrics[mode] = {
      file: path.basename(filePath),
      path: urlPath,
      bytes: data.byteLength,
      sha256: createHash('sha256').update(data).digest('hex'),
    };
  }

  const json = `${JSON.stringify(metrics, null, 2)}\n`;
  const previous = await readFile(OUTPUT_FILE, 'utf8').catch(() => null);

  // Writing an unchanged file would trigger a needless dev-server reload.
  if (previous !== json) {
    await writeFile(OUTPUT_FILE, json);
  }

  return metrics;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const metrics = await generateAssetMetrics();

  for (const [mode, asset] of Object.entries(metrics)) {
    console.log(`${mode}: ${asset.file} ${asset.bytes} bytes (sha256 ${asset.sha256.slice(0, 12)}…)`);
  }

  console.log(`Written to ${path.relative(ROOT, OUTPUT_FILE)}`);
}
