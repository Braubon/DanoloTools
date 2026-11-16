/**
 * PIXFORGE // Procedural High-Resolution Sample Artwork Generator (512x512)
 * Simulates smooth-shaded AI-generated character/item illustrations with gradients,
 * anti-aliasing, and solid peripheral backgrounds to test the Pixel-Art pipeline immediately.
 */
(function (global) {
  "use strict";

  function createCanvas(size = 512) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    return c;
  }

  /**
   * 1. Cyber Samurai Helmet / Chibi Warrior (Smooth gradients + off-white background)
   */
  function drawKnightSample() {
    const c = createCanvas(512);
    const ctx = c.getContext("2d");

    // Peripheral solid studio background (#F1F5F9)
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, 0, 512, 512);

    ctx.save();
    ctx.translate(256, 265);

    // Crimson cape behind
    const capeGrad = ctx.createLinearGradient(0, -40, 0, 185);
    capeGrad.addColorStop(0, "#e11d48");
    capeGrad.addColorStop(1, "#881337");
    ctx.fillStyle = capeGrad;
    ctx.beginPath();
    ctx.moveTo(-110, 10);
    ctx.quadraticCurveTo(-155, 110, -125, 180);
    ctx.lineTo(125, 180);
    ctx.quadraticCurveTo(155, 110, 110, 10);
    ctx.closePath();
    ctx.fill();

    // Torso Armor
    const bodyGrad = ctx.createLinearGradient(-80, 10, 80, 165);
    bodyGrad.addColorStop(0, "#38bdf8");
    bodyGrad.addColorStop(0.5, "#0284c7");
    bodyGrad.addColorStop(1, "#1e3a8a");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-82, 20, 164, 145, 36);
    ctx.fill();

    // Golden Chest Emblem
    const goldGrad = ctx.createLinearGradient(0, 45, 0, 130);
    goldGrad.addColorStop(0, "#fde047");
    goldGrad.addColorStop(0.5, "#eab308");
    goldGrad.addColorStop(1, "#a16207");
    ctx.fillStyle = goldGrad;
    ctx.beginPath();
    ctx.moveTo(0, 48);
    ctx.lineTo(38, 86);
    ctx.lineTo(0, 128);
    ctx.lineTo(-38, 86);
    ctx.closePath();
    ctx.fill();

    // Pauldrons (Shoulders)
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.scale(dir, 1);
      const shGrad = ctx.createRadialGradient(85, 35, 8, 95, 50, 55);
      shGrad.addColorStop(0, "#7dd3fc");
      shGrad.addColorStop(0.55, "#0284c7");
      shGrad.addColorStop(1, "#172554");
      ctx.fillStyle = shGrad;
      ctx.beginPath();
      ctx.arc(94, 52, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Helmet Dome
    const helmGrad = ctx.createRadialGradient(-35, -105, 18, 0, -65, 135);
    helmGrad.addColorStop(0, "#bae6fd");
    helmGrad.addColorStop(0.35, "#0ea5e9");
    helmGrad.addColorStop(0.8, "#1d4ed8");
    helmGrad.addColorStop(1, "#172554");
    ctx.fillStyle = helmGrad;
    ctx.beginPath();
    ctx.arc(0, -60, 112, 0, Math.PI * 2);
    ctx.fill();

    // Helmet Horns (Golden)
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.scale(dir, 1);
      ctx.fillStyle = goldGrad;
      ctx.beginPath();
      ctx.moveTo(65, -120);
      ctx.quadraticCurveTo(155, -155, 165, -225);
      ctx.quadraticCurveTo(115, -185, 38, -148);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Center Crest
    ctx.fillStyle = "#f43f5e";
    ctx.beginPath();
    ctx.moveTo(0, -225);
    ctx.lineTo(32, -145);
    ctx.lineTo(-32, -145);
    ctx.closePath();
    ctx.fill();

    // Dark Visor Slit
    ctx.fillStyle = "#090d16";
    ctx.beginPath();
    ctx.roundRect(-78, -82, 156, 56, 22);
    ctx.fill();

    // Glowing Cyan Cyber Eyes
    ctx.fillStyle = "#22d3ee";
    ctx.beginPath();
    ctx.ellipse(-36, -54, 18, 10, -0.12, 0, Math.PI * 2);
    ctx.ellipse(36, -54, 18, 10, 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(-40, -56, 5, 0, Math.PI * 2);
    ctx.arc(32, -56, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return c.getContext("2d").getImageData(0, 0, 512, 512);
  }

  /**
   * 2. Arcane Mana Potion (Glass highlights, glowing liquid gradients, cork & gold trim)
   */
  function drawPotionSample() {
    const c = createCanvas(512);
    const ctx = c.getContext("2d");

    // Soft warm parchment background (#F8FAFC)
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, 512, 512);

    ctx.save();
    ctx.translate(256, 285);

    // Cork stopper
    const corkGrad = ctx.createLinearGradient(-35, -225, 35, -160);
    corkGrad.addColorStop(0, "#f59e0b");
    corkGrad.addColorStop(0.5, "#b45309");
    corkGrad.addColorStop(1, "#78350f");
    ctx.fillStyle = corkGrad;
    ctx.beginPath();
    ctx.moveTo(-36, -225);
    ctx.lineTo(36, -225);
    ctx.lineTo(28, -162);
    ctx.lineTo(-28, -162);
    ctx.closePath();
    ctx.fill();

    // Bottle Neck Glass
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.roundRect(-48, -168, 96, 32, 12);
    ctx.fill();

    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(-34, -140, 68, 52);

    // Outer Glass Flask
    const glassGrad = ctx.createRadialGradient(-45, -30, 20, 0, 20, 175);
    glassGrad.addColorStop(0, "#e2e8f0");
    glassGrad.addColorStop(0.7, "#94a3b8");
    glassGrad.addColorStop(1, "#475569");
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.arc(0, 28, 152, 0, Math.PI * 2);
    ctx.fill();

    // Magical Violet/Magenta Liquid Inside
    const liqGrad = ctx.createRadialGradient(-30, 5, 15, 0, 40, 140);
    liqGrad.addColorStop(0, "#f472b6");
    liqGrad.addColorStop(0.35, "#d946ef");
    liqGrad.addColorStop(0.75, "#9333ea");
    liqGrad.addColorStop(1, "#3b0764");
    ctx.fillStyle = liqGrad;
    ctx.beginPath();
    ctx.arc(0, 28, 130, 0.08 * Math.PI, 0.92 * Math.PI, false);
    ctx.quadraticCurveTo(0, -18, 126, 32);
    ctx.closePath();
    ctx.fill();

    // Full liquid body fill
    ctx.beginPath();
    ctx.arc(0, 28, 128, -0.12 * Math.PI, 1.12 * Math.PI, false);
    ctx.closePath();
    ctx.fill();

    // Liquid surface meniscus
    ctx.fillStyle = "#f9a8d4";
    ctx.beginPath();
    ctx.ellipse(0, -16, 118, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Golden Decorative Collar & Base Ring
    const goldGrad = ctx.createLinearGradient(-60, 0, 60, 0);
    goldGrad.addColorStop(0, "#facc15");
    goldGrad.addColorStop(0.5, "#fef08a");
    goldGrad.addColorStop(1, "#ca8a04");
    ctx.fillStyle = goldGrad;
    ctx.beginPath();
    ctx.roundRect(-46, -112, 92, 26, 8);
    ctx.fill();

    // Emerald Gem on Collar
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(0, -99, 14, 0, Math.PI * 2);
    ctx.fill();

    // Specular Glass Highlight
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(-68, -22, 18, 46, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-45, 42, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return c.getContext("2d").getImageData(0, 0, 512, 512);
  }

  /**
   * 3. Emerald Dragonet / Kaiju Pet
   */
  function drawDragonSample() {
    const c = createCanvas(512);
    const ctx = c.getContext("2d");

    ctx.fillStyle = "#eef2ff";
    ctx.fillRect(0, 0, 512, 512);

    ctx.save();
    ctx.translate(256, 270);

    // Orange Wings
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.scale(dir, 1);
      const wingGrad = ctx.createLinearGradient(40, -90, 190, 40);
      wingGrad.addColorStop(0, "#fb923c");
      wingGrad.addColorStop(1, "#c2410c");
      ctx.fillStyle = wingGrad;
      ctx.beginPath();
      ctx.moveTo(45, -30);
      ctx.quadraticCurveTo(140, -145, 200, -65);
      ctx.quadraticCurveTo(165, 20, 75, 45);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Tail with flame tip
    ctx.fillStyle = "#15803d";
    ctx.beginPath();
    ctx.moveTo(60, 100);
    ctx.quadraticCurveTo(175, 130, 175, 35);
    ctx.quadraticCurveTo(135, 85, 50, 60);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.arc(178, 25, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.arc(178, 28, 14, 0, Math.PI * 2);
    ctx.fill();

    // Dragon Body
    const bodyGrad = ctx.createRadialGradient(-25, 15, 15, 0, 45, 135);
    bodyGrad.addColorStop(0, "#4ade80");
    bodyGrad.addColorStop(0.6, "#16a34a");
    bodyGrad.addColorStop(1, "#14532d");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 55, 95, 105, 0, 0, Math.PI * 2);
    ctx.fill();

    // Yellow Belly Ridges
    ctx.fillStyle = "#fef08a";
    ctx.beginPath();
    ctx.ellipse(0, 65, 58, 76, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#eab308";
    for (let y = 10; y <= 110; y += 26) {
      ctx.fillRect(-42, y, 84, 7);
    }

    // Dragon Head
    const headGrad = ctx.createRadialGradient(-25, -95, 12, 0, -75, 105);
    headGrad.addColorStop(0, "#86efac");
    headGrad.addColorStop(0.55, "#22c55e");
    headGrad.addColorStop(1, "#14532d");
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(0, -72, 88, 0, Math.PI * 2);
    ctx.fill();

    // Horns
    ctx.fillStyle = "#f59e0b";
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.scale(dir, 1);
      ctx.beginPath();
      ctx.moveTo(35, -140);
      ctx.lineTo(85, -205);
      ctx.lineTo(68, -120);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Large Ruby Eyes
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.scale(dir, 1);
      ctx.fillStyle = "#090d16";
      ctx.beginPath();
      ctx.arc(36, -78, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(36, -76, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(31, -83, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Feet
    ctx.fillStyle = "#15803d";
    ctx.beginPath();
    ctx.ellipse(-58, 152, 34, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(58, 152, 34, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return c.getContext("2d").getImageData(0, 0, 512, 512);
  }

  /**
   * 4. Retro Mecha Core Bot
   */
  function drawMechaSample() {
    const c = createCanvas(512);
    const ctx = c.getContext("2d");

    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(0, 0, 512, 512);

    ctx.save();
    ctx.translate(256, 265);

    // Antenna
    ctx.fillStyle = "#475569";
    ctx.fillRect(-10, -215, 20, 65);
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(0, -220, 24, 0, Math.PI * 2);
    ctx.fill();

    // Side Thruster Pods
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.roundRect(-178, -55, 44, 110, 14);
    ctx.roundRect(134, -55, 44, 110, 14);
    ctx.fill();

    // Main Chassis Box
    const hullGrad = ctx.createLinearGradient(-135, -145, 135, 145);
    hullGrad.addColorStop(0, "#fbbf24");
    hullGrad.addColorStop(0.55, "#f59e0b");
    hullGrad.addColorStop(1, "#b45309");
    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    ctx.roundRect(-140, -145, 280, 260, 48);
    ctx.fill();

    // Visor Screen
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.roundRect(-104, -108, 208, 118, 24);
    ctx.fill();

    // Happy / Cyber CRT Eyes
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(-72, -72, 42, 48);
    ctx.fillRect(30, -72, 42, 48);

    ctx.fillStyle = "#e0f2fe";
    ctx.fillRect(-66, -66, 16, 16);
    ctx.fillRect(36, -66, 16, 16);

    // Chest Core Reactor
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(0, 62, 38, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(0, 62, 24, 0, Math.PI * 2);
    ctx.fill();

    // Treads / Legs
    ctx.fillStyle = "#334155";
    ctx.beginPath();
    ctx.roundRect(-115, 115, 76, 58, 16);
    ctx.roundRect(39, 115, 76, 58, 16);
    ctx.fill();

    ctx.restore();
    return c.getContext("2d").getImageData(0, 0, 512, 512);
  }

  function generateSample(name) {
    switch (name) {
      case "potion":
        return drawPotionSample();
      case "dragon":
        return drawDragonSample();
      case "mecha":
        return drawMechaSample();
      case "knight":
      default:
        return drawKnightSample();
    }
  }

  global.PixDemos = {
    generateSample
  };
})(window);
