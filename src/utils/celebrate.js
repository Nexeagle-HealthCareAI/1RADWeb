// Lightweight, dependency-free celebration burst.
//
// Spawns a transient full-screen canvas, animates confetti particles, then
// removes itself. No npm dependency and no network, so it runs in the desktop
// (Electron) build too. Call it imperatively on a happy moment:
//   celebrate();          // festive burst — booking, payment, approval
//   celebrate('calm');    // softer, reassuring burst — rejection (stay positive)
//   celebrate('sparkle'); // cool wide shimmer — an edit/update saved

const PRESETS = {
  confetti: {
    colors: ['#16a34a', '#0f52ba', '#f59e0b', '#e11d48', '#7c3aed', '#10b981'],
    count: 130,
    spread: 75,
    power: 15,
  },
  calm: {
    colors: ['#60a5fa', '#93c5fd', '#a7f3d0', '#bfdbfe'],
    count: 55,
    spread: 55,
    power: 10,
  },
  // A distinct, cooler shimmer for "saved an edit" — wider fan + blues/violets/
  // gold, so an update reads differently from a fresh booking's confetti.
  sparkle: {
    colors: ['#0f52ba', '#38bdf8', '#a78bfa', '#22d3ee', '#fcd34d'],
    count: 95,
    spread: 120,
    power: 13,
  },
};

export function celebrate(variant = 'confetti') {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  // Respect users who prefer reduced motion.
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch { /* ignore */ }

  const cfg = PRESETS[variant] || PRESETS.confetti;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '2147483647',
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Fan upward from just below centre, like a popper.
  const originX = W / 2;
  const originY = H * 0.78;
  const particles = Array.from({ length: cfg.count }, () => {
    const angle = (-90 + (Math.random() - 0.5) * cfg.spread) * (Math.PI / 180);
    const speed = cfg.power * (0.5 + Math.random());
    return {
      x: originX, y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      color: cfg.colors[(Math.random() * cfg.colors.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
    };
  });

  const GRAVITY = 0.32;
  const DRAG = 0.992;
  const DURATION = 1400;
  const start = performance.now();

  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.vx *= DRAG;
      p.vy = p.vy * DRAG + GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = Math.max(0, 1 - elapsed / DURATION);
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (elapsed < DURATION) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(frame);
}
