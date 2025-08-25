import fs from "fs";
import path from "path";
import { fromPath } from "pdf2pic";
import { PDFDocument, PDFPage } from "pdf-lib";

import { Logger } from "#root/utils/logger.js";

/**
 * PDF 페이지 객체로부터 가로/세로 픽셀 길이를 반환합니다.
 * 회전 각도를 고려하여 조정합니다.
 *
 * @param {PDFPage} page - pdf-lib의 PDFPage 객체
 * @param {number} dpi - 변환할 이미지의 DPI
 * @returns {{width: number, height: number}} - 픽셀 단위의 페이지 크기
 */
function getPageSizeInPixels(page, dpi) {
  const { width, height } = page.getSize(); // points
  const rotation = page.getRotation().angle;

  let adjustedWidth = width;
  let adjustedHeight = height;

  // 90도 또는 270도 회전된 경우 width와 height를 바꿈
  if (rotation === 90 || rotation === 270) {
    adjustedWidth = height;
    adjustedHeight = width;
  }

  // points -> pixels (1 inch = 72 points)
  const pxWidth = Math.round((adjustedWidth * dpi) / 72);
  const pxHeight = Math.round((adjustedHeight * dpi) / 72);

  return { width: pxWidth, height: pxHeight };
}

/**
 * PDF의 모든 페이지를 이미지로 변환합니다.
 * 파일을 한 번만 읽어 성능을 개선하고, 에러 처리 및 로깅을 추가합니다.
 *
 * @param {string} pdfFilePath - 변환할 PDF 파일 경로
 * @param {string} outputDir - 이미지를 저장할 디렉토리
 * @param {number} dpi - 변환할 이미지의 DPI
 * @returns {Promise<{page: number, path: string}[] | null>} 변환된 이미지 정보 배열 또는 실패 시 null
 */
export async function convertToImages(pdfFilePath, outputDir, dpi) {
  const pdfFilename = path.basename(pdfFilePath);
  Logger.info(`[START] Converting ${pdfFilename}`);

  try {
    if (!fs.existsSync(pdfFilePath)) {
      throw new Error(`PDF 파일을 찾을 수 없습니다: ${pdfFilePath}`);
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileBuffer = await fs.promises.readFile(pdfFilePath);
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pages = pdfDoc.getPages();
    const pageCount = pages.length;

    const outputPaths = [];

    for (let i = 0; i < pageCount; i++) {
      const page = pages[i];
      const pageNumber = i + 1;

      const { width, height } = getPageSizeInPixels(page, dpi);

      const converter = fromPath(pdfFilePath, {
        density: dpi,
        format: "png",
        width,
        height,
        savePath: outputDir,
        saveFilename: `page`, // base name
      });

      const convertResult = await converter(pageNumber);
      outputPaths.push({ page: pageNumber, path: convertResult.path });
    }

    Logger.info(`[DONE] Successfully converted ${pageCount} pages from ${pdfFilename}`);
    return outputPaths;
  } catch (error) {
    Logger.error(`[FAIL] Error converting ${pdfFilename}: ${error.message}`);
    Logger.debug(error.stack);
    return null;
  }
}
