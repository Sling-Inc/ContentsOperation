import { ImageAnnotatorClient } from '@google-cloud/vision';
import sharp from 'sharp';

// Vision 클라이언트 초기화
const visionClient = new ImageAnnotatorClient();

/**
 * 문서에 최적화된 OCR을 수행하고 상세한 구조 정보를 반환합니다.
 * @param {Buffer} imageBuffer - 이미지 파일의 Buffer 객체
 * @returns {Promise<{basicTexts: Array<Object>, fullTextAnnotation: Object}|null>} 텍스트 정보와 구조화된 문서 정보, 실패 시 null
 */
export async function performGoogleDocumentOCR(imageBuffer) {
  try {
    const [result] = await visionClient.annotateImage({
      image: { content: imageBuffer },
      features: [
        {
          type: 'DOCUMENT_TEXT_DETECTION',
        },
      ],
      imageContext: {
        languageHints: ['ko'],
      },
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    // 기본 텍스트 어노테이션
    const textAnnotations = result.textAnnotations || [];
    const basicTexts = textAnnotations.map((text) => ({
      text: text.description,
      vertices: text.boundingPoly.vertices,
    }));

    // 전체 문서 구조 정보
    const fullTextAnnotation = result.fullTextAnnotation || null;

    // 구조화된 결과 반환
    return {
      basicTexts,
      fullTextAnnotation,
    };
  } catch (error) {
    console.error('Google Vision API Error:', error);
    return null;
  }
}

/**
 * OCR 결과를 바탕으로 원본 이미지에 바운딩 박스를 그려 시각화합니다.
 * @param {Buffer} imageBuffer - 원본 이미지의 Buffer 객체
 * @param {Object} ocrResult - performGoogleDocumentOCR 함수의 반환 객체
 * @returns {Promise<Buffer|null>} 바운딩 박스가 그려진 이미지의 Buffer 객체, 실패 시 null
 */
export async function visualizeOcrResults(imageBuffer, ocrResult) {
  if (!ocrResult || !ocrResult.fullTextAnnotation || !ocrResult.fullTextAnnotation.pages) {
    console.error('Invalid OCR result provided for visualization.');
    return null;
  }

  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    const svgElements = [];
    // 페이지, 블록, 문단, 단어를 순회하며 모든 단어의 바운딩 박스를 찾습니다.
    ocrResult.fullTextAnnotation.pages.forEach(page => {
      page.blocks.forEach(block => {
        block.paragraphs.forEach(paragraph => {
          paragraph.words.forEach(word => {
            const vertices = word.boundingBox.vertices;
            const points = vertices.map(v => `${v.x},${v.y}`).join(' ');
            svgElements.push(
              `<polygon points="${points}" style="fill:none;stroke:red;stroke-width:2" />`
            );
          });
        });
      });
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
