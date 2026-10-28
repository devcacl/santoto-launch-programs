import { useCallback, useEffect, useRef, useState } from 'react';

const SETTINGS_KEY = 'santoto-launch-feedback-v1';

export function useExperienceFeedback() {
  const audioRef = useRef(null);
  const [settings, setSettings] = useState(() => {
    try { return { sound: true, vibration: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
    catch { return { sound: true, vibration: true }; }
  });

  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);

  const play = useCallback((kind = 'tap') => {
    if (!settings.sound || typeof window === 'undefined') return;
    try {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return;
      audioRef.current ||= new AudioContextType();
      const context = audioRef.current;
      if (context.state === 'suspended') context.resume();
      const frequencies = kind === 'success' ? [660, 880] : kind === 'coin' ? [740, 990, 1175] : [520];
      frequencies.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.085;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(kind === 'tap' ? 0.045 : 0.075, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.14);
      });
    } catch { /* Audio is an optional enhancement; the activity stays usable without it. */ }
  }, [settings.sound]);

  const vibrate = useCallback((kind = 'tap') => {
    if (!settings.vibration || typeof navigator === 'undefined' || !navigator.vibrate) return;
    navigator.vibrate(kind === 'success' ? [20, 45, 25] : kind === 'coin' ? [18, 30, 18, 30, 35] : 12);
  }, [settings.vibration]);

  const feedback = useCallback((kind = 'tap') => { play(kind); vibrate(kind); }, [play, vibrate]);
  const toggle = (key) => setSettings((previous) => ({ ...previous, [key]: !previous[key] }));
  return { settings, toggle, feedback };
}
