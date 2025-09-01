export const SECTION = {
  국어: "국어",
  수학: "수학",
  영어: "영어",
  한국사: "한국사",
  사회탐구: "사회탐구",
  과학탐구: "과학탐구",
  직업탐구: "직업탐구",
  제2외국어: "제2외국어",
};

export const SUBJECT = {
  국어: {
    공통: "공통",
    언어와매체: "언어와 매체",
    화법과작문: "화법과 작문",
  },
  수학: {
    공통: "공통",
    미적분: "미적분",
    기하: "기하",
    확률과통계: "확률과 통계",
  },
  영어: {
    공통: "공통",
  },
  한국사: {
    한국사: "한국사",
  },
  사회탐구: {
    공통: "공통",
    생활과윤리: "생활과 윤리",
    윤리와사상: "윤리와 사상",
    한국지리: "한국지리",
    세계지리: "세계지리",
    동아시아사: "동아시아사",
    세계사: "세계사",
    경제: "경제",
    정치와법: "정치와 법",
    사회문화: "사회·문화",
  },
  과학탐구: {
    공통: "공통",
    물리학Ⅰ: "물리학Ⅰ",
    화학Ⅰ: "화학Ⅰ",
    생명과학Ⅰ: "생명과학Ⅰ",
    지구과학Ⅰ: "지구과학Ⅰ",
    물리학ⅠⅠ: "물리학ⅠⅠ",
    화학ⅠⅠ: "화학ⅠⅠ",
    생명과학ⅠⅠ: "생명과학ⅠⅠ",
    지구과학ⅠⅠ: "지구과학ⅠⅠ",
  },
  직업탐구: {
    공업일반: "공업 일반",
    농업기초: "농업 기초 기술",
    상업경제: "상업 경제",
    직업생활: "성공적인 직업 생활",
    해운산업: "수산·해운 산업 기초",
    인간발달: "인간 발달",
  },
  제2외국어: {
    독일어: "독일어",
    프랑스어: "프랑스어",
    스페인어: "스페인어",
    중국어: "중국어",
    일본어: "일본어",
    러시아어: "러시아어",
    베트남어: "베트남어",
    아랍어: "아랍어",
    한문: "한문",
  },
};

/**
 * @type {Record<string, {
 *  code: string,
 *  name: string,
 *  shortName?: string,
 *  subjects: Record<string, {
 *    code: string,
 *    name: string,
 *    shortName?: string,
 *  }>}
 * >}
 */
export const SECTIONS = {
  [SECTION.국어]: {
    code: "korean",
    name: "국어",
    subjects: {
      [SUBJECT.국어.공통]: { code: "common", name: "공통" },
      [SUBJECT.국어.언어와매체]: {
        code: "chn",
        name: "언어와 매체",
        shortName: "언매",
      },
      [SUBJECT.국어.화법과작문]: {
        code: "wrt",
        name: "화법과 작문",
        shortName: "화작",
      },
    },
  },
  [SECTION.수학]: {
    code: "math",
    name: "수학",
    subjects: {
      [SUBJECT.수학.공통]: { code: "common", name: "공통" },
      [SUBJECT.수학.미적분]: {
        code: "diff",
        name: "미적분",
        shortName: "미적",
      },
      [SUBJECT.수학.기하]: { code: "geo", name: "기하" },
      [SUBJECT.수학.확률과통계]: {
        code: "prob",
        name: "확률과 통계",
        shortName: "확통",
      },
    },
  },
  [SECTION.영어]: {
    code: "english",
    name: "영어",
    subjects: {
      [SUBJECT.영어.공통]: { code: "common", name: "공통" },
    },
  },
  [SECTION.한국사]: {
    code: "korea_history",
    name: "한국사",
    subjects: {
      [SUBJECT.한국사.한국사]: { code: "korea_history", name: "한국사" },
    },
  },
  [SECTION.사회탐구]: {
    code: "society",
    name: "통합사회",
    shortName: "사회탐구",
    subjects: {
      [SUBJECT.사회탐구.공통]: { code: "common", name: "공통" },
      [SUBJECT.사회탐구.생활과윤리]: {
        code: "life_ethics",
        name: "생활과 윤리",
        shortName: "생활과윤리",
      },
      [SUBJECT.사회탐구.윤리와사상]: {
        code: "ethics_ideology",
        name: "윤리와 사상",
        shortName: "윤리와사상",
      },
      [SUBJECT.사회탐구.한국지리]: {
        code: "korea_geography",
        name: "한국지리",
      },
      [SUBJECT.사회탐구.세계지리]: {
        code: "world_geography",
        name: "세계지리",
      },
      [SUBJECT.사회탐구.동아시아사]: {
        code: "eastasia_history",
        name: "동아시아사",
      },
      [SUBJECT.사회탐구.세계사]: { code: "world_history", name: "세계사" },
      [SUBJECT.사회탐구.경제]: { code: "economics", name: "경제" },
      [SUBJECT.사회탐구.정치와법]: {
        code: "politics_law",
        name: "정치와 법",
        shortName: "정치와법",
      },
      [SUBJECT.사회탐구.사회문화]: {
        code: "society_culture",
        name: "사회·문화",
        shortName: "사회문화",
      },
    },
  },
  [SECTION.과학탐구]: {
    code: "science",
    name: "통합과학",
    shortName: "과학탐구",
    subjects: {
      [SUBJECT.과학탐구.공통]: { code: "common", name: "공통" },
      [SUBJECT.과학탐구.물리학Ⅰ]: { code: "physics1", name: "물리학Ⅰ" },
      [SUBJECT.과학탐구.화학Ⅰ]: { code: "chemistry1", name: "화학Ⅰ" },
      [SUBJECT.과학탐구.생명과학Ⅰ]: { code: "biology1", name: "생명과학Ⅰ" },
      [SUBJECT.과학탐구.지구과학Ⅰ]: { code: "earth1", name: "지구과학Ⅰ" },
      [SUBJECT.과학탐구.물리학ⅠⅠ]: { code: "physics2", name: "물리학ⅠⅠ" },
      [SUBJECT.과학탐구.화학ⅠⅠ]: { code: "chemistry2", name: "화학ⅠⅠ" },
      [SUBJECT.과학탐구.생명과학ⅠⅠ]: {
        code: "biology2",
        name: "생명과학ⅠⅠ",
      },
      [SUBJECT.과학탐구.지구과학ⅠⅠ]: { code: "earth2", name: "지구과학ⅠⅠ" },
    },
  },
  [SECTION.직업탐구]: {
    code: "career",
    name: "직업탐구",
    subjects: {
      [SUBJECT.직업탐구.공업일반]: {
        code: "manufacturing",
        name: "공업 일반",
        shortName: "공업일반",
      },
      [SUBJECT.직업탐구.농업기초]: {
        code: "agriculture_tech",
        name: "농업 기초 기술",
        shortName: "농업기초",
      },
      [SUBJECT.직업탐구.상업경제]: {
        code: "commerce",
        name: "상업 경제",
        shortName: "상업경제",
      },
      [SUBJECT.직업탐구.인간발달]: {
        code: "human_development",
        name: "인간 발달",
        shortName: "인간발달",
      },
      [SUBJECT.직업탐구.직업생활]: {
        code: "successful_career",
        name: "성공적인 직업 생활",
        shortName: "직업생활",
      },
      [SUBJECT.직업탐구.해운산업]: {
        code: "marine_transport",
        name: "수산·해운 산업 기초",
        shortName: "해운산업",
      },
    },
  },
  [SECTION.제2외국어]: {
    code: "foreign",
    name: "제2외국어",
    subjects: {
      [SUBJECT.제2외국어.독일어]: { code: "german", name: "독일어" },
      [SUBJECT.제2외국어.프랑스어]: { code: "french", name: "프랑스어" },
      [SUBJECT.제2외국어.스페인어]: { code: "spanish", name: "스페인어" },
      [SUBJECT.제2외국어.중국어]: { code: "chinese", name: "중국어" },
      [SUBJECT.제2외국어.일본어]: { code: "japanese", name: "일본어" },
      [SUBJECT.제2외국어.러시아어]: { code: "russian", name: "러시아어" },
      [SUBJECT.제2외국어.베트남어]: { code: "vietnamese", name: "베트남어" },
      [SUBJECT.제2외국어.아랍어]: { code: "arabic", name: "아랍어" },
      [SUBJECT.제2외국어.한문]: { code: "chinese_character", name: "한문" },
    },
  },
};
