import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { Logger } from '#root/utils/logger.js';

async function visualizeAllBboxesForExam(llmResultPath, mergedJsonDir, imageDir, outputImagePath) {
  Logger.section(`Visualizing LLM-used bboxes for: ${path.basename(mergedJsonDir)}`);

  // 1. Read llmResult.json and create a set of all used block IDs.
  const llmContent = await fs.readFile(llmResultPath, 'utf-8');
  const llmData = JSON.parse(llmContent);
  const usedBlockIds = new Set(llmData.flatMap(group => group.ids));
  Logger.info(`Found ${usedBlockIds.size} unique block IDs used by the LLM.`);

  // 2. Get image dimensions to create a base canvas.
  const imageFiles = (await fs.readdir(imageDir)).filter(f => f.endsWith('.png'));
  imageFiles.sort((a, b) => {
    const numA = parseInt(a.match(/page\.(\d+)\.png/)[1], 10);
    const numB = parseInt(b.match(/page\.(\d+)\.png/)[1], 10);
    return numA - numB;
  });

  if (imageFiles.length === 0) {
    Logger.error('No images found in the directory.');
    return;
  }
  const metadata = await sharp(path.join(imageDir, imageFiles[0])).metadata();
  const { width: maxWidth, height: maxHeight } = metadata;
  Logger.info(`Creating a base canvas of size ${maxWidth}x${maxHeight}`);

  // 3. Prepare SVG overlay with ONLY the bboxes used by the LLM.
  const svgElements = [];
  let blockIdCounter = 0;
  
  const jsonFiles = (await fs.readdir(mergedJsonDir)).filter(f => f.endsWith('.json'));
  jsonFiles.sort((a, b) => {
    const numA = parseInt(a.match(/page\.(\d+)\.json/)[1], 10);
    const numB = parseInt(b.match(/page\.(\d+)\.json/)[1], 10);
    return numA - numB;
  });
  
  for (const jsonFile of jsonFiles) {
      const pageBlocks = JSON.parse(await fs.readFile(path.join(mergedJsonDir, jsonFile), 'utf-8'));

      for (const block of pageBlocks) {
          if (usedBlockIds.has(blockIdCounter)) {
              const [x1, y1, x2, y2] = block.bbox;
              const width = x2 - x1;
              const height = y2 - y1;
              const isWide = width > maxWidth * 0.5;
              const color = isWide ? 'rgba(255, 165, 0, 0.5)' : 'rgba(0, 128, 0, 0.3)';
              
              svgElements.push(
                  `<rect x="${x1}" y="${y1}" width="${width}" height="${height}" style="fill:${color};" />`
              );
          }
          blockIdCounter++;
      }
  }

  const svgOverlay = `<svg width="${maxWidth}" height="${maxHeight}">${svgElements.join('')}</svg>`;
  
  // 4. Composite SVG over the base image and save.
  await sharp(path.join(imageDir, imageFiles[0]))
    .composite([{ input: Buffer.from(svgOverlay) }])
    .toFile(outputImagePath);

  Logger.notice(`Debug visualization saved to: ${outputImagePath}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error('Usage: node scripts/tmp/visualizeAllBboxes.js <llmResultPath> <mergedJsonDir> <imageDir> <outputImagePath>');
    process.exit(1);
  }
  const [llmResultPath, mergedJsonDir, imageDir, outputImagePath] = args;
  
  await visualizeAllBboxesForExam(llmResultPath, mergedJsonDir, imageDir, outputImagePath);
  Logger.close();
}

main();