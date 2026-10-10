import React, { useEffect, useRef, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: 'circle' | 'rect' | 'sparkle';
  rotation: number;
  rotationSpeed: number;
}

interface Ring {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  color: string;
  lineWidth: number;
}

interface SubscribeCelebrationProps {
  isActive: boolean;
  buttonRect: DOMRect | null;
  reducedMotion: boolean;
  onComplete: () => void;
}

const PARTICLE_COUNT = 30;
const ANIMATION_DURATION = 850;
const MAX_DPR = 2;

const PALETTE = {
  rose: '#e11d48',
  roseLight: '#fb7185',
  gold: '#f59e0b',
  goldLight: '#fbbf24',
  pearl: '#fef3c7',
  white: '#ffffff',
};

function getRandomColor(): string {
  const colors = [
    PALETTE.rose,
    PALETTE.roseLight,
    PALETTE.gold,
    PALETTE.goldLight,
    PALETTE.pearl,
    PALETTE.white,
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function createParticles(centerX: number, centerY: number): Particle[] {
  const particles: Particle[] = [];
  const shapes: Particle['shape'][] = ['circle', 'rect', 'sparkle'];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = (Math.PI * 2) / PARTICLE_COUNT * i + (Math.random() - 0.5) * 0.4;
    const speed = 1.2 + Math.random() * 2.4;
    const life = 650 + Math.random() * 350;
    const size = 2 + Math.random() * 2.5;

    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.8,
      life,
      maxLife: life,
      size,
      color: getRandomColor(),
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.12,
    });
  }
  return particles;
}

function createRings(centerX: number, centerY: number): Ring[] {
  return [
    { x: centerX, y: centerY, radius: 0, maxRadius: 42, opacity: 0.45, color: PALETTE.rose, lineWidth: 2 },
    { x: centerX, y: centerY, radius: 0, maxRadius: 72, opacity: 0.3, color: PALETTE.gold, lineWidth: 1.5 },
    { x: centerX, y: centerY, radius: 0, maxRadius: 108, opacity: 0.18, color: PALETTE.roseLight, lineWidth: 1 },
  ];
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const progress = 1 - p.life / p.maxLife;
  const eased = 1 - Math.pow(1 - progress, 2.5);
  const currentSize = p.size * (1 - eased * 0.3);
  const currentAlpha = Math.max(0, 1 - eased);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.globalAlpha = currentAlpha * (p.life / p.maxLife);
  ctx.fillStyle = p.color;

  switch (p.shape) {
    case 'circle': {
      ctx.beginPath();
      ctx.arc(0, 0, currentSize, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'rect': {
      const half = currentSize;
      ctx.fillRect(-half, -half, currentSize * 2, currentSize * 2);
      break;
    }
    case 'sparkle': {
      const outer = currentSize;
      const inner = currentSize * 0.35;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const angle = (Math.PI / 2) * i;
        const nextAngle = (Math.PI / 2) * (i + 0.5);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.lineTo(Math.cos(nextAngle) * inner, Math.sin(nextAngle) * inner);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawRing(ctx: CanvasRenderingContext2D, ring: Ring, progress: number): void {
  const eased = 1 - Math.pow(1 - progress, 2);
  const currentRadius = ring.maxRadius * eased;
  const currentAlpha = ring.opacity * (1 - eased);

  if (currentRadius < 1 || currentAlpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = currentAlpha;
  ctx.strokeStyle = ring.color;
  ctx.lineWidth = ring.lineWidth * (1 - eased * 0.5);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(ring.x, ring.y, currentRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCenterFlash(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, progress: number): void {
  if (progress > 0.25) return;

  const flashProgress = progress / 0.25;
  const eased = 1 - Math.pow(1 - flashProgress, 3);
  const radius = 32 * eased;
  const alpha = 0.65 * (1 - eased);

  if (radius < 1) return;

  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
  gradient.addColorStop(0.45, `rgba(249, 115, 22, ${alpha * 0.7})`);
  gradient.addColorStop(1, `rgba(225, 29, 72, 0)`);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export const SubscribeCelebration: React.FC<SubscribeCelebrationProps> = ({
  isActive,
  buttonRect,
  reducedMotion,
  onComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const ringsRef = useRef<Ring[]>([]);
  const hasTriggeredRef = useRef(false);

  const cleanup = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    startTimeRef.current = null;
    particlesRef.current = [];
    ringsRef.current = [];
    hasTriggeredRef.current = false;
  }, []);

  const animate = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (startTimeRef.current === null) {
      startTimeRef.current = timestamp;
    }

    const elapsed = timestamp - startTimeRef.current;
    const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawCenterFlash(ctx, ringsRef.current[0]?.x ?? 0, ringsRef.current[0]?.y ?? 0, progress);
    ringsRef.current.forEach(ring => drawRing(ctx, ring, progress));

    particlesRef.current.forEach(particle => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.04;
      particle.vx *= 0.992;
      particle.rotation += particle.rotationSpeed;
      particle.life -= 16;
      drawParticle(ctx, particle);
    });

    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    const ringsActive = ringsRef.current.some(r => r.radius < r.maxRadius * 0.95);
    if (progress < 1 || particlesRef.current.length > 0 || ringsActive) {
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      cleanup();
      onComplete();
    }
  }, [cleanup, onComplete]);

  useEffect(() => {
    if (!isActive) {
      cleanup();
      return;
    }

    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    if (reducedMotion || !buttonRect) {
      const timer = setTimeout(() => {
        cleanup();
        onComplete();
      }, 120);
      return () => clearTimeout(timer);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const centerX = buttonRect.left + buttonRect.width / 2;
    const centerY = buttonRect.top + buttonRect.height / 2;

    particlesRef.current = createParticles(centerX, centerY);
    ringsRef.current = createRings(centerX, centerY);
    startTimeRef.current = null;
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cleanup();
    };
  }, [isActive, buttonRect, reducedMotion, animate, cleanup, onComplete]);

  if (!isActive && !hasTriggeredRef.current) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[60]"
      style={{ left: 0, top: 0 }}
      aria-hidden="true"
      role="presentation"
    />
  );
};

export default SubscribeCelebration;
