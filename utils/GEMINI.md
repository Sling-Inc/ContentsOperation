# Utils

이 디렉토리에는 프로젝트 전반에서 사용되는 재사용 가능한 유틸리티 모듈들이 포함되어 있습니다.

---

# Logger (`utils/logger.js`)

이 프로젝트를 위한 커스텀 로거 모듈입니다. 콘솔 출력과 파일 로깅을 모두 처리합니다.

## 주요 기능

- **다양한 로그 레벨**: `error`, `warn`, `notice`, `info`, `debug`, `section`, `log` 등 다양한 로그 레벨을 지원합니다.
- **콘솔 출력**: 각 로그 레벨에 따라 다른 색상으로 콘솔에 로그를 출력하여 가독성을 높였습니다.
- **파일 로깅**: 모든 로그는 프로젝트 루트의 `_logs` 디렉토리에 파일로 자동 저장됩니다.
- **자동 파일명 생성**: 로그 파일은 `[타임스탬프]_[스크립트명].log` 형식으로 생성되어 어떤 스크립트에서 발생한 로그인지 쉽게 파악할 수 있습니다.
- **섹션 기능**: `Logger.section()`과 `Logger.endSection()`을 사용하여 로그를 논리적인 블록으로 그룹화하고 들여쓰기를 적용할 수 있어, 복잡한 작업의 흐름을 쉽게 추적할 수 있습니다.

## 사용법

`Logger`는 싱글턴 인스턴스로 export 되므로, 어떤 파일에서든 바로 가져와서 사용할 수 있습니다.

```javascript
import { Logger } from '#root/utils/logger.js';

Logger.section("데이터 처리 시작");
// ...
Logger.close();
```

---

# PDF 유틸리티 (`utils/pdf.js`)

PDF 파일을 처리하기 위한 유틸리티 함수 모음입니다.

## `convertToImages(pdfFilePath, outputDir, dpi)`

지정된 PDF 파일의 모든 페이지를 이미지로 변환하여 출력 디렉토리에 저장합니다.

### 파라미터

- `pdfFilePath` (string): 변환할 PDF 파일의 전체 경로.
- `outputDir` (string): 생성된 이미지를 저장할 디렉토리 경로.
- `dpi` (number): 변환할 이미지의 DPI (dots per inch).

### 반환값

- `Promise<Array<{page: number, path: string}> | null>`: 성공 시, 각 페이지 번호와 저장된 이미지 경로가 담긴 객체 배열을 반환합니다. 실패 시 `null`을 반환합니다.

---

# Google Cloud Vision 유틸리티 (`utils/cloudVision.js`)

Google Cloud Vision API를 사용하여 이미지에서 텍스트를 추출(OCR)하고 결과를 시각화하는 함수 모음입니다.

## `performGoogleDocumentOCR(imageBuffer)`

이미지 버퍼를 받아 문서에 최적화된 OCR을 수행하고, 텍스트와 상세 구조 정보를 반환합니다.

### 파라미터

- `imageBuffer` (Buffer): OCR을 수행할 이미지의 Buffer 객체.

### 반환값

- `Promise<Object | null>`: 성공 시, `basicTexts`와 `fullTextAnnotation`을 포함하는 객체를 반환합니다. 실패 시 `null`을 반환합니다.

## `visualizeOcrResults(imageBuffer, ocrResult)`

`performGoogleDocumentOCR`의 결과를 받아, 원본 이미지 위에 감지된 모든 '단어'의 바운딩 박스를 그려 시각화합니다.

### 파라미터

- `imageBuffer` (Buffer): 원본 이미지의 Buffer 객체.
- `ocrResult` (Object): `performGoogleDocumentOCR`로부터 반환된 결과 객체.

### 반환값

- `Promise<Buffer|null>`: 바운딩 박스가 그려진 새로운 이미지의 Buffer를 반환합니다. 실패 시 `null`을 반환합니다.

---

# 레이아웃 처리 유틸리티 (`utils/layoutProcessor.js`)

`dots.ocr`의 레이아웃 정보와 `cloudVision`의 OCR 정보를 병합하고 시각화하는 함수 모음입니다.

## `mergeLayoutAndOcr(layoutData, ocrData, layoutDimensions, ocrDimensions)`

해상도가 다른 두 이미지에서 추출한 레이아웃과 OCR 결과를 병합합니다. 레이아웃의 좌표를 OCR 이미지 기준으로 스케일링하고, 각 레이아웃에 포함된 텍스트를 찾아 합칩니다.

### 파라미터

- `layoutData` (Array): `A03` 결과 JSON의 `results` 필드에 해당하는, 바운딩 박스 정보가 담긴 배열.
- `ocrData` (Object): Google Vision 결과 JSON의 `fullTextAnnotation` 객체.
- `layoutDimensions` (Object): 레이아웃을 추출한 저해상도 이미지의 크기 (`{width, height}`).
- `ocrDimensions` (Object): OCR을 수행한 고해상도 이미지의 크기 (`{width, height}`).

### 반환값

- `Promise<Array<Object>>`: 각 요소가 `{bbox, text}` 형태를 가지는 병합된 레이아웃 정보 배열을 반환합니다.

## `visualizeMergedLayout(imagePathOrBuffer, mergedData)`

`mergeLayoutAndOcr`로 생성된 병합 데이터를 사용하여, 원본 고해상도 이미지 위에 각 '레이아웃'의 바운딩 박스를 그려 시각화합니다.

### 파라미터

- `imagePathOrBuffer` (string | Buffer): 시각화의 바탕이 될 고해상도 원본 이미지의 경로 또는 버퍼.
- `mergedData` (Array): `mergeLayoutAndOcr`로부터 반환된 병합 데이터 객체.

### 반환값

- `Promise<Buffer|null>`: 바운딩 박스가 그려진 새로운 이미지의 Buffer를 반환합니다. 실패 시 `null`을 반환합니다.

---

# Gemini LLM 유틸리티 (`utils/gemini.js`)

Google Gemini LLM API 호출을 안정적으로 수행하기 위한 래퍼(wrapper) 함수입니다.

## `runGemini(generateContentParameters, isDebug)`

Gemini API에 콘텐츠 생성 요청을 보냅니다. 자동 재시도, 안전한 JSON 파싱, 상세 디버깅 등 안정성을 위한 기능이 포함되어 있습니다.

### 파라미터

- `generateContentParameters` (Object): `@google/genai`의 `generateContent` 메소드에 전달될 파라미터 객체.
- `isDebug` (boolean): `true`로 설정 시 상세한 디버그 로그를 출력합니다.

### 반환값

- `Promise<Object>`: `{ response, tokenUsage, timeUsage }` 형태의 객체를 반환합니다.

### 인증

`.env` 파일에 `GOOGLE_API_KEY`가 정의되어 있어야 합니다.
