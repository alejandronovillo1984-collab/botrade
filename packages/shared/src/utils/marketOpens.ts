import type { Candle, MarketOpen } from '../types';

interface MarketOpenConfig {
  timezone: string;
  hour: number;
  minute: number;
}

const MARKET_OPEN_CONFIG: Record<MarketOpen, MarketOpenConfig> = {
  nueva_york: { timezone: 'America/New_York', hour: 9, minute: 30 },
  sidney: { timezone: 'Australia/Sydney', hour: 10, minute: 0 },
  tokio: { timezone: 'Asia/Tokyo', hour: 9, minute: 0 },
};

interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getLocalDateTime(utcMs: number, timeZone: string): LocalDateTime {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(utcMs));
  const lookup = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const hour = parseInt(lookup('hour'), 10) % 24;
  return {
    year: parseInt(lookup('year'), 10),
    month: parseInt(lookup('month'), 10),
    day: parseInt(lookup('day'), 10),
    hour,
    minute: parseInt(lookup('minute'), 10),
    second: parseInt(lookup('second'), 10),
  };
}

function timeZoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const local = getLocalDateTime(utcMs, timeZone);
  const asIfUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second
  );
  return Math.round((asIfUtc - utcMs) / 60000);
}

export function getMarketOpenUtcMs(utcMs: number, marketOpen: MarketOpen): number {
  const config = MARKET_OPEN_CONFIG[marketOpen];
  const local = getLocalDateTime(utcMs, config.timezone);
  const naiveUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    config.hour,
    config.minute,
    0
  );
  const offsetMinutes = timeZoneOffsetMinutes(naiveUtc, config.timezone);
  return naiveUtc - offsetMinutes * 60000;
}

export function isOpeningCandle(candle: Candle, marketOpen: MarketOpen): boolean {
  const openMs = getMarketOpenUtcMs(candle.time * 1000, marketOpen);
  return Math.floor(openMs / 1000) === candle.time;
}
