# 프로젝트 구성

operation 프로젝트는 외부의 scripts와 별개로, 사용자가 직접 여러가지 작업을 수행하는 곳입니다.
operation 프로젝트는 JavaScript와 Node.js 22 버전을 사용합니다.
operation 프로젝트는 yarn을 사용합니다.

## `utils` 폴더

프로젝트 전반에서 재사용되는 유틸리티 함수들은 `utils` 폴더에 위치합니다.
예를 들어, 로거(`logger.js`), 스크립트 실행기(`runScript.js`), 등이 있습니다.
스크립트 내에서 `#operation/utils/` 경로를 통해 쉽게 가져와 사용할 수 있습니다.

---

## 프로젝트 실행

루트 디렉토리의 `index.js` 파일은 이 프로젝트의 메인 실행 스크립트입니다.
`scripts` 폴더 내의 특정 프로젝트와 하위 스크립트를 실행하는 역할을 합니다.

**실행 방법:**

```bash
node operation/index.js <프로젝트_폴더명> <스크립트_폴더명> [하위_스크립트_인자]
```

- `<프로젝트_폴더명>`: `scripts` 폴더 아래의 프로젝트 폴더 이름 (예: `OP01_operationAutomation`)
- `<스크립트_폴더명>`: 프로젝트 폴더 아래의 스크립트 폴더 이름 (예: `001_helloWorld`)
- `[하위_스크립트_인자]`: (선택 사항) 실행할 하위 스크립트의 키 값 (예: `001`)

인자 없이 `node index.js`를 실행하면, `inquirer` 프롬프트를 통해 실행할 프로젝트와 스크립트를 대화형으로 선택할 수 있습니다.

## `scripts` 폴더 구조

모든 자동화 스크립트는 `scripts` 폴더 아래에 체계적으로 구성됩니다.

```
operation/
└── scripts/
    └── <프로젝트_폴더명>/
        └── <스크립트_폴더명>/
            ├── index.js       # 스크립트 메인 실행 파일
            └── ...            # 스크립트 관련 모듈 파일
```

- **`<프로젝트_폴더명>`**: 관련된 스크립트들을 그룹화하는 최상위 폴더입니다. (예: `OP01_operationAutomation`)
- **`<스크립트_폴더명>`**: 실제 개별 기능을 수행하는 스크립트 폴더입니다. (예: `001_helloWorld`)
- **`index.js`**: 각 스크립트 폴더의 진입점(entry point) 역할을 합니다.

## 스크립트 `index.js` 작성 요령

각 스크립트 폴더의 `index.js`는 `RunScript` 유틸리티를 사용하여 일관된 방식으로 작성합니다. `index.js`는 스크립트의 진입점 및 기능 분기 처리를 담당합니다.

### 기본 템플릿

```javascript
import path from "path";
import url from "url";
import { RunScript } from "#operation/utils/runScript.js";

// 실행할 실제 로직이 담긴 함수들을 가져옵니다.
import { F001_someFunction } from "./F001_someFunction.js";
import { F002_anotherFunction } from "./F002_anotherFunction.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// 실행할 기능 목록을 정의합니다.
// key: 커맨드 라인 인자로 사용될 값 (예: '001')
// value: 사용자에게 보여질 설명 (inquirer 프롬프트)
const choices = {
  ["001"]: "001. 첫 번째 기능 실행",
  ["002"]: "002. 두 번째 기능 실행",
};

// 메인 실행 함수
async function main() {
  // RunScript 유틸리티를 호출합니다.
  await RunScript(__dirname, choices, async (choice) => {
    // 선택된 기능에 따라 분기 처리합니다.
    switch (choice) {
      case choices["001"]:
        await F001_someFunction();
        break;
      case choices["002"]:
        await F002_anotherFunction();
        break;
    }
  });
}

main();
```

### 주요 규칙

1.  **로직 분리**: 실제 기능을 수행하는 코드는 별도의 파일(예: `F001_someFunction.js`)로 작성하고, `index.js`에서는 해당 함수를 `import`하여 사용합니다. `index.js`는 오케스트레이션 역할만 담당합니다.
2.  **`choices` 객체 정의**:
    - 실행할 기능의 목록을 `choices` 객체에 정의합니다.
    - **`key`**는 `node operation/index.js ... <key>` 형태로 커맨드 라인에서 기능을 직접 지정할 때 사용됩니다. (예: `001`)
    - **`value`**는 커맨드 라인 인자 없이 실행했을 때 `inquirer` 프롬프트에 표시될 설명입니다.
3.  **`RunScript` 사용**:
    - `RunScript` 함수를 호출하여 스크립트 실행을 위임합니다.
    - 첫 번째 인자로 `__dirname`을 전달하여 로그 파일 경로를 설정합니다.
    - 두 번째 인자로 `choices` 객체를 전달합니다.
    - 세 번째 인자로 `async (choice) => { ... }` 콜백 함수를 전달합니다. 이 함수는 사용자가 선택한 기능(`choice` 변수)에 따라 실제 로직을 실행하는 `switch` 문을 포함합니다.
