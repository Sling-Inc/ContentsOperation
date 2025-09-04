# D01 후처리 (Post-processing)

LLM 분석(`C02`)을 통해 생성된 `llmResult.json` 파일의 구조적 정보를 바탕으로 최종 결과물을 생성하는 스크립트들이 위치합니다.

---

## 출력 디렉토리 규칙

`D01` 단계의 모든 스크립트 (`A01_generateBbox.js`, `A02_cropImages.js` 등)는 **동일한 최상위 출력 디렉토리**를 공유해야 합니다. 이렇게 하면 모든 후처리 결과물이 한 곳에 모여 일관성 있게 관리됩니다.

- **권장 디렉토리명**: `D01_postprocess_results`
- **결과 구조 예시**:
  ```
  D01_postprocess_results/
  └── <시험지명>/
      ├── bbox.json         (A01_generateBbox.js 결과)
      ├── answers.json      (B01_llmExtractAnswer.js 결과)
      └── images/           (A02_cropImages.js 결과)
          ├── 1.png
          └── passage_1-2.png
  ```

---

## 표준 데이터 형식 (`bbox.json`)

`A01_generateBbox.js` 스크립트들은 공통적으로 다음과 같은 구조의 `bbox.json` 파일을 생성해야 합니다. 이는 후속 `A02_cropImages.js` 스크립트의 일관된 입력을 보장하기 위함입니다.

```json
{
  "info": {
    // 이 객체는 각 후처리 타입(mockTest, default 등)의 특성에 맞는
    // 자유로운 추가 정보를 담는 데 사용될 수 있습니다. (예: 컬럼 개수 등)
  },
  "bbox": [
    {
      "id": "1",
      "bbox": [100, 200, 500, 800],
      "type": "question",
      "pageNum": 1,
      "imagePath": "path/to/page.1.png"
    }
  ]
}
```

### `bbox` 배열의 필수 필드

- `id` (string): 문제/지문의 고유 ID
- `bbox` (Array<number>): 최종 경계 상자 좌표 `[x1, y1, x2, y2]`
- `type` (string): `"question"` 또는 `"passage"`
- `pageNum` (number): 페이지 번호
- `imagePath` (string): 원본 고해상도 이미지 경로

---

## 표준 데이터 형식 (`answers.json`)

`B01_llmExtractAnswer.js` 스크립트는 LLM을 통해 추출된 문제의 정답 정보를 `answers.json` 파일로 생성합니다.

```json
{
  "answers": [
    {
      "id": "1",
      "answer": [2]
    }
  ]
}
```

### `answers` 배열의 필수 필드

- `id` (string): 문제의 고유 ID
- `answer` (Array<string | number>): LLM이 추출한 문제의 정답 목록

---

## 모의고사 후처리 (`mockTest/`)

모의고사 유형의 시험지를 후처리하며, **Bbox 정밀 조정**과 **이미지 추출**의 두 단계로 나뉩니다.

> **💡 특정 시험만 재처리하기**
>
> `mockTest` 워크플로우의 스크립트들(`A01_generateBbox.js`, `A02_cropImages.js`)은 `--targetFile` 옵션을 지원합니다. 이 옵션을 사용하면 전체가 아닌, 텍스트 파일에 명시된 특정 시험 폴더만 대상으로 작업을 수행할 수 있어 재처리나 디버깅에 유용합니다.
>
> **[사용 예시]**
>
> 1.  재처리할 시험 폴더 목록을 `target_files.txt` 파일로 생성합니다.
>     ```txt
>     # workspace/20250903_01/target_files.txt
>     explanation_2025_09_1_교육청_국어_공통
>     problem_2025_06_1_교육청_영어_공통
>     ```
>
> 2.  스크립트 실행 시 `--targetFile` 옵션으로 해당 파일을 지정합니다.
>     ```bash
>     node scripts/D01_postprocess/mockTest/A01_generateBbox.js ... --targetFile workspace/20250903_01/target_files.txt
>     ```

### 1단계: `A01_generateBbox.js` (경계 상자 생성)

- **역할**: LLM 분석 결과를 바탕으로, 컴퓨터 비전(OpenCV)을 이용해 각 문제/지문 영역의 경계 상자(Bbox)를 정밀하게 보정합니다. 최종 보정된 좌표와 관련 정보를 `bbox.json` 파일로 시험지별로 생성합니다.
- **입력**:
  1.  `C02_llm_classification_results` 폴더 (LLM 분석 결과)
  2.  `C01_merged_results` 폴더 (병합된 OCR/레이아웃 정보)
  3.  `B01_images_ocr_420dpi` 폴더 (고해상도 원본 이미지)
- **출력**:
  - `<D01_결과_폴더>/<시험지명>/bbox.json`: 정제된 최종 Bbox 데이터
  - `--debug` 옵션 사용 시, `<D01_결과_폴더>/<시험지명>/debug/` 폴더에 보정 전/후 시각화 이미지 생성
- **사용법**:
  ```bash
  node scripts/D01_postprocess/mockTest/A01_generateBbox.js <C02_폴더> <C01_폴더> <B01_폴더> <D01_결과_폴더> [--debug]
  ```

### 2단계: `A02_cropImages.js` (이미지 추출)

- **역할**: 1단계에서 생성된 `bbox.json` 파일을 읽어, 고해상도 원본 이미지에서 각 문제와 지문 영역을 정확히 잘라냅니다. 여러 페이지에 걸친 항목은 하나의 긴 이미지로 이어 붙이고, OCR 데이터를 참조하여 문제 번호를 삭제한 후 최종 결과물을 저장합니다.
- **입력**:
  1.  `<D01_결과_폴더>` (내부에 `bbox.json` 포함)
  2.  `B02_cloudVisionOCR_results` 폴더 (OCR 결과 JSON)
- **출력**:
  - `<D01_결과_폴더>/<시험지명>/images/`: 잘라내고 병합된 문제/지문 이미지 파일들
- **사용법**:
  ```bash
  node scripts/D01_postprocess/mockTest/A02_cropImages.js <D01_결과_폴더> <B02_OCR_결과_폴더>
  ```

> **💡 초고해상도 이미지 처리하기**
>
> 기본 420dpi가 아닌 더 높은 해상도(예: 840dpi)의 이미지를 사용하여 이미지를 추출할 수 있습니다. `--scale`과 `--newImageDir` 옵션을 함께 사용하면, 기존 `bbox.json`의 좌표를 자동으로 스케일링하고 새로운 이미지 폴더를 참조하여 작업을 수행합니다.
>
> - **`--scale <배율>`**: `bbox.json`의 좌표에 곱할 배율을 지정합니다. (예: 840dpi는 420dpi의 2배이므로 `2`를 입력)
> - **`--newImageDir <경로>`**: 사용할 새로운 고해상도 이미지 폴더의 경로를 지정합니다.
>
> **[사용 예시 (840dpi)]**
>
> ```bash
> node scripts/D01_postprocess/mockTest/A02_cropImages.js <D01_결과_폴더> <B02_OCR_결과_폴더> --scale 2 --newImageDir <840dpi_이미지_폴더>
> ```

---

## 기본 후처리 (`default/`)

`mockTest`와 달리 컴퓨터 비전 보정 없이, LLM 결과와 컬럼 분석만으로 Bbox를 생성하고 이미지를 추출하는 기본 워크플로우입니다.

### 1단계: `A01_generateBbox.js` (경계 상자 생성)

- **역할**: LLM 분석 결과를 바탕으로 컬럼을 나누고, 각 문제/지문 영역의 경계 상자(Bbox)를 계산하여 `bbox.json` 파일로 저장합니다.
- **사용법**:
  ```bash
  node scripts/D01_postprocess/default/A01_generateBbox.js <C02_폴더> <C01_폴더> <B01_폴더> <D01_결과_폴더> [--debug]
  ```

### 2단계: `A02_cropImages.js` (이미지 추출)

- **역할**: 1단계에서 생성된 `bbox.json` 파일을 읽어, 고해상도 원본 이미지에서 각 문제와 지문 영역을 정확히 잘라냅니다. 여러 페이지에 걸친 항목은 하나의 긴 이미지로 이어 붙여 최종 결과물을 저장합니다.
- **사용법**:
  ```bash
  node scripts/D01_postprocess/default/A02_cropImages.js <D01_결과_폴더> <B01_폴더>
  ```

---

## CSE 후처리 (`CSE/`)

CSE(공무원 시험) 유형의 시험지를 후처리하며, **Bbox 생성**, **이미지 추출**, **LLM 정답 추출**의 세 단계로 나뉩니다.

### 1단계: `A01_generateBbox.js` (경계 상자 생성)

- **역할**: LLM 분석 결과를 바탕으로 컬럼을 나누고, 각 문제/지문 영역의 경계 상자(Bbox)를 계산하여 `bbox.json` 파일로 저장합니다. `default` 워크플로우와 유사합니다.
- **사용법**:
  ```bash
  node scripts/D01_postprocess/CSE/A01_generateBbox.js <C02_폴더> <C01_폴더> <B01_폴더> <D01_결과_폴더> [--debug]
  ```

### 2단계: `A02_cropImages.js` (이미지 추출)

- **역할**: 1단계에서 생성된 `bbox.json` 파일을 읽어, 고해상도 원본 이미지에서 각 문제와 지문 영역을 정확히 잘라냅니다. 여러 페이지에 걸친 항목은 하나의 긴 이미지로 이어 붙여 최종 결과물을 저장합니다.
- **입력**:
  1.  `<D01_결과_폴더>` (내부에 `bbox.json` 포함)
  2.  `B01_images_ocr_420dpi` 폴더 (고해상도 원본 이미지)
- **출력**:
  - `<D01_결과_폴더>/<시험지명>/images/`: 잘라내고 병합된 문제/지문 이미지 파일들
- **사용법**:
  ```bash
  node scripts/D01_postprocess/CSE/A02_cropImages.js <D01_결과_폴더> <B01_폴더>
  ```

### 3단계: `B01_llmExtractAnswer.js` (정답 추출)

- **역할**: `C02` 단계에서 생성된 `llmResult.json` 파일과 별도의 정답 PDF 파일을 함께 LLM에 전달하여, 각 문제의 최종 정답을 추출하고 `answers.json` 파일로 저장합니다.
- **입력**:
  1.  `C02_llm_classification_results` 폴더 (LLM 분석 결과)
  2.  정답 PDF 파일들이 들어있는 폴더
- **출력**:
  - `<D01_결과_폴더>/<시험지명>/answers.json`: 추출된 최종 정답 데이터
- **사용법**:
  ```bash
  node scripts/D01_postprocess/CSE/B01_llmExtractAnswer.js <C02_폴더> <정답_PDF_폴더> <D01_결과_폴더> [--debug]
  ```
