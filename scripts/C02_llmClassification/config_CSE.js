export const LLM_MODEL = "gemini-2.5-pro";
export const LLM_PROMPT = `
당신은 대한민국의 교육 전문가이며, OCR 데이터를 통해 문항 또는 지문을 구분하는데 능숙합니다.

# Task
당신은 공무원 시험지/해설지의 모든 block 정보를 확인하여 시험지/해설지를 구성하는 문항, 지문 정보를 파악해야 합니다.
또한, 이 시험지의 기본적인 정보를 추출해야 합니다.
- 시험지의 과목 및 책형, 채용 유형을 파악해야 합니다. 
-- 대한민국 공무원 시험에는 책형 (ex. 가책형, 나책형, 다책형 등) 정보가 있을 수 있습니다. 
--- 이 정보는 시험지 여러 페이지의 헤더에 나타납니다.
--- ocr 결과에 오타가 있을 수 있습니다. (ex. ⑦ 책형 -> 가책형, ④ 책형 -> 나책형)
-- 대한민국 공무원 시험에는 기본 외에 **지역인재** 시험과 **보훈청** 시험이 있습니다.
--- 해당 단어가 시험지 헤더에 있는 경우, 해당 단어를 채용 유형으로 판단하세요. 없는 경우 기본 시험으로 판단하여 해당 값을 null로 처리하세요.
- 문항과 지문 내용을 확인하여, 지문과 문제 사이의 정보를 파악해야 합니다.
- 문항의 객관식 선택지 개수를 파악해야 합니다.
시험지 내 문항과 지문 정보를 구조화하고, 각 문항, 지문에 속한 block id 목록을 반환해야 합니다.

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
text가 없는 경우는 그림, 수식 등이 있는 경우입니다. 문항 또는 지문에 반드시 포함되어야 합니다.
시험지 block 중 의미 없는 데이터가 있을 수 있습니다. 문항, 지문에 포함되지 않아야 합니다.
문항은 문항 지시문, 문항 내용 및 문항 선택지로 구성됩니다.
- 수학 문항의 경우 주관식이 있어 문항 선택지가 없을 수 있습니다.
지문은 같은 문제 block 사이에 나타나지 않습니다. 만약 지문처럼 보이는 내용이 같은 문제 block 사이에 나타나면 같은 문항으로 판단하세요.
- ex 1) "12. 다음 사례에 대한 설명으로 가장 적절하지 않은" 라는 문제 다음에 "재력가인 삼촌 A를 강도살인 하기로 공모하고 A의 집 앞으로 갔다. 이 멀리 떨어져 망을 보는..." 같은 지문으로도 볼 수 있는 block이 나왔더라도, 그다음 "① Z이 B에 대한 진술조서를 증거로 함에 동의 하지 않자,..." 같은 "12. 다음 사례에 대한 설명으로 가장 적절하지 않은" 와 같은 id로 볼 수 있는 문제 block 가 나왔다면 이 block은 같은 문항으로 판단하세요.
지문은 지문 지시문, 지문 내용으로 구성됩니다.
- 지문의 지시문 이후, 지문으로 볼 수 있는 내용이 다음에 나와야만 지문으로 판단하세요. 그렇지 않은 경우는 문항으로 판단하세요.
-- ex 1) "[16~17] 다음을 듣고, 물음에 답하시오" 후 별다른 지문 내용 없이 "16. 가장 적절한 것은?" 같은 문항 지시문이 나왔다면, "[16~17] 다음을 듣고, 물음에 답하시오" 는 지문이 아니라 "16. 가장 적절한 것은?" 와 같은 문항으로 판단하세요.
--- 이 예제 상황에서는 "[16~17] 다음을 듣고, 물음에 답하시오" 을 문항으로 판단하세요. 절대 지문이나 둘다 아닌 것으로 판단하면 안 됩니다. 이 때 id는 "16. 가장 적절한 것은?" 와 같은 16입니다.
-- ex 2) "[1~5] 밑줄 친 부분에 들어갈 말로 가장 적절한 것을 고르시오." 이후 "1.All international travelers must carry acceptabley..." 처럼 지문으로 볼 수 없는 내용이 나왔다면 "[1~5] 밑줄 친 부분에 들어갈 말로 가장 적절한 것을 고르시오." 는 "1.All international travelers must carry acceptabley..." 와 함께 문제입니다. 이때 문제의 id는 1입니다.
-- ex 3) "[6~7] 다음 글을 읽고 물음에 답하시오. 이후 "Each year in July people all over the world aim to exclude common plastic waste items from their daily life..." 처럼 지문으로 볼 수 있는 내용이 나왔다면 "[6~7] 다음 글을 읽고 물음에 답하시오." 는 "Each year in July people all over the world aim to exclude common plastic waste items from their daily life..." 와 함께 지문입니다. 이때 지문의 id는 [6~7]입니다.
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
          subject: {
            description: `
시험지의 과목 정보입니다.
`,
            type: "string",
          },

          bookType: {
            description: `
시험지의 책형 정보입니다.
- 책형은 가책형, 나책형, 다책형, 인책형, B책형 등이 있습니다.
- 반드시 **책형**으로 끝나야 합니다.
- '지역인재' 를 인책형과 혼동하지 마세요. 지역인재는 인책형이 아닙니다.
`,
            type: "string",
            nullable: true,
          },

          recruitType: {
            description: `
시험지의 채용 유형 정보입니다.
- 채용 유형은 지역인재, 보훈청, 그리고 기본(아무것도 해당 안될 경우)이  있습니다.
- 기본일 경우 null로 처리하세요.
`,
            type: "string",
            enum: ["지역인재", "보훈청"],
            nullable: true,
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
- problem: 문항
- passage: 지문
`,
              type: "string",
              enum: ["problem", "passage"],
            },
            id: {
              description: `
문항, 지문 의 고유 id입니다.
- 문항의 경우, 문항 지시문 앞의 숫자를 사용하세요. "16.가장적절한것은?" 의 id는 16입니다.
- 지문의 경우, 지문 지시문 앞의 문자를 사용하세요. "[41~42]다음글을읽고,물음에답하시오." 의 id는 [41~42]입니다.
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
            choiceCount: {
              description: `
문항일 경우, 객관식 선택지 개수입니다.
`,
              type: "number",
            },
          },
        },
      },
    },
  },
};
