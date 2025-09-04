export const LLM_MODEL = "gemini-2.5-pro";
export const LLM_PROMPT = `
당신은 대한민국의 교육 전문가이며, 고등학교 내신 시험지의 OCR 데이터를 통해 문항 또는 지문을 구분하는데 능숙합니다.

# Task
당신은 고등학교 내신 시험지의 모든 block 정보를 확인하여 시험지를 구성하는 문항, 지문 정보를 파악해야 합니다. 
시험지의 정보를 추출해야 합니다.
시험지 여부와 대상 학년을 파악해야 합니다.
자료 내 문항과 지문 정보를 구조화하고, 각 문항, 지문에 속한 block id 목록을 반환해야 합니다.
문항과 지문 내용을 확인하여, 지문과 문제 사이의 정보를 파악해야 합니다.
문항과 지문이 각각 무슨 과목인지 파악해야 합니다.

# 과목 처리 규칙
고등학교 내신 시험지는 다음과 같은 과목들이 출제됩니다:

## 주요 과목 분류
1. **국어 영역**: 국어, 화법과 작문, 언어와 매체, 문학, 독서, 고전 읽기 등
2. **수학 영역**: 수학, 수학1, 수학2, 미적분, 확률과 통계, 기하, 심화 수학 등
3. **영어 영역**: 영어, 영어 회화, 영어 독해와 작문, 실용 영어, 심화 영어 등
4. **사회탐구 영역**: 한국사, 사회문화, 정치와 법, 경제, 세계지리, 한국지리, 세계사 등
5. **과학탐구 영역**: 통합과학, 물리학1/2, 화학1/2, 생명과학1/2, 지구과학1/2 등
6. **제2외국어 영역**: 일본어, 중국어, 독일어, 프랑스어, 스페인어, 러시아어 등
7. **기타 영역**: 기술가정, 정보, 체육, 음악, 미술, 진로와 직업 등

## 과목 판단 기준
- 시험지에 명시된 과목명을 우선적으로 사용하세요
- 과목명이 명확하지 않은 경우, 문제 내용과 지문을 통해 과목을 추론하세요
- 심화 과목과 기본 과목을 구분하세요

# 입력
당신에게 시험지를 구성하는 각종 블럭의 정보 Array가 주어집니다.
각 블럭의 정보는 다음과 같습니다.
  id: block의 고유 id입니다. number 형태입니다.
  page: block이 속한 페이지 번호입니다. number 형태입니다.
  position: block의 위치 정보, [x, y, width, height] 형태입니다.
  text: block의 텍스트 정보입니다. 만약 block이 단순한 그림일 경우, 빈 문자열이 주어질 수 있습니다.

# 주의사항
한 block은 오직 하나의 문항 또는 지문에만 속할 수 있습니다.
시험지 내 문항, 지문 정보가 여러 문단, 여러 페이지에 걸쳐 있을 수 있습니다.
  * 단, 시험지 내 block이 여러 페이지를 넘어서 등장할 수는 없습니다. (지문과 문제 block은 연속적으로 등장할 확률이 매우 높습니다.)
text가 없는 경우는 그림, 수식 등이 있는 경우입니다. 문항 또는 지문에 반드시 포함되어야 합니다.
시험지 block 중 의미 없는 데이터가 있을 수 있습니다. 문항, 지문에 포함되지 않아야 합니다.
문항은 문항 지시문, 문항 내용 및 문항 선택지로 구성됩니다.
  * 수학 문항의 경우 주관식이 있어 문항 선택지가 없을 수 있습니다.
지문은 지문 지시문, 지문 내용으로 구성됩니다.
  * 지문의 지시문 이후, 지문으로 볼 수 있는 내용이 다음에 나와야만 지문으로 판단하세요. 그렇지 않은 경우는 문항으로 판단하세요.
    * ex 1) "[16~17] 다음을 듣고, 물음에 답하시오" 후 별다른 지문 내용 없이 "16. 가장 적절한 것은?" 같은 문항 지시문이 나왔다면, "[16~17] 다음을 듣고, 물음에 답하시오" 는 지문이 아니라 "16. 가장 적절한 것은?" 와 같은 문항으로 판단하세요.
      * 이 예제 상황에서는 "[16~17] 다음을 듣고, 물음에 답하시오" 을 문항으로 판단하세요. 절대 지문이나 둘다 아닌 것으로 판단하면 안 됩니다. 이 때 id는 "16. 가장 적절한 것은?" 와 같은 16입니다.
    * ex 2) "[31~34] 다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오." 이후 "31. You hear again and again that some of the greatest composers were misunderstood in their own day..." 처럼 지문으로 볼 수 없는 내용이 나왔다면 "[31~34] 다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오." 는 "31. You hear again and again that some of the greatest composers were misunderstood in their own day..." 와 함께 문제입니다. 이때 문제의 id는 31입니다.
    * ex 3) "[41~42] 다음 글을 읽고, 물음에 답하시오." 이후 "The speed at which we form language can..." 처럼 지문으로 볼 수 있는 내용이 나왔다면 "[41~42] 다음 글을 읽고, 물음에 답하시오." 는 "The speed at which we form language can..." 와 함께 지문입니다. 이때 지문의 id는 [41~42]입니다.
`;

export const LLM_CONFIG = {
  temperature: 0.0,

  thinkingConfig: {
    thinkingBudget: 500,
  },

  responseMimeType: "application/json",
  responseSchema: {
    type: "object",
    properties: {
      metadata: {
        description: `
시험지의 정보입니다.
`,
        type: "object",
        properties: {
          examType: {
            description: `
시험지의 타입입니다. 고등학교 내신 시험지입니다.
`,
            type: "string",
            enum: ["examPaper"],
          },
          grade: {
            description: `
시험지의 대상 학년입니다.
`,
            type: "string",
            enum: ["1", "2", "3"],
          },
          semester: {
            description: `
시험지의 학기 정보입니다.
`,
            type: "string",
            enum: ["1", "2"],
          },
          examPeriod: {
            description: `
시험지의 시험 기간입니다.
`,
            type: "string",
            enum: ["중간고사", "기말고사", "기타"],
          },
        },
      },
      structure: {
        description: `
시험지를 구성하는 각종 문항, 지문 정보입니다.
`,
        nullable: false,
        type: "array",
        items: {
          description: `
문항 또는 지문의 정보입니다.
`,
          type: "object",
          required: ["type", "id", "ids"],

          properties: {
            type: {
              description: `
문항, 지문 타입입니다.
  * problem: 문항
  * passage: 지문
`,
              type: "string",
              enum: ["problem", "passage"],
            },
            subject: {
              description: `
문항, 지문이 속한 과목 정보입니다. 고등학교 교과 과정에 따른 정확한 과목명을 사용하세요.
`,
              type: "string",
              nullable: true,
            },
            section: {
              description: `
과목의 대분류입니다.
  * 국어: 국어 관련 과목
  * 수학: 수학 관련 과목  
  * 영어: 영어 관련 과목
  * 사회탐구: 사회 관련 과목
  * 과학탐구: 과학 관련 과목
  * 제2외국어: 제2외국어 관련 과목
  * 기타: 기타 과목
`,
              type: "string",
              enum: ["국어", "수학", "영어", "사회탐구", "과학탐구", "제2외국어", "기타"],
              nullable: true,
            },
            id: {
              description: `
문항, 지문 의 고유 id입니다.
  * 문항의 경우, 문항 지시문 앞의 숫자를 사용하세요. "16.가장적절한것은?" 의 id는 16입니다.
  * 지문의 경우, 지문 지시문 앞의 문자를 사용하세요. "[41~42]다음글을읽고,물음에답하시오." 의 id는 [41~42]입니다.
`,
              type: "string",
            },

            ids: {
              description: `
해당 문항, 지문에 속한 block의 id 목록입니다
`,
              type: "array",
              items: {
                type: "number",
              },
            },

            problemIds: {
              description: `
지문일 경우, 이 지문에 속한 문제 id입니다.
`,
              type: "array",
              items: {
                type: "string",
              },
            },

            score: {
              description: `
문항일 경우, 문항의 점수입니다. 따로 표시가 없는 경우 2점입니다.
`,
              type: "number",
            },
          },
        },
      },
    },
  },
};
