const GATEWAY_FLOOR_REGEX = /^gateway-tang(?:([A-Za-z]+))?([1-9]\d*)$/;
const ESP32_AS608_LCD_REGEX = /^esp32-AS608-LCD-tang([1-9]\d*)$/;
const ESP32_RELAY_REGEX = /^esp32-relay-tang([1-9]\d*)-(\d{2})$/;
const DEFAULT_GATEWAY_BUILDING_CODE = 'G';

function normalizeToken(value) {
  return String(value || '').trim();
}

function isValidGatewayId(value) {
  return GATEWAY_FLOOR_REGEX.test(normalizeToken(value));
}

function isAs608DeviceId(value) {
  return ESP32_AS608_LCD_REGEX.test(normalizeToken(value));
}

function isRelayDeviceId(value) {
  return ESP32_RELAY_REGEX.test(normalizeToken(value));
}

function isValidEsp32DeviceId(value) {
  return isAs608DeviceId(value) || isRelayDeviceId(value);
}

function extractFloorFromGatewayId(value) {
  const match = normalizeToken(value).match(GATEWAY_FLOOR_REGEX);
  if (!match) return null;
  const floor = Number(match[2]);
  return Number.isInteger(floor) && floor > 0 ? floor : null;
}

function extractFloorFromEsp32DeviceId(value) {
  const normalized = normalizeToken(value);

  const as608Match = normalized.match(ESP32_AS608_LCD_REGEX);
  if (as608Match) {
    const floor = Number(as608Match[1]);
    return Number.isInteger(floor) && floor > 0 ? floor : null;
  }

  const relayMatch = normalized.match(ESP32_RELAY_REGEX);
  if (!relayMatch) return null;

  const floor = Number(relayMatch[1]);
  return Number.isInteger(floor) && floor > 0 ? floor : null;
}

function buildGatewayIdByFloor(floor, buildingCode = DEFAULT_GATEWAY_BUILDING_CODE) {
  const normalizedFloor = Number(floor);
  const normalizedBuildingCode = normalizeToken(buildingCode)
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  return `gateway-tang${normalizedBuildingCode}${normalizedFloor}`;
}

function buildAs608DeviceIdByFloor(floor) {
  return `esp32-AS608-LCD-tang${Number(floor)}`;
}

function buildRelayDeviceIdByFloor(floor, nodeIndex) {
  return `esp32-relay-tang${Number(floor)}-${String(nodeIndex).padStart(2, '0')}`;
}

module.exports = {
  GATEWAY_FLOOR_REGEX,
  ESP32_AS608_LCD_REGEX,
  ESP32_RELAY_REGEX,
  isValidGatewayId,
  isAs608DeviceId,
  isRelayDeviceId,
  isValidEsp32DeviceId,
  extractFloorFromGatewayId,
  extractFloorFromEsp32DeviceId,
  buildGatewayIdByFloor,
  buildAs608DeviceIdByFloor,
  buildRelayDeviceIdByFloor,
};
