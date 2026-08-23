export interface GuideConnectorPoint {
  endX: number;
  y: number;
}

export interface GuidePathGeometry {
  connectors: readonly GuideConnectorPoint[];
  endY: number;
  spineX: number;
  startY: number;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const middleValue = sorted[middle];
  if (middleValue === undefined) {
    return null;
  }
  if (sorted.length % 2 === 1) {
    return middleValue;
  }
  const precedingValue = sorted[middle - 1];
  return precedingValue === undefined
    ? middleValue
    : (precedingValue + middleValue) / 2;
}

export function buildGuidePath({
  connectors,
  endY,
  spineX,
  startY,
}: GuidePathGeometry): string {
  const commands = [
    `M ${formatCoordinate(spineX)} ${formatCoordinate(startY)}`,
    `V ${formatCoordinate(endY)}`,
  ];
  for (const connector of connectors) {
    commands.push(
      `M ${formatCoordinate(spineX)} ${formatCoordinate(connector.y)}`,
      `H ${formatCoordinate(connector.endX)}`,
    );
  }
  return commands.join(" ");
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
