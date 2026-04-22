export const GATEWAY_FLOOR_REGEX = /^gateway-tang(?:([A-Za-z]+))?([1-9]\d*)$/;
export const ESP32_AS608_LCD_REGEX = /^esp32-AS608-LCD-tang([1-9]\d*)$/;
export const ESP32_RELAY_REGEX = /^esp32-relay-tang([1-9]\d*)-(\d{2})$/;
export const DEFAULT_GATEWAY_BUILDING_CODE = 'G';

export function normalizeNameToken(value: unknown): string {
  return String(value || '').trim();
}

export function toFloorNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function buildGatewayIdByFloor(
  floor: number,
  buildingCode: string = DEFAULT_GATEWAY_BUILDING_CODE,
): string {
  const normalizedFloor = Number(floor);
  const normalizedBuildingCode = normalizeNameToken(buildingCode)
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();

  return `gateway-tang${normalizedBuildingCode}${normalizedFloor}`;
}

export function buildAs608DeviceIdByFloor(floor: number): string {
  return `esp32-AS608-LCD-tang${floor}`;
}

export function buildRelayDeviceIdByFloor(floor: number, nodeIndex: number): string {
  return `esp32-relay-tang${floor}-${String(nodeIndex).padStart(2, '0')}`;
}

export function isValidGatewayId(value: unknown): boolean {
  const normalized = normalizeNameToken(value);
  return GATEWAY_FLOOR_REGEX.test(normalized);
}

export function isAs608DeviceId(value: unknown): boolean {
  const normalized = normalizeNameToken(value);
  return ESP32_AS608_LCD_REGEX.test(normalized);
}

export function isRelayDeviceId(value: unknown): boolean {
  const normalized = normalizeNameToken(value);
  return ESP32_RELAY_REGEX.test(normalized);
}

export function isValidEsp32DeviceId(value: unknown): boolean {
  return isAs608DeviceId(value) || isRelayDeviceId(value);
}

export function extractFloorFromGatewayId(value: unknown): number | null {
  const normalized = normalizeNameToken(value);
  const match = normalized.match(GATEWAY_FLOOR_REGEX);
  if (!match) {
    return null;
  }

  const floor = Number(match[2]);
  return Number.isInteger(floor) && floor > 0 ? floor : null;
}

export function extractFloorFromEsp32DeviceId(value: unknown): number | null {
  const normalized = normalizeNameToken(value);

  const as608Match = normalized.match(ESP32_AS608_LCD_REGEX);
  if (as608Match) {
    const floor = Number(as608Match[1]);
    return Number.isInteger(floor) && floor > 0 ? floor : null;
  }

  const relayMatch = normalized.match(ESP32_RELAY_REGEX);
  if (!relayMatch) {
    return null;
  }

  const floor = Number(relayMatch[1]);
  return Number.isInteger(floor) && floor > 0 ? floor : null;
}
