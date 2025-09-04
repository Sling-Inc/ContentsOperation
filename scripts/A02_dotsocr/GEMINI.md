# 목표

- `dots.ocr` 모델을 사용하여 로컬의 이미지들을 VM에서 병렬로 Layout 분석 처리하여 결과 json 및 이미지를 다운로드

---

## 1. 핵심 자산

### 1-1. GCP VM

- **이름:** `dots-ocr-l4-test-vm`
- **사양:** `g2-standard-8`, L4 GPU, 200GB balanced persistent disk
- **Zone:** `asia-northeast3-a`

### 1-2. 핵심 스크립트

- **VM 제어 (로컬 실행):**
  - `start_vm.sh`: VM 및 컨테이너 시작
  - `stop_vm.sh`: VM 중지
- **분석 실행 (VM 내부):**
  - `process_all_images.sh`: 이미지 병렬 처리
- **데이터 전송 (로컬 실행):**
  - `download_results.sh`: 결과 다운로드 및 경로 정리

## 2. 표준 작업 절차 (SOP)

이 절차는 로컬 컴퓨터에서 VM을 제어하여 분석 작업을 수행하는 표준 방법을 설명합니다.

### 0단계: GCP 프로젝트 설정

- **중요**: VM은 `dev-giyoung` 프로젝트에 있습니다.
  - **명령:** `gcloud config set project dev-giyoung`

### 1단계: VM 상태 확인 및 시작

- **(권장) 상태 확인:** 작업을 시작하기 전에 VM의 현재 상태를 확인합니다.
  - **명령:** `gcloud compute instances describe dots-ocr-l4-test-vm --zone=asia-northeast3-a --format='get(status)'`
  - **결과:** `RUNNING`이면 다음 단계로, `TERMINATED`이면 아래 시작 명령을 실행합니다.
- **VM 시작:**
  - **명령:** `bash scripts/A02_dotsOCR/start_vm.sh`
  - **동작:**
    - GCP의 `dots-ocr-l4-test-vm` VM을 시작합니다.
    - VM에 접속하여 기존 컨테이너를 삭제하고, `~/input` 및 `~/result` 폴더를 생성하여 작업 환경을 초기화합니다.
    - `custom-dots-ocr:unified` 이미지를 사용하여 새로운 컨테이너를 백그라운드에서 실행합니다.
- **주의사항:**
  - `start_vm.sh` 실행 후, 컨테이너 내부 모델이 GPU 메모리에 로드될 때까지 **반드시 2분 이상 기다리는 것을 권장합니다.**
  - 충분히 기다리지 않으면 `Connection Refused` 오류가 발생할 수 있습니다.

### 2단계: (권장) 작업 폴더 정리

- 이전 작업의 파일이 남아있는 경우를 방지하기 위해, 이미지 업로드 전에 VM의 `input`, `result` 폴더를 비우는 것을 권장합니다.
- **명령:** `gcloud compute ssh dots-ocr-l4-test-vm --zone=asia-northeast3-a --command="sudo rm -rf ~/input/* ~/result/*"`

### 3단계: 이미지 업로드

- **명령:** `gcloud compute scp --recurse [로컬 상위 폴더]/* dots-ocr-l4-test-vm:~/input/ --zone=asia-northeast3-a`
- **동작:**
  - 로컬 컴퓨터의 이미지 폴더들을 VM의 `~/input` 디렉토리로 복사합니다.
  - `100dpi`, `120dpi` 등 여러 버전의 이미지 폴더를 담고 있는 상위 폴더(예: `A01_images_layout`)의 내용물 전체를 한 번에 업로드하는 것을 권장합니다. 이렇게 하면 VM 내부에 `~/input/100dpi/`, `~/input/120dpi/` 와 같이 폴더 구조가 그대로 유지되어 효율적입니다.
- **실행 예시:**
  ```bash
  # A01_images_layout 폴더 안의 100dpi, 120dpi 폴더들을 모두 업로드
  gcloud compute scp --recurse workspace/A01_images_layout/* dots-ocr-l4-test-vm:~/input/ --zone=asia-northeast3-a
  ```
- **주의사항:**
  - 명령어 마지막의 `/*` 와 `~/input/` 를 정확히 입력해야 폴더 내용물만 올바르게 복사됩니다.

### 4단계: (권장) 모델 로드 상태 확인

- 분석을 실행하기 직전에, 아래 명령으로 서비스가 정상적으로 준비되었는지 최종 확인합니다. `Connection Refused` 오류를 방지하는 가장 확실한 방법입니다.
  - **1. 컨테이너 상태 확인:**
    - **명령:** `gcloud compute ssh dots-ocr-l4-test-vm --zone=asia-northeast3-a --command="sudo docker ps"`
    - **정상:** `STATUS` 항목이 `Up ...`으로 표시된 컨테이너가 있어야 합니다.
  - **2. GPU 상태 확인:**
    - **명령:** `gcloud compute ssh dots-ocr-l4-test-vm --zone=asia-northeast3-a --command="nvidia-smi"`
    - **정상:** `Memory-Usage`에 수 GB 이상의 메모리가 사용 중이고, 하단 `Processes` 목록에 `python3` 등의 프로세스가 보여야 합니다.

### 5단계: 분석 병렬 처리 실행

- **분석 실행:**
  - **명령:** `gcloud compute ssh dots-ocr-l4-test-vm --zone=asia-northeast3-a --command="~/process_all_images.sh [옵션]"`
  - **입력 (VM):** `~/input` 디렉토리 내의 모든 이미지 파일 (`.png`, `.jpg`, `.jpeg`)
  - **출력 (VM):** `~/result` 디렉토리 내에 입력과 동일한 폴더 구조로 OCR 결과(`page1/page1.json` 등)가 생성됩니다.
- **주의사항:**
  - `-p` 옵션으로 병렬 작업 수를 너무 높게 설정하면 VM 성능에 따라 불안정해질 수 있습니다. (권장: 4 ~ 12)

### 6단계: 결과 다운로드 (고속화 버전)

- **명령:** `bash scripts/A02_dotsOCR/download_results.sh [-i] [-o <출력 디렉토리>]`
- **주요 옵션:**
  - `-i`: 결과 이미지(.jpg)를 포함하여 다운로드합니다.
  - `-o`: 결과물이 저장될 로컬 디렉토리를 지정합니다. (기본값: `./results`)
- **동작:**
  - VM의 `~/result` 디렉토리 전체를 로컬의 임시 폴더로 한 번에 다운로드하여 속도를 크게 향상시켰습니다.
  - 다운로드 후, 스크립트가 로컬에서 자동으로 불필요한 중간 경로를 정리하고 최종 결과물만 지정된 출력 디렉토리에 저장합니다.
- **주의사항:**
  - 이 스크립트는 실행 시 가장 먼저 지정된 출력 디렉토리를 삭제하므로, 이전 결과물은 미리 백업해야 합니다.

### 7단계: VM 중지

- **명령:** `bash scripts/A02_dotsOCR/stop_vm.sh`
- **동작:** VM을 중지하여 불필요한 클라우드 비용 발생을 방지합니다.
- **주의사항:**
  - 모든 작업이 끝나면 반드시 실행하는 것을 권장합니다.

---

## 3. 핵심 발견 사항 및 운영 가이드

### 3-1. 올바른 입/출력 경로 및 정리

- **VM 입력:** `~/input`
- **VM 출력:** `~/result`
- **정리:** 새 작업 전, 이전 데이터를 정리하는 것을 권장합니다. 컨테이너 내부(root)에서 생성된 파일은 권한 문제가 있을 수 있으므로, `sudo`를 사용하여 각 폴더의 **내용물만** 삭제해야 합니다.
  - **명령:** `sudo rm -rf ~/input/* ~/result/*`

### 3-2. 컨테이너 생명 주기 및 모델 로딩 (가장 중요)

- **가장 빈번한 오류의 원인:** `start_vm.sh` 실행 후 vLLM 모델이 GPU에 완전히 로드되기까지는 시간이 걸립니다. 충분히 기다리지 않고 모델을 실행하면 `Connection Refused` 오류가 발생하며 컨테이너가 비정상 종료될 수 있습니다.
- **권장 대기 시간:** **최소 2~3분 이상** 충분히 기다린 후, "모델 로드 상태 확인" 절차를 통해 서비스 준비 상태를 확인하는 것이 가장 안정적입니다.

### 3-3. 성능 튜닝 및 권장 설정

- **`--max_pixels` (`-m`):** 이 옵션은 이미지의 **'전체 픽셀 수 (가로 x 세로)'**를 제한합니다. 원본 이미지 해상도가 너무 클 경우, 적절한 값으로 리사이징하여 메모리 부족으로 인한 컨테이너 중단 현상을 방지하고 처리 속도를 높일 수 있습니다.
- **동적 전처리:** `process_all_images.sh` 스크립트는 이제 이미지의 픽셀 수를 자동으로 계산하여, 120만 픽셀 이하인 저해상도 이미지에는 `fitz` 업샘플링을 적용하고, 초과하는 고해상도 이미지에는 적용하지 않아 최적의 결과 품질을 유도합니다.
- **권장 실행 옵션:**
  - **`~/process_all_images.sh -p 12 -m 2000000`**
  - 위 설정은 병렬 작업을 12개로 최대화하면서, 각 이미지 크기를 2백만 픽셀로 제한하여 안정적인 고속 처리를 가능하게 하는 최적의 조합입니다.
