# Scripts

이 디렉토리에는 PDF 시험지 처리 자동화를 위한 스크립트들이 순서대로 정리되어 있습니다.

## A. PDF → 데이터 변환

### A01. PDF를 이미지로 변환 (`A01_convertPdfToImage/`)

PDF 파일을 이미지로 변환하는 첫 단계입니다. 레이아웃 분석용(저해상도)과 OCR용(고해상도)으로 두 번 실행해야 합니다.

- **사용법:** `node scripts/A01_convertPdfToImage <입력_폴더> <출력_폴더> <DPI>`

### A02. 레이아웃 분석 (`A02_dotsOCR/`)

저해상도 이미지에서 `dots.ocr` 모델을 사용하여 객체의 위치(bounding box)와 종류(category)를 분석합니다.

- **사용법:** `scripts/A02_dotsOCR/GEMINI.md` 참고

### A03. 최적 레이아웃 선택 (`A03_selectOptimumLayout/`)

여러 DPI로 분석된 레이아웃 결과 중 페이지별 최적의 JSON을 선택하여 다음 단계를 위한 입력 데이터를 생성합니다.

- **사용법:** `node scripts/A03_selectOptimumLayout <A02_입력_폴더> <A01_이미지_폴더> <A03_출력_폴더>`

## B. OCR 수행

### B01. 이미지에서 텍스트 추출 (`B01_cloudVisionOCR/`)

고해상도 이미지에서 Google Cloud Vision API를 사용하여 정확한 텍스트와 위치 정보를 추출합니다.

- **사용법:** `node scripts/B01_cloudVisionOCR <입력_폴더> <출력_폴더> [--debug]`
- **`--debug` (선택사항):** 추가 시, OCR 결과를 시각화한 이미지(.png)를 JSON과 동일한 폴더에 함께 저장합니다.

## C. 데이터 병합 및 최종 분석

### C01. 레이아웃과 OCR 결과 병합 (`C01_mergeResults/`)

A03과 B01에서 얻은 두 종류의 JSON(레이아웃, 텍스트)을 병합하여, 고해상도 이미지 기준으로 좌표가 변환되고 텍스트가 포함된 완전한 데이터를 생성합니다.

- **사용법:** `node scripts/C01_mergeResults <레이아웃_JSON_폴더> <OCR_JSON_폴더> <OCR_이미지_폴더> <출력_폴더> [--debug]`
- **`--debug` (선택사항):** 추가 시, 병합된 레이아웃을 시각화한 이미지(.png)를 JSON과 동일한 폴더에 함께 저장합니다.

### C02. LLM을 이용한 최종 분석 (`C02_llmClassification/`)

병합된 데이터를 Gemini LLM에 전달하여 최종적으로 각 영역이 '문제'인지 '지문'인지를 판단하고 구조화된 최종 JSON을 생성합니다. 스크립트가 내부적으로 병렬 처리되어 하위의 모든 시험지 폴더를 한 번에 분석합니다.

- **사용법:** `node scripts/C02_llmClassification <병합_JSON_상위폴더> <고해상도_이미지_상위폴더> <최종_출력_상위폴더> [--debug]`
- **`--debug` (선택사항):** 추가 시, LLM이 분류한 문제/지문 영역을 시각화한 이미지(.png)를 `llmResult.json`과 동일한 폴더에 함께 저장합니다.

### C03. LLM 결과 검증 (`C03_CheckllmResult/`)

C02의 결과물에 구조적인 오류(예: 블록 ID 중복 할당)가 없는지 검증합니다.

- **사용법:** `node scripts/C03_CheckllmResult <C02_결과_폴더> <C01_결과_폴더>`

## D. 후처리 및 이미지 추출 (`D01_postprocess/`)

C02에서 생성된 LLM 분석 결과를 바탕으로 최종 결과물을 생성하는 단계입니다. 시험지 유형(`default`, `mockTest`)에 따라 다른 워크플로우를 사용하며, 각 워크플로우는 두 단계의 스크립트로 구성됩니다.

- **중요:** 후처리 단계는 여러 스크립트로 구성되며 시험지 유형별로 실행 방식과 요구 인자가 다릅니다. **반드시 `scripts/D01_postprocess/GEMINI.md` 문서를 먼저 다시 한번 읽고 절차를 숙지한 후 진행하세요.**

- **상세 사용법:** `scripts/D01_postprocess/GEMINI.md` 참고

---

## 개발 규칙

### 임시 스크립트 및 테스트 코드

- 일회성 테스트나 유틸리티 검증을 위한 스크립트는 `scripts/tmp` 디렉토리에 작성하는 것을 원칙으로 합니다.
- 이 디렉토리의 스크립트들은 버전 관리 대상에 포함되지 않을 수 있으며, 언제든지 삭제될 수 있습니다.

### 표준 인자 (Arguments)

- `A02_dotsOCR` 관련 스크립트를 제외한 모든 Javascript 기반 스크립트는 다음 두 가지 표준 옵션 인자를 반드시 처리해야 합니다.
  - `--debug`: 스크립트 실행 시 추가적인 시각화 결과물이나 상세 로그를 출력합니다.
  - `--examType <타입>`: 시험지의 종류를 지정하여, 스크립트가 해당 타입에 최적화된 로직을 수행하도록 합니다. (기본값: `default`)
