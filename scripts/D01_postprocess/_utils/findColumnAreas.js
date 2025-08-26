/**
 * 페이지 내의 블록들을 기반으로 세로 단(column) 영역을 찾습니다.
 * 블록이 5개 미만일 경우, 전체 페이지를 하나의 단으로 간주합니다.
 * @param {Array<Object>} blocks - 페이지 내의 블록 배열. 각 블록은 { bbox: [x1, y1, x2, y2] } 형태를 가집니다.
 * @param {number} pageWidth - 페이지의 전체 너비.
 * @returns {Array<Object>} 각 단의 시작(x1)과 끝(x2) 좌표를 담은 객체 배열. 예: [{ x1: 0, x2: 1200 }, { x1: 1250, x2: 2450 }]
 */
export function findColumnAreas(blocks, pageWidth) {
  if (blocks.length < 5) {
    return [{ x1: 0, x2: pageWidth }];
  }
  let columnAreas = [];
  for (const block of blocks) {
    const blockX1 = block.bbox[0];
    const blockX2 = block.bbox[2];
    const overlappingIndices = [];
    for (let i = 0; i < columnAreas.length; i++) {
      if (
        Math.max(blockX1, columnAreas[i].x1) <
        Math.min(blockX2, columnAreas[i].x2)
      ) {
        overlappingIndices.push(i);
      }
    }
    if (overlappingIndices.length === 0) {
      columnAreas.push({ x1: blockX1, x2: blockX2 });
    } else {
      let mergedX1 = blockX1;
      let mergedX2 = blockX2;
      for (const index of overlappingIndices) {
        mergedX1 = Math.min(mergedX1, columnAreas[index].x1);
        mergedX2 = Math.max(mergedX2, columnAreas[index].x2);
      }
      for (let i = overlappingIndices.length - 1; i >= 0; i--) {
        columnAreas.splice(overlappingIndices[i], 1);
      }
      columnAreas.push({ x1: mergedX1, x2: mergedX2 });
    }
  }
  return columnAreas.sort((a, b) => a.x1 - b.x1);
}
