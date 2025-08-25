import fs from 'fs/promises';
import path from 'path';
import { visualizeMergedLayout } from '#root/utils/layoutProcessor.js';
import { Logger } from '#root/utils/logger.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

async function processDirectory(mergedJsonDir, imageDir, outputDir) {
  try {
    const entries = await fs.readdir(mergedJsonDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullMergedPath = path.join(mergedJsonDir, entry.name);
      const fullImagePath = path.join(imageDir, entry.name);
      const fullOutputPath = path.join(outputDir, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(fullOutputPath, { recursive: true });
        await processDirectory(fullMergedPath, fullImagePath, fullOutputPath);
      } else if (entry.name.endsWith('.json')) {
        const imageName = entry.name.replace('.json', '.png');
        const imagePath = path.join(imageDir, imageName);
        const outputPath = path.join(outputDir, entry.name.replace('.json', '.jpg'));

        try {
          const mergedData = JSON.parse(await fs.readFile(fullMergedPath, 'utf-8'));
          // visualizeMergedLayout can take a path or a buffer
          const visualizedBuffer = await visualizeMergedLayout(imagePath, mergedData);
          if (visualizedBuffer) {
            await fs.writeFile(outputPath, visualizedBuffer);
            Logger.info(`Visualized ${entry.name} and saved to ${outputPath}`);
          }
        } catch (err) {
          Logger.warn(`Could not process ${entry.name}: ${err.message}`);
        }
      }
    }
  } catch (error) {
    Logger.error(`Error processing directory ${mergedJsonDir}: ${error.message}`);
  }
}

async function main() {
  const [mergedJsonRoot, imageRoot, outputRoot] = process.argv.slice(2);

  if (!mergedJsonRoot || !imageRoot || !outputRoot) {
    Logger.error('Usage: node <script> <mergedJsonDir> <imageDir> <outputDir>');
    return;
  }

  Logger.section(`Starting Merged Layout Visualization`);
  Logger.info(`Input (JSON): ${mergedJsonRoot}`);
  Logger.info(`Input (Image): ${imageRoot}`);
  Logger.info(`Output: ${outputRoot}`);

  await fs.mkdir(outputRoot, { recursive: true });
  await processDirectory(mergedJsonRoot, imageRoot, outputRoot);

  Logger.section('Visualization complete.');
  Logger.close();
}

main();
