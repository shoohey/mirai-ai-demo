/**
 * Canvas Anime Character - ブラウザだけで動くアニメ風メイドキャラクター
 * まばたき、リップシンク、表情変化、アイドルアニメーション対応
 */
class CanvasCharacter {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.t = 0;

    // State
    this.expression = 'normal'; // normal, smile, surprise, think
    this.isSpeaking = false;
    this.mouthOpen = 0;
    this.targetMouthOpen = 0;

    // Blink
    this.blinkTimer = 0;
    this.nextBlink = 2 + Math.random() * 3;
    this.blinkProgress = -1; // -1 = not blinking
    this.eyeOpenness = 1;

    // Idle sway
    this.swayX = 0;
    this.swayY = 0;
    this.breathe = 0;

    // Emotion particles
    this.particles = [];

    // Colors
    this.colors = {
      hair: '#FF69B4',
      hairDark: '#DB2777',
      hairHighlight: '#FFB6D9',
      skin: '#FFECD2',
      skinShadow: '#F5D0A9',
      eye: '#7C3AED',
      eyeHighlight: '#A78BFA',
      dress: '#1A1333',
      dressBorder: '#FF69B4',
      ribbon: '#FF69B4',
      ribbonDark: '#DB2777',
      blush: 'rgba(255, 105, 180, 0.25)',
      mouth: '#E8505B',
      mouthInner: '#C0392B',
      white: '#FFFFFF',
      lash: '#2D1B4E',
    };

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.animate();
  }

  resize() {
    var parent = this.canvas.parentElement;
    var rect = parent ? parent.getBoundingClientRect() : { width: 0, height: 0 };
    var w = rect.width || this.canvas.clientWidth || 280;
    var h = rect.height || this.canvas.clientHeight || 400;
    var dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.w = w * dpr;
    this.h = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawW = w;
    this.drawH = h;
  }

  animate() {
    var self = this;
    var lastTime = performance.now();

    function loop(now) {
      var dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      self.update(dt);
      self.draw();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  update(dt) {
    this.t += dt;

    // Idle sway
    this.swayX = Math.sin(this.t * 0.6) * 2;
    this.swayY = Math.sin(this.t * 1.0) * 1.5;
    this.breathe = Math.sin(this.t * 1.4) * 0.008;

    // Blink
    this.blinkTimer += dt;
    if (this.blinkProgress < 0 && this.blinkTimer >= this.nextBlink) {
      this.blinkProgress = 0;
      this.blinkTimer = 0;
      this.nextBlink = 2 + Math.random() * 4;
    }
    if (this.blinkProgress >= 0) {
      this.blinkProgress += dt * 8;
      if (this.blinkProgress < 0.5) {
        this.eyeOpenness = 1 - this.blinkProgress * 2;
      } else if (this.blinkProgress < 1) {
        this.eyeOpenness = (this.blinkProgress - 0.5) * 2;
      } else {
        this.eyeOpenness = 1;
        this.blinkProgress = -1;
      }
    }

    // Lip sync
    if (this.isSpeaking) {
      this.targetMouthOpen = 0.3 + Math.sin(this.t * 12) * 0.25 + Math.sin(this.t * 7.3) * 0.15;
      this.targetMouthOpen = Math.max(0, Math.min(1, this.targetMouthOpen));
    } else {
      this.targetMouthOpen = 0;
    }
    this.mouthOpen += (this.targetMouthOpen - this.mouthOpen) * Math.min(1, dt * 15);

    // Update particles
    this.updateParticles(dt);
  }

  updateParticles(dt) {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  spawnParticles(type) {
    var cx = this.drawW / 2;
    var cy = this.drawH * 0.35;
    for (var i = 0; i < 6; i++) {
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 80,
        y: cy + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 40,
        vy: -20 - Math.random() * 30,
        life: 1 + Math.random() * 0.5,
        maxLife: 1.5,
        alpha: 1,
        size: 4 + Math.random() * 6,
        type: type // 'heart', 'star', 'sparkle'
      });
    }
  }

  draw() {
    var ctx = this.ctx;
    var W = this.drawW;
    var H = this.drawH;
    ctx.clearRect(0, 0, W, H);

    ctx.save();

    // Center character
    var scale = Math.min(W / 280, H / 450) * 0.9;
    var cx = W / 2 + this.swayX;
    var baseY = H * 0.92;

    ctx.translate(cx, baseY);
    ctx.scale(scale, scale);

    // Breathe effect
    ctx.translate(0, this.swayY);
    ctx.scale(1, 1 + this.breathe);

    this.drawBody(ctx);
    this.drawHead(ctx);

    ctx.restore();

    // Draw particles on top
    this.drawParticles(ctx);
  }

  drawBody(ctx) {
    var c = this.colors;

    // Neck
    ctx.fillStyle = c.skin;
    ctx.beginPath();
    ctx.moveTo(-12, -260);
    ctx.lineTo(12, -260);
    ctx.lineTo(14, -230);
    ctx.lineTo(-14, -230);
    ctx.closePath();
    ctx.fill();

    // Dress body
    ctx.fillStyle = c.dress;
    ctx.beginPath();
    ctx.moveTo(-50, -230);
    ctx.quadraticCurveTo(-60, -160, -70, -60);
    ctx.lineTo(-55, 0);
    ctx.quadraticCurveTo(0, 10, 55, 0);
    ctx.lineTo(70, -60);
    ctx.quadraticCurveTo(60, -160, 50, -230);
    ctx.closePath();
    ctx.fill();

    // Dress border / apron
    ctx.strokeStyle = c.dressBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    // White apron
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(-30, -220);
    ctx.quadraticCurveTo(-35, -150, -40, -60);
    ctx.lineTo(-30, 0);
    ctx.quadraticCurveTo(0, 8, 30, 0);
    ctx.lineTo(40, -60);
    ctx.quadraticCurveTo(35, -150, 30, -220);
    ctx.closePath();
    ctx.fill();

    // Apron ribbon at waist
    ctx.fillStyle = c.ribbon;
    ctx.beginPath();
    ctx.ellipse(0, -150, 35, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bow on apron
    this.drawBow(ctx, 0, -150, 18, c.ribbon, c.ribbonDark);

    // Shoulders / sleeves
    ctx.fillStyle = c.white;
    // Left sleeve
    ctx.beginPath();
    ctx.moveTo(-50, -230);
    ctx.quadraticCurveTo(-70, -225, -75, -200);
    ctx.quadraticCurveTo(-70, -190, -55, -195);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = c.dressBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Right sleeve
    ctx.beginPath();
    ctx.moveTo(50, -230);
    ctx.quadraticCurveTo(70, -225, 75, -200);
    ctx.quadraticCurveTo(70, -190, 55, -195);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Collar ribbon
    this.drawBow(ctx, 0, -240, 14, c.ribbon, c.ribbonDark);
  }

  drawBow(ctx, x, y, size, color, darkColor) {
    ctx.fillStyle = color;
    // Left loop
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - size * 1.2, y - size * 0.6, x - size, y);
    ctx.quadraticCurveTo(x - size * 1.2, y + size * 0.6, x, y);
    ctx.fill();
    // Right loop
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + size * 1.2, y - size * 0.6, x + size, y);
    ctx.quadraticCurveTo(x + size * 1.2, y + size * 0.6, x, y);
    ctx.fill();
    // Center knot
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    // Tails
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 2, y);
    ctx.quadraticCurveTo(x - 6, y + size * 1.2, x - 4, y + size * 1.5);
    ctx.lineTo(x, y + size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 2, y);
    ctx.quadraticCurveTo(x + 6, y + size * 1.2, x + 4, y + size * 1.5);
    ctx.lineTo(x, y + size * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  drawHead(ctx) {
    var c = this.colors;
    var headY = -300;

    // Hair back (behind face)
    ctx.fillStyle = c.hair;
    ctx.beginPath();
    ctx.ellipse(0, headY + 5, 62, 58, 0, 0, Math.PI * 2);
    ctx.fill();

    // Side hair flowing down
    ctx.fillStyle = c.hair;
    // Left side hair
    ctx.beginPath();
    ctx.moveTo(-55, headY - 10);
    ctx.quadraticCurveTo(-65, headY + 30, -60, headY + 90);
    ctx.quadraticCurveTo(-55, headY + 120, -45, headY + 130);
    ctx.quadraticCurveTo(-48, headY + 80, -45, headY + 20);
    ctx.closePath();
    ctx.fill();

    // Right side hair
    ctx.beginPath();
    ctx.moveTo(55, headY - 10);
    ctx.quadraticCurveTo(65, headY + 30, 60, headY + 90);
    ctx.quadraticCurveTo(55, headY + 120, 45, headY + 130);
    ctx.quadraticCurveTo(48, headY + 80, 45, headY + 20);
    ctx.closePath();
    ctx.fill();

    // Face
    ctx.fillStyle = c.skin;
    ctx.beginPath();
    ctx.ellipse(0, headY + 10, 50, 48, 0, 0, Math.PI * 2);
    ctx.fill();

    // Face shadow (chin area)
    ctx.fillStyle = c.skinShadow;
    ctx.beginPath();
    ctx.ellipse(0, headY + 40, 35, 15, 0, 0, Math.PI);
    ctx.fill();

    // Bangs
    ctx.fillStyle = c.hair;
    ctx.beginPath();
    ctx.moveTo(-52, headY - 15);
    ctx.quadraticCurveTo(-40, headY - 45, -15, headY - 42);
    ctx.quadraticCurveTo(0, headY - 44, 15, headY - 42);
    ctx.quadraticCurveTo(40, headY - 45, 52, headY - 15);
    ctx.lineTo(48, headY);
    ctx.quadraticCurveTo(30, headY - 5, 20, headY + 5);
    ctx.quadraticCurveTo(10, headY - 8, 0, headY + 2);
    ctx.quadraticCurveTo(-10, headY - 8, -20, headY + 5);
    ctx.quadraticCurveTo(-30, headY - 5, -48, headY);
    ctx.closePath();
    ctx.fill();

    // Hair highlights
    ctx.strokeStyle = c.hairHighlight;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(-30, headY - 35);
    ctx.quadraticCurveTo(-25, headY - 15, -22, headY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, headY - 38);
    ctx.quadraticCurveTo(12, headY - 15, 8, headY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Eyes
    this.drawEyes(ctx, headY);

    // Blush
    ctx.fillStyle = c.blush;
    ctx.beginPath();
    ctx.ellipse(-28, headY + 18, 12, 6, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(28, headY + 18, 12, 6, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Nose (tiny)
    ctx.fillStyle = c.skinShadow;
    ctx.beginPath();
    ctx.arc(0, headY + 15, 2, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    this.drawMouth(ctx, 0, headY + 28);

    // Headband with ribbon
    this.drawHeadband(ctx, headY);

    // Cat ears (maid cafe style)
    this.drawCatEars(ctx, headY);
  }

  drawEyes(ctx, headY) {
    var c = this.colors;
    var eyeY = headY + 8;
    var eyeSpacing = 22;
    var openness = this.eyeOpenness;

    // Expression modifiers
    var eyeScale = 1;
    var eyeYOffset = 0;
    if (this.expression === 'surprise') {
      eyeScale = 1.2;
    } else if (this.expression === 'smile') {
      openness = Math.min(openness, 0.5);
    } else if (this.expression === 'think') {
      eyeYOffset = -3;
    }

    for (var side = -1; side <= 1; side += 2) {
      var ex = side * eyeSpacing;
      var ey = eyeY + eyeYOffset;

      ctx.save();
      ctx.translate(ex, ey);
      ctx.scale(eyeScale, eyeScale);

      if (openness < 0.15) {
        // Closed eye - curved line
        ctx.strokeStyle = c.lash;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.quadraticCurveTo(0, 3, 10, 0);
        ctx.stroke();
      } else {
        // Eye white
        var eyeH = 14 * openness;
        ctx.fillStyle = c.white;
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, eyeH, 0, 0, Math.PI * 2);
        ctx.fill();

        // Iris
        ctx.fillStyle = c.eye;
        var irisH = Math.min(10 * openness, 10);
        ctx.beginPath();
        ctx.ellipse(0, 1, 8, irisH, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupil
        ctx.fillStyle = '#1A0A2E';
        var pupilH = Math.min(6 * openness, 6);
        ctx.beginPath();
        ctx.ellipse(0, 1, 5, pupilH, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eye highlight (big)
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.ellipse(-3, -3, 3, 3 * openness, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eye highlight (small)
        ctx.beginPath();
        ctx.ellipse(3, 2, 1.5, 1.5 * openness, 0, 0, Math.PI * 2);
        ctx.fill();

        // Upper eyelash
        ctx.strokeStyle = c.lash;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-12, -eyeH + 2);
        ctx.quadraticCurveTo(0, -eyeH - 1, 12, -eyeH + 2);
        ctx.stroke();

        // Eyelash details
        ctx.lineWidth = 1.5;
        // Outer lash
        ctx.beginPath();
        ctx.moveTo(side > 0 ? 11 : -11, -eyeH + 3);
        ctx.lineTo(side > 0 ? 15 : -15, -eyeH - 1);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  drawMouth(ctx, x, y) {
    var c = this.colors;
    var open = this.mouthOpen;

    if (this.expression === 'smile' && open < 0.1) {
      // Happy smile - curved line
      ctx.strokeStyle = c.mouth;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 1);
      ctx.quadraticCurveTo(x, y + 6, x + 8, y - 1);
      ctx.stroke();
      // Little fang
      ctx.fillStyle = c.white;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 1);
      ctx.lineTo(x + 6, y + 5);
      ctx.lineTo(x + 8, y + 1);
      ctx.closePath();
      ctx.fill();
    } else if (this.expression === 'surprise' && open < 0.1) {
      // O mouth
      ctx.fillStyle = c.mouth;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 6, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.mouthInner;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (open > 0.05) {
      // Speaking mouth
      var mouthH = 3 + open * 8;
      var mouthW = 7 + open * 3;
      ctx.fillStyle = c.mouth;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, mouthW, mouthH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.mouthInner;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, mouthW - 2, mouthH - 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tongue hint
      if (open > 0.3) {
        ctx.fillStyle = '#E87070';
        ctx.beginPath();
        ctx.ellipse(x, y + mouthH - 1, 4, 3, 0, 0, Math.PI);
        ctx.fill();
      }
    } else {
      // Neutral small smile
      ctx.strokeStyle = c.mouth;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.quadraticCurveTo(x, y + 3, x + 6, y);
      ctx.stroke();
    }
  }

  drawHeadband(ctx, headY) {
    var c = this.colors;
    // Headband
    ctx.strokeStyle = c.ribbon;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, headY - 25, 50, 30, 0, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();

    // Headband ribbon/bow
    this.drawBow(ctx, 25, headY - 42, 12, c.ribbon, c.ribbonDark);
  }

  drawCatEars(ctx, headY) {
    var c = this.colors;

    // Left ear
    ctx.fillStyle = c.hair;
    ctx.beginPath();
    ctx.moveTo(-40, headY - 35);
    ctx.lineTo(-55, headY - 75);
    ctx.lineTo(-20, headY - 45);
    ctx.closePath();
    ctx.fill();
    // Inner ear
    ctx.fillStyle = c.skinShadow;
    ctx.beginPath();
    ctx.moveTo(-38, headY - 38);
    ctx.lineTo(-50, headY - 68);
    ctx.lineTo(-25, headY - 45);
    ctx.closePath();
    ctx.fill();

    // Right ear
    ctx.fillStyle = c.hair;
    ctx.beginPath();
    ctx.moveTo(40, headY - 35);
    ctx.lineTo(55, headY - 75);
    ctx.lineTo(20, headY - 45);
    ctx.closePath();
    ctx.fill();
    // Inner ear
    ctx.fillStyle = c.skinShadow;
    ctx.beginPath();
    ctx.moveTo(38, headY - 38);
    ctx.lineTo(50, headY - 68);
    ctx.lineTo(25, headY - 45);
    ctx.closePath();
    ctx.fill();
  }

  drawParticles(ctx) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      ctx.globalAlpha = p.alpha;

      if (p.type === 'heart') {
        ctx.fillStyle = '#FF69B4';
        this.drawHeart(ctx, p.x, p.y, p.size);
      } else if (p.type === 'star') {
        ctx.fillStyle = '#FFD700';
        this.drawStar(ctx, p.x, p.y, p.size);
      } else {
        ctx.fillStyle = '#A78BFA';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawHeart(ctx, x, y, size) {
    var s = size / 10;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 3);
    ctx.bezierCurveTo(x, y, x - s * 5, y, x - s * 5, y + s * 3);
    ctx.bezierCurveTo(x - s * 5, y + s * 6, x, y + s * 9, x, y + s * 10);
    ctx.bezierCurveTo(x, y + s * 9, x + s * 5, y + s * 6, x + s * 5, y + s * 3);
    ctx.bezierCurveTo(x + s * 5, y, x, y, x, y + s * 3);
    ctx.fill();
  }

  drawStar(ctx, x, y, size) {
    var spikes = 5;
    var outerR = size;
    var innerR = size / 2;
    ctx.beginPath();
    for (var i = 0; i < spikes * 2; i++) {
      var r = i % 2 === 0 ? outerR : innerR;
      var angle = (i * Math.PI) / spikes - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
      else ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
    }
    ctx.closePath();
    ctx.fill();
  }

  // === Public API (same as CafeCharacter) ===

  setExpression(expr) {
    var prevExpr = this.expression;
    this.expression = expr;

    if (expr === 'smile' && prevExpr !== 'smile') {
      this.spawnParticles('heart');
    } else if (expr === 'surprise' && prevExpr !== 'surprise') {
      this.spawnParticles('star');
    } else if (expr === 'think') {
      this.spawnParticles('sparkle');
    }
  }

  setSpeaking(speaking) {
    this.isSpeaking = speaking;
  }

  setLipSync(volume) {
    if (this.isSpeaking) {
      this.targetMouthOpen = volume;
    }
  }
}
