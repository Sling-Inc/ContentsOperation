/**
 * 여러 개의 Bbox를 모두 포함하는 가장 작은 하나의 Bbox(Union Bbox)를 계산합니다.
 * @param {Array<Array<number>>} bboxes - Bbox 배열. 각 Bbox는 [x1, y1, x2, y2] 형태입니다.
 * @returns {Array<number>} 모든 Bbox를 포함하는 Union Bbox. [x1, y1, x2, y2] 형태입니다.
 */
export function getUnionBbox(bboxes) {
  if (!bboxes || bboxes.length === 0) {
    return [0, 0, 0, 0];
  }
  const x1 = Math.min(...bboxes.map((b) => b[0]));
  const y1 = Math.min(...bboxes.map((b) => b[1]));
  const x2 = Math.max(...bboxes.map((b) => b[2]));
  const y2 = Math.max(...bboxes.map((b) => b[3]));
  return [x1, y1, x2, y2];
}
