class CafeSpeech {
  constructor() {
    this.speaking = false;
    this.onStart = null;
    this.onEnd = null;
    this.onListenEnd = null;
    this.onAudioCreated = null;
    this.recognition = null;
    this.currentAudio = null;
  }

  speak(text, lang) {
    var self = this;
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    return new Promise(function(resolve) {
      self.speaking = true;
      if (self.onStart) self.onStart();

      // Use server-side TTS (Microsoft Edge Neural Voices)
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/tts', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.responseType = 'blob';
      xhr.timeout = 15000;

      xhr.onload = function() {
        if (xhr.status === 200) {
          var blob = xhr.response;
          var url = URL.createObjectURL(blob);
          var audio = new Audio(url);
          self.currentAudio = audio;

          audio.onended = function() {
            self.speaking = false;
            self.currentAudio = null;
            URL.revokeObjectURL(url);
            if (self.onEnd) self.onEnd();
            resolve();
          };

          audio.onerror = function() {
            self.speaking = false;
            self.currentAudio = null;
            URL.revokeObjectURL(url);
            if (self.onEnd) self.onEnd();
            resolve();
          };

          // Notify for lip sync
          if (self.onAudioCreated) self.onAudioCreated(audio);

          audio.play().catch(function(e) {
            console.warn('Audio play failed:', e.message);
            self.speaking = false;
            self.currentAudio = null;
            if (self.onEnd) self.onEnd();
            resolve();
          });
        } else {
          console.warn('TTS server error:', xhr.status);
          self.speaking = false;
          if (self.onEnd) self.onEnd();
          resolve();
        }
      };

      xhr.onerror = function() {
        console.warn('TTS network error');
        self.speaking = false;
        if (self.onEnd) self.onEnd();
        resolve();
      };

      xhr.ontimeout = function() {
        console.warn('TTS timeout');
        self.speaking = false;
        if (self.onEnd) self.onEnd();
        resolve();
      };

      xhr.send(JSON.stringify({ text: text, lang: lang }));
    });
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.speaking = false;
    if (this.onEnd) this.onEnd();
  }

  // Speech-to-Text (STT)
  startListening(lang, onResult) {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported');
      if (this.onListenEnd) this.onListenEnd();
      return null;
    }

    if (this.recognition) {
      try { this.recognition.abort(); } catch(e) {}
    }

    var langMap = {
      ja: 'ja-JP', en: 'en-US', zh: 'zh-CN', ko: 'ko-KR', fr: 'fr-FR', es: 'es-ES', th: 'th-TH'
    };

    try {
      var self = this;
      this.recognition = new SpeechRecognition();
      this.recognition.lang = langMap[lang] || 'en-US';
      this.recognition.interimResults = true;
      this.recognition.continuous = false;

      this.recognition.onresult = function(event) {
        var transcript = '';
        var isFinal = false;
        for (var i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
          if (event.results[i].isFinal) isFinal = true;
        }
        if (onResult) onResult(transcript, isFinal);
      };

      this.recognition.onerror = function() {
        if (self.onListenEnd) self.onListenEnd();
      };

      this.recognition.onend = function() {
        if (self.onListenEnd) self.onListenEnd();
      };

      this.recognition.start();
    } catch(e) {
      console.warn('STT start error:', e);
      if (this.onListenEnd) this.onListenEnd();
    }
    return this.recognition;
  }

  stopListening() {
    if (this.recognition) {
      try { this.recognition.stop(); } catch(e) {}
      this.recognition = null;
    }
  }
}
