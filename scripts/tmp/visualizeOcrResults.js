import fs from 'fs/promises';
import path from 'path';
import { visualizeOcrResults } from '#root/utils/cloudVision.js';
import { Logger } from '#root/utils/logger.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

async function processDirectory(ocrJsonDir, imageDir, outputDir) {
  try {
    const entries = await fs.readdir(ocrJsonDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullOcrPath = path.join(ocrJsonDir, entry.name);
      const fullImagePath = path.join(imageDir, entry.name);
      const fullOutputPath = path.join(outputDir, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(fullOutputPath, { recursive: true });
        await processDirectory(fullOcrPath, fullImagePath, fullOutputPath);
      } else if (entry.name.endsWith('.json')) {
        const imageName = entry.name.replace('.json', '.png');
        const imagePath = path.join(imageDir, imageName);
        const outputPath = path.join(outputDir, entry.name.replace('.json', '.jpg'));

        try {
          const ocrData = JSON.parse(await fs.readFile(fullOcrPath, 'utf-8'));
          const imageBuffer = await fs.readFile(imagePath);
          const visualizedBuffer = await visualizeOcrResults(imageBuffer, ocrData);
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
    Logger.error(`Error processing directory ${ocrJsonDir}: ${error.message}`);
  }
}

async function main() {
  const [ocrJsonRoot, imageRoot, outputRoot] = process.argv.slice(2);

  if (!ocrJsonRoot || !imageRoot || !outputRoot) {
    Logger.error('Usage: node <script> <ocrJsonDir> <imageDir> <outputDir>');
    return;
  }

  Logger.section(`Starting OCR Visualization`);
  Logger.info(`Input (JSON): ${ocrJsonRoot}`);
  Logger.info(`Input (Image): ${imageRoot}`);
  Logger.info(`Output: ${outputRoot}`);

  await fs.mkdir(outputRoot, { recursive: true });
  await processDirectory(ocrJsonRoot, imageRoot, outputRoot);

  Logger.section('Visualization complete.');
  Logger.close();
}

main();
