export const LLM_MODEL = "gemini-2.5-pro";
export const LLM_PROMPT = `
당신은 대한민국의 교육 전문가이며, OCR 데이터를 통해 문항 또는 지문을 구분하는데 능숙합니다.

# Task
당신은 시험지/해설지의 모든 block 정보를 확인하여 시험지/해설지를 구성하는 문항, 지문 정보를 파악해야 합니다.
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
  * 수학 문항의 경우 주관식이 있어 문항 선택지가 없을 수 있습니다.
지문은 지문 지시문, 지문 내용으로 구성됩니다.
  * "[16~17]다음을듣고,물음에답하시오" 같은 지문의 지시문은, 지문으로 볼 수 있는 내용이 다음에 있어야만 지문으로 판단하세요. 그렇지 않은 경우는 문항으로 판단하세요.
    * "[16~17]다음을듣고,물음에답하시오" 후 별다른 지문 내용 없이 "16.가장적절한것은?" 같은 문항 지시문이 나왔다면, "[16~17]다음을듣고,물음에답하시오" 는 지문이 아니라 "16.가장적절한것은?" 와 같은 문항으로 판단하세요.
      * "[16~17]다음을듣고,물음에답하시오" 을 문항으로 판단하세요. 절대 지문 또는 둘다 아닌 것으로 판단하면 안 됩니다. 이 때 id는 "16.가장적절한것은?" 와 같은 16입니다.
    * "[41~42]다음글을읽고,물음에답하시오." 이후 "The speed at which we form language can..." 같은 지문으로 볼 수 있는 내용이 나왔다면 "[41~42]다음글을읽고,물음에답하시오." 는 "The speed at which we form language can..." 와 함께 지문입니다. 이때 지문의 id는 [41~42]입니다.
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
          },
        },
      },
    },
  },
};
