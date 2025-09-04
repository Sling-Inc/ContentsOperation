import { STANDARD, STANDARD_SECTION } from './standardName.js';

/**
 * 과목명을 표준화하고 대분류를 반환하는 함수
 * @param {string} subjectName - 원본 과목명
 * @returns {object} { standardName, category }
 */
export function standardizeSubject(subjectName) {
  if (!subjectName) return { standardName: null, category: null };
  
  const normalizedName = subjectName.trim();
  
  // 정확한 매칭 먼저 시도
  if (STANDARD[normalizedName]) {
    return {
      standardName: normalizedName,
      category: STANDARD[normalizedName].section
    };
  }
  
  // 동의어 매칭 시도
  for (const [standardName, config] of Object.entries(STANDARD)) {
    if (config.synonym && config.synonym.includes(normalizedName)) {
      return {
        standardName: standardName,
        category: config.section
      };
    }
  }
  
  // 부분 매칭 시도 (예: "수학1" -> "수학")
  for (const [standardName, config] of Object.entries(STANDARD)) {
    if (normalizedName.includes(standardName) || standardName.includes(normalizedName)) {
      return {
        standardName: standardName,
        category: config.section
      };
    }
  }
  
  // 카테고리별 추론
  const category = inferCategoryFromName(normalizedName);
  
  return {
    standardName: normalizedName, // 원본 유지
    category: category
  };
}

/**
 * 과목명으로부터 카테고리를 추론하는 함수
 * @param {string} subjectName - 과목명
 * @returns {string} 카테고리
 */
function inferCategoryFromName(subjectName) {
  const name = subjectName.toLowerCase();
  
  // 국어 영역
  if (name.includes('국어') || name.includes('문학') || name.includes('독서') || 
      name.includes('화법') || name.includes('작문') || name.includes('언어') || 
      name.includes('매체') || name.includes('고전')) {
    return STANDARD_SECTION.국어;
  }
  
  // 수학 영역
  if (name.includes('수학') || name.includes('미적분') || name.includes('확률') || 
      name.includes('통계') || name.includes('기하') || name.includes('대수')) {
    return STANDARD_SECTION.수학;
  }
  
  // 영어 영역
  if (name.includes('영어') || name.includes('영미') || name.includes('회화') || 
      name.includes('독해') || name.includes('작문')) {
    return STANDARD_SECTION.영어;
  }
  
  // 사회탐구 영역
  if (name.includes('사회') || name.includes('문화') || name.includes('정치') || 
      name.includes('법') || name.includes('경제') || name.includes('지리') || 
      name.includes('역사') || name.includes('세계사') || name.includes('한국사') ||
      name.includes('윤리') || name.includes('생활과윤리')) {
    return STANDARD_SECTION.사회탐구;
  }
  
  // 과학탐구 영역
  if (name.includes('과학') || name.includes('물리') || name.includes('화학') || 
      name.includes('생명') || name.includes('지구') || name.includes('통합과학')) {
    return STANDARD_SECTION.과학탐구;
  }
  
  // 제2외국어 영역
  if (name.includes('일본어') || name.includes('중국어') || name.includes('독일어') || 
      name.includes('프랑스어') || name.includes('스페인어') || name.includes('러시아어') ||
      name.includes('아랍어') || name.includes('베트남어') || name.includes('한문')) {
    return STANDARD_SECTION.제2외국어;
  }
  
  return STANDARD_SECTION.기타;
}

/**
 * 학년별 과목 필터링 함수
 * @param {string} subjectName - 과목명
 * @param {number} grade - 학년
 * @returns {boolean} 해당 학년에 적합한 과목인지 여부
 */
export function isSubjectValidForGrade(subjectName, grade) {
  const name = subjectName.toLowerCase();
  
  // 학년별 과목 제한
  if (grade === 1) {
    // 1학년 과목: 수학1, 영어1, 국어1 등
    if (name.includes('수학2') || name.includes('수학ii') || 
        name.includes('미적분') || name.includes('확률과통계') || name.includes('기하')) {
      return false;
    }
  } else if (grade === 2) {
    // 2학년 과목: 수학2, 영어2 등
    if (name.includes('수학1') || name.includes('수학i')) {
      return false;
    }
  }
  
  return true;
}

/**
 * 시험지 메타데이터에서 과목 추론
 * @param {object} metadata - 시험지 메타데이터
 * @param {string} examName - 시험지 이름
 * @returns {string} 추론된 과목
 */
export function inferSubjectFromMetadata(metadata, examName) {
  // 시험지 이름에서 과목 추론
  const name = examName.toLowerCase();
  
  // 과목명이 명시된 경우
  for (const [standardName, config] of Object.entries(STANDARD)) {
    if (name.includes(standardName.toLowerCase())) {
      return standardName;
    }
  }
  
  // 동의어로 검색
  for (const [standardName, config] of Object.entries(STANDARD)) {
    if (config.synonym) {
      for (const synonym of config.synonym) {
        if (name.includes(synonym.toLowerCase())) {
          return standardName;
        }
      }
    }
  }
  
  return null;
} 