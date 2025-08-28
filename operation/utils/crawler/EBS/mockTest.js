import { Logger } from "#operation/utils/logger.js";
import { writeFile } from "#operation/utils/file.js";
import path from "path";
import axios from "axios";

const commonHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/53.36",
};

/**
 * 학년 정보를 바탕으로 EBSi 모의고사 메인 페이지 URL을 찾습니다.
 * @param {number} grade - 학년 (1, 2, 3)
 * @returns {Promise<string|null>} 모의고사 페이지 URL 또는 null
 */
export async function findMockTestMainPageUrl(grade) {
  if (![1, 2, 3].includes(grade)) {
    Logger.error("학년은 1, 2, 3 중 하나여야 합니다.");
    return null;
  }

  const gradeMap = {
    1: "high1",
    2: "high2",
    3: "high3",
  };
  const gradeVal = gradeMap[grade];
  const url = `https://www.ebsi.co.kr/ebs/pot/poti/main.ebs?cookieGradeVal=${gradeVal}`;

  Logger.info(`${grade}학년 메인 페이지에 접근 중... URL: ${url}`);

  try {
    const response = await axios.get(url, { headers: commonHeaders });
    const html = response.data;

    const regex = /<a href="([^"]+)">모의고사<\/a>/;
    const match = html.match(regex);

    if (match && match[1]) {
      const foundPath = match[1].replace(/&amp;/g, "&");
      const fullUrl = `https://www.ebsi.co.kr${foundPath}`;
      Logger.notice(`모의고사 페이지 URL을 찾았습니다: ${fullUrl}`);
      return fullUrl;
    } else {
      Logger.warn("모의고사 링크를 찾을 수 없습니다.");
      return null;
    }
  } catch (error) {
    Logger.error("페이지를 가져오는 중 오류가 발생했습니다.", error);
    return null;
  }
}

/**
 * 특정 학년과 연도의 irecord 목록을 추출합니다.
 * @param {number} grade - 학년 (1, 2, 3)
 * @param {number} year - 연도 (예: 2025)
 * @returns {Promise<object|null>} { year: { target: [irecords...] } } 형식의 객체 또는 null
 */
export async function getMockTestIRecords(grade, year) {
  const mockTestUrl = await findMockTestMainPageUrl(grade);
  if (!mockTestUrl) {
    return null;
  }

  Logger.info(
    `${year}년 ${grade}학년 irecord 정보를 가져옵니다... URL: ${mockTestUrl}`
  );

  try {
    const response = await axios.get(mockTestUrl, { headers: commonHeaders });
    const html = response.data;

    const targetMap = {
      1: "D100",
      2: "D200",
      3: "D300",
    };
    const target = targetMap[grade];

    const regex = new RegExp(
      `if\(target == '${target}'\) {([\s\S]*?)}`,
      "g"
    );

    const scriptContentMatch = html.match(regex);
    if (!scriptContentMatch) {
      Logger.warn(
        `${year}년 ${target}에 해당하는 스크립트 블록을 찾을 수 없습니다.`
      );
      return null;
    }

    const optionsRegex = /options \+= '<option value="(\d+)">[^<]+<\/option>';/g;
    let irecords = [];
    let match;
    while ((match = optionsRegex.exec(scriptContentMatch[0])) !== null) {
      irecords.push(match[1]);
    }

    if (irecords.length > 0) {
      const result = {
        [year]: {
          [target]: irecords,
        },
      };
      Logger.notice("irecord 정보를 성공적으로 추출했습니다.");
      Logger.log(JSON.stringify(result, null, 2));
      return result;
    }
  } catch (error) {
    Logger.error("페이지 처리 중 오류가 발생했습니다.", error);
    return null;
  }
}

/**
 * 주어진 irecord에 해당하는 모든 모의고사 관련 파일을 다운로드합니다.
 * @param {string} irecord - 모의고사 코드
 * @param {string} outputDir - 파일 저장 경로
 * @param {string} [cookie] - 로그인 세션 쿠키
 */
export async function downloadMockTestFiles(irecord, outputDir, cookie) {
  const ajaxUrl = `https://www.ebsi.co.kr/ebs/xip/xipt/RetrieveSCVMainTop.ajax?irecord=${irecord}`;
  const referer = `https://www.ebsi.co.kr/ebs/xip/xipa/retrieveSCVMainInfo.ebs?irecord=${irecord}`;

  Logger.info(`AJAX 요청으로 파일 목록 가져오는 중... URL: ${ajaxUrl}`);

  const headers = {
    ...commonHeaders,
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    Referer: referer,
    Origin: "https://www.ebsi.co.kr",
  };
  if (cookie) {
    headers.Cookie = cookie;
  }

  try {
    const response = await axios.post(ajaxUrl, "", { headers });
    const html = response.data;

    const tbodyRegex = /<tbody>([\s\S]*?)<\/tbody>/;
    const tbodyMatch = html.match(tbodyRegex);
    if (!tbodyMatch) {
      Logger.warn("파일 목록 테이블(tbody)을 찾을 수 없습니다.");
      return;
    }

    const rows = tbodyMatch[1].split("</tr>").filter((row) => row.trim());
    const downloadTasks = [];

    for (const row of rows) {
      const categoryMatch = row.match(/<td>(.*?)<\/td>/);
      const category = categoryMatch ? categoryMatch[1].trim() : null;
      if (!category) continue;

      const linkRegex = /onclick="[^']+'([^']+)'[^>]+>([^<]+)<\/a>/g;
      let linkMatch;
      while ((linkMatch = linkRegex.exec(row)) !== null) {
        const downloadUrl = linkMatch[1];
        const subject = linkMatch[2].trim();
        downloadTasks.push({ category, subject, downloadUrl });
      }
    }

    const downloadPromises = downloadTasks.map(
      async ({ category, subject, downloadUrl }) => {
        const safeSubject = subject.replace(/\//g, "_");
        Logger.info(`'${category}_${safeSubject}' 파일 다운로드 시작...`);
        Logger.log(`URL: ${downloadUrl}`);

        try {
          const fileResponse = await axios.get(downloadUrl, {
            responseType: "arraybuffer",
            headers: commonHeaders,
          });
          const buffer = fileResponse.data;
          const extension = path.extname(new URL(downloadUrl).pathname);
          const fileName = `${category}_${safeSubject}${extension}`;
          const outputPath = path.join(outputDir, fileName);

          await writeFile(outputPath, buffer);
          Logger.notice(`'${fileName}' 저장 완료: ${outputPath}`);
        } catch (downloadError) {
          Logger.error(
            `'${category}_${subject}' 파일 처리 중 오류 발생`,
            downloadError
          );
        }
      }
    );

    await Promise.all(downloadPromises);
  } catch (error) {
    Logger.error("AJAX 요청 또는 파일 처리 중 오류가 발생했습니다.", error);
    return null;
  }
}
