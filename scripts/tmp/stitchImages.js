import sharp from 'sharp';
import path from 'path';
import { Logger } from '#root/utils/logger.js';

async function stitchImagesHorizontally() {
  const imagePaths = [
    '/Users/jgj/Documents/toy/contentsOperation/workspace/20250819_02/C02_final_analysis/korB_mun_92KUL83H/visualized/page.13.png',
    '/Users/jgj/Documents/toy/contentsOperation/workspace/20250819_02/C02_final_analysis/전달현상(7급)/visualized/page.3.png',
    '/Users/jgj/Documents/toy/contentsOperation/workspace/20250819_02/C02_final_analysis/mathB_1_mun_9623W768_1/visualized/page.12.png',
    '/Users/jgj/Documents/toy/contentsOperation/workspace/20250819_02/C02_final_analysis/69-심화-문제/visualized/page.4.png'
  ];
  const outputPath = 'workspace/stitched_image_final_analysis.png';

  Logger.section('Stitching images horizontally');
  Logger.info(`Output will be saved to: ${outputPath}`);

  try {
    const imagesMetadata = await Promise.all(
      imagePaths.map(p => sharp(p).metadata())
    );

    const totalWidth = imagesMetadata.reduce((sum, meta) => sum + meta.width, 0);
    const maxHeight = Math.max(...imagesMetadata.map(meta => meta.height));

    Logger.info(`Calculated dimensions: ${totalWidth}x${maxHeight}`);

    const compositeOptions = [];
    let currentLeft = 0;
    for (let i = 0; i < imagePaths.length; i++) {
      compositeOptions.push({
        input: imagePaths[i],
        left: currentLeft,
        top: 0
      });
      currentLeft += imagesMetadata[i].width;
    }

    await sharp({
      create: {
        width: totalWidth,
        height: maxHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
    .composite(compositeOptions)
    .toFile(outputPath);

    Logger.notice('Successfully stitched images!');

  } catch (error) {
    Logger.error('Failed to stitch images.');
    Logger.error(error.message);
    Logger.debug(error.stack);
  } finally {
    Logger.endSection('Finished stitching process');
    Logger.close();
  }
}

stitchImagesHorizontally();