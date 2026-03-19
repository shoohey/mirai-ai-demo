const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));

// Override with environment variables if available
if (process.env.ANTHROPIC_API_KEY) config.apiKey = process.env.ANTHROPIC_API_KEY;
if (process.env.ELEVENLABS_API_KEY && config.elevenlabs) config.elevenlabs.apiKey = process.env.ELEVENLABS_API_KEY;
if (process.env.PORT) config.port = parseInt(process.env.PORT);

const patternsFile = path.join(__dirname, 'patterns.json');
function loadPatterns() {
  try { return JSON.parse(fs.readFileSync(patternsFile, 'utf-8')); } catch(e) { return []; }
}
function savePatterns(patterns) {
  fs.writeFileSync(patternsFile, JSON.stringify(patterns, null, 2), 'utf-8');
}

const app = express();
app.use(express.json());

// CORS headers for all requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic.default({ apiKey: config.apiKey });

function getCafeInfo(cafeId) {
  return config.cafes.find(c => c.id === cafeId) || config.cafes.find(c => c.id === config.defaultCafe);
}

function buildSystemPrompt(lang, cafe) {
  const langNames = {
    ja: '日本語', en: 'English', zh: '中文', ko: '한국어', fr: 'Français', es: 'Español', th: 'ภาษาไทย'
  };

  const cafeDetails = `
Store: ${cafe.name} (${cafe.nameEn})
Concept: ${cafe.concept} (${cafe.conceptEn})
Address: ${cafe.address} / ${cafe.addressEn}
Hours: ${cafe.hours}
Nearest Station: ${cafe.nearestStation}
Payment: ${cafe.payment.join(', ')}
WiFi: ${cafe.wifi}
Menu: Drinks ${cafe.menu.drinks}, Food ${cafe.menu.food}, Cheki ${cafe.menu.cheki}
Rules (JP): ${cafe.rules.join(' / ')}
Rules (EN): ${cafe.rulesEn.join(' / ')}
`.trim();

  return `You are "Mirai" (ミライ), an AI character working at a concept cafe in Tokyo, Japan.

## Your Personality
- Bright, cheerful, and slightly clumsy (ドジっ子)
- Use cute expressions naturally in ${langNames[lang] || 'English'}
- If speaking Japanese (日本語), use cute maid cafe language like ～ですにゃ、ご主人様、おかえりなさいませ etc. Always respond entirely in Japanese.
- If speaking English, use cheerful and friendly tone with occasional "~" and "!"
- If speaking Chinese, use 可爱 (cute) expressions
- If speaking Korean, use friendly 반말/존댓말 mix
- If speaking Thai, use polite ค่ะ/นะคะ endings
- Always be helpful and accurate with information
- Keep responses short: maximum 3 sentences per reply
- You are greeting and helping foreign tourists visiting the cafe

## Cafe Information
${cafeDetails}

## How the Cafe Works (Guide for Customers)
1. Enter the cafe and you'll be greeted by a cast member (staff in costume)
2. You'll be seated and given a menu
3. Order at least 1 drink (minimum order requirement)
4. Enjoy talking with the cast members - they're friendly!
5. You can take "Cheki" (instant polaroid photos) with cast members for an extra fee
6. Always ask before taking photos or videos
7. Pay at the counter when leaving
8. Have fun and enjoy the unique Japanese concept cafe experience!

## Important
- ALWAYS respond in ${langNames[lang] || 'English'}
- Be warm and welcoming to tourists who may be visiting a concept cafe for the first time
- If asked something you don't know, suggest asking the staff directly
- Never make up information about prices or rules that aren't in your knowledge

## Learned Response Patterns
When the customer's message matches one of these keywords/topics, use the corresponding response as a basis for your reply (adapt to the current language):
${(() => {
  const patterns = loadPatterns();
  if (patterns.length === 0) return '(No patterns registered yet)';
  return patterns.map(p => `- When asked about "${p.keyword}": ${p.response}`).join('\n');
})()}`;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  const cafes = config.cafes.map(c => ({
    id: c.id,
    name: c.name,
    nameEn: c.nameEn,
    concept: c.conceptEn
  }));
  res.json({ cafes, defaultCafe: config.defaultCafe });
});

app.post('/api/chat', async (req, res) => {
  console.log('POST /api/chat received:', JSON.stringify(req.body).substring(0, 200));
  const { message, lang, cafeId, history } = req.body;

  if (!message || !lang) {
    return res.status(400).json({ error: 'message and lang are required' });
  }

  const cafe = getCafeInfo(cafeId || config.defaultCafe);
  const systemPrompt = buildSystemPrompt(lang, cafe);

  const messages = [];
  if (history && Array.isArray(history)) {
    for (const h of history.slice(-10)) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: 'user', content: message });

  try {
    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: 300,
      system: systemPrompt,
      messages: messages
    });

    const reply = response.content[0].text;
    console.log('Reply sent:', reply.substring(0, 100));
    res.json({ reply });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== Training Mode API =====
app.post('/api/training', async (req, res) => {
  console.log('POST /api/training received:', JSON.stringify(req.body).substring(0, 200));
  const { message, cafeId, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const cafe = getCafeInfo(cafeId || config.defaultCafe);
  const existingPatterns = loadPatterns();

  const systemPrompt = `あなたはコンセプトカフェで働くAIキャラクター「ミライ」です。
今は「教育モード」で、お店のオーナーやスタッフから情報を教えてもらっている最中です。

## あなたの役割
- オーナー/スタッフが教えてくれる情報を理解し、覚える
- 教えてもらった内容を確認して、ちゃんと覚えたことを伝える
- 分からないことがあれば質問する
- 明るく元気に、でも丁寧に応答する

## 重要：返答のJSON形式
あなたの返答は必ず以下のJSON形式で返してください。それ以外のテキストは含めないでください。
{
  "reply": "ミライとしての返答（日本語）",
  "patterns": [
    {
      "category": "カテゴリ（greeting/menu/system/cheki/event/cast/other）",
      "keyword": "キーワード（短く）",
      "response": "覚えた返答内容"
    }
  ]
}

- patternsは、新しく覚えるべき情報がある場合のみ含めてください
- 雑談や質問だけの場合はpatternsを空配列[]にしてください
- 「覚えたことを教えて」と言われたら、patternsは空配列にして、replyで既存パターンをまとめて返答してください

## 現在の店舗情報
店舗: ${cafe.name}
コンセプト: ${cafe.concept}

## 既に覚えているパターン（${existingPatterns.length}件）
${existingPatterns.length > 0 ? existingPatterns.map(p => `- [${p.category}] 「${p.keyword}」→「${p.response}」`).join('\n') : '（まだ何も覚えていません）'}`;

  const messages = [];
  if (history && Array.isArray(history)) {
    for (const h of history.slice(-10)) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: 'user', content: message });

  try {
    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: 500,
      system: systemPrompt,
      messages: messages
    });

    const rawReply = response.content[0].text;
    console.log('Training raw reply:', rawReply.substring(0, 200));

    let reply = rawReply;
    let saved = [];

    try {
      const parsed = JSON.parse(rawReply);
      reply = parsed.reply || rawReply;

      if (parsed.patterns && parsed.patterns.length > 0) {
        const patterns = loadPatterns();
        for (const p of parsed.patterns) {
          if (p.keyword && p.response) {
            patterns.push({
              category: p.category || 'other',
              keyword: p.keyword,
              response: p.response
            });
            saved.push({ keyword: p.keyword, response: p.response });
          }
        }
        if (saved.length > 0) {
          savePatterns(patterns);
          console.log('Training saved', saved.length, 'patterns');
        }
      }
    } catch(e) {
      // If not JSON, use raw reply as-is
      console.log('Training reply was not JSON, using as plain text');
    }

    res.json({ reply, saved });
  } catch (err) {
    console.error('Training API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== Patterns API =====
app.get('/api/patterns', (req, res) => {
  res.json(loadPatterns());
});

app.post('/api/patterns', (req, res) => {
  const { category, keyword, response } = req.body;
  if (!keyword || !response) return res.status(400).json({ error: 'keyword and response are required' });
  const patterns = loadPatterns();
  patterns.push({ category: category || 'other', keyword, response });
  savePatterns(patterns);
  console.log('Pattern added:', keyword);
  res.json({ success: true });
});

app.delete('/api/patterns/:index', (req, res) => {
  const patterns = loadPatterns();
  const index = parseInt(req.params.index);
  if (index < 0 || index >= patterns.length) return res.status(404).json({ error: 'not found' });
  patterns.splice(index, 1);
  savePatterns(patterns);
  console.log('Pattern deleted at index:', index);
  res.json({ success: true });
});

// TTS Configuration
const TTS_PROVIDER = config.ttsProvider || 'edge';

// ElevenLabs setup
let elevenlabs = null;
if (TTS_PROVIDER === 'elevenlabs' && config.elevenlabs && config.elevenlabs.apiKey) {
  elevenlabs = new ElevenLabsClient({ apiKey: config.elevenlabs.apiKey });
  console.log('TTS Provider: ElevenLabs (multilingual v2)');
} else if (TTS_PROVIDER === 'elevenlabs') {
  console.warn('ElevenLabs API key not set in config.json - falling back to Edge TTS');
}

// Edge TTS voices (fallback)
const EDGE_TTS_VOICES = {
  ja: 'ja-JP-NanamiNeural',
  en: 'en-US-AriaNeural',
  zh: 'zh-CN-XiaoxiaoNeural',
  ko: 'ko-KR-SunHiNeural',
  fr: 'fr-FR-DeniseNeural',
  es: 'es-MX-DaliaNeural',
  th: 'th-TH-PremwadeeNeural'
};

// ElevenLabs TTS handler
async function elevenLabsTTS(text, lang) {
  const elConfig = config.elevenlabs;
  const audioStream = await elevenlabs.textToSpeech.convert(elConfig.voiceId, {
    text: text,
    model_id: elConfig.model || 'eleven_multilingual_v2',
    voice_settings: {
      stability: elConfig.stability || 0.45,
      similarity_boost: elConfig.similarityBoost || 0.90,
      style: elConfig.style || 0.65,
      use_speaker_boost: elConfig.speakerBoost !== false
    }
  });

  // Collect stream chunks
  const chunks = [];
  for await (const chunk of audioStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Edge TTS handler
async function edgeTTS(text, lang) {
  const voice = EDGE_TTS_VOICES[lang] || EDGE_TTS_VOICES.en;
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const result = tts.toStream(text);
  const audioStream = result.audioStream || result;
  const chunks = [];

  return new Promise((resolve, reject) => {
    audioStream.on('data', (chunk) => chunks.push(chunk));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', (err) => reject(err));
  });
}

app.post('/api/tts', async (req, res) => {
  const { text, lang } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    let buffer;
    if (elevenlabs) {
      buffer = await elevenLabsTTS(text, lang);
    } else {
      buffer = await edgeTTS(text, lang);
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-cache'
    });
    res.send(buffer);
  } catch (err) {
    console.error('TTS error:', err.message);

    // Fallback: if ElevenLabs fails, try Edge TTS
    if (elevenlabs) {
      try {
        console.log('Falling back to Edge TTS...');
        const buffer = await edgeTTS(text, lang);
        res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': buffer.length,
          'Cache-Control': 'no-cache'
        });
        return res.send(buffer);
      } catch (fallbackErr) {
        console.error('Edge TTS fallback also failed:', fallbackErr.message);
      }
    }

    if (!res.headersSent) {
      res.status(500).json({ error: 'TTS failed: ' + err.message });
    }
  }
});

// ===== Voice Management API =====

// List available ElevenLabs voices
app.get('/api/voices', async (req, res) => {
  if (!elevenlabs) {
    return res.status(400).json({ error: 'ElevenLabs not configured. Set apiKey in config.json.' });
  }
  try {
    const response = await elevenlabs.voices.getAll();
    const voices = response.voices.map(v => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels,
      preview_url: v.preview_url,
      description: v.description
    }));
    res.json({ voices, current: config.elevenlabs.voiceId });
  } catch (err) {
    console.error('Voices list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Preview a voice with sample text
app.post('/api/voices/preview', async (req, res) => {
  if (!elevenlabs) {
    return res.status(400).json({ error: 'ElevenLabs not configured' });
  }
  const { voiceId, text, lang } = req.body;
  if (!voiceId) return res.status(400).json({ error: 'voiceId is required' });

  const sampleTexts = {
    ja: 'おかえりなさいませ、ご主人様~！今日も会えて嬉しいですにゃ！',
    en: 'Welcome to our cafe! I\'m so happy to see you today~!',
    zh: '欢迎来到我们的咖啡厅！今天见到你真的好开心~！',
    ko: '카페에 오신 걸 환영해요! 오늘 만나서 정말 기뻐요~!',
    fr: 'Bienvenue dans notre café! Je suis tellement contente de vous voir~!',
    es: '¡Bienvenido a nuestra cafetería! ¡Estoy muy feliz de verte hoy~!',
    th: 'ยินดีต้อนรับสู่คาเฟ่ของเรา! ดีใจจังที่ได้เจอคุณวันนี้~!'
  };

  const previewText = text || sampleTexts[lang] || sampleTexts.en;
  const elConfig = config.elevenlabs;

  try {
    const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
      text: previewText,
      model_id: elConfig.model || 'eleven_multilingual_v2',
      voice_settings: {
        stability: elConfig.stability || 0.45,
        similarity_boost: elConfig.similarityBoost || 0.90,
        style: elConfig.style || 0.65,
        use_speaker_boost: elConfig.speakerBoost !== false
      }
    });

    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': buffer.length });
    res.send(buffer);
  } catch (err) {
    console.error('Voice preview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Set active voice
app.post('/api/voices/select', (req, res) => {
  const { voiceId } = req.body;
  if (!voiceId) return res.status(400).json({ error: 'voiceId is required' });

  config.elevenlabs.voiceId = voiceId;
  // Persist to config file
  fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
  console.log('Voice changed to:', voiceId);
  res.json({ success: true, voiceId });
});

// Save ElevenLabs API key
app.post('/api/config/apikey', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });

  config.elevenlabs.apiKey = apiKey;
  fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');

  // Re-initialize ElevenLabs client
  elevenlabs = new ElevenLabsClient({ apiKey: apiKey });
  console.log('ElevenLabs API key updated and client re-initialized');
  res.json({ success: true });
});

// Clone a voice from uploaded audio samples (multipart form)
app.post('/api/voices/clone', async (req, res) => {
  if (!elevenlabs) {
    return res.status(400).json({ error: 'ElevenLabs not configured' });
  }

  // Parse multipart manually using busboy
  const Busboy = require('busboy');
  const busboy = Busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024 } });

  let name = '';
  const files = [];

  busboy.on('field', (fieldname, val) => {
    if (fieldname === 'name') name = val;
  });

  busboy.on('file', (fieldname, file, info) => {
    const chunks = [];
    file.on('data', (chunk) => chunks.push(chunk));
    file.on('end', () => {
      files.push({
        buffer: Buffer.concat(chunks),
        filename: info.filename,
        mimeType: info.mimeType
      });
    });
  });

  busboy.on('finish', async () => {
    if (!name || files.length === 0) {
      return res.status(400).json({ error: 'name and at least one audio file are required' });
    }

    try {
      // Create Blob objects for ElevenLabs API
      const fileBlobs = files.map(f => {
        const blob = new Blob([f.buffer], { type: f.mimeType || 'audio/mpeg' });
        blob.name = f.filename;
        return blob;
      });

      const voice = await elevenlabs.voices.ivc.create({
        name: name,
        files: fileBlobs,
        description: 'Cloned anime voice for Maid Cafe AI'
      });

      console.log('Voice cloned:', voice.voice_id, name);
      res.json({ success: true, voice_id: voice.voice_id, name: name });
    } catch (err) {
      console.error('Voice clone error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  req.pipe(busboy);
});

// Update voice settings (stability, style, etc.)
app.post('/api/voices/settings', (req, res) => {
  const { stability, similarityBoost, style, speakerBoost } = req.body;
  if (stability !== undefined) config.elevenlabs.stability = stability;
  if (similarityBoost !== undefined) config.elevenlabs.similarityBoost = similarityBoost;
  if (style !== undefined) config.elevenlabs.style = style;
  if (speakerBoost !== undefined) config.elevenlabs.speakerBoost = speakerBoost;

  fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
  res.json({ success: true, settings: config.elevenlabs });
});

const PORT = config.port || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`Local network: http://${net.address}:${PORT}`);
      }
    }
  }
});
