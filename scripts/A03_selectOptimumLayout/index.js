import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { Logger } from '#root/utils/logger.js';

async function findBestJsonForPages(ocrInputDir, layoutImageInputDir) {
  Logger.section('최적 레이아웃 분석 시작');
  const bestResults = {}; // { examName: { pageName: { ... } } }

  const dpiDirs = await fs.readdir(ocrInputDir, { withFileTypes: true });

  for (const dpiDir of dpiDirs) {
    if (!dpiDir.isDirectory()) continue;
    const dpiName = dpiDir.name;
    const ocrDpiPath = path.join(ocrInputDir, dpiName);
    Logger.log(`- ${dpiName} 폴더 스캔 중...`);

    const examDirs = await fs.readdir(ocrDpiPath, { withFileTypes: true });

    for (const examDir of examDirs) {
      if (!examDir.isDirectory()) continue;
      const examName = examDir.name;
      const ocrExamPath = path.join(ocrDpiPath, examName);

      if (!bestResults[examName]) {
        bestResults[examName] = {};
      }

      const pageFiles = await fs.readdir(ocrExamPath);
      const jsonFiles = pageFiles.filter((f) => f.endsWith('.json'));

      for (const jsonFile of jsonFiles) {
        const pageName = path.basename(jsonFile, '.json');
        const jsonPath = path.join(ocrExamPath, jsonFile);

        try {
          const content = await fs.readFile(jsonPath, 'utf-8');
          const data = JSON.parse(content);
          const boxCount = Array.isArray(data) ? data.length : 0;

          const currentBest = bestResults[examName][pageName];
          const newDpi = parseInt(dpiName, 10) || 0;
          const currentDpi = currentBest
            ? parseInt(currentBest.dpi, 10) || 0
            : 0;

          if (
            !currentBest ||
            boxCount > currentBest.count ||
            (boxCount === currentBest.count && newDpi > currentDpi)
          ) {
            const debugImagePath = jsonPath.replace('.json', '.jpg');
            let debugImageExists = false;
            try {
              await fs.access(debugImagePath);
              debugImageExists = true;
            } catch {
              // 디버그 이미지가 존재하지 않아도 오류 아님
            }

            // 원본 레이아웃 이미지 경로 찾기
            const layoutImagePath = path.join(
              layoutImageInputDir,
              dpiName,
              examName,
              `${pageName}.png`
            );
            const imageMetadata = await sharp(layoutImagePath).metadata();

            bestResults[examName][pageName] = {
              count: boxCount,
              dpi: dpiName,
              metadata: {
                width: imageMetadata.width,
                height: imageMetadata.height,
                dpi: dpiName,
              },
              results: data,
              debugImagePath: debugImageExists ? debugImagePath : null,
            };
          }
        } catch (error) {
          Logger.error(`파일 처리 오류 ${jsonPath}:`, error);
        }
      }
    }
  }
  Logger.endSection();
  return bestResults;
}

async function writeBestResults(bestResults, outputDir) {
  Logger.section('최적 결과 저장 시작');
  await fs.mkdir(outputDir, { recursive: true });

  for (const examName in bestResults) {
    const examOutputDir = path.join(outputDir, examName);
    await fs.mkdir(examOutputDir, { recursive: true });
    Logger.log(`- ${examName} 결과 저장 중...`);

    for (const pageName in bestResults[examName]) {
      const result = bestResults[examName][pageName];
      const outputJson = {
        metadata: result.metadata,
        results: result.results,
      };

      const destJsonPath = path.join(examOutputDir, `${pageName}.json`);
      await fs.writeFile(
        destJsonPath,
        JSON.stringify(outputJson, null, 2),
        'utf-8'
      );

      if (result.debugImagePath) {
        const destImagePath = path.join(examOutputDir, `${pageName}.jpg`);
        await fs.copyFile(result.debugImagePath, destImagePath);
      }
      Logger.log(
        `  - ${pageName}: ${result.dpi} 선택 (박스 ${result.count}개, ${result.metadata.width}x${result.metadata.height})`
      );
    }
  }
  Logger.endSection();
}

async function main() {
  const args = process.argv.slice(2);
  const ocrInputDir = args[0];
  const layoutImageInputDir = args[1];
  const outputDir = args[2];

  if (!ocrInputDir || !layoutImageInputDir || !outputDir) {
    Logger.error(
      '사용법: node scripts/A03_selectOptimumLayout <OCR 입력 폴더> <레이아웃 이미지 폴더> <출력 폴더>'
    );
    return;
  }

  try {
    const bestResults = await findBestJsonForPages(
      ocrInputDir,
      layoutImageInputDir
    );
    await writeBestResults(bestResults, outputDir);
    Logger.notice('모든 작업이 성공적으로 완료되었습니다.');
  } catch (error) {
    Logger.error('작업 중 오류 발생:', error);
  } finally {
    Logger.close();
  }
}

main();
