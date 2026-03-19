(function() {
  var App = {
    mode: null, // 'customer' or 'training'
    lang: null,
    cafeId: null,
    cafes: [],
    history: [],
    trainingHistory: [],
    character: null,
    trainingCharacter: null,
    speech: null,
    soundEnabled: true,
    trainingSoundEnabled: true,
    isListening: false,
    isSending: false,

    init: function() {
      var self = this;
      this.debug('App init started');

      try {
        this.speech = new CafeSpeech();
        this.speech.onStart = function() {
          try {
            var ch = self.mode === 'training' ? self.trainingCharacter : self.character;
            if (ch) ch.setSpeaking(true);
          } catch(e){}
        };
        this.speech.onEnd = function() {
          try {
            var ch = self.mode === 'training' ? self.trainingCharacter : self.character;
            if (ch) ch.setSpeaking(false);
          } catch(e){}
        };
        this.speech.onAudioCreated = function(audio) {
          try {
            var ch = self.mode === 'training' ? self.trainingCharacter : self.character;
            if (ch) ch.connectAudioForLipSync(audio);
          } catch(e){}
        };
        this.speech.onListenEnd = function() {
          var micId = self.mode === 'training' ? 'training-mic-btn' : 'mic-btn';
          var micBtn = document.getElementById(micId);
          if (micBtn) { micBtn.textContent = '🎤'; micBtn.classList.remove('listening'); }
          self.isListening = false;
        };
      } catch(e) {
        this.debug('Speech init error: ' + e.message);
        this.speech = { speak: function(){return Promise.resolve();}, stop:function(){}, startListening:function(){}, stopListening:function(){} };
      }

      this.loadConfig();
      this.bindEvents();
      this.debug('App init done');
    },

    debug: function(msg) {
      console.log('[CafeApp] ' + msg);
      var el = document.getElementById('debug-info');
      if (el) el.textContent = msg;
    },

    loadConfig: function() {
      var self = this;
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/config', true);
      xhr.onload = function() {
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            self.cafes = data.cafes;
            self.cafeId = data.defaultCafe;
            if (self.cafes.length > 1) self.renderCafeSelect();
            self.debug('Config loaded OK');
          } catch(e) { self.debug('Config parse error: ' + e.message); }
        }
      };
      xhr.onerror = function() { self.debug('Config network error'); };
      xhr.send();
    },

    bindEvents: function() {
      var self = this;

      // Mode buttons
      var customerBtn = document.getElementById('mode-customer');
      if (customerBtn) customerBtn.addEventListener('click', function() { self.selectMode('customer'); });
      var trainingBtn = document.getElementById('mode-training');
      if (trainingBtn) trainingBtn.addEventListener('click', function() { self.selectMode('training'); });

      // Language buttons
      var langBtns = document.querySelectorAll('.lang-btn[data-lang]');
      for (var i = 0; i < langBtns.length; i++) {
        (function(btn) {
          btn.addEventListener('click', function() {
            var lang = btn.getAttribute('data-lang');
            if (lang) self.selectLanguage(lang);
          });
        })(langBtns[i]);
      }

      // Chat form (customer)
      var form = document.getElementById('chat-form');
      if (form) {
        form.addEventListener('submit', function(e) {
          e.preventDefault();
          var input = document.getElementById('chat-input');
          var msg = input.value.trim();
          if (msg) { self.sendMessage(msg); input.value = ''; }
        });
      }

      // Back button (customer)
      var backBtn = document.getElementById('back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', function() {
          if (self.speech) self.speech.stop();
          self.history = [];
          self.hideSpeechBubble();
          self.showScreen('language-screen');
        });
      }

      // Sound toggle (customer)
      var soundBtn = document.getElementById('sound-toggle');
      if (soundBtn) {
        soundBtn.addEventListener('click', function() {
          self.soundEnabled = !self.soundEnabled;
          soundBtn.textContent = self.soundEnabled ? '🔊' : '🔇';
          if (!self.soundEnabled && self.speech) self.speech.stop();
        });
      }

      // Mic button (customer)
      var micBtn = document.getElementById('mic-btn');
      if (micBtn) micBtn.addEventListener('click', function() { self.toggleMic('customer'); });

      // === Training mode events ===
      var trainingForm = document.getElementById('training-form');
      if (trainingForm) {
        trainingForm.addEventListener('submit', function(e) {
          e.preventDefault();
          var input = document.getElementById('training-input');
          var msg = input.value.trim();
          if (msg) { self.sendTrainingMessage(msg); input.value = ''; }
        });
      }

      var trainingBackBtn = document.getElementById('training-back-btn');
      if (trainingBackBtn) {
        trainingBackBtn.addEventListener('click', function() {
          if (self.speech) self.speech.stop();
          self.trainingHistory = [];
          self.hideTrainingSpeechBubble();
          self.showScreen('mode-screen');
        });
      }

      var trainingSoundBtn = document.getElementById('training-sound-toggle');
      if (trainingSoundBtn) {
        trainingSoundBtn.addEventListener('click', function() {
          self.trainingSoundEnabled = !self.trainingSoundEnabled;
          trainingSoundBtn.textContent = self.trainingSoundEnabled ? '🔊' : '🔇';
          if (!self.trainingSoundEnabled && self.speech) self.speech.stop();
        });
      }

      var trainingMicBtn = document.getElementById('training-mic-btn');
      if (trainingMicBtn) trainingMicBtn.addEventListener('click', function() { self.toggleMic('training'); });
    },

    selectMode: function(mode) {
      this.mode = mode;
      if (mode === 'customer') {
        this.showScreen('language-screen');
      } else {
        this.showScreen('training-screen');
        this.initTrainingScreen();
      }
    },

    toggleMic: function(mode) {
      var self = this;
      if (this.isListening) {
        if (this.speech) this.speech.stopListening();
        this.isListening = false;
        return;
      }

      var micId = mode === 'training' ? 'training-mic-btn' : 'mic-btn';
      var micBtn = document.getElementById(micId);
      if (micBtn) { micBtn.textContent = '⏹'; micBtn.classList.add('listening'); }
      this.isListening = true;

      var inputId = mode === 'training' ? 'training-input' : 'chat-input';
      var input = document.getElementById(inputId);
      var listenLang = mode === 'training' ? 'ja' : this.lang;

      if (this.speech) {
        this.speech.startListening(listenLang, function(transcript, isFinal) {
          if (input) input.value = transcript;
          if (isFinal && transcript.trim()) {
            if (mode === 'training') {
              self.sendTrainingMessage(transcript.trim());
            } else {
              self.sendMessage(transcript.trim());
            }
            if (input) input.value = '';
          }
        });
      }
    },

    // ===== Training Mode =====
    initTrainingScreen: function() {
      if (!this.trainingCharacter) {
        try {
          this.trainingCharacter = new CafeCharacter('training-character-container');
          this.trainingCharacter.startBlinking();
        } catch(e) { this.debug('Training character error: ' + e.message); }
      }

      var chat = document.getElementById('training-messages');
      if (chat) chat.innerHTML = '';
      this.trainingHistory = [];

      this.updateTrainingQuickButtons();

      var welcomeMsg = 'オーナーさん、こんにちは~！ミライに何でも教えてくださいね！お店のこと、メニューのこと、接客のコツ...なんでも覚えますよ！';
      this.showTrainingSpeechBubble(welcomeMsg);
      this.addTrainingMessage('assistant', welcomeMsg);

      try { if (this.trainingCharacter) this.trainingCharacter.setExpression('smile'); } catch(e){}
      if (this.trainingSoundEnabled && this.speech) {
        try { this.speech.speak(welcomeMsg, 'ja'); } catch(e){}
      }
      var self = this;
      setTimeout(function() { try { if (self.trainingCharacter) self.trainingCharacter.setExpression('normal'); } catch(e){} }, 2000);
    },

    updateTrainingQuickButtons: function() {
      var container = document.getElementById('training-quick-buttons');
      if (!container) return;
      container.innerHTML = '';
      var self = this;
      var quickList = [
        {text:'メニュー教える', msg:'新しいメニューを教えるね'},
        {text:'ルール教える', msg:'お店のルールを教えるね'},
        {text:'イベント教える', msg:'今度のイベントについて教えるね'},
        {text:'接客の言葉遣い', msg:'こういう時はこう答えてね'},
        {text:'覚えたこと確認', msg:'今まで覚えたことを教えて'},
        {text:'キャスト情報', msg:'キャストについて教えるね'}
      ];
      for (var i = 0; i < quickList.length; i++) {
        (function(b) {
          var btn = document.createElement('button');
          btn.className = 'quick-btn';
          btn.textContent = b.text;
          btn.addEventListener('click', function() { self.sendTrainingMessage(b.msg); });
          container.appendChild(btn);
        })(quickList[i]);
      }
    },

    addTrainingMessage: function(role, text) {
      var container = document.getElementById('training-messages');
      if (!container) return;
      var div = document.createElement('div');
      div.className = 'message ' + role;
      var escaped = this.escapeHtml(text);
      if (role === 'assistant') {
        div.innerHTML = '<span class="msg-name">Mirai</span><span class="msg-text">' + escaped + '</span>';
      } else if (role === 'system-info') {
        div.innerHTML = '<span class="msg-text" style="background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.3);font-size:13px;color:#B794F6;">💾 ' + escaped + '</span>';
      } else {
        div.innerHTML = '<span class="msg-name" style="color:#7C3AED;">オーナー</span><span class="msg-text">' + escaped + '</span>';
      }
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    },

    showTrainingSpeechBubble: function(text) {
      var bubble = document.getElementById('training-speech-bubble');
      var textEl = document.getElementById('training-speech-text');
      if (bubble && textEl) { textEl.textContent = text; bubble.classList.add('visible'); }
    },

    hideTrainingSpeechBubble: function() {
      var bubble = document.getElementById('training-speech-bubble');
      if (bubble) bubble.classList.remove('visible');
    },

    sendTrainingMessage: function(text) {
      if (this.isSending) return;
      this.isSending = true;
      var self = this;

      this.addTrainingMessage('user', text);
      try { if (this.trainingCharacter) this.trainingCharacter.setExpression('think'); } catch(e){}
      this.showTrainingSpeechBubble('うーん、覚えてるよ...');

      var thinkingDiv = document.createElement('div');
      thinkingDiv.className = 'message assistant';
      thinkingDiv.innerHTML = '<span class="msg-name">Mirai</span><span class="msg-text typing-indicator"><span>.</span><span>.</span><span>.</span></span>';
      var chatMessages = document.getElementById('training-messages');
      if (chatMessages) chatMessages.appendChild(thinkingDiv);

      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/training', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 30000;

      xhr.onload = function() {
        if (thinkingDiv.parentNode) thinkingDiv.remove();
        self.isSending = false;

        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            self.trainingHistory.push({role:'user',content:text});
            self.trainingHistory.push({role:'assistant',content:data.reply});

            self.addTrainingMessage('assistant', data.reply);
            self.showTrainingSpeechBubble(data.reply);

            if (data.saved && data.saved.length > 0) {
              for (var i = 0; i < data.saved.length; i++) {
                self.addTrainingMessage('system-info', '覚えました: 「' + data.saved[i].keyword + '」→「' + data.saved[i].response + '」');
              }
            }

            try { if (self.trainingCharacter) self.trainingCharacter.setExpression('smile'); } catch(e){}
            if (self.trainingSoundEnabled && self.speech) {
              try { self.speech.speak(data.reply, 'ja'); } catch(e){}
            }
            setTimeout(function() { try { if (self.trainingCharacter) self.trainingCharacter.setExpression('normal'); } catch(e){} }, 2000);
          } catch(e) {
            self.addTrainingMessage('system-info', 'エラー: ' + e.message);
          }
        } else {
          self.addTrainingMessage('system-info', 'サーバーエラーが発生しました');
        }
      };

      xhr.onerror = function() {
        if (thinkingDiv.parentNode) thinkingDiv.remove();
        self.isSending = false;
        self.addTrainingMessage('system-info', 'ネットワークエラー');
      };

      xhr.ontimeout = function() {
        if (thinkingDiv.parentNode) thinkingDiv.remove();
        self.isSending = false;
        self.addTrainingMessage('system-info', 'タイムアウト');
      };

      xhr.send(JSON.stringify({
        message: text,
        cafeId: this.cafeId,
        history: this.trainingHistory.slice(-10)
      }));
    },

    // ===== Customer Mode (existing) =====
    renderCafeSelect: function() {
      var self = this;
      var container = document.getElementById('cafe-select');
      if (!container) return;
      container.innerHTML = '';
      for (var i = 0; i < this.cafes.length; i++) {
        (function(cafe) {
          var btn = document.createElement('button');
          btn.className = 'cafe-option' + (cafe.id === self.cafeId ? ' active' : '');
          btn.textContent = cafe.nameEn;
          btn.addEventListener('click', function() {
            self.cafeId = cafe.id;
            var all = container.querySelectorAll('.cafe-option');
            for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
            btn.classList.add('active');
          });
          container.appendChild(btn);
        })(this.cafes[i]);
      }
      container.style.display = 'flex';
    },

    showScreen: function(id) {
      var screens = document.querySelectorAll('.screen');
      for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
      var s = document.getElementById(id);
      if (s) s.classList.add('active');
    },

    selectLanguage: function(lang) {
      this.lang = lang;
      this.history = [];
      this.debug('Language: ' + lang);
      this.showScreen('main-screen');
      this.initMainScreen();
    },

    initMainScreen: function() {
      if (!this.character) {
        try {
          this.character = new CafeCharacter('character-container');
          this.character.startBlinking();
        } catch(e) { this.debug('Character error: ' + e.message); }
      }

      var chat = document.getElementById('chat-messages');
      if (chat) chat.innerHTML = '';
      this.updateQuickButtons();

      var msgs = {
        ja: 'おかえりなさいませ、ご主人様~！ミライです！なんでも聞いてくださいね！',
        en: "Welcome~! I'm Mirai! Feel free to ask me anything about our cafe!",
        zh: '欢迎光临~！我是未来！有什么想问的尽管问我吧！',
        ko: '어서 오세요~! 저는 미라이예요! 뭐든 물어봐 주세요!',
        fr: "Bienvenue~! Je suis Mirai! N'hesitez pas a me poser des questions!",
        es: 'Bienvenido~! Soy Mirai! Preguntame lo que quieras!',
        th: 'ยินดีต้อนรับค่ะ~! มิไรเองค่ะ! ถามอะไรก็ได้นะคะ!'
      };
      var msg = msgs[this.lang] || msgs.en;
      this.showSpeechBubble(msg);
      this.addMessage('assistant', msg);

      try { if (this.character) this.character.setExpression('smile'); } catch(e){}
      if (this.soundEnabled && this.speech) {
        try { this.speech.speak(msg, this.lang); } catch(e){}
      }
      var self = this;
      setTimeout(function() { try { if (self.character) self.character.setExpression('normal'); } catch(e){} }, 2000);

      var input = document.getElementById('chat-input');
      if (input) {
        var ph = { ja:'メッセージを入力...', en:'Type a message...', zh:'输入消息...', ko:'메시지를 입력하세요...', fr:'Tapez un message...', es:'Escribe un mensaje...', th:'พิมพ์ข้อความ...' };
        input.placeholder = ph[this.lang] || ph.en;
      }
    },

    showSpeechBubble: function(text) {
      var bubble = document.getElementById('speech-bubble');
      var textEl = document.getElementById('speech-text');
      if (bubble && textEl) { textEl.textContent = text; bubble.classList.add('visible'); }
    },

    hideSpeechBubble: function() {
      var bubble = document.getElementById('speech-bubble');
      if (bubble) bubble.classList.remove('visible');
    },

    updateQuickButtons: function() {
      var buttons = {
        ja: [
          {text:'メニューは？',msg:'メニューを教えて！'},
          {text:'注文方法は？',msg:'どうやって注文するの？'},
          {text:'写真OK？',msg:'写真撮ってもいい？'},
          {text:'支払い方法は？',msg:'支払い方法は何がある？'},
          {text:'チェキは？',msg:'チェキについて教えて！'},
          {text:'アクセスは？',msg:'お店への行き方を教えて！'}
        ],
        en: [
          {text:'Menu?',msg:"What's on the menu?"},
          {text:'How to order?',msg:'How do I order?'},
          {text:'Photos OK?',msg:'Can I take photos?'},
          {text:'Payment?',msg:'What payment methods do you accept?'},
          {text:'Cheki?',msg:'Tell me about cheki photos'},
          {text:'Access?',msg:'How do I get here?'}
        ],
        zh: [
          {text:'菜单？',msg:'菜单上有什么？'},
          {text:'怎么点餐？',msg:'怎么点餐？'},
          {text:'可以拍照吗？',msg:'可以拍照吗？'},
          {text:'支付方式？',msg:'可以用什么支付方式？'},
          {text:'拍立得？',msg:'请告诉我关于拍立得的信息'},
          {text:'交通？',msg:'怎么到这里？'}
        ],
        ko: [
          {text:'메뉴?',msg:'메뉴를 알려주세요'},
          {text:'주문 방법?',msg:'어떻게 주문하나요?'},
          {text:'사진 OK?',msg:'사진 찍어도 되나요?'},
          {text:'결제 방법?',msg:'결제 방법은 뭐가 있나요?'},
          {text:'체키?',msg:'체키에 대해 알려주세요'},
          {text:'교통?',msg:'어떻게 가나요?'}
        ],
        fr: [
          {text:'Menu?',msg:"Qu'y a-t-il au menu?"},
          {text:'Commander?',msg:'Comment commander?'},
          {text:'Photos?',msg:'Puis-je prendre des photos?'},
          {text:'Paiement?',msg:'Quels modes de paiement acceptez-vous?'},
          {text:'Cheki?',msg:'Parlez-moi des photos cheki'},
          {text:'Acces?',msg:'Comment venir ici?'}
        ],
        es: [
          {text:'Menu?',msg:'Que hay en el menu?'},
          {text:'Pedir?',msg:'Como pido?'},
          {text:'Fotos?',msg:'Puedo tomar fotos?'},
          {text:'Pago?',msg:'Que metodos de pago aceptan?'},
          {text:'Cheki?',msg:'Cuentame sobre las fotos cheki'},
          {text:'Acceso?',msg:'Como llego aqui?'}
        ],
        th: [
          {text:'เมนู?',msg:'มีเมนูอะไรบ้าง?'},
          {text:'สั่งยังไง?',msg:'สั่งอาหารยังไง?'},
          {text:'ถ่ายรูปได้ไหม?',msg:'ถ่ายรูปได้ไหม?'},
          {text:'จ่ายเงิน?',msg:'จ่ายเงินยังไงได้บ้าง?'},
          {text:'Cheki?',msg:'Cheki คืออะไร?'},
          {text:'การเดินทาง?',msg:'มาที่นี่ยังไง?'}
        ]
      };
      var container = document.getElementById('quick-buttons');
      if (!container) return;
      container.innerHTML = '';
      var self = this;
      var list = buttons[this.lang] || buttons.en;
      for (var i = 0; i < list.length; i++) {
        (function(b) {
          var btn = document.createElement('button');
          btn.className = 'quick-btn';
          btn.textContent = b.text;
          btn.addEventListener('click', function() { self.sendMessage(b.msg); });
          container.appendChild(btn);
        })(list[i]);
      }
    },

    escapeHtml: function(text) {
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    addMessage: function(role, text) {
      var container = document.getElementById('chat-messages');
      if (!container) return;
      var div = document.createElement('div');
      div.className = 'message ' + role;
      var escaped = this.escapeHtml(text);
      if (role === 'assistant') {
        div.innerHTML = '<span class="msg-name">Mirai</span><span class="msg-text">' + escaped + '</span>';
      } else if (role === 'error') {
        div.innerHTML = '<span class="msg-text">' + escaped + '</span>';
      } else {
        div.innerHTML = '<span class="msg-text">' + escaped + '</span>';
      }
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    },

    sendMessage: function(text) {
      if (this.isSending) return;
      this.isSending = true;
      var self = this;

      this.addMessage('user', text);
      try { if (this.character) this.character.setExpression('think'); } catch(e){}
      this.showSpeechBubble('...');

      var thinkingDiv = document.createElement('div');
      thinkingDiv.className = 'message assistant';
      thinkingDiv.innerHTML = '<span class="msg-name">Mirai</span><span class="msg-text typing-indicator"><span>.</span><span>.</span><span>.</span></span>';
      var chatMessages = document.getElementById('chat-messages');
      if (chatMessages) chatMessages.appendChild(thinkingDiv);

      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/chat', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 30000;

      xhr.onload = function() {
        if (thinkingDiv.parentNode) thinkingDiv.remove();
        self.isSending = false;

        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            self.history.push({role:'user',content:text});
            self.history.push({role:'assistant',content:data.reply});
            self.addMessage('assistant', data.reply);
            self.showSpeechBubble(data.reply);
            try { if (self.character) self.character.setExpression('smile'); } catch(e){}
            if (self.soundEnabled && self.speech) {
              try { self.speech.speak(data.reply, self.lang); } catch(e){}
            }
            setTimeout(function() { try { if (self.character) self.character.setExpression('normal'); } catch(e){} }, 2000);
          } catch(e) {
            self.showError('Response parse error: ' + e.message);
          }
        } else {
          var errMsg = 'Server error ' + xhr.status;
          try { errMsg += ': ' + JSON.parse(xhr.responseText).error; } catch(e) { errMsg += ': ' + xhr.responseText.substring(0, 200); }
          self.showError(errMsg);
        }
      };

      xhr.onerror = function() {
        if (thinkingDiv.parentNode) thinkingDiv.remove();
        self.isSending = false;
        self.showError('Network error - could not reach server');
      };

      xhr.ontimeout = function() {
        if (thinkingDiv.parentNode) thinkingDiv.remove();
        self.isSending = false;
        self.showError('Request timeout - server took too long');
      };

      var body = JSON.stringify({
        message: text,
        lang: this.lang,
        cafeId: this.cafeId,
        history: this.history.slice(-10)
      });

      self.debug('Sending: ' + text.substring(0, 50));
      xhr.send(body);
    },

    showError: function(detail) {
      this.debug('Error: ' + detail);
      var errorMsgs = {
        ja: 'エラーが発生しました',
        en: 'An error occurred',
        zh: '发生错误',
        ko: '오류가 발생했습니다',
        fr: 'Une erreur est survenue',
        es: 'Ocurrio un error',
        th: 'เกิดข้อผิดพลาด'
      };
      var msg = (errorMsgs[this.lang] || errorMsgs.en) + '\n[' + detail + ']';
      this.addMessage('error', msg);
      this.showSpeechBubble('Oops...');
      try { if (this.character) this.character.setExpression('surprise'); } catch(e){}
      var self = this;
      setTimeout(function() { try { if (self.character) self.character.setExpression('normal'); } catch(e){} }, 2000);
    }
  };

  window.App = App;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { App.init(); });
  } else {
    App.init();
  }
})();
