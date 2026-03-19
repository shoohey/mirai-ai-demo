/**
 * CafeCharacter - Live2D > Unity WebGL > Canvas anime > Static PNG
 * 利用可能な最高品質のアバターを自動選択
 */
class CafeCharacter {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.mode = null; // 'live2d', 'unity', 'canvas', 'static'
    this.isSpeaking = false;
    this.live2dChar = null;
    this.unityBridge = null;
    this.canvasChar = null;
    this.audioAnalyser = null;

    this.init();
  }

  init() {
    var self = this;

    // Priority 1: Live2D
    this.checkLive2D(function(modelPath) {
      if (modelPath) {
        self.initLive2D(modelPath);
      } else {
        // Priority 2: Unity WebGL
        self.checkUnity(function(hasUnity) {
          if (hasUnity) {
            self.initUnity();
          } else {
            // Priority 3: Canvas character
            self.initCanvas();
          }
        });
      }
    });
  }

  checkLive2D(callback) {
    // Check if Live2D libraries are loaded and model exists
    if (typeof PIXI === 'undefined' || !PIXI.live2d) {
      console.log('Live2D libraries not loaded, skipping');
      callback(null);
      return;
    }

    // Try to find model files
    var modelPaths = [
      '/live2d/models/mirai/mirai.model3.json',
      '/live2d/models/mirai/mirai.model.json',
      '/live2d/models/haru/haru.model3.json'
    ];

    var idx = 0;

    function tryNext() {
      if (idx >= modelPaths.length) {
        callback(null);
        return;
      }
      var path = modelPaths[idx++];
      var xhr = new XMLHttpRequest();
      xhr.open('HEAD', path, true);
      xhr.timeout = 3000;
      xhr.onload = function() {
        if (xhr.status === 200) {
          callback(path);
        } else {
          tryNext();
        }
      };
      xhr.onerror = xhr.ontimeout = function() { tryNext(); };
      xhr.send();
    }
    tryNext();
  }

  async initLive2D(modelPath) {
    this.mode = 'live2d';
    console.log('Initializing Live2D with:', modelPath);

    // Setup container
    this.container.innerHTML =
      '<div class="avatar-stage">' +
        '<div class="avatar-glow" id="avatar-glow"></div>' +
        '<div id="live2d-container" style="width:100%;flex-grow:1;min-height:300px;position:relative;z-index:1;"></div>' +
        '<div class="avatar-name-tag">Mirai</div>' +
      '</div>';

    var live2dContainer = document.getElementById('live2d-container');
    this.live2dChar = new Live2DCharacter(live2dContainer);

    var success = await this.live2dChar.init(modelPath);
    if (!success) {
      console.warn('Live2D failed, falling back to Canvas');
      this.initCanvas();
      return;
    }

    // Log available expressions/motions for debugging
    var info = this.live2dChar.getModelInfo();
    if (info) console.log('Live2D model info:', info);
  }

  checkUnity(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('HEAD', '/unity/Build/Build.loader.js', true);
    xhr.timeout = 3000;
    xhr.onload = function() { callback(xhr.status === 200); };
    xhr.onerror = xhr.ontimeout = function() { callback(false); };
    xhr.send();
  }

  initUnity() {
    var self = this;
    this.mode = 'unity';
    this.unityBridge = new UnityBridge(this.container.id, {
      gameObjectName: 'CharacterController',
      buildUrl: '/unity/Build',
      onReady: function() {
        if (!self.unityBridge.instance) {
          self.mode = null;
          self.initCanvas();
        } else {
          console.log('Unity character ready');
        }
      }
    });
    this.unityBridge.load();
  }

  initCanvas() {
    this.mode = 'canvas';

    this.container.innerHTML =
      '<div class="avatar-stage">' +
        '<div class="avatar-glow" id="avatar-glow"></div>' +
        '<canvas id="character-canvas"></canvas>' +
        '<div class="avatar-name-tag">Mirai</div>' +
      '</div>';

    var canvas = document.getElementById('character-canvas');
    if (canvas) {
      var self = this;
      requestAnimationFrame(function() {
        self.canvasChar = new CanvasCharacter(canvas);
        console.log('Canvas character ready');
      });
    }
  }

  // === Public API ===

  setExpression(expr) {
    switch (this.mode) {
      case 'live2d':
        if (this.live2dChar) this.live2dChar.setExpression(expr);
        break;
      case 'unity':
        if (this.unityBridge) this.unityBridge.setExpression(expr);
        break;
      case 'canvas':
        if (this.canvasChar) this.canvasChar.setExpression(expr);
        break;
    }

    // Glow effect for all modes
    var glow = this.container.querySelector('#avatar-glow');
    if (glow) {
      glow.classList.remove('glow-happy', 'glow-think');
      if (expr === 'smile') glow.classList.add('glow-happy');
      if (expr === 'think') glow.classList.add('glow-think');
    }
  }

  setSpeaking(speaking) {
    this.isSpeaking = speaking;

    switch (this.mode) {
      case 'live2d':
        if (this.live2dChar) this.live2dChar.setSpeaking(speaking);
        break;
      case 'unity':
        if (this.unityBridge) this.unityBridge.setSpeaking(speaking);
        break;
      case 'canvas':
        if (this.canvasChar) this.canvasChar.setSpeaking(speaking);
        break;
    }

    // Glow effect
    var glow = this.container.querySelector('#avatar-glow');
    if (glow) {
      if (speaking) glow.classList.add('glow-speaking');
      else glow.classList.remove('glow-speaking');
    }
  }

  connectAudioForLipSync(audioElement) {
    var self = this;
    if (this.mode !== 'live2d' && this.mode !== 'unity' && this.mode !== 'canvas') return;

    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var source = ctx.createMediaElementSource(audioElement);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      this.audioAnalyser = analyser;

      var dataArray = new Uint8Array(analyser.frequencyBinCount);

      function updateLipSync() {
        if (!self.isSpeaking) return;
        analyser.getByteFrequencyData(dataArray);
        var sum = 0;
        for (var i = 0; i < 20; i++) { sum += dataArray[i]; }
        var volume = (sum / 20) / 255;

        switch (self.mode) {
          case 'live2d':
            if (self.live2dChar) self.live2dChar.setLipSync(volume);
            break;
          case 'unity':
            if (self.unityBridge) self.unityBridge.setLipSync(volume);
            break;
          case 'canvas':
            if (self.canvasChar) self.canvasChar.setLipSync(volume);
            break;
        }
        requestAnimationFrame(updateLipSync);
      }
      updateLipSync();
    } catch (e) {
      console.warn('LipSync audio connect failed:', e);
    }
  }

  startBlinking() {}
}
