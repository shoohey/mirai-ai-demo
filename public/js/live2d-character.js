/**
 * Live2D Character Controller
 * pixi-live2d-display を使用してブラウザ上でLive2Dモデルを表示・制御
 */
class Live2DCharacter {
  constructor(container) {
    this.container = container;
    this.app = null;
    this.model = null;
    this.ready = false;
    this.isSpeaking = false;
    this.currentExpression = 'normal';
    this.lipSyncValue = 0;
    this.lipSyncTimer = null;
  }

  async init(modelPath) {
    var cw = this.container.clientWidth || 280;
    var ch = this.container.clientHeight || 400;

    // Create PIXI Application (v6 compatible)
    this.app = new PIXI.Application({
      width: cw,
      height: ch,
      transparent: true,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });

    // Add canvas to container
    this.app.view.style.width = '100%';
    this.app.view.style.height = '100%';
    this.app.view.style.display = 'block';
    this.container.appendChild(this.app.view);

    // Load Live2D model
    try {
      this.model = await PIXI.live2d.Live2DModel.from(modelPath, {
        autoInteract: false
      });

      // Scale and position the model
      this.fitModel();

      // Add to stage
      this.app.stage.addChild(this.model);

      // Handle window resize
      var self = this;
      window.addEventListener('resize', function() { self.fitModel(); });

      // Start idle motion
      this.playIdleMotion();

      this.ready = true;
      console.log('Live2D model loaded successfully');
      return true;
    } catch (err) {
      console.error('Live2D model load failed:', err);
      return false;
    }
  }

  fitModel() {
    if (!this.model || !this.app) return;

    var cw = this.container.clientWidth || 280;
    var ch = this.container.clientHeight || 400;

    this.app.renderer.resize(cw, ch);

    // Scale model to fit container
    var modelWidth = this.model.internalModel.originalWidth || this.model.width;
    var modelHeight = this.model.internalModel.originalHeight || this.model.height;

    var scaleX = cw / modelWidth;
    var scaleY = ch / modelHeight;
    var scale = Math.min(scaleX, scaleY) * 0.85;

    this.model.scale.set(scale);
    this.model.anchor.set(0.5, 0.5);
    this.model.x = cw / 2;
    this.model.y = ch / 2;
  }

  playIdleMotion() {
    if (!this.model) return;
    try {
      // Try common idle motion group names
      var motionGroups = ['Idle', 'idle', 'Motion', 'motion', ''];
      for (var i = 0; i < motionGroups.length; i++) {
        try {
          this.model.motion(motionGroups[i], 0, PIXI.live2d.MotionPriority.IDLE);
          break;
        } catch (e) { /* try next */ }
      }
    } catch (e) {
      console.warn('Idle motion not found:', e);
    }
  }

  // === Public API ===

  setExpression(expr) {
    if (!this.model) return;
    this.currentExpression = expr;

    try {
      var mgr = this.model.internalModel.motionManager;

      switch (expr) {
        case 'smile':
          this.tryExpression(['f01', 'f05', 'happy', 'smile', 'Happy', 'Smile', 'fun', 'Fun']);
          this.tryMotion(['Tap', 'Happy', 'happy', 'TapBody']);
          break;
        case 'surprise':
          this.tryExpression(['f03', 'f06', 'surprise', 'Surprise', 'shocked', 'Shocked']);
          this.tryMotion(['Tap', 'Surprise', 'surprise', 'Flick']);
          break;
        case 'think':
          this.tryExpression(['f02', 'f04', 'think', 'Think', 'sad', 'Sad', 'serious', 'Serious']);
          break;
        case 'normal':
        default:
          this.tryExpression(['f00', 'normal', 'Normal', 'default', 'Default', '']);
          this.playIdleMotion();
          break;
      }
    } catch (e) {
      console.warn('Expression set failed:', e);
    }
  }

  tryExpression(names) {
    if (!this.model) return;
    for (var i = 0; i < names.length; i++) {
      try {
        this.model.expression(names[i]);
        return;
      } catch (e) { /* try next */ }
    }
  }

  tryMotion(names) {
    if (!this.model) return;
    for (var i = 0; i < names.length; i++) {
      try {
        this.model.motion(names[i], 0, PIXI.live2d.MotionPriority.NORMAL);
        return;
      } catch (e) { /* try next */ }
    }
  }

  setSpeaking(speaking) {
    this.isSpeaking = speaking;

    if (!this.model) return;

    if (speaking) {
      this.startLipSync();
    } else {
      this.stopLipSync();
    }
  }

  startLipSync() {
    var self = this;
    if (this.lipSyncTimer) clearInterval(this.lipSyncTimer);

    this.lipSyncTimer = setInterval(function() {
      if (!self.isSpeaking || !self.model) {
        self.stopLipSync();
        return;
      }
      // Simulated lip sync - smooth random mouth movement
      var target = 0.3 + Math.random() * 0.5;
      self.lipSyncValue += (target - self.lipSyncValue) * 0.3;
      self.applyLipSync(self.lipSyncValue);
    }, 60);
  }

  stopLipSync() {
    if (this.lipSyncTimer) {
      clearInterval(this.lipSyncTimer);
      this.lipSyncTimer = null;
    }
    this.lipSyncValue = 0;
    this.applyLipSync(0);
  }

  applyLipSync(value) {
    if (!this.model) return;
    try {
      var coreModel = this.model.internalModel.coreModel;
      var paramNames = ['ParamMouthOpenY', 'PARAM_MOUTH_OPEN_Y', 'ParamMouthOpen', 'PARAM_MOUTH_OPEN'];

      for (var i = 0; i < paramNames.length; i++) {
        try {
          // Cubism 4 - setParameterValueById
          if (coreModel.setParameterValueById) {
            coreModel.setParameterValueById(paramNames[i], value);
            return;
          }
          // Direct array access
          if (coreModel._parameterIds) {
            var idx = coreModel._parameterIds.indexOf(paramNames[i]);
            if (idx >= 0) {
              coreModel._parameterValues[idx] = value;
              return;
            }
          }
          // Cubism 2
          if (coreModel.setParamFloat) {
            coreModel.setParamFloat(paramNames[i], value);
            return;
          }
        } catch (e) { /* try next */ }
      }
    } catch (e) {
      // Silent fail
    }
  }

  setLipSync(volume) {
    if (this.isSpeaking && this.model) {
      this.lipSyncValue = volume;
      this.applyLipSync(volume);
    }
  }

  // Get available expressions and motions for debugging
  getModelInfo() {
    if (!this.model) return null;
    var info = {};
    try {
      var settings = this.model.internalModel.settings;
      if (settings.expressions) {
        info.expressions = settings.expressions.map(function(e) { return e.Name || e.name || e; });
      }
      if (settings.motions) {
        info.motions = Object.keys(settings.motions);
      }
    } catch (e) {
      info.error = e.message;
    }
    return info;
  }

  destroy() {
    this.stopLipSync();
    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }
    this.model = null;
    this.ready = false;
  }
}
