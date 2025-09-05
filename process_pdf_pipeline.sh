#!/bin/bash

# PDF 처리 파이프라인 스크립트
# 사용법: ./process_pdf_pipeline.sh <원안지_PDF_경로> <답안지_PDF_경로>
# 예시: ./process_pdf_pipeline.sh "/path/to/exam.pdf" "/path/to/answer.pdf"

set -e  # 오류 발생시 스크립트 종료

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 인수 확인
if [ $# -ne 2 ]; then
    log_error "사용법: $0 <원안지_PDF_경로> <답안지_PDF_경로>"
    exit 1
fi

EXAM_PDF="$1"
ANSWER_PDF="$2"

# PDF 파일 존재 확인
if [ ! -f "$EXAM_PDF" ]; then
    log_error "원안지 PDF 파일을 찾을 수 없습니다: $EXAM_PDF"
    exit 1
fi

if [ ! -f "$ANSWER_PDF" ]; then
    log_error "답안지 PDF 파일을 찾을 수 없습니다: $ANSWER_PDF"
    exit 1
fi

# 스크립트 디렉토리 경로
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# PDF 파일명에서 확장자 제거하여 작업 폴더명 생성
EXAM_NAME=$(basename "$EXAM_PDF" .pdf)
ANSWER_NAME=$(basename "$ANSWER_PDF" .pdf)

# 작업 폴더 경로
WORKSPACE_DIR="$SCRIPT_DIR/workspace_$EXAM_NAME"

log_info "작업 폴더: $WORKSPACE_DIR"

# 작업 폴더 생성
mkdir -p "$WORKSPACE_DIR/temp_input"
mkdir -p "$WORKSPACE_DIR/temp_answers"

# 원안지 PDF만 작업 폴더로 복사 (이미지 변환용)
log_info "원안지 PDF를 작업 폴더로 복사 중..."
cp "$EXAM_PDF" "$WORKSPACE_DIR/temp_input/"

# 답안지 PDF는 별도 폴더에 저장 (정답 추출용)
log_info "답안지 PDF를 별도 폴더에 저장 중..."
cp "$ANSWER_PDF" "$WORKSPACE_DIR/temp_answers/"

log_success "PDF 파일 복사 완료"

# A01. PDF를 이미지로 변환 (레이아웃 분석용 - 저해상도)
log_info "A01: PDF를 이미지로 변환 (레이아웃 분석용 - 150dpi)"
node "$SCRIPT_DIR/scripts/A01_convertPdfToImage/index.js" \
    "$WORKSPACE_DIR/temp_input" \
    "$WORKSPACE_DIR/A01_images_layout/150dpi" \
    150

log_success "A01 완료"

# A01. PDF를 이미지로 변환 (OCR용 - 고해상도)
log_info "A01: PDF를 이미지로 변환 (OCR용 - 420dpi)"
node "$SCRIPT_DIR/scripts/A01_convertPdfToImage/index.js" \
    "$WORKSPACE_DIR/temp_input" \
    "$WORKSPACE_DIR/A01_images_ocr/420dpi" \
    420

log_success "A01 OCR용 완료"

# A02. dotsOCR 레이아웃 분석
log_info "A02: dotsOCR 레이아웃 분석"
log_info "VM에 이미지 업로드 중..."
# 한글 파일명 처리를 위해 find 명령어 사용
find "$WORKSPACE_DIR/A01_images_layout" -type d -name "*" | while read -r dir; do
    if [ "$dir" != "$WORKSPACE_DIR/A01_images_layout" ]; then
        gcloud compute scp --recurse "$dir" dots-ocr-l4-test-vm:~/input/ --zone=asia-northeast3-a
    fi
done

log_info "VM에서 dotsOCR 분석 실행 중..."
gcloud compute ssh dots-ocr-l4-test-vm --zone=asia-northeast3-a --command="~/process_all_images.sh -p 8 -m 2000000"

log_info "A02 결과 다운로드 중..."
bash "$SCRIPT_DIR/scripts/A02_dotsocr/download_results.sh" -o "$WORKSPACE_DIR/A02_dotsocr_results"

log_success "A02 완료"

# A03. 최적 레이아웃 선택
log_info "A03: 최적 레이아웃 선택"
node "$SCRIPT_DIR/scripts/A03_selectOptimumLayout/index.js" \
    "$WORKSPACE_DIR/A02_dotsocr_results" \
    "$WORKSPACE_DIR/A01_images_layout" \
    "$WORKSPACE_DIR/A03_optimum_layout"

log_success "A03 완료"

# B01. Cloud Vision OCR
log_info "B01: Cloud Vision OCR"
node "$SCRIPT_DIR/scripts/B01_cloudVisionOCR/index.js" \
    "$WORKSPACE_DIR/A01_images_ocr/420dpi" \
    "$WORKSPACE_DIR/B01_cloudVision_results" \
    --debug

log_success "B01 완료"

# C01. 레이아웃과 OCR 결과 병합
log_info "C01: 레이아웃과 OCR 결과 병합"
node "$SCRIPT_DIR/scripts/C01_mergeResults/index.js" \
    "$WORKSPACE_DIR/A03_optimum_layout" \
    "$WORKSPACE_DIR/B01_cloudVision_results" \
    "$WORKSPACE_DIR/A01_images_ocr/420dpi" \
    "$WORKSPACE_DIR/C01_merged_results" \
    --debug

log_success "C01 완료"

# C02. LLM을 이용한 최종 분석 (naesin)
log_info "C02: LLM을 이용한 최종 분석 (naesin)"
node "$SCRIPT_DIR/scripts/C02_llmClassification/index.js" \
    "$WORKSPACE_DIR/C01_merged_results" \
    "$WORKSPACE_DIR/A01_images_ocr/420dpi" \
    "$WORKSPACE_DIR/C02_llm_classification_results" \
    --debug \
    --examType naesin

log_success "C02 완료"

# C03. LLM 결과 검증
log_info "C03: LLM 결과 검증"
node "$SCRIPT_DIR/scripts/C03_CheckllmResult/index.js" \
    "$WORKSPACE_DIR/C02_llm_classification_results" \
    "$WORKSPACE_DIR/C01_merged_results"

log_success "C03 완료"

# D01 A01. 경계 상자 생성
log_info "D01 A01: 경계 상자 생성"
node "$SCRIPT_DIR/scripts/D01_postprocess/naesin/A01_generateBbox.js" \
    "$WORKSPACE_DIR/C02_llm_classification_results" \
    "$WORKSPACE_DIR/C01_merged_results" \
    "$WORKSPACE_DIR/A01_images_ocr/420dpi" \
    "$WORKSPACE_DIR/D01_postprocess_results" \
    --debug

log_success "D01 A01 완료"

# D01 A02. 이미지 추출
log_info "D01 A02: 이미지 추출"
node "$SCRIPT_DIR/scripts/D01_postprocess/naesin/A02_cropImages.js" \
    "$WORKSPACE_DIR/D01_postprocess_results" \
    "$WORKSPACE_DIR/A01_images_ocr/420dpi"

log_success "D01 A02 완료"

# D01 B01. 정답 추출
log_info "D01 B01: 정답 추출"
node "$SCRIPT_DIR/scripts/D01_postprocess/naesin/B01_llmExtractAnswer.js" \
    "$WORKSPACE_DIR/C02_llm_classification_results" \
    "$WORKSPACE_DIR/temp_answers" \
    "$WORKSPACE_DIR/D01_postprocess_results" \
    --debug

log_success "D01 B01 완료"

# VM 정리
log_info "VM 정리 중..."
gcloud compute ssh dots-ocr-l4-test-vm --zone=asia-northeast3-a --command="sudo rm -rf ~/input/* ~/result/*" || log_warning "VM 정리 실패 (무시 가능)"

log_success "🎉 모든 단계가 성공적으로 완료되었습니다!"
log_info "최종 결과물 위치: $WORKSPACE_DIR/D01_postprocess_results/"
log_info "  - $EXAM_NAME/: 원안지 처리 결과 (개별 문제 이미지 포함)"
log_info "  - $ANSWER_NAME/: 답안지 처리 결과 (정답 추출 결과 포함)"
log_info "답안지 PDF 위치: $WORKSPACE_DIR/temp_answers/$ANSWER_NAME.pdf"