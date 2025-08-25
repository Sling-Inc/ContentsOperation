# D01 후처리 (Post-processing)

LLM 분석(`C02`)을 통해 생성된 `llmResult.json` 파일의 구조적 정보를 바탕으로 최종 결과물을 생성하는 스크립트들이 위치합니다.

---

## 표준 데이터 형식 (`bbox.json`)

`01_generateBbox.js` 스크립트들은 공통적으로 다음과 같은 구조의 `bbox.json` 파일을 생성해야 합니다. 이는 후속 `02_cropImages.js` 스크립트의 일관된 입력을 보장하기 위함입니다.

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

-   `id` (string): 문제/지문의 고유 ID
-   `bbox` (Array<number>): 최종 경계 상자 좌표 `[x1, y1, x2, y2]`
-   `type` (string): `"question"` 또는 `"passage"`
-   `pageNum` (number): 페이지 번호
-   `imagePath` (string): 원본 고해상도 이미지 경로

---

## 모의고사 후처리 (`mockTest/`)

모의고사 유형의 시험지를 후처리하며, **Bbox 정밀 조정**과 **이미지 추출**의 두 단계로 나뉩니다.

### 1단계: `01_generateBbox.js` (경계 상자 생성)

-   **역할**: LLM 분석 결과를 바탕으로, 컴퓨터 비전(OpenCV)을 이용해 각 문제/지문 영역의 경계 상자(Bbox)를 정밀하게 보정합니다. 최종 보정된 좌표와 관련 정보를 `bbox.json` 파일로 시험지별로 생성합니다.
-   **입력**:
    1.  `C02_llm_analysis` 폴더 (LLM 분석 결과)
    2.  `C01_merged_results` 폴더 (병합된 OCR/레이아웃 정보)
    3.  `B01_images_ocr_420dpi` 폴더 (고해상도 원본 이미지)
-   **출력**:
    -   `<출력_폴더>/<시험지명>/bbox.json`: 정제된 최종 Bbox 데이터
    -   `--debug` 옵션 사용 시, `<출력_폴더>/<시험지명>/debug/` 폴더에 보정 전/후 시각화 이미지 생성
-   **사용법**:
    ```bash
    node scripts/D01_postprocess/mockTest/01_generateBbox.js <C02_폴더> <C01_폴더> <B01_폴더> <출력_폴더> [--debug]
    ```

### 2단계: `02_cropImages.js` (이미지 추출)

-   **역할**: 1단계에서 생성된 `bbox.json` 파일을 읽어, 고해상도 원본 이미지에서 각 문제와 지문 영역을 정확히 잘라냅니다. 여러 페이지에 걸친 항목은 하나의 긴 이미지로 이어 붙여 최종 결과물을 저장합니다.
-   **입력**:
    1.  1단계의 `<출력_폴더>` (내부에 `bbox.json` 포함)
    2.  `B01_images_ocr_420dpi` 폴더 (고해상도 원본 이미지)
-   **출력**:
    -   `<최종_출력_폴더>/<시험지명>/images/`: 잘라내고 병합된 문제/지문 이미지 파일들
-   **사용법**:
    ```bash
    node scripts/D01_postprocess/mockTest/02_cropImages.js <1단계_출력_폴더> <B01_폴더> <최종_출력_폴더>
    ```

---

## 기본 후처리 (`default/`)

`mockTest`와 달리 컴퓨터 비전 보정 없이, LLM 결과와 컬럼 분석만으로 Bbox를 생성하고 이미지를 추출하는 기본 워크플로우입니다.

### 1단계: `01_generateBbox.js` (경계 상자 생성)

-   **역할**: LLM 분석 결과를 바탕으로 컬럼을 나누고, 각 문제/지문 영역의 경계 상자(Bbox)를 계산하여 `bbox.json` 파일로 저장합니다.
-   **사용법**:
    ```bash
    node scripts/D01_postprocess/default/01_generateBbox.js <C02_폴더> <C01_폴더> <B01_폴더> <출력_폴더> [--debug]
    ```

### 2단계: `02_cropImages.js` (이미지 추출)

-   **역할**: 1단계에서 생성된 `bbox.json` 파일을 읽어, 고해상도 원본 이미지에서 각 문제와 지문 영역을 정확히 잘라냅니다. 여러 페이지에 걸친 항목은 하나의 긴 이미지로 이어 붙여 최종 결과물을 저장합니다.
-   **사용법**:
    ```bash
    node scripts/D01_postprocess/default/02_cropImages.js <1단계_출력_폴더> <B01_폴더> <최종_출력_폴더>
    ```
