import { Logger } from "#operation/utils/logger.js";
import { writeFile } from "#operation/utils/file.js";
import path from "path";
import axios from "axios";
import fs from "fs/promises";

/**
 * @typedef {Object} MockTestFile
 * @property {"문제" | "해설지" | "정답표"} fileCategory - 모의고사 파일 종류
 * @property {"국어" | "수학" | "영어" | "한국사" | "사회" | "과학" | "직업" | "제2외/한문"} section - 과목
 * @property {string} downloadUrl - 다운로드 URL
 */

const commonHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/53.36",
};

/**
 * @param {string} irecord
 * @param {object} options
 * @param {string} [options.cookie]
 * @returns {Promise<MockTestFile[]>}
 */
async function getMockTestFiles(irecord, options = {}) {
  const { cookie } = options;
  const ajaxUrl = `https://www.ebsi.co.kr/ebs/xip/xipt/RetrieveSCVMainTop.ajax?irecord=${irecord}`;
  const referer = `https://www.ebsi.co.kr/ebs/xipa/retrieveSCVMainInfo.ebs?irecord=${irecord}`;

  Logger.info(`AJAX 요청으로 파일 목록 가져오는 중... URL: ${ajaxUrl}`);

  const headers = {
    ...commonHeaders,
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    Referer: referer,
    Origin: "https://www.ebsi.co.kr",
  };
  if (cookie) {
    headers["Cookie"] = cookie;
  }

  try {
    const response = await axios.post(ajaxUrl, "", { headers });
    const html = response.data;

    const tbodyRegex = /<tbody>([\s\S]*?)<\/tbody>/;
    const tbodyMatch = html.match(tbodyRegex);
    if (!tbodyMatch) {
      Logger.warn("파일 목록 테이블(tbody)을 찾을 수 없습니다.");
      return [];
    }

    const rows = tbodyMatch[1].split("</tr>").filter((row) => row.trim());
    let downloadTasks = [];

    for (const row of rows) {
      const categoryMatch = row.match(/<td>(.*?)<\/td>/);
      const fileCategory = categoryMatch ? categoryMatch[1].trim() : null;
      if (!fileCategory) continue;

      const linkRegex = /onclick=\"[^']+'([^']+)'[^>]+>([^<]+)<\/a>/g;
      let linkMatch;
      while ((linkMatch = linkRegex.exec(row)) !== null) {
        const downloadUrl = linkMatch[1];

        /** @type {"국어" | "수학" | "영어" | "한국사" | "사회" | "과학" | "직업" | "제2외/한문"} */
        // @ts-ignore
        const section = linkMatch[2].trim();

        downloadTasks.push({ fileCategory, section, downloadUrl });
      }
    }

    return downloadTasks;
  } catch (error) {
    Logger.error("AJAX 요청 또는 파일 처리 중 오류가 발생했습니다.", error);
    return [];
  }
}

/**
 * 주어진 irecord에 해당하는 모든 모의고사 관련 파일을 다운로드합니다.
 * @param {string} irecord - 모의고사 코드
 * @param {string} outputDir - 파일 저장 경로
 * @param {object} [options] - 추가 옵션
 * @param {string} [options.cookie] - 로그인 세션 쿠키
 * @param {MockTestFile["section"][]} [options.targetSections] - 다운로드할 과목(section) 목록. 지정하지 않으면 모두 다운로드합니다.
 * @param {MockTestFile["fileCategory"][]} [options.targetFileTypes] - 다운로드할 파일 종류. 지정하지 않으면 모두 다운로드합니다.
 * @returns {Promise<string[]>} 새로 다운로드한 파일 경로 목록
 */
export async function downloadMockTestFiles(irecord, outputDir, options = {}) {
  let downloadTasks = await getMockTestFiles(irecord, options);
  const { targetSections, targetFileTypes } = options;

  // targetSections이 제공되면 해당 과목만 필터링합니다.
  if (targetSections && targetSections.length > 0) {
    downloadTasks = downloadTasks.filter(({ section }) =>
      targetSections.includes(section)
    );
  }

  // targetFileTypes가 제공되면 해당 파일 종류만 필터링합니다.
  if (targetFileTypes && targetFileTypes.length > 0) {
    downloadTasks = downloadTasks.filter(({ fileCategory }) =>
      targetFileTypes.includes(fileCategory)
    );
    Logger.info(
      `[FILTER] 대상 파일 종류만 필터링합니다: ${targetFileTypes.join(", ")}`
    );
  }

  try {
    const newlyDownloadedFilePaths = [];
    const downloadPromises = downloadTasks.map(
      async ({ fileCategory, section, downloadUrl }) => {
        const safeSubject = section.replace(/\//g, "_");
        const extension = path.extname(new URL(downloadUrl).pathname);
        const fileName = `${fileCategory}_${safeSubject}${extension}`;
        const outputPath = path.join(outputDir, fileName);

        try {
          await fs.access(outputPath);
          Logger.info(
            `파일이 이미 다운로드 폴더에 있어 건너뜁니다: ${fileName}`
          );
        } catch (error) {
          // File doesn't exist, so download it
          Logger.info(`'${fileName}' 파일 다운로드 시작...`);
          try {
            const fileResponse = await axios.get(downloadUrl, {
              responseType: "arraybuffer",
              headers: commonHeaders,
            });
            const buffer = fileResponse.data;
            await writeFile(outputPath, buffer);
            Logger.notice(`'${fileName}' 저장 완료: ${outputPath}`);
            newlyDownloadedFilePaths.push(outputPath); // Add path to list
          } catch (downloadError) {
            Logger.error(
              `'${fileCategory}_${section}' 파일 처리 중 오류 발생`,
              downloadError
            );
          }
        }
      }
    );

    await Promise.all(downloadPromises);
    return newlyDownloadedFilePaths;
  } catch (error) {
    Logger.error("AJAX 요청 또는 파일 처리 중 오류가 발생했습니다.", error);
    return []; // Return empty array on error
  }
}
