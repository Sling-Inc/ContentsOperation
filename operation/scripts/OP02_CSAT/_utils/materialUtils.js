import { SECTIONS } from "./sectionCode.js";

/**
 * @typedef MaterialInfo
 * @type {{
 *  year?: number;
 *  month?: number;
 *  grade: number;
 *  section: {code: string, name: string, shortName?: string},
 *  subject: {code: string, name: string, shortName?: string}
 * }}
 */
export function getTitle(/** @type {MaterialInfo} */ info) {
  if (!info) return;

  let prefix = "";

  // 고3 수능 (11월)
  if (info.grade === 3 && [11].includes(info.month)) {
    prefix = `${info.year + 1}학년도 대학수학능력평가시험`;
  }
  // 고3 6월, 9월
  else if (info.grade === 3 && [6, 9].includes(info.month)) {
    prefix = `${info.year + 1}학년도 대학수학능력평가시험 ${
      info.month
    }월 모의평가`;
  }
  // 기타
  else {
    prefix = `${info.year}학년도 ${info.month}월 고${info.grade} 전국연합학력평가`;
  }

  if (["common", "korea_history"].includes(info.subject.code))
    return `${prefix} ${info.section.name}`.normalize("NFC");

  if (["korean", "math", "career"].includes(info.section.code))
    return `${prefix} ${info.section.name}(${info.subject.name})`.normalize(
      "NFC"
    );

  return `${prefix} ${info.subject.name}`.normalize("NFC");
}

export function getShortTitle(/** @type {MaterialInfo} */ info) {
  if (!info) return;

  let prefix = "";

  // 고3 수능 (11월)
  if (info.grade === 3 && [11].includes(info.month)) {
    prefix = `${((info.year + 1) % 100).toString().padStart(2, "0")}년 수능`;
  }
  // 고3 6월, 9월
  else if (info.grade === 3 && [6, 9].includes(info.month)) {
    prefix = `${((info.year + 1) % 100).toString().padStart(2, "0")}년 ${
      info.month
    }월 고3`;
  }
  // 기타
  else {
    prefix = `${(info.year % 100).toString().padStart(2, "0")}년 ${
      info.month
    }월 고${info.grade}`;
  }

  if (["common", "korea_history"].includes(info.subject.code))
    return `${prefix} ${info.section.shortName || info.section.name}`.normalize(
      "NFC"
    );

  if (["korean", "math", "career"].includes(info.section.code))
    return `${prefix} ${info.section.shortName || info.section.name}(${
      info.subject.shortName || info.subject.name
    })`.normalize("NFC");

  return `${prefix} ${info.subject.shortName || info.subject.name}`.normalize(
    "NFC"
  );
}

/**
 */
export function getMaterialInfo(
  year,
  month,
  grade,
  supervisor,
  section,
  subject
) {
  year = Number(year);
  month = Number(month);
  grade = Number(grade);

  const sectionInfo = SECTIONS[section];
  const subjectInfo = sectionInfo.subjects[subject];

  const title = getTitle({
    year,
    month,
    grade,
    section: sectionInfo,
    subject: subjectInfo,
  });

  const shortTitle = getShortTitle({
    year,
    month,
    grade,
    section: sectionInfo,
    subject: subjectInfo,
  });

  return {
    title,
    shortTitle,

    type: "examPaper",
    subType: "previous",

    metadata: {
      executionYear: year,
      executionMonth: month,
      highSchoolYear: grade,
      supervisor: supervisor === "교육청" ? "OoE" : "KICE",

      section: {
        code: sectionInfo.code,
        name: section,
      },
      subject: {
        code: subjectInfo.code,
        name: subjectInfo.name,
      },
    },
  };
}
