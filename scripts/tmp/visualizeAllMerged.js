import fs from 'fs/promises';
import path from 'path';
import { Logger } from '#root/utils/logger.js';
import { visualizeMergedLayout } from '#root/utils/layoutProcessor.js';

async function findJsonFiles(dir) {
  const allFiles = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      allFiles.push(...await findJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      allFiles.push(fullPath);
    }
  }
  return allFiles;
}

async function main() {
  Logger.section('Running Full Merged Result Visualization');

  const mergedJsonDir = 'workspace/20250819_01/merged_results';
  const ocrImageDir = 'workspace/20250819_01/image_420';
  const outputDir = 'workspace/20250819_01/visualized_merged';

  try {
    const jsonFiles = await findJsonFiles(mergedJsonDir);
    Logger.info(`Found ${jsonFiles.length} merged JSON files to visualize.`);

    for (const jsonPath of jsonFiles) {
      const relativePath = path.relative(mergedJsonDir, jsonPath);
      const imageName = `${path.basename(relativePath, '.json')}.png`;
      const imagePath = path.join(ocrImageDir, path.dirname(relativePath), imageName);
      const outputPath = path.join(outputDir, relativePath.replace('.json', '.png'));

      Logger.info(`Visualizing ${relativePath}...`);

      if (!(await fs.access(imagePath).then(() => true).catch(() => false))) {
        Logger.warn(`Source image not found: ${imagePath}, skipping.`);
        continue;
      }

      const mergedData = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
      const visualizedBuffer = await visualizeMergedLayout(imagePath, mergedData);

      if (visualizedBuffer) {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, visualizedBuffer);
      } else {
        Logger.warn(`Visualization failed for ${relativePath}.`);
      }
    }
    Logger.notice('All visualizations completed!');
    Logger.info(`Results are saved in: ${outputDir}`);

  } catch (error) {
    Logger.error(`An error occurred: ${error.message}`);
    Logger.debug(error.stack);
  } finally {
    Logger.endSection('Finished Visualization Process');
    Logger.close();
  }
}

main();
