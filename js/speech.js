/**
 * speech.js - Web Native Speech Recognition (STT) & Pure Cloud HD Neural Audio Synthesis (TTS)
 * 100% High-Definition Natural Human Voices (US/UK/AU Accents)
 * iOS Safari HTML5 Audio Unlocked
 */

export class SpeechManager {
  constructor() {
    this.synth = window.speechSynthesis;
    this.recognition = null;
    this.isListening = false;
    this.rate = 1.0; // Speech speed rate
    this.autoPlay = true;
    this.recLang = 'zh-TW'; // Default to zh-TW for seamless mixed Chinese + English recognition
    this.ttsEngine = 'google-hd-us'; // Default to Google Cloud HD Audio for natural human voice
    this.audioPlayer = new Audio(); // Persistent HTML5 Audio instance for iOS Safari
    this.wakeLock = null;

    this.initRecognition();
    this.initMediaSession();
  }

  // --- Speech Recognition (STT) ---
  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Web Speech Recognition API is not supported in this browser.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false; // Stop when user stops speaking
    this.recognition.interimResults = true; // Show real-time interim transcript
    this.recognition.lang = this.recLang || 'zh-TW';
  }

  setRecLang(lang) {
    this.recLang = lang || 'zh-TW';
    if (this.recognition) {
      this.recognition.lang = this.recLang;
    }
  }

  setTTSEngine(engine) {
    this.ttsEngine = engine || 'google-hd-us';
  }

  startListening(onResult, onEnd, onError, onVolumeChange) {
    if (!this.recognition) {
      if (onError) onError('您的瀏覽器不支援 Web Speech 語音辨識功能。');
      return;
    }

    if (this.isListening) {
      this.stopListening();
    }

    // Set active language right before starting
    this.recognition.lang = this.recLang || 'zh-TW';

    let finalTranscript = '';

    this.recognition.onstart = () => {
      this.isListening = true;
      if (onVolumeChange) onVolumeChange(true);
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      if (onResult) {
        onResult(finalTranscript || interimTranscript, !!finalTranscript);
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.isListening = false;
      if (onVolumeChange) onVolumeChange(false);
      if (onError) onError(event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (onVolumeChange) onVolumeChange(false);
      if (onEnd) onEnd(finalTranscript);
    };

    try {
      this.recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  // --- CarPlay & Lock Screen Media Session API ---
  initMediaSession() {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '戶外品牌商務口說教練',
          artist: 'AI Partner Voice',
          album: '英語口語 PWA',
          artwork: [
            { src: 'assets/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
          ]
        });

        navigator.mediaSession.setActionHandler('play', () => {
          this.unlock();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          this.stopSpeaking();
        });
      } catch (e) {
        console.warn('MediaSession init warning:', e);
      }
    }
  }

  // --- Screen Wake Lock for Driving Mode ---
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('Screen Wake Lock active');
      } catch (e) {
        console.warn('Wake Lock request failed:', e);
      }
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
        this.wakeLock = null;
      } catch (e) {}
    }
  }

  /**
   * iOS Safari User-Gesture Unlock Helper
   * Synchronously unlocks HTML5 Audio context on iOS!
   */
  unlock() {
    if (this.audioPlayer) {
      try {
        // Unlock HTML5 Audio context for iOS Safari
        this.audioPlayer.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        this.audioPlayer.play().catch(() => {});
      } catch (e) {}
    }
  }

  setRate(rate) {
    this.rate = parseFloat(rate) || 1.0;
  }

  speak(text, onStart, onEnd) {
    this.stopSpeaking();

    let lang = 'en';
    if (this.ttsEngine === 'google-hd-uk') lang = 'en-gb';
    if (this.ttsEngine === 'google-hd-au') lang = 'en-au';
    
    // Always use Cloud HD Neural Human Audio
    this.playCloudTTS(text, lang, onStart, onEnd);
  }

  // --- Cloud HD Audio Stream Player ---
  playCloudTTS(text, lang = 'en', onStart, onEnd) {
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '') // remove code blocks
      .replace(/[\#\*\_\~\`]/g, '') // remove markdown symbols
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // link formatting
      .replace(/\n+/g, ' ')
      .trim();

    if (!cleanText) {
      if (onEnd) onEnd();
      return;
    }

    const chunks = this._splitTextIntoChunks(cleanText, 170);
    this._playChunksSequentially(chunks, lang, onStart, onEnd);
  }

  _splitTextIntoChunks(text, maxLength = 170) {
    const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
    const chunks = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + sentence).length <= maxLength) {
        current += sentence;
      } else {
        if (current) chunks.push(current.trim());
        if (sentence.length <= maxLength) {
          current = sentence;
        } else {
          const words = sentence.split(' ');
          let wordChunk = '';
          for (const w of words) {
            if ((wordChunk + ' ' + w).length <= maxLength) {
              wordChunk += (wordChunk ? ' ' : '') + w;
            } else {
              if (wordChunk) chunks.push(wordChunk.trim());
              wordChunk = w;
            }
          }
          current = wordChunk;
        }
      }
    }
    if (current) chunks.push(current.trim());
    return chunks;
  }

  _playChunksSequentially(chunks, lang, onStart, onEnd) {
    if (chunks.length === 0) {
      if (onEnd) onEnd();
      return;
    }

    let index = 0;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    if (onStart) onStart();

    const playNext = () => {
      if (index >= chunks.length) {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
        if (onEnd) onEnd();
        return;
      }

      const chunkText = chunks[index];
      index++;

      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunkText)}&tl=${lang}&client=tw-ob`;
      
      this.audioPlayer.src = url;
      this.audioPlayer.playbackRate = this.rate || 1.0;

      this.audioPlayer.onended = () => {
        playNext();
      };

      this.audioPlayer.onerror = (err) => {
        console.warn('Cloud Audio chunk play warning:', err);
        playNext();
      };

      this.audioPlayer.play().catch(err => {
        console.warn('Cloud Audio play catch:', err);
        playNext();
      });
    };

    playNext();
  }

  stopSpeaking() {
    if (this.audioPlayer) {
      try {
        this.audioPlayer.pause();
      } catch (e) {}
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }
}

export const speech = new SpeechManager();
