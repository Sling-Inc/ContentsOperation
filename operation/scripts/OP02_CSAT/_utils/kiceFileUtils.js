import { SECTIONS } from "./sectionCode.js";

const FILE_TYPE_MAP = {
  문제: "problem",
  정답: "answer",
  듣기평가: "audio",
  파일: "explanation",
};

function getKiceSectionAndSubject(fileName) {
  const parts = fileName.split("_");
  if (parts.length < 2) return null;

  const sectionName = parts[1];
  const subjectName = parts.length > 2 ? parts[2].split(".")[0] : sectionName;

  const sectionInfo = SECTIONS[sectionName];
  if (!sectionInfo) return null;

  const subjectInfo = sectionInfo.subjects[subjectName];
  if (!subjectInfo) return null;

  return {
    section: sectionName,
    subject: subjectName,
  };
}

export function getInfoFromKiceMockTestFile(year, month, grade, fileName) {
  const typeStr = fileName.split("_")[0];
  const type = FILE_TYPE_MAP[typeStr];

  if (!type) {
    return null;
  }

  const nameInfo = getKiceSectionAndSubject(fileName);

  if (!nameInfo) {
    return null;
  }

  return {
    type,
    supervisor: { name: "KICE" },
    ...nameInfo,
  };
}
