export const PORT = Number(process.env.PORT) || 3000;

export const WS_PATH = '/ws/v1';
export const MAX_PAYLOAD = 16384;
export const IDENTIFY_TIMEOUT_MS = Number(process.env.WS_IDENTIFY_TIMEOUT_MS) || 10_000;
export const PING_INTERVAL_MS = Number(process.env.WS_PING_INTERVAL_MS) || 30_000;
