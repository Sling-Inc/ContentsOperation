import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { getUnionBbox } from "./getUnionBbox.js";
import { Logger } from "#root/utils/logger.js";

// =================================================================================================
// Internal Helper Functions
// =================================================================================================

function calculateOverlapRatio(candidateBox, llmBox) {
  const [x1A, y1A, x2A, y2A] = candidateBox;
  const [x1B, y1B, x2B, y2B] = llmBox;
  const xA = Math.max(x1A, x1B);
  const yA = Math.max(y1A, y1B);
  const xB = Math.min(x2A, x2B);
  const yB = Math.min(y2A, y2B);
  const intersectionArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const boxAArea = (x2A - x1A) * (y2A - y1A);
  return boxAArea === 0 ? 0 : intersectionArea / boxAArea;
}

function boxesOverlap(boxA, boxB) {
  const [x1A, y1A, x2A, y2A] = boxA;
  const [x1B, y1B, x2B, y2B] = boxB;
  if (x2A < x1B || x2B < x1A) return false;
  if (y2A < y1B || y2B < y1A) return false;
  return true;
}

async function visualizeBboxes(imagePath, items) {
  const image = sharp(imagePath);
  const { width, height } = await image.metadata();
  const colors = {
    question: "rgba(255, 0, 0, 0.5)",
    passage: "rgba(0, 0, 255, 0.5)",
  };
  const svgElements = items
    .map((item) => {
      const [x1, y1, x2, y2] = item.bbox;
      const color = colors[item.type] || "rgba(0, 255, 0, 0.5)";
      return `<rect x="${x1}" y="${y1}" width="${
        x2 - x1
      }" height="${
        y2 - y1
      }" style="fill:${color};stroke:black;stroke-width:2;" /><text x="${
        x1 + 5
      }" y="${
        y1 + 20
      }" font-family="Arial" font-size="16" fill="white">${item.id}</text>`;
    })
    .join("");
  const svgOverlay = `<svg width="${width}" height="${height}">${svgElements}</svg>`;
  return image.composite([{ input: Buffer.from(svgOverlay) }]).png().toBuffer();
}

// =================================================================================================
// Exported Core Logic
// =================================================================================================

/**
 * OpenCV를 사용하여 페이지의 Bbox들을 이미지 내용에 맞게 보정합니다.
 * @param {object} cv - OpenCV.js 인스턴스
 * @param {string} imagePath - 보정할 원본 이미지 경로
 * @param {Array<object>} llmItemsOnPage - 해당 페이지에 대한 LLM 분석 결과 항목 배열
 * @param {number} footerThreshold - Bbox 보정 시 무시할 페이지 하단 영역의 Y 좌표
 * @returns {Promise<object>} 보정된 항목, 디버그 정보, OpenCV Mat 객체들을 포함하는 객체
 */
export async function adjustBboxesForPage(
  cv,
  imagePath,
  llmItemsOnPage,
  footerThreshold
) {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const src = new cv.Mat(info.height, info.width, cv.CV_8UC4);
  src.data.set(data);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  const binary = new cv.Mat();
  cv.threshold(gray, binary, 0, 255, cv.THRESH_OTSU | cv.THRESH_BINARY_INV);

  if (footerThreshold > 0 && footerThreshold < info.height) {
    cv.rectangle(
      binary,
      new cv.Point(0, footerThreshold),
      new cv.Point(info.width, info.height),
      new cv.Scalar(0),
      -1
    );
  }

  const labels = new cv.Mat();
  const stats = new cv.Mat();
  const centroids = new cv.Mat();
  const nLabels = cv.connectedComponentsWithStats(
    binary,
    labels,
    stats,
    centroids,
    8,
    cv.CV_32S
  );

  const reliableComponents = [];
  for (let i = 1; i < nLabels; i++) {
    const w = stats.intPtr(i)[2];
    const h = stats.intPtr(i)[3];
    if (w < info.width / 5 && h < info.height / 5) continue;
    const x = stats.intPtr(i)[0];
    const y = stats.intPtr(i)[1];
    reliableComponents.push([x, y, x + w, y + h]);
  }

  const potentialAdjustments = llmItemsOnPage.map((llmItem) => {
    const overlappingComponents = reliableComponents.filter(
      (compBox) =>
        calculateOverlapRatio(compBox, llmItem.bbox) > 0.7 &&
        calculateOverlapRatio(compBox, llmItem.bbox) < 1
    );
    const potentialBbox =
      overlappingComponents.length > 0
        ? getUnionBbox([llmItem.bbox, ...overlappingComponents])
        : llmItem.bbox;
    return {
      ...llmItem,
      potentialBbox,
      originalBbox: llmItem.bbox,
      overlappingComponents,
    };
  });

  const adjustedLlmItems = [];
  const reliableComponentsForDebug = [];
  for (let i = 0; i < potentialAdjustments.length; i++) {
    const currentItem = potentialAdjustments[i];
    let collision = false;
    if (currentItem.overlappingComponents.length > 0) {
      for (let j = 0; j < potentialAdjustments.length; j++) {
        if (i === j) continue;
        if (
          boxesOverlap(
            currentItem.potentialBbox,
            potentialAdjustments[j].potentialBbox
          )
        ) {
          collision = true;
          break;
        }
      }
    }
    if (!collision && currentItem.overlappingComponents.length > 0) {
      adjustedLlmItems.push({ ...currentItem, bbox: currentItem.potentialBbox });
      reliableComponentsForDebug.push(...currentItem.overlappingComponents);
    } else {
      adjustedLlmItems.push({
        ...currentItem,
        bbox: currentItem.originalBbox,
      });
    }
  }

  const cvMats = { src, gray, binary, labels, stats, centroids };
  return { adjustedLlmItems, reliableComponentsForDebug, cvMats };
}

/**
 * Bbox 보정 전/후 비교 및 중간 결과물을 이미지 파일로 저장합니다.
 * @param {object} cv - OpenCV.js 인스턴스
 * @param {object} cvMats - adjustBboxesForPage에서 생성된 OpenCV Mat 객체들
 * @param {string} outputDir - 최상위 출력 디렉토리
 * @param {string} examName - 시험지 이름
 * @param {number} pageNum - 페이지 번호
 * @param {string} imagePath - 원본 이미지 경로
 * @param {Array<object>} llmItemsOnPage - 보정 전 LLM 항목 배열
 * @param {Array<object>} adjustedLlmItems - 보정 후 LLM 항목 배열
 * @param {Array<Array<number>>} reliableComponentsForDebug - 보정에 사용된 신뢰 영역 배열
 */
export async function saveDebugImages(
  cv,
  cvMats,
  outputDir,
  examName,
  pageNum,
  imagePath,
  llmItemsOnPage,
  adjustedLlmItems,
  reliableComponentsForDebug
) {
  const debugOutputDir = path.join(outputDir, examName, "debug");
  await fs.mkdir(debugOutputDir, { recursive: true });

  const beforeImageBuffer = await visualizeBboxes(imagePath, llmItemsOnPage);
  const beforeImagePath = path.join(
    debugOutputDir,
    `page.${pageNum}_before.png`
  );
  await fs.writeFile(beforeImagePath, beforeImageBuffer);
  Logger.debug(`Saved 'before' visualization to ${beforeImagePath}`);

  const afterImageBuffer = await visualizeBboxes(imagePath, adjustedLlmItems);
  const afterImagePath = path.join(debugOutputDir, `page.${pageNum}_after.png`);
  await fs.writeFile(afterImagePath, afterImageBuffer);
  Logger.debug(`Saved 'after' visualization to ${afterImagePath}`);

  const reliableCompImage = new cv.Mat(
    cvMats.binary.rows,
    cvMats.binary.cols,
    cv.CV_8UC1,
    new cv.Scalar(0)
  );
  for (const box of reliableComponentsForDebug) {
    cv.rectangle(
      reliableCompImage,
      new cv.Point(box[0], box[1]),
      new cv.Point(box[2], box[3]),
      new cv.Scalar(255),
      2
    );
  }
  const reliableCompPath = path.join(
    debugOutputDir,
    `page.${pageNum}_reliable_components.png`
  );
  await sharp(Buffer.from(reliableCompImage.data), {
    raw: {
      width: reliableCompImage.cols,
      height: reliableCompImage.rows,
      channels: 1,
    },
  })
    .png()
    .toFile(reliableCompPath);
  Logger.debug(`Saved reliable components to ${reliableCompPath}`);
  reliableCompImage.delete();
}
