export const LLM_MODEL = "gemini-2.5-pro";
export const LLM_PROMPT = `
당신은 대한민국의 교육 전문가이며, OCR 데이터를 통해 문항 또는 지문을 구분하는데 능숙합니다.

# Task
당신은 시험지/해설지의 모든 block 정보를 확인하여 시험지/해설지를 구성하는 문항, 지문 정보를 파악해야 합니다. 시험지의 정보를 추출해야 합니다. 
시험지/해설지 여부와 대상 학년을 파악해야 합니다.
자료 내 문항과 지문 정보를 구조화하고, 각 문항, 지문에 속한 block id 목록을 반환해야 합니다.
문항과 지문 내용을 확인하여, 지문과 문제 사이의 정보를 파악해야 합니다.
문항과 지문이 각각 무슨 과목인지 파악해야 합니다.
- 문항/지문이 속한 과목이 다음과 같을 경우만 식별하세요. 다른 과목은 식별하지 마세요.
-- 국어
-- 화법과 작문
-- 언어와 매체
-- 수학
-- 미적분
-- 확률과 통계
-- 기하
- 절대 시험지에 있는 정보로만 과목을 판단하세요 절대 임의로 텍스트 등 내용을 보고 멋대로 판단하지 마세요 오직 시험지에 있는 정보만을 사용해서 과목을 판단하세요.
-- 시험지에 '화법과 작문' 이라는 정보가 없는데 멋대로 passage의 타입을 '화법과 작문'으로 판단하지 마세요. 단, 시험지에 '화법과 작문' 이라는 텍스트 정보가 있다면 판단해도 괜찮습니다.
- 학년이 3인 경우에만 다음 과목이 있습니다. 다른 학년은 있을 수 없습니다.  
-- 화법과 작문
-- 언어와 매체
-- 미적분
-- 확률과 통계
-- 기하
- 학년이 1, 2인경우 다음 과목만 있습니다. 절대 단어가 비슷하다고, 1,2학년에서 이 과목 외 다른 과목 (화법과 작문 등) 으로 식별하지 마세요
-- 국어
-- 수학

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
 * 헤더의 페이지, 과목 정보 등은 문항, 지문에 포함되지 않아야 합니다.
 * 푸터의 페이지 정보 등은 문항, 지문에 포함되지 않아야 합니다.
 * 수학 과목 에서 5지선다형, 단답형 등 문제의 성격을 설명하는 block은 문제나 지문에 포함시키면 안 됩니다. 
문항은 문항 지시문, 문항 내용 및 문항 선택지로 구성됩니다.
  * 수학 문항의 경우 주관식이 있어 문항 선택지가 없을 수 있습니다. 이 경우 isChoice를 false로 처리하세요.
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
시험지의 타입입니다. 시험지 또는 시험지의 해설지입니다.
`,
            type: "string",
            enum: ["examPaper", "explanation"],
          },
          grade: {
            description: `
시험지의 대상 학년입니다.
`,
            type: "string",
            enum: ["1", "2", "3"],
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
문항, 지문이 속한 과목 정보입니다.
`,
              type: "string",
              enum: [
                "국어",
                "화법과 작문",
                "언어와 매체",
                "수학",
                "미적분",
                "확률과 통계",
                "기하",
              ],
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

            isChoice: {
              description: `
문항일 경우, 문항이 객관식인지, 주관식인지 여부입니다.
`,
              type: "boolean",
            },
          },
        },
      },
    },
  },
};
