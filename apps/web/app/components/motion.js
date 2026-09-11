'use client';
import {useEffect, useRef, useState} from 'react';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Split text into letters that rise in one after another. Layout is identical to plain text. */
export function Letters({text, delay = 0, step = 0.035, className = ''}) {
  let i = 0;
  return (
    <span className={'letters ' + className}>
      {text.split('').map((ch, k) => {
        const idx = ch === ' ' ? null : i++;
        return ch === ' ' ? (
          <span key={k} className="letter-space">{'\u00a0'}</span>
        ) : (
          <span key={k} className="letter" aria-hidden="true" style={{animationDelay: delay + (idx ?? 0) * step + 's'}}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}

/* A link or button that leans toward the pointer and springs back. */
export function Magnetic({as: Tag = 'a', strength = 0.35, radius = 90, children, className = '', ...rest}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || !matchMedia('(hover: hover)').matches) return;
    let raf;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      const pull = d < radius + Math.max(r.width, r.height) / 2 ? strength : 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = pull ? `translate(${dx * pull}px, ${dy * pull}px)` : '';
      });
    };
    const leave = () => { cancelAnimationFrame(raf); el.style.transform = ''; };
    const zone = el.parentElement || el;
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerleave', leave);
    return () => { zone.removeEventListener('pointermove', move); zone.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, [strength, radius]);
  return <Tag ref={ref} className={'magnetic ' + className} {...rest}>{children}</Tag>;
}

/* Tilt a card toward the pointer while it hovers the stage. */
export function useTilt(max = 6) {
  const stage = useRef(null), card = useRef(null);
  useEffect(() => {
    const s = stage.current, c = card.current;
    if (!s || !c || reduced() || !matchMedia('(hover: hover)').matches) return;
    let raf;
    const move = (e) => {
      const r = s.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        c.style.transform = `rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg)`;
        c.style.transition = 'transform .25s ease-out';
      });
    };
    const leave = () => { cancelAnimationFrame(raf); c.style.transform = ''; c.style.transition = ''; };
    s.addEventListener('pointermove', move);
    s.addEventListener('pointerleave', leave);
    return () => { s.removeEventListener('pointermove', move); s.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, [max]);
  return [stage, card];
}

/* Counts from 0 to `value` the first time it scrolls into view. */
export function CountUp({value, prefix = '', duration = 1400}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(reduced() ? value : 0);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) { setShown(value); return; }
    let raf, started = false;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || started) return;
      started = true;
      const t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / duration);
        setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      io.disconnect();
    }, {threshold: 0.4});
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, duration]);
  return <span ref={ref} className="count-up">{prefix}{shown.toLocaleString('en-US')}</span>;
}

/* Small polyline that draws itself when revealed. Points are raw values, latest last. */
export function Spark({points, width = 120, height = 34, up}) {
  if (!points || points.length < 2) return <svg className="spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" />;
  const min = Math.min(...points), max = Math.max(...points);
  const d = points
    .map((v, i) => `${(i / (points.length - 1)) * width},${height - 2 - ((v - min) / (max - min || 1)) * (height - 4)}`)
    .join(' ');
  const rising = up ?? points[points.length - 1] >= points[0];
  return (
    <svg className={'spark ' + (rising ? 'spark-up' : 'spark-down')} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={d} fill="none" strokeWidth="1.6" pathLength="1" />
      <circle r="2.2" cx={width} cy={height - 2 - ((points[points.length - 1] - min) / (max - min || 1)) * (height - 4)} />
    </svg>
  );
}

/* Live price that ticks from the public snapshot every 20 seconds. */
export function LivePrice({symbol = 'BTCUSDT'}) {
  const [row, setRow] = useState(null);
  const [flash, setFlash] = useState('');
  useEffect(() => {
    let alive = true, last = null;
    const load = () =>
      fetch('/api/markets', {cache: 'no-store'})
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          const m = (d.markets || []).find((x) => x.symbol === symbol);
          if (!m) return;
          if (last !== null && m.price !== last) {
            setFlash(m.price > last ? 'tick-up' : 'tick-down');
            setTimeout(() => alive && setFlash(''), 900);
          }
          last = m.price;
          setRow(m);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [symbol]);
  if (!row) return <span className="live-price" aria-hidden="true"><i /> BTC / USDT · connecting</span>;
  return (
    <span className={'live-price ' + flash} aria-live="off">
      <i /> {symbol.replace('USDT', '')} / USDT <b>{row.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</b>
      <em className={row.change >= 0 ? 'up' : 'down'}>{row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}% 24h</em>
    </span>
  );
}
