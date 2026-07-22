/**
 * speech.js - Web Native Speech Recognition (STT) and Speech Synthesis (TTS)
 */

export class SpeechManager {
  constructor() {
    this.synth = window.speechSynthesis;
    this.recognition = null;
    this.isListening = false;
    this.voices = [];
    this.selectedVoice = null;
    this.rate = 1.0; // Speech speed rate
    this.pitch = 1.0;
    this.autoPlay = true;

    this.initRecognition();
    this.initVoices();
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
    this.recognition.lang = 'en-US'; // Default to English recognition
  }

  startListening(onResult, onEnd, onError, onVolumeChange) {
    if (!this.recognition) {
      if (onError) onError('Your browser does not support Web Speech Recognition.');
      return;
    }

    if (this.isListening) {
      this.stopListening();
    }

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

  // --- Speech Synthesis (TTS) ---
  initVoices() {
    if (!this.synth) return;

    const loadVoices = () => {
      this.voices = this.synth.getVoices();
      // Prefer English voices (Samantha, Alex, Google US English, Natural Voices)
      const englishVoices = this.voices.filter(v => v.lang.startsWith('en'));
      if (englishVoices.length > 0) {
        this.selectedVoice = englishVoices.find(v => v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Alex')) || englishVoices[0];
      }
    };

    loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = loadVoices;
    }
  }

  speak(text, onStart, onEnd) {
    if (!this.synth) return;

    // Stop current speaking
    this.stopSpeaking();

    // Clean markdown syntax for speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '') // remove code blocks
      .replace(/[\#\*\_\~\`]/g, '') // remove markdown symbols
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // link formatting
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;

    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    } else {
      utterance.lang = 'en-US';
    }

    utterance.onstart = () => {
      if (onStart) onStart();
    };

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    utterance.onerror = (err) => {
      console.error('Speech synthesis error:', err);
      if (onEnd) onEnd();
    };

    this.synth.speak(utterance);
  }

  stopSpeaking() {
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
    }
  }

  setRate(rate) {
    this.rate = parseFloat(rate) || 1.0;
  }

  setVoice(voiceName) {
    const found = this.voices.find(v => v.name === voiceName);
    if (found) {
      this.selectedVoice = found;
    }
  }

  getEnglishVoices() {
    return this.voices.filter(v => v.lang.startsWith('en'));
  }
}

export const speech = new SpeechManager();
