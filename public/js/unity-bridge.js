/**
 * Unity WebGL ↔ Web App Communication Bridge
 *
 * Unity側からの呼び出し: SendMessage("CharacterController", "MethodName", "param")
 * Web側からUnity呼び出し: unityBridge.send("MethodName", param)
 */
class UnityBridge {
  constructor(containerId, config) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.instance = null;
    this.ready = false;
    this.onReady = config.onReady || function() {};
    this.gameObjectName = config.gameObjectName || 'CharacterController';
    this.buildUrl = config.buildUrl || '/unity/Build';
    this.pendingCommands = [];
  }

  load() {
    var self = this;

    // Create canvas for Unity
    var canvas = document.createElement('canvas');
    canvas.id = 'unity-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.background = 'transparent';
    this.container.innerHTML = '';
    this.container.appendChild(canvas);

    // Unity loader script
    var loaderUrl = this.buildUrl + '/Build.loader.js';
    var script = document.createElement('script');
    script.src = loaderUrl;
    script.onload = function() {
      createUnityInstance(canvas, {
        dataUrl: self.buildUrl + '/Build.data',
        frameworkUrl: self.buildUrl + '/Build.framework.js',
        codeUrl: self.buildUrl + '/Build.wasm',
        streamingAssetsUrl: 'StreamingAssets',
        companyName: 'CafeConcierge',
        productName: 'MiraiCharacter',
        productVersion: '1.0',
        // Transparent background
        matchWebGLToCanvasSize: true,
      }).then(function(instance) {
        self.instance = instance;
        self.ready = true;
        console.log('Unity WebGL loaded successfully');

        // Execute pending commands
        for (var i = 0; i < self.pendingCommands.length; i++) {
          var cmd = self.pendingCommands[i];
          self.send(cmd.method, cmd.param);
        }
        self.pendingCommands = [];

        self.onReady();
      }).catch(function(err) {
        console.error('Unity load error:', err);
      });
    };
    script.onerror = function() {
      console.warn('Unity build not found at', loaderUrl, '- using fallback avatar');
      self.loadFallback();
    };
    document.body.appendChild(script);
  }

  // Fallback to static avatar if Unity build not available
  loadFallback() {
    this.container.innerHTML =
      '<div class="avatar-stage">' +
        '<div class="avatar-glow" id="avatar-glow"></div>' +
        '<div class="avatar-frame">' +
          '<img src="/img/mirai_avatar.png" alt="Mirai" class="avatar-img" id="avatar-img">' +
        '</div>' +
        '<div class="avatar-name-tag">Mirai</div>' +
      '</div>';
    this.ready = false;
    this.onReady();
  }

  // Send command to Unity
  send(method, param) {
    if (!this.ready || !this.instance) {
      this.pendingCommands.push({ method: method, param: param });
      return;
    }
    try {
      this.instance.SendMessage(this.gameObjectName, method, param != null ? String(param) : '');
    } catch (e) {
      console.warn('Unity SendMessage error:', e);
    }
  }

  // Character control methods
  setExpression(expr) {
    if (this.instance) {
      this.send('SetExpression', expr); // smile, surprise, think, normal
    }
  }

  setSpeaking(speaking) {
    if (this.instance) {
      this.send('SetSpeaking', speaking ? '1' : '0');
    }
  }

  setLipSync(volume) {
    if (this.instance) {
      this.send('SetLipSyncVolume', String(volume)); // 0.0 ~ 1.0
    }
  }

  triggerAnimation(animName) {
    if (this.instance) {
      this.send('PlayAnimation', animName); // wave, bow, dance, etc.
    }
  }

  setEmotion(emotion) {
    if (this.instance) {
      this.send('SetEmotion', emotion); // happy, sad, excited, shy
    }
  }
}

// Register global callback for Unity → JS communication
window.OnUnityMessage = function(type, data) {
  var event = new CustomEvent('unity-message', {
    detail: { type: type, data: data }
  });
  window.dispatchEvent(event);
};
