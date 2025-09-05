import path from "path";
import { Logger } from "#operation/utils/logger.js";
import { readDirectories, readJSONFile } from "#root/operation/utils/file.js";

import { STANDARD } from "./standardName.js";

/**
 * 페이지 메타데이터를 검증하는 스크립트
 */
export async function F031_checkPageMetadata(TARGET_DIR) {
  Logger.section("F031_checkPageMetadata 실행");

  const schoolPaths = await readDirectories(TARGET_DIR, { fullPath: true });

  for (const schoolPath of schoolPaths) {
    const school = path.basename(schoolPath).normalize("NFC");

    Logger.section(`[${school}] 페이지 메타데이터 검증...`);
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

    for (const metadata of pdfMetadata) {
      for (const page of metadata.result.pages) {
        // 1. subject 검증
        if (page.subject.length === 0) {
          Logger.warn(
            `[${school}] ${metadata.filePath} [${page.pageNumber}] subject가 존재하지 않습니다.`
          );
          continue;
        } else if (page.subject.length > 1) {
          Logger.warn(
            `[${school}] ${metadata.filePath} [${page.pageNumber}] :${page.subject} subject가 여러 개 존재합니다.`
          );
          continue;
        }

        for (const subject of page.subject) {
          if (subject === "unknown") {
            Logger.warn(
              `[${school}] ${metadata.filePath} [${page.pageNumber}] :${subject} subject가 unknown입니다.`
            );
          } else if (!STANDARD[subject]) {
            Logger.warn(
              `[${school}] ${metadata.filePath} [${page.pageNumber}] :${subject} subject가 존재하지 않습니다.`
            );
          }
        }

        // 2. grade 검증
        const grade = Number(page.grade);
        if (grade < 1 || grade > 3) {
          Logger.warn(
            `[${school}] ${metadata.filePath} [${page.pageNumber}] [${metadata.grade}] grade가  범위를 벗어납니다.`
          );
        }

        // 3. pageType 검증
        if (page.pageType === "unknown") {
          Logger.warn(
            `[${school}] ${metadata.filePath} [${page.pageNumber}] [${page.pageType}] pageType가 unknown입니다. \nreason: ${page.reason}`
          );
        }
      }
    }
    Logger.endSection();
  }

  Logger.endSection();
}
