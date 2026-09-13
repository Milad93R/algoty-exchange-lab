"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
} from "lightweight-charts";
import { CHART_TIMEFRAME_DETAILS } from "./market-config";

const UP = "#217d68";
const DOWN = "#d65b43";

function chartNumber(value, digits = 2) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function unixTime(value) {
  const numeric = Number(value);
  return Math.floor(numeric > 10_000_000_000 ? numeric / 1000 : numeric);
}

function normalizeRows(rows) {
  const unique = new Map();
  for (const row of rows) {
    if (
      !row ||
      !["time", "open", "high", "low", "close", "volume"].every((key) =>
        Number.isFinite(Number(row[key])),
      )
    ) {
      continue;
    }
    const time = unixTime(row.time);
    unique.set(time, {
      time,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      closed: row.closed !== false,
    });
  }
  return [...unique.values()].sort((left, right) => left.time - right.time);
}

export function barsFor(rows = [], timeframe = "1m", sourceTimeframe = "1m") {
  const clean = normalizeRows(rows);
  const target = CHART_TIMEFRAME_DETAILS[timeframe]?.durationMs;
  const source = CHART_TIMEFRAME_DETAILS[sourceTimeframe]?.durationMs;
  if (!target || !source || target <= source) return clean;

  const targetSeconds = target / 1000;
  const groups = new Map();
  for (const row of clean) {
    const bucket = Math.floor(row.time / targetSeconds) * targetSeconds;
    const aggregate = groups.get(bucket);
    if (!aggregate) {
      groups.set(bucket, { ...row, time: bucket });
      continue;
    }
    aggregate.high = Math.max(aggregate.high, row.high);
    aggregate.low = Math.min(aggregate.low, row.low);
    aggregate.close = row.close;
    aggregate.volume += row.volume;
    aggregate.closed = aggregate.closed && row.closed;
  }
  return [...groups.values()];
}

function movingAverage(rows, period = 20) {
  let sum = 0;
  return rows.flatMap((row, index) => {
    sum += row.close;
    if (index >= period) sum -= rows[index - period].close;
    if (index < period - 1) return [];
    return [{ time: row.time, value: sum / period }];
  });
}

function chartTime(time, timeframe) {
  const date = new Date(Number(time) * 1000);
  const dateOnly = timeframe === "1d" || timeframe === "1w";
  return date.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: dateOnly ? "numeric" : undefined,
    hour: dateOnly ? undefined : "2-digit",
    minute: dateOnly ? undefined : "2-digit",
    hour12: false,
  });
}

export default function MarketChart({
  rows = [],
  timeframe = "1m",
  sourceTimeframe = "1m",
  level,
  error,
  onLoadOlder,
  loadingOlder = false,
  hasMore = false,
  logarithmic,
  onLogarithmicChange,
}) {
  const hostRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const averageSeriesRef = useRef(null);
  const levelLineRef = useRef(null);
  const dataRef = useRef([]);
  const loadOlderRef = useRef(onLoadOlder);
  const loadingOlderRef = useRef(loadingOlder);
  const hasMoreRef = useRef(hasMore);
  const [hovered, setHovered] = useState(null);
  const [showAverage, setShowAverage] = useState(false);
  const [localLogarithmic, setLocalLogarithmic] = useState(true);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const logarithmicScale = logarithmic ?? localLogarithmic;

  const data = useMemo(
    () => barsFor(rows, timeframe, sourceTimeframe),
    [rows, timeframe, sourceTimeframe],
  );
  const active = hovered || data.at(-1) || null;

  loadOlderRef.current = onLoadOlder;
  loadingOlderRef.current = loadingOlder;
  hasMoreRef.current = hasMore;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      width: host.clientWidth,
      height: host.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#faf9f4" },
        textColor: "#7c8478",
        fontFamily: "Arial, sans-serif",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#e9eae4", style: LineStyle.Dotted },
        horzLines: { color: "#e1e3dc", style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#8b9481",
          style: LineStyle.Dashed,
          width: 1,
          labelBackgroundColor: "#465247",
        },
        horzLine: {
          color: "#8b9481",
          style: LineStyle.Dashed,
          width: 1,
          labelBackgroundColor: "#465247",
        },
      },
      rightPriceScale: {
        borderColor: "#d6d9d0",
        mode: logarithmicScale
          ? PriceScaleMode.Logarithmic
          : PriceScaleMode.Normal,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: "#d6d9d0",
        timeVisible: timeframe !== "1d" && timeframe !== "1w",
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 7,
        minBarSpacing: 2,
        shiftVisibleRangeOnNewBar: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      localization: { locale: "en-US" },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineColor: "#728578",
      priceLineStyle: LineStyle.Dashed,
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      visible: false,
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    const average = chart.addSeries(LineSeries, {
      color: "#c28a30",
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });

    const handleCrosshair = (parameter) => {
      const row = parameter.seriesData.get(candles);
      setHovered(row && "open" in row ? row : null);
    };
    const handleRange = (range) => {
      if (!range) return;
      const info = candles.barsInLogicalRange(range);
      if (!info) return;
      setAwayFromLatest(info.barsAfter > 4);
      if (
        info.barsBefore < 100 &&
        hasMoreRef.current &&
        !loadingOlderRef.current &&
        loadOlderRef.current
      ) {
        void loadOlderRef.current();
      }
    };
    chart.subscribeCrosshairMove(handleCrosshair);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRange);

    const observer = new ResizeObserver(() => {
      if (host.clientWidth > 0 && host.clientHeight > 0) {
        chart.resize(host.clientWidth, host.clientHeight);
      }
    });
    observer.observe(host);
    chartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;
    averageSeriesRef.current = average;

    return () => {
      observer.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshair);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRange);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      averageSeriesRef.current = null;
      dataRef.current = [];
    };
  }, [timeframe]);

  useEffect(() => {
    chartRef.current?.priceScale("right").applyOptions({
      mode: logarithmicScale
        ? PriceScaleMode.Logarithmic
        : PriceScaleMode.Normal,
    });
  }, [logarithmicScale]);

  useEffect(() => {
    const chart = chartRef.current;
    const candles = candleSeriesRef.current;
    const volume = volumeSeriesRef.current;
    const average = averageSeriesRef.current;
    if (!chart || !candles || !volume || !average || !data.length) return;

    const previous = dataRef.current;
    const prepended = previous.length > 0 && data[0].time < previous[0].time;
    const visibleRange = prepended ? chart.timeScale().getVisibleRange() : null;
    candles.setData(data);
    volume.setData(
      data.map((row) => ({
        time: row.time,
        value: row.volume,
        color: row.close >= row.open ? "#217d6835" : "#d65b4335",
      })),
    );
    average.setData(showAverage ? movingAverage(data) : []);

    if (previous.length === 0) {
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.length - 120),
        to: data.length + 5,
      });
    } else if (visibleRange) {
      chart.timeScale().setVisibleRange(visibleRange);
    }
    dataRef.current = data;
  }, [data, showAverage]);

  useEffect(() => {
    const candles = candleSeriesRef.current;
    if (!candles) return;
    if (levelLineRef.current) {
      candles.removePriceLine(levelLineRef.current);
      levelLineRef.current = null;
    }
    if (Number.isFinite(Number(level)) && Number(level) > 0) {
      levelLineRef.current = candles.createPriceLine({
        price: Number(level),
        color: "#e6653e",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Order",
      });
    }
  }, [level, data.length]);

  return (
    <div className="candle-wrap">
      <div className="chart-tools">
        <span>
          {active ? chartTime(active.time, timeframe) : "—"} UTC
          <b>O</b> {active ? chartNumber(active.open) : "—"}
          <b>H</b> {active ? chartNumber(active.high) : "—"}
          <b>L</b> {active ? chartNumber(active.low) : "—"}
          <b>C</b> {active ? chartNumber(active.close) : "—"}
        </span>
        <div className="chart-actions">
          <button
            type="button"
            className={logarithmicScale ? "on" : ""}
            aria-label="Logarithmic price scale"
            aria-pressed={logarithmicScale}
            onClick={() =>
              onLogarithmicChange
                ? onLogarithmicChange(!logarithmicScale)
                : setLocalLogarithmic((value) => !value)
            }
          >
            LOG
          </button>
          <button
            type="button"
            className={showAverage ? "on" : ""}
            aria-pressed={showAverage}
            onClick={() => setShowAverage((value) => !value)}
          >
            SMA 20
          </button>
          <button
            type="button"
            className={awayFromLatest ? "chart-latest is-away" : "chart-latest"}
            disabled={!awayFromLatest}
            onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
          >
            Latest
          </button>
        </div>
      </div>
      <div
        className="market-chart-stage"
        role="img"
        aria-label="Interactive live candlestick chart"
        data-testid="market-chart"
        data-timeframe={timeframe}
        data-price-scale={logarithmicScale ? "logarithmic" : "linear"}
        data-candles={data.length}
        data-loaded-candles={data.length}
      >
        <div ref={hostRef} className="market-chart-canvas" />
        {!data.length && (
          <div className="chart-skeleton chart-skeleton-overlay">
            {error || `Loading ${timeframe} candles`}
            <span />
          </div>
        )}
        {loadingOlder && (
          <span className="chart-history-state" role="status">
            Loading earlier bars…
          </span>
        )}
      </div>
      <div className="chart-bottom">
        <span>
          BINANCE · {timeframe.toUpperCase()} · {data.length.toLocaleString("en-US")} BARS
        </span>
        <span className={error ? "chart-history-error" : ""}>
          {error
            ? error
            : loadingOlder
              ? "FETCHING HISTORY"
              : hasMore
                ? "DRAG BACK TO LOAD MORE"
                : "EARLIEST AVAILABLE BAR"}
        </span>
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer"
        >
          CHARTS BY TRADINGVIEW ↗
        </a>
      </div>
    </div>
  );
}
