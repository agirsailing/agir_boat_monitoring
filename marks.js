// Numeric values are the sail_msgs/Mark constants; keep Committee and Pin distinct.
export const MARK_NAMES = Object.freeze({ 0: "Committee", 1: "Pin", 2: "Windward" });

export function validMark(mark) {
  return mark !== null && typeof mark === "object" &&
    Number.isInteger(mark.type) && Object.hasOwn(MARK_NAMES, mark.type) &&
    Number.isFinite(mark.lat) && Math.abs(mark.lat) <= 90 &&
    Number.isFinite(mark.lon) && Math.abs(mark.lon) <= 180;
}

export function validMarks(marks) {
  return Array.isArray(marks) && marks.length <= 3 && marks.every(validMark) &&
    new Set(marks.map(mark => mark.type)).size === marks.length;
}
