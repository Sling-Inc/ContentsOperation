import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { readDirectories, readJSONFile } from "#root/operation/utils/file.js";
import { Logger } from "#operation/utils/logger.js";

/**
 * PDF에 메타데이터를 추가하여 새로 생성하는 스크립트
 */
export async function F040_createPdfWithMetadata(TARGET_DIR, OUTPUT_DIR) {
  Logger.section("F040_createPdfWithMetadata 실행");

  const schoolPaths = await readDirectories(TARGET_DIR, { fullPath: true });

  for (const schoolPath of schoolPaths) {
    const school = path.basename(schoolPath).normalize("NFC");
    const schoolOutputDir = path.join(OUTPUT_DIR, school);

    Logger.section(`[${school}] PDF 생성 작업 시작...`);
    await fs.mkdir(schoolOutputDir, { recursive: true });

    const pdfMetadata = await readJSONFile(
      path.join(schoolPath, "__pdfMetadata.json")
    );

    if (!Array.isArray(pdfMetadata) || pdfMetadata.length === 0) {
      Logger.endSection();
      Logger.error(
        `[${school}] __pdfMetadata.json 파일이 없거나 비어있습니다.`
      );
      continue;
    }

    // 1. 모든 페이지 정보를 { [groupKey]: [{ pdfFilePath, pageNumber }] } 형태로 그룹화
    const pageGroups = {};
    for (const metadata of pdfMetadata) {
      const pdfFilePath = path.join(schoolPath, metadata.filePath);
      for (const page of metadata.result.pages) {
        const term = page.term >= 2 ? 2 : 1;

        // subject가 배열이므로 각 subject에 대해 그룹키를 생성하고 페이지 정보를 추가
        for (const subject of page.subject) {
          const groupKey = `${page.year}-${page.grade}-${term}-${subject}-${page.pageType}`;

          if (!pageGroups[groupKey]) {
            pageGroups[groupKey] = [];
          }
          pageGroups[groupKey].push({
            pdfFilePath,
            pageNumber: page.pageNumber,
          });
        }
      }
    }

    // 2. 그룹별로 PDF 문서 생성 준비
    const newPdfDocs = {};
    for (const groupKey in pageGroups) {
      newPdfDocs[groupKey] = await PDFDocument.create();
    }

    // 3. 원본 PDF를 한 번만 열고 페이지 복사
    const sourcePdfs = {}; // 열었던 PDF 문서를 캐싱
    for (const groupKey in pageGroups) {
      const pages = pageGroups[groupKey];
      Logger.log(`  - 처리 중: ${groupKey}.pdf (${pages.length} 페이지)`);

      for (const pageInfo of pages) {
        try {
          // 해당 원본 PDF가 열려있지 않으면 새로 열어서 캐시에 저장
          if (!sourcePdfs[pageInfo.pdfFilePath]) {
            const pdfBytes = await fs.readFile(pageInfo.pdfFilePath);
            sourcePdfs[pageInfo.pdfFilePath] = await PDFDocument.load(pdfBytes);
          }
          const srcDoc = sourcePdfs[pageInfo.pdfFilePath];
          const destDoc = newPdfDocs[groupKey];

          const [copiedPage] = await destDoc.copyPages(srcDoc, [
            pageInfo.pageNumber - 1,
          ]);
          destDoc.addPage(copiedPage);
        } catch (error) {
          Logger.error(
            `  - 오류: ${pageInfo.pdfFilePath} 파일의 ${pageInfo.pageNumber} 페이지를 읽는 중 오류 발생`
          );
          Logger.error(error);
        }
      }
    }

    // 4. 생성된 PDF 파일 저장
    for (const groupKey in newPdfDocs) {
      const pdfDoc = newPdfDocs[groupKey];
      const outputFileName = `${groupKey}.pdf`;
      const newPdfBytes = await pdfDoc.save();
      await fs.writeFile(
        path.join(schoolOutputDir, outputFileName),
        newPdfBytes
      );
      Logger.log(`  - 저장 완료: ${outputFileName}`);
    }

    Logger.endSection();
  }
  Logger.endSection();
}
