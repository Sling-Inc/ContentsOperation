import { Logger } from "#operation/utils/logger.js";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs/promises";
import path from "path";
import { URL } from "url";

export async function downloadMockTestFiles(url, downloadDir) {
  Logger.section(`KICE 자료 다운로드를 시작합니다. URL: ${url}`);

  if (!url || !downloadDir) {
    Logger.error("URL과 다운로드 디렉토리가 모두 필요합니다.");
    Logger.endSection();
    return [];
  }

  try {
    await fs.mkdir(downloadDir, { recursive: true });

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const headerMap = {};
    let headerColIdx = 0;
    $("thead > tr > th").each((i, th) => {
      const text = $(th).text().trim();
      const colspan = Number($(th).attr("colspan")) || 1;
      for (let j = 0; j < colspan; j++) {
        headerMap[headerColIdx + j] = text;
      }
      headerColIdx += colspan;
    });

    const getFileTypeFromColIndex = (index) => {
      const headerText = headerMap[index];
      if (!headerText) return "파일";
      if (headerText.includes("문제")) return "문제";
      if (headerText.includes("정답")) return "정답";
      if (headerText.includes("듣기")) return "듣기평가";
      if (headerText.includes("음성대본")) return "음성대본";
      return "파일";
    };

    const downloadTasks = [];
    const grid = [];

    $("tbody > tr").each((rowIndex, tr) => {
      grid[rowIndex] = grid[rowIndex] || [];
      let colIndex = 0;
      $(tr)
        .children("td")
        .each((tdIndex, td) => {
          while (grid[rowIndex][colIndex]) {
            colIndex++;
          }

          const $td = $(td);
          const rowspan = Number($td.attr("rowspan")) || 1;
          const colspan = Number($td.attr("colspan")) || 1;

          for (let r = 0; r < rowspan; r++) {
            grid[rowIndex + r] = grid[rowIndex + r] || [];
            for (let c = 0; c < colspan; c++) {
              grid[rowIndex + r][colIndex + c] = $td;
            }
          }
          colIndex += colspan;
        });
    });

    grid.forEach((row) => {
      const cat1 = row[1]?.text().trim().replace(/\/.*/, "") || "";
      const cat2 = row[2]?.text().trim().replace(/Ⅰ|Ⅱ/g, "") || "";

      row.forEach(($td, colIndex) => {
        if (!$td) return;
        const $fileDiv = $td.find("div.file");
        if ($fileDiv.length > 0) {
          const originalFilename = $fileDiv.attr("value");
          if (!originalFilename) return;

          const fileType = getFileTypeFromColIndex(colIndex);
          const extension = path.extname(originalFilename).substring(1);

          const newFilename =
            cat1 === cat2
              ? `${fileType}_${cat1}.${extension}`
              : `${fileType}_${cat1}_${cat2}.${extension}`;

          const downloadUrl = new URL(originalFilename, url).toString();
          const destPath = path.join(downloadDir, newFilename);

          if (!downloadTasks.some((task) => task.destPath === destPath)) {
            downloadTasks.push({
              downloadUrl,
              destPath,
              newFilename,
            });
          }
        }
      });
    });

    const existingFiles = new Set(await fs.readdir(downloadDir).catch(() => []));
    const tasksToRun = downloadTasks.filter(
      (task) => !existingFiles.has(task.newFilename)
    );

    if (tasksToRun.length === 0) {
      Logger.log("다운로드할 새 파일이 없습니다. 모든 파일이 이미 존재합니다.");
      return [];
    }

    Logger.log(`${tasksToRun.length}개의 파일을 다운로드합니다.`);

    const downloadPromises = tasksToRun.map(async (task) => {
      try {
        const fileResponse = await axios.get(task.downloadUrl, {
          responseType: "arraybuffer",
        });
        await fs.writeFile(task.destPath, fileResponse.data);
        Logger.log(`다운로드 완료: ${task.newFilename}`);
        return task.destPath;
      } catch (error) {
        Logger.error(`'${task.newFilename}' 다운로드 실패: ${error.message}`);
        return null;
      }
    });

    const results = await Promise.all(downloadPromises);
    const downloadedFilePaths = results.filter(Boolean);

    Logger.log(`총 ${downloadedFilePaths.length}개의 파일을 성공적으로 다운로드했습니다.`);
    Logger.endSection();
    return downloadedFilePaths;
  } catch (error) {
    Logger.error(`다운로드 중 오류 발생: ${error.message}`);
    Logger.endSection();
    return [];
  }
}
