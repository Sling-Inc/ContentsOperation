import { SECTION, SUBJECT } from "./sectionCode.js";

/**
 *
 * @param {string} year
 * @param {string} month
 * @param {string} grade
 * @returns {{code: string, name: string}}
 */
const getSupervisorFromMockTestFileName = (year, month, grade) => {
  if (grade === "3" && ["06", "09", "11"].includes(month))
    return {
      code: "KICE",
      name: "평가원",
    };
  else
    return {
      code: "OoE",
      name: "교육청",
    };
};

const getSectionFromMockTestFileName = (fileName) => {
  if (fileName.includes("국어") && !fileName.includes("제2"))
    return SECTION.국어;
  else if (fileName.includes("수학")) return SECTION.수학;
  else if (fileName.includes("영어")) return SECTION.영어;
  else if (fileName.includes("한국사")) return SECTION.한국사;
  else if (fileName.includes("사회")) return SECTION.사회탐구;
  else if (fileName.includes("과학")) return SECTION.과학탐구;
  else if (fileName.includes("제2")) return SECTION.제2외국어;
  else if (fileName.includes("직업")) return SECTION.직업탐구;
  else return null;
};

const getSubjectFromMockTestFileName = (section, fileName) => {
  if (section === SECTION.국어) return SUBJECT[SECTION.국어].공통;
  else if (section === SECTION.수학) return SUBJECT[SECTION.수학].공통;
  else if (section === SECTION.영어) return SUBJECT[SECTION.영어].공통;
  else if (section === SECTION.한국사) return SUBJECT[SECTION.한국사].한국사;
  //
  // 사회탐구
  //
  else if (section === SECTION.사회탐구) {
    if (fileName.includes("윤리와사상") || fileName.includes("윤리와 사상"))
      return SUBJECT[SECTION.사회탐구].윤리와사상;
    else if (
      fileName.includes("생활과윤리") ||
      fileName.includes("생활과 윤리")
    )
      return SUBJECT[SECTION.사회탐구].생활과윤리;
    else if (fileName.includes("한국지리"))
      return SUBJECT[SECTION.사회탐구].한국지리;
    else if (fileName.includes("세계지리"))
      return SUBJECT[SECTION.사회탐구].세계지리;
    else if (fileName.includes("동아시아사"))
      return SUBJECT[SECTION.사회탐구].동아시아사;
    else if (fileName.includes("세계사"))
      return SUBJECT[SECTION.사회탐구].세계사;
    else if (fileName.includes("경제")) return SUBJECT[SECTION.사회탐구].경제;
    else if (fileName.includes("정치와법") || fileName.includes("정치와 법"))
      return SUBJECT[SECTION.사회탐구].정치와법;
    else if (
      fileName.includes("사회문화") ||
      fileName.includes("사회·문화") ||
      fileName.includes("사회·문화")
    )
      return SUBJECT[SECTION.사회탐구].사회문화;
    else return SUBJECT[SECTION.사회탐구].공통;
  }
  //
  // 과학탐구
  //
  else if (section === SECTION.과학탐구) {
    if (fileName.includes("물리학Ⅰ") || fileName.includes("물리학1"))
      return SUBJECT[SECTION.과학탐구].물리학Ⅰ;
    else if (fileName.includes("물리학Ⅱ") || fileName.includes("물리학2"))
      return SUBJECT[SECTION.과학탐구].물리학ⅠⅠ;
    else if (fileName.includes("화학Ⅰ") || fileName.includes("화학1"))
      return SUBJECT[SECTION.과학탐구].화학Ⅰ;
    else if (fileName.includes("화학Ⅱ") || fileName.includes("화학2"))
      return SUBJECT[SECTION.과학탐구].화학ⅠⅠ;
    else if (fileName.includes("생명과학Ⅰ") || fileName.includes("생명과학1"))
      return SUBJECT[SECTION.과학탐구].생명과학Ⅰ;
    else if (fileName.includes("생명과학Ⅱ") || fileName.includes("생명과학2"))
      return SUBJECT[SECTION.과학탐구].생명과학ⅠⅠ;
    else if (fileName.includes("지구과학Ⅰ") || fileName.includes("지구과학1"))
      return SUBJECT[SECTION.과학탐구].지구과학Ⅰ;
    else if (fileName.includes("지구과학Ⅱ") || fileName.includes("지구과학2"))
      return SUBJECT[SECTION.과학탐구].지구과학ⅠⅠ;
    else return SUBJECT[SECTION.과학탐구].공통;
  }
  //
  // 직업탐구
  //
  else if (section === SECTION.직업탐구) {
    if (fileName.includes("직업생활"))
      return SUBJECT[SECTION.직업탐구].직업생활;
    else if (fileName.includes("농업"))
      return SUBJECT[SECTION.직업탐구].농업기초;
    else if (fileName.includes("공업"))
      return SUBJECT[SECTION.직업탐구].공업일반;
    else if (fileName.includes("상업"))
      return SUBJECT[SECTION.직업탐구].상업경제;
    else if (fileName.includes("해운"))
      return SUBJECT[SECTION.직업탐구].해운산업;
    else if (fileName.includes("인간"))
      return SUBJECT[SECTION.직업탐구].인간발달;
  }
  //
  // 제2외국어
  //
  else if (section === SECTION.제2외국어) {
    if (fileName.includes("독일".normalize("NFC")))
      return SUBJECT[SECTION.제2외국어].독일어;
    else if (fileName.includes("프랑스".normalize("NFC")))
      return SUBJECT[SECTION.제2외국어].프랑스어;
    else if (fileName.includes("스페인".normalize("NFC")))
      return SUBJECT[SECTION.제2외국어].스페인어;
    else if (fileName.includes("중국".normalize("NFC")))
      return SUBJECT[SECTION.제2외국어].중국어;
    else if (fileName.includes("일본".normalize("NFC")))
      return SUBJECT[SECTION.제2외국어].일본어;
    else if (fileName.includes("러시아".normalize("NFC")))
      return SUBJECT[SECTION.제2외국어].러시아어;
    else if (fileName.includes("베트남".normalize("NFC")))
      return SUBJECT[SECTION.제2외국어].베트남어;
    else if (fileName.includes("아랍".normalize("NFC")))
      return SUBJECT[SECTION.제2외국어].아랍어;
    else if (fileName.includes("한문".normalize("NFC")))
      return SUBJECT[SECTION.제2외국어].한문;
  }
};

export const getInfoFromEbsMockTestFile = (year, month, grade, rawFileName) => {
  const fileName = rawFileName.normalize("NFC").replace("대학수학능력시험", "");

  const type = fileName.startsWith("문제")
    ? "problem"
    : fileName.startsWith("해설")
    ? "explanation"
    : "answer";

  const supervisor = getSupervisorFromMockTestFileName(year, month, grade);
  const section = getSectionFromMockTestFileName(fileName);

  if (section === SECTION.영어 && fileName.includes("대본")) return null;
  if (section === SECTION.영어 && fileName.endsWith("mp3"))
    return {
      type: "audio",
      year,
      month,
      grade,
      supervisor,
      section,
      subject: null,
    };

  let subject;
  if (type !== "answer") {
    subject = getSubjectFromMockTestFileName(section, fileName);
    console.log(fileName, section, subject);
  }

  return {
    type,
    year,
    month,
    grade,
    supervisor,
    section,
    subject,
  };
};
