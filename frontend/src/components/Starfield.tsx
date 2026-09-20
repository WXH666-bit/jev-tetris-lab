import { useEffect, useRef } from "react";

/** Decorative only: capped pixel ratio, 30fps, and no work in a hidden tab. */
export function Starfield({ animated, density = 170 }: { animated: boolean; density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 1,
      height = 1,
      frame = 0,
      last = 0,
      time = 0;
    let pointer = { x: 0, y: 0 };
    let seed = 7301;
    const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const stars = Array.from({ length: density }, () => ({
      x: random(),
      y: random(),
      size: 0.45 + random() * 1.25,
      phase: random() * Math.PI * 2,
      depth: 0.3 + random() * 0.7,
    }));
    function draw() {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        const drift =
          animated && !media.matches ? time * 0.0014 * star.depth : 0;
        const x =
          (((star.x * width + pointer.x * star.depth * 12) % width) + width) %
          width;
        const y =
          (((star.y * height - drift + pointer.y * star.depth * 8) % height) +
            height) %
          height;
        const alpha =
          0.28 + (0.5 + 0.5 * Math.sin(time * 0.0006 + star.phase)) * 0.55;
        ctx.fillStyle = `rgba(${star.depth > 0.65 ? "200,211,255" : "136,161,228"},${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, star.size, 0, Math.PI * 2);
        ctx.fill();
        if (star.size > 1.5) {
          ctx.strokeStyle = `rgba(168,189,255,${alpha * 0.3})`;
          ctx.beginPath();
          ctx.moveTo(x - 4, y);
          ctx.lineTo(x + 4, y);
          ctx.moveTo(x, y - 4);
          ctx.lineTo(x, y + 4);
          ctx.stroke();
        }
      }
      // One short, sparse meteor per cycle; never sits over the game canvas.
      const phase = (time % 15000) / 1200;
      if (animated && !media.matches && phase > 0 && phase < 1) {
        const x = width * 0.7 - phase * 230,
          y = 15 + phase * 150;
        const gradient = ctx.createLinearGradient(x, y, x + 100, y - 65);
        gradient.addColorStop(
          0,
          `rgba(198,212,255,${Math.sin(phase * Math.PI) * 0.7})`,
        );
        gradient.addColorStop(1, "rgba(198,212,255,0)");
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 100, y - 65);
        ctx.stroke();
      }
    }
    function tick(stamp: number) {
      if (document.hidden || !animated || media.matches) return;
      if (stamp - last >= 1000 / 30) {
        time += Math.min(50, stamp - last);
        last = stamp;
        draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function resume() {
      cancelAnimationFrame(frame);
      pointer = { x: 0, y: 0 };
      draw();
      last = performance.now();
      if (!document.hidden && animated && !media.matches)
        frame = requestAnimationFrame(tick);
    }
    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    }
    function move(event: PointerEvent) {
      if (animated && !media.matches && event.pointerType === "mouse")
        pointer = {
          x: event.clientX / width - 0.5,
          y: event.clientY / height - 0.5,
        };
    }
    resize();
    resume();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("visibilitychange", resume);
    media.addEventListener("change", resume);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", resume);
      media.removeEventListener("change", resume);
    };
  }, [animated, density]);
  return (
    <div className="cosmos" aria-hidden="true">
      <div className="nebula nebula-violet" />
      <div className="nebula nebula-blue" />
      <div className="nebula nebula-rose" />
      <canvas ref={canvasRef} />
      <div className="cosmic-horizon" />
    </div>
  );
}
