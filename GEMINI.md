# 시험지 PDF 오퍼레이션 프로젝트

이 프로젝트는 시험지 PDF 파일에서 다음과 같은 작업을 자동화 하는 것을 목표로 합니다.

- 시험지 PDF에서 문제, 지문 식별 및 bounding box 및 이미지 추출
- 문제, 지문 정보 자동 추출 (TODO)

# 프로젝트 구성

이 프로젝트는 Javascript와 sh 스크립트 파일을 혼용해서 사용합니다.
JavaScript는 Node.js 22 버전 및 yarn을 사용합니다.
JavaScript에서 각종 시각화를 위하여 sharp 패키지를 사용합니다.

## 프로젝트 구조

### `_logs` 폴더

js 스크립트의 실행 로그가 저장되는 디렉토리입니다.

### `workspace` 폴더

pdf 파일, json 파일 등 각종 파일을 읽고, 결과를 저장하는데 사용하는 디렉토리입니다.
모든 결과물은 모두 해당 디렉토리 내에 저장하도록 하세요.

### `utils` 폴더

프로젝트 전체에서 사용되는 js 도구 함수들이 있는 디렉토리입니다.

# 오퍼레이션 순서

이 프로젝트의 최종 목표는 PDF 시험지로부터 문제와 지문 정보를 추출하는 것이며, 전체 작업은 3단계의 워크플로우로 구성됩니다. 각 단계는 `scripts` 폴더 내의 스크립트를 순서대로 실행하여 수행할 수 있습니다.

### 1단계: 데이터 준비 (PDF → 이미지 → JSON)

PDF 파일을 분석 가능한 데이터(이미지, JSON)로 변환합니다.

1.  **PDF → 이미지 변환 (`A01_convertPdfToImage/`)**

    - PDF 파일을 저해상도(레이아웃 분석용)와 고해상도(OCR용) 이미지로 각각 변환합니다.
    - **[실행 예시]**
      ```bash
      # 저해상도 (100dpi) 이미지 생성
      node scripts/A01_convertPdfToImage workspace/pdfs workspace/A01_images_layout_100dpi 100
      # 고해상도 (420dpi) 이미지 생성
      node scripts/A01_convertPdfToImage workspace/pdfs workspace/B01_images_ocr_420dpi 420
      ```

2.  **레이아웃 분석 (`A02_dotsocr/`)**

    - 저해상도 이미지를 사용하여 GCP VM에서 `dots.ocr` 모델로 이미지의 구조를 분석하고 **레이아웃 JSON**을 생성합니다.
    - **[실행 예시]**
      ```bash
      # VM 시작부터 결과 다운로드까지 (자세한 내용은 A02_dotsocr/GEMINI.md 참고)
      bash scripts/A02_dotsocr/start_vm.sh
      gcloud compute scp --recurse workspace/A01_images_layout_100dpi/* ...
      gcloud compute ssh ... --command="~/process_all_images.sh ..."
      bash scripts/A02_dotsocr/download_results.sh -o workspace/A02_dotsocr_results
      bash scripts/A02_dotsocr/stop_vm.sh
      ```

3.  **텍스트 추출 (`B01_performOcr/`)**
    - 고해상도 이미지에 Google Cloud Vision OCR을 적용하여 상세 **텍스트 JSON**을 생성합니다.
    - **[실행 예시]**
      ```bash
      node scripts/B01_performOcr workspace/B01_images_ocr_420dpi workspace/B02_ocr_results --debug
      ```

### 2단계: 데이터 병합

1단계에서 생성된 두 종류의 JSON(레이아웃, 텍스트)을 하나로 합쳐 완전한 데이터를 만듭니다.

1.  **JSON 병합 (`C01_mergeOcrAndLayout/`)**
    - 레이아웃과 텍스트 JSON을 병합하여, 고해상도 이미지 기준의 좌표와 텍스트를 포함하는 **병합 JSON**을 생성합니다.
    - **[실행 예시]**
      ```bash
      node scripts/C01_mergeOcrAndLayout workspace/A02_dotsocr_results workspace/B02_ocr_results workspace/A01_images_layout_100dpi workspace/B01_images_ocr_420dpi workspace/C01_merged_results --debug
      ```

### 3단계: LLM을 이용한 최종 분석

병합된 데이터를 LLM에 전달하여 최종적으로 문제와 지문을 식별합니다.

1.  **LLM 분석 (`C02_analyzeExamPaper/`)**
    - 병합된 JSON 데이터를 LLM에 보내 문제/지문 정보를 포함하는 **최종 분석 JSON**을 생성합니다. 이 스크립트는 내부적으로 병렬 처리되어 모든 시험지를 한 번에 분석합니다.
    - **[실행 예시]**
      ```bash
      # C01_merged_results 폴더 내의 모든 시험지에 대해 분석 실행
      node scripts/C02_analyzeExamPaper workspace/C01_merged_results workspace/B01_images_ocr_420dpi workspace/C02_llm_analysis --debug
      ```

# 에이전트 운영 규칙
이 프로젝트의 작업을 에이전트를 통해 수행할 때, 다음 규칙을 따릅니다.

1.  **작업 설정 확인**: 새로운 데이터셋(예: `workspace/20250820_01`)에 대한 전체 프로세스를 시작하기 전에, 에이전트는 반드시 사용자에게 다음 두 가지 설정을 질문해야 합니다.
    -   `시험 타입 (examType)`: 분석할 시험지의 종류. 현재 사용 가능한 타입은 `default`(기본), `mockTest`(모의고사) 입니다.
    -   `디버그 모드 (debug mode)`: 활성화 여부 (y/n)

2.  **실행 전 설정 고지**: 위에서 설정된 값을 바탕으로 각 스크립트(`A01`, `B01` 등)를 실행하기 직전, 에이전트는 어떤 `examType`과 `debug` 설정으로 명령을 실행할 것인지 사용자에게 명확히 알려야 합니다.
