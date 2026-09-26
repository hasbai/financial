<script lang="ts">
  import { onMount } from "svelte";

  type Petal = {
    x: number;
    y: number;
    size: number;
    sprite: number;
    angle: number;
    spin: number;
    fall: number;
    opacity: number;
    sway: number;
    phase: number;
    drift: number;
    driftPhase: number;
    breath: number;
  };

  const fullTurn = Math.PI * 2;
  const layers = [
    { weight: 0.4, scale: 0.62, opacity: 0.65, fall: 0.7 },
    { weight: 0.35, scale: 0.82, opacity: 0.85, fall: 0.85 },
    { weight: 0.25, scale: 1, opacity: 1, fall: 1 },
  ];
  const random = (min: number, max: number) => min + Math.random() * (max - min);

  function makeSprite(dark: boolean) {
    const sprite = document.createElement("canvas");
    sprite.width = 96;
    sprite.height = 96;
    const context = sprite.getContext("2d");
    if (!context) return sprite;

    const hue = random(dark ? 28 : 33, dark ? 36 : 40);
    const saturation = random(dark ? 55 : 65, dark ? 70 : 80);
    const lightness = random(dark ? 55 : 52, dark ? 65 : 62);
    if (dark) {
      const halo = context.createRadialGradient(48, 48, 0, 48, 48, 46);
      halo.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness + 5}%, .12)`);
      halo.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 5}%, 0)`);
      context.fillStyle = halo;
      context.fillRect(0, 0, 96, 96);
    }

    const firstAngle = random(0, fullTurn);
    context.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    for (let index = 0; index < 4; index += 1) {
      const angle = firstAngle + (index * fullTurn) / 4 + random(-0.08, 0.08);
      context.save();
      context.translate(48 + Math.cos(angle) * 8.1, 48 + Math.sin(angle) * 8.1);
      context.rotate(angle);
      context.beginPath();
      context.ellipse(0, 0, random(9.4, 10.8), random(6.8, 8.3), 0, 0, fullTurn);
      context.fill();
      context.restore();
    }
    context.fillStyle = `hsl(${hue + 2}, ${saturation + 5}%, ${lightness - 12}%)`;
    context.beginPath();
    context.arc(48, 48, 4, 0, fullTurn);
    context.fill();
    return sprite;
  }

  function makePetal(width: number, height: number, onScreen: boolean): Petal {
    const pick = Math.random();
    const layer = pick < layers[0].weight ? layers[0] : pick < layers[0].weight + layers[1].weight ? layers[1] : layers[2];
    return {
      x: Math.random() * width,
      y: onScreen ? Math.random() * height : -random(10, height * 0.3),
      size: random(4, 10) * (0.7 + layer.scale * 0.3),
      sprite: Math.floor(Math.random() * 4),
      angle: random(0, fullTurn),
      spin: random(-0.9, 0.9),
      fall: random(20, 40) * layer.fall,
      opacity: random(0.35, 0.65) * layer.opacity,
      sway: random(10, 26) * layer.scale,
      phase: random(0, fullTurn),
      drift: random(3, 9) * layer.scale,
      driftPhase: random(0, fullTurn),
      breath: random(0, fullTurn),
    };
  }

  let canvas: HTMLCanvasElement;
  let visible = $state(false);

  onMount(() => {
    const context = canvas.getContext("2d");
    if (!context) return;

    const desktop = matchMedia("(min-width: 1025px)");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const petals: Petal[] = [];
    let sprites: HTMLCanvasElement[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let dark = false;
    let running = false;
    let frame = 0;
    let started = 0;
    let previous = 0;

    function resize() {
      width = innerWidth;
      height = innerHeight;
      dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    function draw(now: number) {
      if (!running || !context) return;
      const elapsed = (now - started) / 1000;
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const target = Math.round(Math.min(140, Math.max(40, (width * height) / 28000)) * (dark ? 0.6 : 1));
      while (petals.length < target) petals.push(makePetal(width, height, true));
      if (petals.length > target) petals.length = target;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      for (const petal of petals) {
        petal.y += petal.fall * (dark ? 0.75 : 1) * delta;
        petal.angle += petal.spin * delta;
        if (petal.y > height + petal.size * 3) Object.assign(petal, makePetal(width, height, false));

        const x = petal.x
          + Math.sin(elapsed * 0.06 * fullTurn + petal.phase) * petal.sway
          + Math.sin(elapsed * 0.18 * fullTurn + petal.driftPhase) * petal.drift;
        const breath = 1 + 0.25 * Math.sin((elapsed * fullTurn) / 18 + petal.x * 0.0025 + petal.breath);
        const opacity = Math.min(0.7, petal.opacity * breath * (dark ? 0.78 : 1));
        const size = petal.size * (96 / 36);
        context.save();
        context.globalAlpha = opacity;
        context.translate(x, petal.y);
        context.rotate(petal.angle);
        context.drawImage(sprites[petal.sprite], -size / 2, -size / 2, size, size);
        context.restore();
      }
      frame = requestAnimationFrame(draw);
    }

    function sync() {
      const shouldRun = desktop.matches && !reducedMotion.matches && !document.hidden;
      if (!shouldRun) {
        running = false;
        cancelAnimationFrame(frame);
        context?.clearRect(0, 0, canvas.width, canvas.height);
        visible = false;
        return;
      }
      const nextDark = document.documentElement.classList.contains("dark");
      if (nextDark !== dark || sprites.length === 0) {
        dark = nextDark;
        sprites = Array.from({ length: 4 }, () => makeSprite(dark));
      }
      if (running) return;
      resize();
      running = true;
      visible = true;
      started = previous = performance.now();
      draw(started);
    }

    const themeObserver = new MutationObserver(sync);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    desktop.addEventListener("change", sync);
    reducedMotion.addEventListener("change", sync);
    addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      themeObserver.disconnect();
      desktop.removeEventListener("change", sync);
      reducedMotion.removeEventListener("change", sync);
      removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", sync);
    };
  });
</script>

<canvas bind:this={canvas} class:visible class="background-texture" aria-hidden="true"></canvas>
