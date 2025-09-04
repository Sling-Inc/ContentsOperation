# 시험지 PDF 오퍼레이션 프로젝트

이 프로젝트는 시험지 PDF 파일에서 다음과 같은 작업을 자동화 하는 것을 목표로 합니다.

- 시험지 PDF에서 문제, 지문 식별 및 bounding box 및 이미지 추출
- 문제, 지문 정보 자동 추출 (TODO)

- 이 프로젝트 내 대화에서는 반드시 한글을 사용하세요

# 프로젝트 구성

이 프로젝트는 Javascript와 sh 스크립트 파일을 혼용해서 사용합니다.
JavaScript는 Node.js 22 버전 및 yarn을 사용합니다.
JavaScript에서 각종 시각화를 위하여 sharp 패키지를 사용합니다.

## 🔧 GCP 프로젝트 설정

**중요**: 이 프로젝트는 `dev-giyoung` GCP 프로젝트를 사용합니다.

### 초기 설정

```bash
# GCP 프로젝트 설정
gcloud config set project dev-giyoung

# 필수 의존성 설치 (macOS)
brew install graphicsmagick ghostscript
```

### 인증 설정

- Google AI API 키가 `.env` 파일에 설정되어야 합니다
- GCP 인증: `gcloud auth application-default login`

## 프로젝트 구조

### `_logs` 폴더

js 스크립트의 실행 로그가 저장되는 디렉토리입니다.

### `workspace` 폴더

pdf 파일, json 파일 등 각종 파일을 읽고, 결과를 저장하는데 사용하는 디렉토리입니다.
모든 결과물은 모두 해당 디렉토리 내에 저장하도록 하세요.

### `utils` 폴더

프로젝트 전체에서 사용되는 js 도구 함수들이 있는 디렉토리입니다.

### `operation` 폴더

자료 업로드, 수정, 삭제 등 작업을 실행하는 디렉토리입니다.
사람이 확인하고 확인하고 실행하는 디렉토리이니, 당신이 수행한 오퍼레이션과 직접적인 관련이 없습니다.
직접 건드리거나 스크립트를 실행하지 마세요.

# 오퍼레이션 순서

이 프로젝트의 최종 목표는 PDF 시험지로부터 문제와 지문 정보를 추출하는 것이며, 전체 작업은 3단계의 워크플로우로 구성됩니다. 각 단계는 `scripts` 폴더 내의 스크립트를 순서대로 실행하여 수행할 수 있습니다.

### 1단계: 데이터 준비 (PDF → 이미지 → JSON)

PDF 파일을 분석 가능한 데이터(이미지, JSON)로 변환합니다.

1.  **PDF → 이미지 변환 (`A01_convertPdfToImage/`)**

    - PDF 파일을 **여러 저해상도(레이아웃 분석용)**와 고해상도(OCR용) 이미지로 각각 변환합니다.
    - 저해상도의 경우, `workspace/A01_images_layout` 디렉토리에 80, 100 등 여려 dpi를 사용하여 이미지로 변환합니다. 이는 다음 단계에서 최적의 레이아웃 분석 결과를 선택하기 위함입니다. (단, `mockTest`의 경우 100dpi만 사용합니다.)
    - 고해상도의 경우, 정해진 하나의 dpi(420)를 사용하여 이미지로 변환합니다.
    - 저해상도, 고해상도의 스크립트들은 병렬로 작업을 수행합니다. 절대로 동시에 두개 이상의 스크립트를 실행하지 마세요.
    - **[실행 예시]**

      ```bash
      # 저해상도 (일반: 80, 100 등 여러 버전 생성 / mockTest: 100dpi만 생성)
      node scripts/A01_convertPdfToImage workspace/pdfs workspace/A01_images_layout/80dpi 80
      node scripts/A01_convertPdfToImage workspace/pdfs workspace/A01_images_layout/100dpi 100

      # 고해상도 (420)
      node scripts/A01_convertPdfToImage workspace/pdfs workspace/B01_images_ocr_420dpi 420
      ```

2.  **레이아웃 분석 (`A02_dotsOCR/`)**

    - 해당 절차를 수행하기 전, 반드시 `scripts/A02_dotsOCR/GEMINI.md` 문서를 확인하세요.
    - 저해상도 이미지를 사용하여 GCP VM에서 `dots.ocr` 모델로 이미지의 구조를 분석하고 **레이아웃 JSON**을 생성합니다.
    - `download_results.sh` 실행 시 `-i` 옵션을 추가하면, 레이아웃 분석이 시각화된 이미지(.jpg)를 함께 다운로드할 수 있습니다.
    - **[실행 예시]**
      ```bash
      # VM 시작부터 결과 다운로드까지
      bash scripts/A02_dotsOCR/start_vm.sh
      gcloud compute scp --recurse workspace/A01_images_layout/* ...
      gcloud compute ssh ... --command="~/process_all_images.sh ..."
      bash scripts/A02_dotsOCR/download_results.sh -o workspace/A02_dotsOCR_results
      bash scripts/A02_dotsOCR/stop_vm.sh
      ```

3.  **최적 레이아웃 선택 (`A03_selectOptimumLayout/`)**

    - 여러 DPI로 분석된 `A02_dotsOCR` 결과물 중에서, 페이지별로 가장 바운딩 박스가 많은 최적의 **레이아웃 JSON**을 선택합니다.
    - 박스 수가 동일할 경우, 더 높은 DPI의 결과물을 선택합니다.
    - 선택된 JSON은 원본 저해상도 이미지의 크기(width, height)와 DPI 정보가 포함된 새로운 구조로 저장되며, 시각화 이미지(.jpg)도 함께 복사됩니다.
    - **[실행 예시]**
      ```bash
      node scripts/A03_selectOptimumLayout workspace/A02_dotsOCR_results workspace/A01_images_layout workspace/A03_optimum_result
      ```

4.  **텍스트 추출 (`B01_cloudVisionOCR/`)**
    - 고해상도 이미지에 Google Cloud Vision OCR을 적용하여 상세 **텍스트 JSON**을 생성합니다.
    - **[실행 예시]**
      ```bash
      node scripts/B01_cloudVisionOCR workspace/B01_images_ocr_420dpi workspace/B02_cloudVisionOCR_results --debug --examType default
      ```

### 2단계: 데이터 병합

1단계에서 생성된 두 종류의 JSON(레이아웃, 텍스트)을 하나로 합쳐 완전한 데이터를 만듭니다.

1.  **JSON 병합 (`C01_mergeResults/`)**
    - `A03`에서 선택된 최적 레이아웃과 `B01`의 텍스트 JSON을 병합하여, 고해상도 이미지 기준의 좌표와 텍스트를 포함하는 **병합 JSON**을 생성합니다.
    - **[실행 예시]**
      ```bash
      node scripts/C01_mergeResults workspace/A03_optimum_result workspace/B02_cloudVisionOCR_results workspace/B01_images_ocr_420dpi workspace/C01_merged_results --debug --examType default
      ```

### 3단계: LLM을 이용한 최종 분석

병합된 데이터를 LLM에 전달하여 최종적으로 문제와 지문을 식별합니다.

1.  **LLM 분석 (`C02_llmClassification/`)**

    - 병합된 JSON 데이터를 LLM에 보내 문제/지문 정보를 포함하는 **최종 분석 JSON**을 생성합니다. 이 스크립트는 내부적으로 병렬 처리되어 모든 시험지를 한 번에 분석합니다.
    - **[실행 예시]**
      ```bash
      # C01_merged_results 폴더 내의 모든 시험지에 대해 분석 실행
      node scripts/C02_llmClassification workspace/C01_merged_results workspace/B01_images_ocr_420dpi workspace/C02_llm_classification_results --debug --examType default
      ```

2.  **LLM 결과 검증 (`C03_CheckllmResult/`)** (선택 사항)
    - `C02` 단계의 결과물인 `llmResult.json` 파일 내에서 하나의 블록 ID가 여러 문제/지문에 중복으로 할당되었는지 검사합니다.
    - 후처리 단계 전에 데이터 정합성을 확인하기 위해 실행하는 것을 권장합니다.
    - **[실행 예시]**
      ```bash
      node scripts/C03_CheckllmResult workspace/C02_llm_classification_results workspace/C01_merged_results
      ```

### 4단계: 후처리 (D01_postprocess)

LLM 분석이 완료된 데이터를 바탕으로 Bbox를 정밀하게 보정하고, 최종 문제/지문 이미지를 추출합니다.

- **중요:** 후처리 단계는 여러 스크립트로 구성되며 시험지 유형별로 실행 방식과 요구 인자가 다릅니다. **반드시 `scripts/D01_postprocess/GEMINI.md` 문서를 먼저 다시 한번 읽고 절차를 숙지한 후 진행하세요.**

# 특정 자료 재처리 워크플로우

`C03_CheckllmResult` 검증 단계에서 특정 파일에 오류(예: 블록 ID 중복 할당)가 발견되었을 경우, 전체 파이프라인을 다시 실행하는 대신 문제가 발생한 파일만 대상으로 재처리할 수 있습니다.

### 1단계: 재처리 대상 지정

1.  작업 디렉토리(예: `workspace/20250903_01`)에 `target_files.txt` 파일을 생성합니다.
2.  파일 안에 재처리가 필요한 시험지의 폴더 이름을 한 줄에 하나씩 기입합니다.

    **[예시: `workspace/20250903_01/target_files.txt`]**

    ```
    problem_2025_06_1_교육청_영어_공통
    problem_2025_06_2_교육청_영어_공통
    ```

### 2단계: 새로운 DPI로 이미지 재생성 (A01)

- 오류는 대부분 레이아웃 분석 문제이므로, 다른 DPI를 적용하여 해결을 시도합니다.
- `A01_convertPdfToImage` 스크립트에 `--targetFile` 옵션을 추가하여, 지정된 파일들만 새로운 DPI(예: 120dpi)로 변환합니다.

  ```bash
  # target_files.txt 목록의 파일만 120dpi로 변환
  node scripts/A01_convertPdfToImage workspace/20250903_01/00_pdf workspace/20250903_01/A01_images_layout/120dpi 120 --targetFile workspace/20250903_01/target_files.txt
  ```

### 3단계: 레이아웃 재분석 및 결과 병합 (A02)

1.  **VM 업로드 및 분석:** 새로 생성된 120dpi 이미지 폴더를 GCP VM에 업로드하고 `dots.ocr` 분석을 실행합니다.
2.  **결과 다운로드 및 병합:** 분석이 완료된 새로운 DPI 폴더(예: `120dpi`)를 기존 `A02_dotsOCR_results` 폴더 안으로 복사하여 병합합니다.

### 4단계: 최적 레이아웃 재선택 (A03)

- `A03_selectOptimumLayout` 스크립트를 다시 실행합니다. 이 스크립트는 기존 DPI 결과와 새로 추가된 120dpi 결과를 모두 비교하여, 재처리 대상 파일들에 대한 최적의 레이아웃을 새로 선택하고 `A03_optimum_result` 폴더의 내용을 덮어씁니다.

  ```bash
  node scripts/A03_selectOptimumLayout workspace/20250903_01/A02_dotsOCR_results workspace/20250903_01/A01_images_layout workspace/20250903_01/A03_optimum_result
  ```

### 5단계: 데이터 재병합 (C01)

- `C01_mergeResults` 스크립트를 다시 실행하여, 새로 선택된 레이아웃을 기준으로 OCR 텍스트를 재병합합니다. 이 과정 역시 `C01_merged_results` 폴더의 해당 파일 내용을 덮어씁니다.

  ```bash
  node scripts/C01_mergeResults workspace/20250903_01/A03_optimum_result workspace/20250903_01/B02_cloudVisionOCR_results workspace/20250903_01/B01_images_ocr_420dpi workspace/20250903_01/C01_merged_results --examType <해당 시험타입>
  ```

### 6단계: LLM 재분석 (C02)

- `C02_llmClassification` 스크립트를 `--targetFile` 옵션과 함께 실행하여, 수정된 파일들만 LLM으로 재분석합니다. 이렇게 하면 시간과 비용을 절약할 수 있습니다.
- 디버그 이미지를 함께 업데이트하려면 `--debug` 플래그를 추가합니다.

  ```bash
  node scripts/C02_llmClassification workspace/20250903_01/C01_merged_results workspace/20250903_01/B01_images_ocr_420dpi workspace/20250903_01/C02_llm_classification_results --examType <해당 시험타입> --targetFile workspace/20250903_01/target_files.txt --debug
  ```

### 7단계: 최종 검증 (C03)

- 마지막으로 `C03_CheckllmResult` 스크립트를 다시 실행하여, 수정된 파일을 포함한 전체 데이터에 오류가 없는지 최종 확인합니다.

  ```bash
  node scripts/C03_CheckllmResult workspace/20250903_01/C02_llm_classification_results workspace/20250903_01/C01_merged_results
  ```

# 에이전트 운영 규칙

이 프로젝트의 작업을 에이전트를 통해 수행할 때, 다음 규칙을 따릅니다.

0. 작업할 디렉토리와 원본 pdf 파일의 디렉토리를 확인하세요.

   - 작업하는 폴더 (예: `workspace/20250820_01`) 내부를 확인해서 pdf 파일 디렉토리 (예: `workspace/20250820_01/00_pdf`) 를 확인하세요.
   - **`.gitignore` 파일 조회**: 작업하는 폴더는 (예: `workspace/20250820_01`) `.gitignore` 처리되어 있을 수 있습니다. 에이전트는 `workspace`등 작업하는 폴더 에서 파일을 조회할 때 `.gitignore`에 의해 무시된 파일도 볼 수 있어야 합니다. 파일 검색 및 조회 도구 사용 시 관련 설정을 반드시 활성화해야 합니다.

1. **작업 설정 확인**: 새로운 데이터셋(예: `workspace/20250903_01`)에 대한 전체 프로세스를 시작하기 전에, 에이전트는 반드시 사용자에게 다음 두 가지 설정을 질문해야 합니다.

   - `시험 타입 (examType)`: 분석할 시험지의 종류. 현재 사용 가능한 타입은 `default`(기본), `mockTest`(모의고사), `CSE`(공무원 시험) 입니다.
   - `디버그 모드 (debug mode)`: 활성화 여부 (y/n)

2. **실행 전 설정 고지**: 위에서 설정된 값을 바탕으로 각 스크립트(`A01`, `B01` 등)를 실행하기 직전, 에이전트는 어떤 `examType`과 `debug` 설정으로 명령을 실행할 것인지 사용자에게 명확히 알려야 합니다.
