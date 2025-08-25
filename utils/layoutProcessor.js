import sharp from 'sharp';

/**
 * 두 좌표(점)가 주어졌을 때, 특정 점이 사각형 내에 있는지 확인합니다.
 * @param {number} px - 점의 x 좌표
 * @param {number} py - 점의 y 좌표
 * @param {Array<number>} box - 사각형의 [x1, y1, x2, y2] 좌표
 * @returns {boolean} 점이 사각형 내에 있으면 true
 */
function isPointInBox(px, py, box) {
  const [x1, y1, x2, y2] = box;
  return px >= x1 && px <= x2 && py >= y1 && py <= y2;
}

/**
 * Google Vision OCR 결과에서 단어의 중심점 좌표를 계산합니다.
 * @param {Object} word - OCR 결과의 단어 객체
 * @returns {{x: number, y: number}} 단어의 중심점 좌표
 */
function getWordCenter(word) {
  const vertices = word.boundingBox.vertices;
  const x = (vertices[0].x + vertices[1].x + vertices[2].x + vertices[3].x) / 4;
  const y = (vertices[0].y + vertices[1].y + vertices[2].y + vertices[3].y) / 4;
  return { x, y };
}

/**
 * dots.ocr 레이아웃과 Google Vision OCR 결과를 병합합니다.
 * 레이아웃 좌표를 OCR 이미지 크기에 맞게 스케일링하고, 각 레이아웃에 포함된 텍스트를 찾습니다.
 *
 * @param {Array<Object>} layoutData - dots.ocr 결과 (e.g., [{ bbox, category }])
 * @param {Object} ocrData - Google Vision OCR 결과 (fullTextAnnotation)
 * @param {{width: number, height: number}} layoutDimensions - 레이아웃 이미지의 크기
 * @param {{width: number, height: number}} ocrDimensions - OCR 이미지의 크기
 * @returns {Array<{bbox: Array<number>, text: string}>} 병합된 결과
 */
export function mergeLayoutAndOcr(layoutData, ocrData, layoutDimensions, ocrDimensions) {
  const scaleX = ocrDimensions.width / layoutDimensions.width;
  const scaleY = ocrDimensions.height / layoutDimensions.height;

  const allWords = [];
  if (ocrData && ocrData.pages) {
    ocrData.pages.forEach(page => {
      page.blocks.forEach(block => {
        block.paragraphs.forEach(paragraph => {
          paragraph.words.forEach(word => {
            const wordText = word.symbols.map(s => s.text).join('');
            allWords.push({
              text: wordText,
              ...word,
            });
          });
        });
      });
    });
  }

  const mergedLayouts = layoutData.map(layout => {
    // 1. 레이아웃의 bbox를 고해상도 OCR 이미지 기준으로 스케일링합니다.
    const scaledBbox = [
      layout.bbox[0] * scaleX,
      layout.bbox[1] * scaleY,
      layout.bbox[2] * scaleX,
      layout.bbox[3] * scaleY,
    ];

    // 2. 스케일링된 bbox 안에 중심점이 포함되는 모든 단어를 찾습니다.
    const containedWords = allWords.filter(word => {
      const center = getWordCenter(word);
      return isPointInBox(center.x, center.y, scaledBbox);
    });

    // 3. 단어들을 텍스트로 조합합니다.
    const text = containedWords.map(word => word.text).join(' ');

    return {
      bbox: scaledBbox,
      text: text,
    };
  });

  return mergedLayouts;
}


/**
 * 병합된 레이아웃 데이터를 기반으로 원본 이미지에 바운딩 박스를 그려 시각화합니다.
 * @param {string | Buffer} imagePathOrBuffer - 원본 고해상도 이미지의 경로 또는 버퍼
 * @param {Array<{bbox: Array<number>, text: string}>} mergedData - mergeLayoutAndOcr 함수의 결과물
 * @returns {Promise<Buffer|null>} 바운딩 박스가 그려진 이미지의 Buffer 객체, 실패 시 null
 */
export async function visualizeMergedLayout(imagePathOrBuffer, mergedData) {
  try {
    const image = sharp(imagePathOrBuffer);
    const metadata = await image.metadata();
    
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
    let colorIndex = 0;

    const svgElements = mergedData.map(item => {
      const [x1, y1, x2, y2] = item.bbox;
      const width = x2 - x1;
      const height = y2 - y1;
      const color = colors[colorIndex % colors.length];
      colorIndex++;

      return `<rect x="${x1}" y="${y1}" width="${width}" height="${height}" style="fill:${color}40; stroke:${color}; stroke-width:3" />`;
    });

    const svgOverlay = `
      <svg width="${metadata.width}" height="${metadata.height}">
        ${svgElements.join('')}
      </svg>
    `;

    const visualizedImageBuffer = await image
      .composite([{ input: Buffer.from(svgOverlay) }])
      .toBuffer();

    return visualizedImageBuffer;
  } catch (error) {
    console.error('Error during visualization:', error);
    return null;
  }
}
