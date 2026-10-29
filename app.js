/**
 * Timer Plus PWA - Interval Timer Application
 * Pure Vanilla JS (ES6+) / Offline First / AMOLED Power Saving
 */

(() => {
  'use strict';

  // --- Storage Keys ---
  const STORAGE_KEYS = {
    PRESETS: 'timer_plus_presets_v2',
    ACTIVE_ID: 'timer_plus_active_id_v2',
    CONFIG: 'timer_plus_config_v1'
  };

  // --- Default Presets ---
  const DEFAULT_PRESETS = [
    {
      id: 'preset-hiit',
      title: 'HIIT',
      prepareSeconds: 5,
      cooldownSeconds: 5,
      countdownVoice: 3,
      blocks: [
        {
          id: 'blk-hiit-a',
          name: 'A',
          customMode: false,
          workSeconds: 20,
          restSeconds: 10,
          sets: 1,
          customSets: []
        },
        {
          id: 'blk-hiit-b',
          name: 'B',
          customMode: false,
          workSeconds: 20,
          restSeconds: 10,
          sets: 1,
          customSets: []
        },
        {
          id: 'blk-hiit-c',
          name: 'C',
          customMode: false,
          workSeconds: 20,
          restSeconds: 10,
          sets: 1,
          customSets: []
        }
      ]
    },
    {
      id: 'preset-stretch',
      title: 'Stretch',
      prepareSeconds: 5,
      cooldownSeconds: 5,
      countdownVoice: 3,
      blocks: [
        {
          id: 'blk-stretch-a',
          name: 'A',
          customMode: false,
          workSeconds: 30,
          restSeconds: 5,
          sets: 1,
          customSets: []
        },
        {
          id: 'blk-stretch-b',
          name: 'B',
          customMode: false,
          workSeconds: 30,
          restSeconds: 5,
          sets: 1,
          customSets: []
        },
        {
          id: 'blk-stretch-c',
          name: 'C',
          customMode: false,
          workSeconds: 30,
          restSeconds: 5,
          sets: 1,
          customSets: []
        }
      ]
    }
  ];

  // --- Application State ---
  let presets = [];
  let activePresetId = '';
  let editingPreset = null;

  let appConfig = {
    bgAudio: true,
    speech: true,
    beep: true
  };

  // Timer Runtime State
  let timeline = [];
  let currentStepIndex = 0;
  let isRunning = false;
  let stepRemainingMs = 0;
  let lastTickTimestamp = 0;
  let timerIntervalId = null;
  let lastAnnouncedSecond = null;

  // Hardware / Background Helpers
  let wakeLockSentinel = null;
  let silentAudioEl = null;
  let audioCtx = null;

  // --- DOM Elements ---
  const el = {
    body: document.body,
    presetSelect: document.getElementById('presetSelect'),
    btnEditPreset: document.getElementById('btnEditPreset'),
    wakeLockBadge: document.getElementById('wakeLockBadge'),
    btnShareUrl: document.getElementById('btnShareUrl'),
    btnAppConfig: document.getElementById('btnAppConfig'),

    phaseBadge: document.getElementById('phaseBadge'),
    blockTitleDisplay: document.getElementById('blockTitleDisplay'),
    mainClock: document.getElementById('mainClock'),
    phaseProgressBar: document.getElementById('phaseProgressBar'),
    setCounterDisplay: document.getElementById('setCounterDisplay'),
    blockCounterDisplay: document.getElementById('blockCounterDisplay'),
    totalRemainDisplay: document.getElementById('totalRemainDisplay'),
    nextStepDisplay: document.getElementById('nextStepDisplay'),

    btnReset: document.getElementById('btnReset'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnStartPause: document.getElementById('btnStartPause'),
    btnStartPauseText: document.getElementById('btnStartPauseText'),

    // Editor Modal
    modalEditor: document.getElementById('modalEditor'),
    btnNewPreset: document.getElementById('btnNewPreset'),
    btnDuplicatePreset: document.getElementById('btnDuplicatePreset'),
    btnDeletePreset: document.getElementById('btnDeletePreset'),
    inputPresetTitle: document.getElementById('inputPresetTitle'),
    prepH: document.getElementById('prepH'),
    prepM: document.getElementById('prepM'),
    prepS: document.getElementById('prepS'),
    coolH: document.getElementById('coolH'),
    coolM: document.getElementById('coolM'),
    coolS: document.getElementById('coolS'),
    selectCountdownVoice: document.getElementById('selectCountdownVoice'),
    btnAddBlock: document.getElementById('btnAddBlock'),
    blocksContainer: document.getElementById('blocksContainer'),
    btnSavePreset: document.getElementById('btnSavePreset'),

    // Share Modal
    modalShare: document.getElementById('modalShare'),
    sharePresetName: document.getElementById('sharePresetName'),
    qrCodeContainer: document.getElementById('qrCodeContainer'),
    shareUrlInput: document.getElementById('shareUrlInput'),
    btnCopyShareUrl: document.getElementById('btnCopyShareUrl'),

    // Config Modal
    modalConfig: document.getElementById('modalConfig'),
    chkBgAudio: document.getElementById('chkBgAudio'),
    chkSpeech: document.getElementById('chkSpeech'),
    chkBeep: document.getElementById('chkBeep'),
    btnExportJson: document.getElementById('btnExportJson'),
    inputImportJsonFile: document.getElementById('inputImportJsonFile'),
    textareaImportJson: document.getElementById('textareaImportJson'),
    btnImportJsonText: document.getElementById('btnImportJsonText'),

    toast: document.getElementById('toast')
  };

  // --- Utility Functions ---
  function uid(prefix = 'id') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function clampInt(val, min, max) {
    const n = parseInt(val, 10);
    if (Number.isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function secondsToHMS(totalSec) {
    const sec = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return { h, m, s };
  }

  function hmsToSeconds(h, m, s) {
    return (
      clampInt(h, 0, 99) * 3600 +
      clampInt(m, 0, 59) * 60 +
      clampInt(s, 0, 59)
    );
  }

  function formatClock(totalSeconds) {
    const sec = Math.max(0, Math.ceil(totalSeconds));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
    }
    return `${mm}:${ss}`;
  }

  let toastTimeout = null;
  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      el.toast.classList.add('hidden');
    }, 3000);
  }

  // --- LocalStorage Management ---
  function loadState() {
    try {
      const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (savedConfig) {
        appConfig = { ...appConfig, ...JSON.parse(savedConfig) };
      }
    } catch (e) {
      console.warn('Config load error:', e);
    }

    try {
      const savedPresets = localStorage.getItem(STORAGE_KEYS.PRESETS);
      if (savedPresets) {
        const parsed = JSON.parse(savedPresets);
        if (Array.isArray(parsed) && parsed.length > 0) {
          presets = parsed.map(normalizePreset);
        }
      }
    } catch (e) {
      console.warn('Presets load error:', e);
    }

    if (presets.length === 0) {
      presets = deepClone(DEFAULT_PRESETS);
      savePresets();
    }

    const savedActive = localStorage.getItem(STORAGE_KEYS.ACTIVE_ID);
    if (savedActive && presets.some((p) => p.id === savedActive)) {
      activePresetId = savedActive;
    } else {
      activePresetId = presets[0].id;
    }
  }

  function normalizePreset(raw) {
    const blocks = Array.isArray(raw.blocks) && raw.blocks.length > 0
      ? raw.blocks.map((b, idx) => {
          const setsCount = clampInt(b.sets ?? 3, 1, 999);
          const workSec = clampInt(b.workSeconds ?? 30, 1, 359999);
          const restSec = clampInt(b.restSeconds ?? 15, 0, 359999);
          let customSets = Array.isArray(b.customSets) ? b.customSets.map((cs) => ({
            workSeconds: clampInt(cs.workSeconds ?? workSec, 1, 359999),
            restSeconds: clampInt(cs.restSeconds ?? restSec, 0, 359999)
          })) : [];
          if (customSets.length === 0) {
            for (let i = 0; i < setsCount; i++) {
              customSets.push({ workSeconds: workSec, restSeconds: restSec });
            }
          }
          return {
            id: b.id || uid('blk'),
            name: String(b.name || `セットブロック ${idx + 1}`),
            customMode: Boolean(b.customMode),
            workSeconds: workSec,
            restSeconds: restSec,
            sets: b.customMode ? customSets.length : setsCount,
            customSets
          };
        })
      : [
          {
            id: uid('blk'),
            name: 'セットブロック 1',
            customMode: false,
            workSeconds: 30,
            restSeconds: 15,
            sets: 3,
            customSets: [
              { workSeconds: 30, restSeconds: 15 },
              { workSeconds: 30, restSeconds: 15 },
              { workSeconds: 30, restSeconds: 15 }
            ]
          }
        ];

    return {
      id: raw.id || uid('preset'),
      title: String(raw.title || '無題のプリセット').slice(0, 50),
      prepareSeconds: clampInt(raw.prepareSeconds ?? 10, 0, 359999),
      cooldownSeconds: clampInt(raw.cooldownSeconds ?? 0, 0, 359999),
      countdownVoice: [0, 3, 5, 10].includes(Number(raw.countdownVoice))
        ? Number(raw.countdownVoice)
        : 3,
      blocks
    };
  }

  function savePresets() {
    localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(presets));
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, activePresetId);
  }

  function saveConfig() {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(appConfig));
  }

  function getActivePreset() {
    return presets.find((p) => p.id === activePresetId) || presets[0];
  }

  // --- Timeline Builder ---
  function buildTimeline(preset) {
    const steps = [];
    const totalBlocks = preset.blocks.length;

    // 1. Prepare Phase
    if (preset.prepareSeconds > 0) {
      steps.push({
        phase: 'prepare',
        phaseLabel: 'PREPARE / 準備',
        voiceStart: '準備してください',
        blockName: preset.title,
        durationSec: preset.prepareSeconds,
        setIndex: 0,
        totalSets: 0,
        blockIndex: 0,
        totalBlocks
      });
    }

    // 2. Set Blocks
    preset.blocks.forEach((block, bIdx) => {
      const blockNum = bIdx + 1;
      const setItems = block.customMode
        ? block.customSets
        : Array.from({ length: block.sets }, () => ({
            workSeconds: block.workSeconds,
            restSeconds: block.restSeconds
          }));

      const totalSets = setItems.length;

      setItems.forEach((item, sIdx) => {
        const setNum = sIdx + 1;
        // Work Step
        if (item.workSeconds > 0) {
          steps.push({
            phase: 'work',
            phaseLabel: 'WORK / ワーク',
            voiceStart: setNum === 1 ? `${block.name}、スタート` : 'スタート',
            blockName: block.name,
            durationSec: item.workSeconds,
            setIndex: setNum,
            totalSets,
            blockIndex: blockNum,
            totalBlocks
          });
        }

        // Rest Step (skip rest on the very last set of the very last block if cooldown follows or if 0)
        const isVeryLastSet = bIdx === totalBlocks - 1 && sIdx === totalSets - 1;
        if (item.restSeconds > 0 && !isVeryLastSet) {
          steps.push({
            phase: 'rest',
            phaseLabel: 'REST / レスト',
            voiceStart: 'レスト',
            blockName: block.name,
            durationSec: item.restSeconds,
            setIndex: setNum,
            totalSets,
            blockIndex: blockNum,
            totalBlocks
          });
        }
      });
    });

    // 3. Cooldown Phase
    if (preset.cooldownSeconds > 0) {
      steps.push({
        phase: 'cooldown',
        phaseLabel: 'COOLDOWN / クールダウン',
        voiceStart: 'クールダウン',
        blockName: 'クールダウン・終了待機',
        durationSec: preset.cooldownSeconds,
        setIndex: 0,
        totalSets: 0,
        blockIndex: totalBlocks,
        totalBlocks
      });
    }

    // Fallback if empty
    if (steps.length === 0) {
      steps.push({
        phase: 'work',
        phaseLabel: 'WORK / ワーク',
        voiceStart: 'スタート',
        blockName: preset.title,
        durationSec: 30,
        setIndex: 1,
        totalSets: 1,
        blockIndex: 1,
        totalBlocks: 1
      });
    }

    return steps;
  }

  // --- Audio & Voice Engine (Web Speech API + Web Audio API + Silent Background WAV) ---
  function initAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  function playBeep(freq = 880, durationMs = 120, type = 'sine') {
    if (!appConfig.beep) return;
    try {
      initAudioContext();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + durationMs / 1000);
    } catch (e) {
      // Ignore audio errors on restricted devices
    }
  }

  function speakText(text) {
    if (!appConfig.speech || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ja-JP';
      utter.rate = 1.15;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }

  // Generate a 1-second 8kHz mono 8-bit PCM silent WAV as Base64 data URI
  function createSilentWavDataUri() {
    const sampleRate = 8000;
    const numSamples = sampleRate;
    const buffer = new ArrayBuffer(44 + numSamples);
    const view = new DataView(buffer);

    function writeStr(offset, str) {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, 1, true);  // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);  // 8-bit
    writeStr(36, 'data');
    view.setUint32(40, numSamples, true);

    for (let i = 0; i < numSamples; i++) {
      view.setUint8(44 + i, 128); // 128 = silence in 8-bit unsigned PCM
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return 'data:audio/wav;base64,' + btoa(binary);
  }

  function startBackgroundAudio() {
    if (!appConfig.bgAudio) return;
    try {
      if (!silentAudioEl) {
        silentAudioEl = new Audio(createSilentWavDataUri());
        silentAudioEl.loop = true;
        silentAudioEl.volume = 0.01;
      }
      silentAudioEl.play().catch(() => {});
    } catch (e) {
      console.warn('Silent audio failed:', e);
    }
  }

  function stopBackgroundAudio() {
    if (silentAudioEl) {
      silentAudioEl.pause();
      silentAudioEl.currentTime = 0;
    }
  }

  // --- Screen Wake Lock API ---
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
      updateWakeLockBadge(false);
      return;
    }
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      updateWakeLockBadge(true);
      wakeLockSentinel.addEventListener('release', () => {
        updateWakeLockBadge(false);
      });
    } catch (err) {
      updateWakeLockBadge(false);
    }
  }

  async function releaseWakeLock() {
    if (wakeLockSentinel) {
      try {
        await wakeLockSentinel.release();
      } catch (e) {}
      wakeLockSentinel = null;
    }
    updateWakeLockBadge(false);
  }

  function updateWakeLockBadge(active) {
    if (active) {
      el.wakeLockBadge.classList.add('active');
    } else {
      el.wakeLockBadge.classList.remove('active');
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isRunning) {
      requestWakeLock();
      tickTimer();
    }
  });

  // --- Timer Engine (Date.now() Delta Based) ---
  function loadActivePresetIntoTimer() {
    stopTimerLoop();
    isRunning = false;
    const preset = getActivePreset();
    timeline = buildTimeline(preset);
    currentStepIndex = 0;
    stepRemainingMs = timeline[0].durationSec * 1000;
    lastAnnouncedSecond = null;
    updateTimerUI();
    el.body.setAttribute('data-phase', 'idle');
    el.btnStartPauseText.textContent = 'START';
  }

  function startTimer() {
    if (timeline.length === 0) return;
    initAudioContext();

    // If finished, restart from step 0
    if (currentStepIndex >= timeline.length) {
      currentStepIndex = 0;
      stepRemainingMs = timeline[0].durationSec * 1000;
    }

    const isFreshStepStart =
      stepRemainingMs === timeline[currentStepIndex].durationSec * 1000;

    isRunning = true;
    lastTickTimestamp = Date.now();
    el.btnStartPauseText.textContent = 'PAUSE';

    requestWakeLock();
    startBackgroundAudio();

    const currentStep = timeline[currentStepIndex];
    el.body.setAttribute('data-phase', currentStep.phase);

    if (isFreshStepStart) {
      announceStepStart(currentStep);
    }

    clearInterval(timerIntervalId);
    timerIntervalId = setInterval(tickTimer, 50);
    updateTimerUI();
  }

  function pauseTimer() {
    if (!isRunning) return;
    tickTimer();
    isRunning = false;
    stopTimerLoop();
    el.btnStartPauseText.textContent = 'RESUME';
    updateTimerUI();
  }

  function stopTimerLoop() {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
    releaseWakeLock();
    stopBackgroundAudio();
  }

  function resetTimer() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    loadActivePresetIntoTimer();
  }

  function skipToStep(newIndex) {
    if (newIndex < 0 || newIndex >= timeline.length) return;
    currentStepIndex = newIndex;
    stepRemainingMs = timeline[currentStepIndex].durationSec * 1000;
    lastAnnouncedSecond = null;
    lastTickTimestamp = Date.now();

    if (isRunning) {
      const step = timeline[currentStepIndex];
      el.body.setAttribute('data-phase', step.phase);
      announceStepStart(step);
    } else {
      el.body.setAttribute('data-phase', timeline[currentStepIndex].phase);
    }
    updateTimerUI();
  }

  function announceStepStart(step) {
    if (step.phase === 'work') {
      playBeep(1046.5, 220, 'triangle');
    } else if (step.phase === 'rest') {
      playBeep(659.25, 220, 'sine');
    } else {
      playBeep(783.99, 180, 'sine');
    }
    speakText(step.voiceStart);
  }

  function tickTimer() {
    if (!isRunning) return;

    const now = Date.now();
    let deltaMs = now - lastTickTimestamp;
    lastTickTimestamp = now;

    if (deltaMs <= 0) return;

    const preset = getActivePreset();
    const voiceThreshold = preset.countdownVoice;

    // Advance across one or more steps if backgrounded for a long time
    while (deltaMs > 0 && currentStepIndex < timeline.length) {
      if (deltaMs < stepRemainingMs) {
        stepRemainingMs -= deltaMs;
        deltaMs = 0;

        // Check per-second countdown voice & beep
        const ceilSec = Math.ceil(stepRemainingMs / 1000);
        if (
          voiceThreshold > 0 &&
          ceilSec <= voiceThreshold &&
          ceilSec >= 1 &&
          lastAnnouncedSecond !== ceilSec
        ) {
          lastAnnouncedSecond = ceilSec;
          playBeep(880, 90, 'sine');
          speakText(String(ceilSec));
        }
      } else {
        // Current step finished
        deltaMs -= stepRemainingMs;
        currentStepIndex++;
        lastAnnouncedSecond = null;

        if (currentStepIndex < timeline.length) {
          const nextStep = timeline[currentStepIndex];
          stepRemainingMs = nextStep.durationSec * 1000;
          el.body.setAttribute('data-phase', nextStep.phase);
          // Only trigger voice if we aren't fast-forwarding past multiple expired steps
          if (deltaMs < nextStep.durationSec * 1000) {
            announceStepStart(nextStep);
          }
        } else {
          // Entire workout completed!
          stepRemainingMs = 0;
          deltaMs = 0;
          completeWorkout();
          return;
        }
      }
    }

    updateTimerUI();
  }

  function completeWorkout() {
    isRunning = false;
    stopTimerLoop();
    el.body.setAttribute('data-phase', 'done');
    el.phaseBadge.textContent = 'COMPLETED / 完了';
    el.blockTitleDisplay.textContent = 'トレーニング終了！お疲れ様でした';
    el.mainClock.textContent = '00:00';
    el.phaseProgressBar.style.width = '0%';
    el.totalRemainDisplay.textContent = '00:00';
    el.nextStepDisplay.textContent = 'すべて完了しました';
    el.btnStartPauseText.textContent = 'RESTART';

    playBeep(1318.5, 180, 'triangle');
    setTimeout(() => playBeep(1567.98, 350, 'triangle'), 200);
    speakText('終了しました。お疲れ様でした');
  }

  // --- UI Rendering ---
  function renderPresetSelector() {
    el.presetSelect.innerHTML = '';
    presets.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.title;
      if (p.id === activePresetId) opt.selected = true;
      el.presetSelect.appendChild(opt);
    });
  }

  function updateTimerUI() {
    if (currentStepIndex >= timeline.length) return;

    const step = timeline[currentStepIndex];
    const secRemaining = stepRemainingMs / 1000;
    const formattedClock = formatClock(secRemaining);

    el.phaseBadge.textContent = isRunning ? step.phaseLabel : `${step.phaseLabel} (待機中)`;
    el.blockTitleDisplay.textContent = step.blockName;
    el.mainClock.textContent = formattedClock;
    el.mainClock.classList.toggle('long-format', formattedClock.length > 5);

    const progressPct = Math.max(
      0,
      Math.min(100, (stepRemainingMs / (step.durationSec * 1000)) * 100)
    );
    el.phaseProgressBar.style.width = `${progressPct}%`;

    el.setCounterDisplay.textContent =
      step.totalSets > 0 ? `${step.setIndex} / ${step.totalSets}` : '- / -';
    el.blockCounterDisplay.textContent =
      step.totalBlocks > 0 ? `${step.blockIndex} / ${step.totalBlocks}` : '- / -';

    // Total remaining calculation
    let totalRemSec = secRemaining;
    for (let i = currentStepIndex + 1; i < timeline.length; i++) {
      totalRemSec += timeline[i].durationSec;
    }
    el.totalRemainDisplay.textContent = formatClock(totalRemSec);

    // Next step preview
    if (currentStepIndex + 1 < timeline.length) {
      const next = timeline[currentStepIndex + 1];
      const nextType =
        next.phase === 'work'
          ? 'ワーク'
          : next.phase === 'rest'
          ? 'レスト'
          : next.phase === 'cooldown'
          ? 'クールダウン'
          : '準備';
      el.nextStepDisplay.textContent = `${nextType} (${next.blockName}) — ${formatClock(
        next.durationSec
      )}`;
    } else {
      el.nextStepDisplay.textContent = 'フィニッシュ（完了）';
    }
  }

  // --- Preset Editor Modal Logic ---
  function openEditorModal(presetToEdit) {
    if (isRunning) pauseTimer();
    editingPreset = deepClone(presetToEdit);
    renderEditorForm();
    el.modalEditor.classList.remove('hidden');
  }

  function renderEditorForm() {
    el.inputPresetTitle.value = editingPreset.title;

    const prep = secondsToHMS(editingPreset.prepareSeconds);
    el.prepH.value = prep.h;
    el.prepM.value = prep.m;
    el.prepS.value = prep.s;

    const cool = secondsToHMS(editingPreset.cooldownSeconds);
    el.coolH.value = cool.h;
    el.coolM.value = cool.m;
    el.coolS.value = cool.s;

    el.selectCountdownVoice.value = String(editingPreset.countdownVoice);

    renderBlocksEditor();
  }

  function createHMSInputsHTML(prefix, idx, subIdx, seconds) {
    const { h, m, s } = secondsToHMS(seconds);
    return `
      <div class="hms-inputs">
        <div class="hms-box">
          <input type="number" min="0" max="99" value="${h}" data-field="${prefix}-h" data-bidx="${idx}" data-sidx="${subIdx}" />
          <span>時間</span>
        </div>
        <div class="hms-box">
          <input type="number" min="0" max="59" value="${m}" data-field="${prefix}-m" data-bidx="${idx}" data-sidx="${subIdx}" />
          <span>分</span>
        </div>
        <div class="hms-box">
          <input type="number" min="0" max="59" value="${s}" data-field="${prefix}-s" data-bidx="${idx}" data-sidx="${subIdx}" />
          <span>秒</span>
        </div>
      </div>
    `;
  }

  function renderBlocksEditor() {
    el.blocksContainer.innerHTML = '';

    editingPreset.blocks.forEach((block, bIdx) => {
      const card = document.createElement('div');
      card.className = 'block-card';

      let bodyHtml = '';
      if (!block.customMode) {
        bodyHtml = `
          <div class="common-settings-grid">
            <div class="form-section">
              <label class="field-label">作業時間 (WORK)</label>
              ${createHMSInputsHTML('common-work', bIdx, -1, block.workSeconds)}
            </div>
            <div class="form-section">
              <label class="field-label">レスト時間 (REST)</label>
              ${createHMSInputsHTML('common-rest', bIdx, -1, block.restSeconds)}
            </div>
            <div class="form-section">
              <label class="field-label">反復セット数</label>
              <div class="hms-box">
                <input type="number" min="1" max="99" value="${block.sets}" data-field="common-sets" data-bidx="${bIdx}" />
                <span>回</span>
              </div>
            </div>
          </div>
        `;
      } else {
        const rowsHtml = block.customSets
          .map(
            (cs, sIdx) => `
            <div class="custom-set-row">
              <span class="custom-set-badge">SET ${sIdx + 1}</span>
              <div>
                <label class="field-label">ワーク</label>
                ${createHMSInputsHTML('custom-work', bIdx, sIdx, cs.workSeconds)}
              </div>
              <div>
                <label class="field-label">レスト</label>
                ${createHMSInputsHTML('custom-rest', bIdx, sIdx, cs.restSeconds)}
              </div>
              <button type="button" class="btn-danger-outline btn-sm" data-action="remove-custom-set" data-bidx="${bIdx}" data-sidx="${sIdx}" title="このセットを削除">✕</button>
            </div>
          `
          )
          .join('');

        bodyHtml = `
          <div class="custom-sets-list">
            ${rowsHtml}
            <div>
              <button type="button" class="btn-outline btn-sm" data-action="add-custom-set" data-bidx="${bIdx}">+ 個別セット行を追加</button>
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="block-card-top">
          <input type="text" class="block-name-input" value="${escapeHtml(block.name)}" data-field="block-name" data-bidx="${bIdx}" placeholder="ブロック名（例: スクワット）" />
          <label class="block-mode-toggle">
            <input type="checkbox" data-action="toggle-custom-mode" data-bidx="${bIdx}" ${block.customMode ? 'checked' : ''} />
            <span>個別カスタムモード</span>
          </label>
          ${
            editingPreset.blocks.length > 1
              ? `<button type="button" class="btn-danger-outline btn-sm" data-action="remove-block" data-bidx="${bIdx}">削除</button>`
              : ''
          }
        </div>
        ${bodyHtml}
      `;

      el.blocksContainer.appendChild(card);
    });
  }

  function syncEditorDOMToModel() {
    if (!editingPreset) return;
    editingPreset.title = el.inputPresetTitle.value.trim() || 'マイプリセット';
    editingPreset.prepareSeconds = hmsToSeconds(
      el.prepH.value,
      el.prepM.value,
      el.prepS.value
    );
    editingPreset.cooldownSeconds = hmsToSeconds(
      el.coolH.value,
      el.coolM.value,
      el.coolS.value
    );
    editingPreset.countdownVoice = Number(el.selectCountdownVoice.value);

    // Sync block fields
    const nameInputs = el.blocksContainer.querySelectorAll('[data-field="block-name"]');
    nameInputs.forEach((inp) => {
      const bIdx = Number(inp.dataset.bidx);
      if (editingPreset.blocks[bIdx]) {
        editingPreset.blocks[bIdx].name = inp.value.trim() || `セットブロック ${bIdx + 1}`;
      }
    });

    editingPreset.blocks.forEach((block, bIdx) => {
      if (!block.customMode) {
        const wh = getFieldVal('common-work-h', bIdx, -1);
        const wm = getFieldVal('common-work-m', bIdx, -1);
        const ws = getFieldVal('common-work-s', bIdx, -1);
        block.workSeconds = Math.max(1, hmsToSeconds(wh, wm, ws));

        const rh = getFieldVal('common-rest-h', bIdx, -1);
        const rm = getFieldVal('common-rest-m', bIdx, -1);
        const rs = getFieldVal('common-rest-s', bIdx, -1);
        block.restSeconds = hmsToSeconds(rh, rm, rs);

        const setsInp = el.blocksContainer.querySelector(
          `[data-field="common-sets"][data-bidx="${bIdx}"]`
        );
        if (setsInp) {
          block.sets = clampInt(setsInp.value, 1, 99);
        }
      } else {
        block.customSets.forEach((cs, sIdx) => {
          const wh = getFieldVal('custom-work-h', bIdx, sIdx);
          const wm = getFieldVal('custom-work-m', bIdx, sIdx);
          const ws = getFieldVal('custom-work-s', bIdx, sIdx);
          cs.workSeconds = Math.max(1, hmsToSeconds(wh, wm, ws));

          const rh = getFieldVal('custom-rest-h', bIdx, sIdx);
          const rm = getFieldVal('custom-rest-m', bIdx, sIdx);
          const rs = getFieldVal('custom-rest-s', bIdx, sIdx);
          cs.restSeconds = hmsToSeconds(rh, rm, rs);
        });
        block.sets = block.customSets.length;
      }
    });
  }

  function getFieldVal(field, bIdx, sIdx) {
    const selector = `[data-field="${field}"][data-bidx="${bIdx}"][data-sidx="${sIdx}"]`;
    const input = el.blocksContainer.querySelector(selector);
    return input ? input.value : 0;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- URL Share (Base64) & Pure-JS SVG QR Code Generator ---
  function encodePresetToBase64(preset) {
    // Compact representation to keep QR Code dense and easy to scan
    const compact = {
      t: preset.title,
      p: preset.prepareSeconds,
      c: preset.cooldownSeconds,
      v: preset.countdownVoice,
      b: preset.blocks.map((blk) => ({
        n: blk.name,
        m: blk.customMode ? 1 : 0,
        w: blk.workSeconds,
        r: blk.restSeconds,
        s: blk.sets,
        cs: blk.customMode
          ? blk.customSets.map((x) => [x.workSeconds, x.restSeconds])
          : []
      }))
    };
    const jsonStr = JSON.stringify(compact);
    const utf8Bytes = new TextEncoder().encode(jsonStr);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function decodePresetFromBase64(b64Url) {
    let b64 = b64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
      b64 += '=';
    }
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const jsonStr = new TextDecoder().decode(bytes);
    const data = JSON.parse(jsonStr);

    // Support both compact and full format
    if (data.t !== undefined && Array.isArray(data.b)) {
      return normalizePreset({
        id: uid('shared'),
        title: data.t,
        prepareSeconds: data.p,
        cooldownSeconds: data.c,
        countdownVoice: data.v,
        blocks: data.b.map((blk) => ({
          id: uid('blk'),
          name: blk.n,
          customMode: Boolean(blk.m),
          workSeconds: blk.w,
          restSeconds: blk.r,
          sets: blk.s,
          customSets: Array.isArray(blk.cs)
            ? blk.cs.map((pair) => ({
                workSeconds: pair[0],
                restSeconds: pair[1]
              }))
            : []
        }))
      });
    }
    return normalizePreset({ ...data, id: uid('shared') });
  }

  function checkUrlHashForSharedPreset() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#share=')) return;

    const encoded = hash.slice('#share='.length).trim();
    if (!encoded) return;

    try {
      const imported = decodePresetFromBase64(encoded);
      imported.title = `${imported.title} (共有)`;
      presets.unshift(imported);
      activePresetId = imported.id;
      savePresets();
      history.replaceState(null, document.title, window.location.pathname + window.location.search);
      showToast(`共有プリセット「${imported.title}」を追加しました！`);
    } catch (e) {
      console.error('Failed to import shared URL preset:', e);
      showToast('共有URLの読み込みに失敗しました');
    }
  }

  // --- Self-Contained QR Code SVG Renderer (ISO/IEC 18004 Byte Mode, Level L) ---
  const QRCodeGenerator = (() => {
    // Total codewords & ECC codewords per block for Version 1..15 (Error Correction Level L)
    const VERSION_TABLE = [
      null,
      { total: 26, ecPerBlock: 7, blocks1: 1, data1: 19, blocks2: 0, data2: 0, align: [] },
      { total: 44, ecPerBlock: 10, blocks1: 1, data1: 34, blocks2: 0, data2: 0, align: [6, 18] },
      { total: 70, ecPerBlock: 15, blocks1: 1, data1: 55, blocks2: 0, data2: 0, align: [6, 22] },
      { total: 100, ecPerBlock: 20, blocks1: 1, data1: 80, blocks2: 0, data2: 0, align: [6, 26] },
      { total: 134, ecPerBlock: 26, blocks1: 1, data1: 108, blocks2: 0, data2: 0, align: [6, 30] },
      { total: 172, ecPerBlock: 18, blocks1: 2, data1: 68, blocks2: 0, data2: 0, align: [6, 34] },
      { total: 196, ecPerBlock: 20, blocks1: 2, data1: 78, blocks2: 0, data2: 0, align: [6, 22, 38] },
      { total: 242, ecPerBlock: 24, blocks1: 2, data1: 97, blocks2: 0, data2: 0, align: [6, 24, 42] },
      { total: 292, ecPerBlock: 30, blocks1: 2, data1: 116, blocks2: 0, data2: 0, align: [6, 26, 46] },
      { total: 346, ecPerBlock: 18, blocks1: 2, data1: 68, blocks2: 2, data2: 69, align: [6, 28, 50] },
      { total: 404, ecPerBlock: 20, blocks1: 4, data1: 81, blocks2: 0, data2: 0, align: [6, 30, 54] },
      { total: 466, ecPerBlock: 24, blocks1: 2, data1: 92, blocks2: 2, data2: 93, align: [6, 32, 58] },
      { total: 532, ecPerBlock: 26, blocks1: 4, data1: 107, blocks2: 0, data2: 0, align: [6, 34, 62] },
      { total: 581, ecPerBlock: 30, blocks1: 3, data1: 115, blocks2: 1, data2: 116, align: [6, 26, 46, 66] },
      { total: 655, ecPerBlock: 22, blocks1: 5, data1: 87, blocks2: 1, data2: 88, align: [6, 26, 48, 70] }
    ];

    const GF_EXP = new Uint8Array(512);
    const GF_LOG = new Uint8Array(256);
    (() => {
      let x = 1;
      for (let i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
      }
      for (let i = 255; i < 512; i++) {
        GF_EXP[i] = GF_EXP[i - 255];
      }
    })();

    function gfMul(a, b) {
      if (a === 0 || b === 0) return 0;
      return GF_EXP[GF_LOG[a] + GF_LOG[b]];
    }

    function rsGeneratorPoly(degree) {
      let poly = [1];
      for (let i = 0; i < degree; i++) {
        const next = new Array(poly.length + 1).fill(0);
        const root = GF_EXP[i];
        for (let j = 0; j < poly.length; j++) {
          next[j] ^= poly[j];
          next[j + 1] ^= gfMul(poly[j], root);
        }
        poly = next;
      }
      return poly;
    }

    function rsEncode(dataBytes, ecLen) {
      const gen = rsGeneratorPoly(ecLen);
      const rem = new Uint8Array(ecLen);
      for (let i = 0; i < dataBytes.length; i++) {
        const factor = dataBytes[i] ^ rem[0];
        rem.copyWithin(0, 1);
        rem[ecLen - 1] = 0;
        for (let j = 0; j < ecLen; j++) {
          rem[j] ^= gfMul(gen[j + 1], factor);
        }
      }
      return rem;
    }

    function renderSVG(text) {
      const utf8 = new TextEncoder().encode(text);
      let version = 1;
      while (version <= 15) {
        const info = VERSION_TABLE[version];
        const capacity = info.blocks1 * info.data1 + info.blocks2 * info.data2;
        const headerBytes = version <= 9 ? 2 : 3;
        if (utf8.length + headerBytes <= capacity) break;
        version++;
      }
      if (version > 15) {
        return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><text x="50" y="52" text-anchor="middle" font-size="8" fill="#000">データ量が大きすぎます</text></svg>`;
      }

      const vInfo = VERSION_TABLE[version];
      const totalDataCodewords = vInfo.blocks1 * vInfo.data1 + vInfo.blocks2 * vInfo.data2;

      // Build bit stream: Byte mode (0100) + char count + payload + terminator + pad
      const bits = [];
      const pushBits = (val, len) => {
        for (let i = len - 1; i >= 0; i--) {
          bits.push((val >>> i) & 1);
        }
      };

      pushBits(0b0100, 4);
      pushBits(utf8.length, version <= 9 ? 8 : 16);
      for (let i = 0; i < utf8.length; i++) {
        pushBits(utf8[i], 8);
      }

      const maxBits = totalDataCodewords * 8;
      const termLen = Math.min(4, maxBits - bits.length);
      pushBits(0, termLen);
      while (bits.length % 8 !== 0) bits.push(0);

      const dataCodewords = new Uint8Array(totalDataCodewords);
      for (let i = 0; i < bits.length / 8; i++) {
        let byte = 0;
        for (let b = 0; b < 8; b++) {
          byte = (byte << 1) | bits[i * 8 + b];
        }
        dataCodewords[i] = byte;
      }
      const padBytes = [0xec, 0x11];
      for (let i = bits.length / 8, p = 0; i < totalDataCodewords; i++, p ^= 1) {
        dataCodewords[i] = padBytes[p];
      }

      // Split into blocks & compute Reed-Solomon EC
      const dataBlocks = [];
      const ecBlocks = [];
      let offset = 0;
      for (let i = 0; i < vInfo.blocks1; i++) {
        const blk = dataCodewords.slice(offset, offset + vInfo.data1);
        offset += vInfo.data1;
        dataBlocks.push(blk);
        ecBlocks.push(rsEncode(blk, vInfo.ecPerBlock));
      }
      for (let i = 0; i < vInfo.blocks2; i++) {
        const blk = dataCodewords.slice(offset, offset + vInfo.data2);
        offset += vInfo.data2;
        dataBlocks.push(blk);
        ecBlocks.push(rsEncode(blk, vInfo.ecPerBlock));
      }

      // Interleave data and EC codewords
      const interleaved = [];
      const maxDataLen = Math.max(vInfo.data1, vInfo.data2);
      for (let i = 0; i < maxDataLen; i++) {
        for (let b = 0; b < dataBlocks.length; b++) {
          if (i < dataBlocks[b].length) interleaved.push(dataBlocks[b][i]);
        }
      }
      for (let i = 0; i < vInfo.ecPerBlock; i++) {
        for (let b = 0; b < ecBlocks.length; b++) {
          interleaved.push(ecBlocks[b][i]);
        }
      }

      // Matrix construction
      const size = version * 4 + 17;
      const modules = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
      const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

      const setFunctionModule = (r, c, dark) => {
        if (r >= 0 && r < size && c >= 0 && c < size) {
          modules[r][c] = dark ? 1 : 0;
          isFunc[r][c] = 1;
        }
      };

      // Finder patterns + separators
      const drawFinder = (row, col) => {
        for (let dr = -1; dr <= 7; dr++) {
          for (let dc = -1; dc <= 7; dc++) {
            const r = row + dr;
            const c = col + dc;
            if (r < 0 || r >= size || c < 0 || c >= size) continue;
            const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
            const inRing = dr === 0 || dr === 6 || dc === 0 || dc === 6;
            const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
            setFunctionModule(r, c, inOuter && (inRing || inCore));
          }
        }
      };
      drawFinder(0, 0);
      drawFinder(0, size - 7);
      drawFinder(size - 7, 0);

      // Timing patterns
      for (let i = 8; i < size - 8; i++) {
        setFunctionModule(6, i, i % 2 === 0);
        setFunctionModule(i, 6, i % 2 === 0);
      }

      // Alignment patterns
      const alignCoords = vInfo.align;
      for (let i = 0; i < alignCoords.length; i++) {
        for (let j = 0; j < alignCoords.length; j++) {
          const ar = alignCoords[i];
          const ac = alignCoords[j];
          if (
            (ar === 6 && ac === 6) ||
            (ar === 6 && ac === size - 7) ||
            (ar === size - 7 && ac === 6)
          ) {
            continue;
          }
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const dark =
                Math.abs(dr) === 2 ||
                Math.abs(dc) === 2 ||
                (dr === 0 && dc === 0);
              setFunctionModule(ar + dr, ac + dc, dark);
            }
          }
        }
      }

      // Reserve format info & dark module
      for (let i = 0; i <= 8; i++) {
        if (i !== 6) {
          if (!isFunc[8][i]) setFunctionModule(8, i, false);
          if (!isFunc[i][8]) setFunctionModule(i, 8, false);
        }
        if (i < 8) {
          if (!isFunc[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
          if (!isFunc[size - 1 - i][8]) setFunctionModule(size - 1 - i, 8, false);
        }
      }
      setFunctionModule(size - 8, 8, true);

      // Version info (for version >= 7)
      if (version >= 7) {
        let rem = version;
        for (let i = 0; i < 12; i++) {
          rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        }
        const verBits = (version << 12) | rem;
        for (let i = 0; i < 18; i++) {
          const bit = ((verBits >>> i) & 1) === 1;
          const a = size - 11 + (i % 3);
          const b = Math.floor(i / 3);
          setFunctionModule(a, b, bit);
          setFunctionModule(b, a, bit);
        }
      }

      // Place data bits in zigzag
      let bitIdx = 0;
      const totalBits = interleaved.length * 8;
      for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) {
          for (let j = 0; j < 2; j++) {
            const c = right - j;
            const upward = ((right + 1) & 2) === 0;
            const r = upward ? size - 1 - vert : vert;
            if (!isFunc[r][c]) {
              let dark = false;
              if (bitIdx < totalBits) {
                dark = ((interleaved[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
                bitIdx++;
              }
              // Apply mask 0: (r + c) % 2 === 0
              if ((r + c) % 2 === 0) dark = !dark;
              modules[r][c] = dark ? 1 : 0;
            }
          }
        }
      }

      // Write Format Information (Level L = 01, Mask 0 = 000 -> data = 01000)
      let fRem = 0b01000;
      for (let i = 0; i < 10; i++) {
        fRem = (fRem << 1) ^ ((fRem >>> 9) * 0x537);
      }
      const formatBits = ((0b01000 << 10) | fRem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setFunctionModule(8, i, ((formatBits >>> i) & 1) === 1);
      setFunctionModule(8, 7, ((formatBits >>> 6) & 1) === 1);
      setFunctionModule(8, 8, ((formatBits >>> 7) & 1) === 1);
      setFunctionModule(7, 8, ((formatBits >>> 8) & 1) === 1);
      for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, ((formatBits >>> i) & 1) === 1);
      for (let i = 0; i < 8; i++) setFunctionModule(size - 1 - i, 8, ((formatBits >>> i) & 1) === 1);
      for (let i = 8; i < 15; i++) setFunctionModule(8, size - 15 + i, ((formatBits >>> i) & 1) === 1);

      // Build SVG path
      const quiet = 2;
      const viewSize = size + quiet * 2;
      let path = '';
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (modules[r][c] === 1) {
            path += `M${c + quiet},${r + quiet}h1v1h-1z`;
          }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="${viewSize}" height="${viewSize}" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
    }

    return { renderSVG };
  })();

  function openShareModal() {
    const preset = getActivePreset();
    const encoded = encodePresetToBase64(preset);
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}#share=${encoded}`;

    el.sharePresetName.textContent = preset.title;
    el.shareUrlInput.value = shareUrl;
    el.qrCodeContainer.innerHTML = QRCodeGenerator.renderSVG(shareUrl);
    el.modalShare.classList.remove('hidden');
  }

  // --- Event Listeners Setup ---
  function bindEvents() {
    // Preset Selector Change
    el.presetSelect.addEventListener('change', (e) => {
      activePresetId = e.target.value;
      savePresets();
      loadActivePresetIntoTimer();
    });

    // Main Timer Controls
    el.btnStartPause.addEventListener('click', () => {
      if (isRunning) {
        pauseTimer();
      } else {
        startTimer();
      }
    });

    el.btnReset.addEventListener('click', () => {
      resetTimer();
      showToast('タイマーをリセットしました');
    });

    el.btnPrev.addEventListener('click', () => {
      if (currentStepIndex > 0) {
        skipToStep(currentStepIndex - 1);
      } else {
        skipToStep(0);
      }
    });

    el.btnNext.addEventListener('click', () => {
      if (currentStepIndex + 1 < timeline.length) {
        skipToStep(currentStepIndex + 1);
      }
    });

    // Open Modals
    el.btnEditPreset.addEventListener('click', () => {
      openEditorModal(getActivePreset());
    });

    el.btnShareUrl.addEventListener('click', () => {
      openShareModal();
    });

    el.btnAppConfig.addEventListener('click', () => {
      el.chkBgAudio.checked = appConfig.bgAudio;
      el.chkSpeech.checked = appConfig.speech;
      el.chkBeep.checked = appConfig.beep;
      el.modalConfig.classList.remove('hidden');
    });

    // Close Modal Buttons
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-close');
        document.getElementById(targetId)?.classList.add('hidden');
      });
    });

    // Editor Modal Actions
    el.btnNewPreset.addEventListener('click', () => {
      editingPreset = normalizePreset({
        id: uid('preset'),
        title: `新規プリセット ${presets.length + 1}`,
        prepareSeconds: 5,
        cooldownSeconds: 5,
        countdownVoice: 3,
        blocks: [
          {
            id: uid('blk'),
            name: 'A',
            customMode: false,
            workSeconds: 20,
            restSeconds: 10,
            sets: 1,
            customSets: []
          }
        ]
      });
      renderEditorForm();
      showToast('新規プリセットを作成中');
    });

    el.btnDuplicatePreset.addEventListener('click', () => {
      syncEditorDOMToModel();
      editingPreset.id = uid('preset');
      editingPreset.title = `${editingPreset.title} (コピー)`;
      renderEditorForm();
      showToast('複製を作成しました。「保存して適用」で確定します');
    });

    el.btnDeletePreset.addEventListener('click', () => {
      if (presets.length <= 1) {
        showToast('最後の1つのプリセットは削除できません');
        return;
      }
      const idx = presets.findIndex((p) => p.id === editingPreset.id);
      if (idx !== -1) {
        presets.splice(idx, 1);
        activePresetId = presets[0].id;
        savePresets();
        renderPresetSelector();
        loadActivePresetIntoTimer();
      }
      el.modalEditor.classList.add('hidden');
      showToast('プリセットを削除しました');
    });

    el.btnAddBlock.addEventListener('click', () => {
      syncEditorDOMToModel();
      const nextLetter = String.fromCharCode(65 + (editingPreset.blocks.length % 26));
      editingPreset.blocks.push({
        id: uid('blk'),
        name: nextLetter,
        customMode: false,
        workSeconds: 20,
        restSeconds: 10,
        sets: 1,
        customSets: [
          { workSeconds: 20, restSeconds: 10 }
        ]
      });
      renderBlocksEditor();
    });

    // Delegated Events inside Blocks Container
    el.blocksContainer.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      syncEditorDOMToModel();
      const action = target.dataset.action;
      const bIdx = Number(target.dataset.bidx);
      const sIdx = Number(target.dataset.sidx);
      const block = editingPreset.blocks[bIdx];
      if (!block) return;

      if (action === 'remove-block') {
        if (editingPreset.blocks.length > 1) {
          editingPreset.blocks.splice(bIdx, 1);
          renderBlocksEditor();
        }
      } else if (action === 'add-custom-set') {
        const last = block.customSets[block.customSets.length - 1] || {
          workSeconds: block.workSeconds,
          restSeconds: block.restSeconds
        };
        block.customSets.push({ ...last });
        block.sets = block.customSets.length;
        renderBlocksEditor();
      } else if (action === 'remove-custom-set') {
        if (block.customSets.length > 1) {
          block.customSets.splice(sIdx, 1);
          block.sets = block.customSets.length;
          renderBlocksEditor();
        } else {
          showToast('最低1セット必要です');
        }
      }
    });

    el.blocksContainer.addEventListener('change', (e) => {
      const target = e.target;
      if (target.dataset.action === 'toggle-custom-mode') {
        syncEditorDOMToModel();
        const bIdx = Number(target.dataset.bidx);
        const block = editingPreset.blocks[bIdx];
        if (!block) return;

        block.customMode = target.checked;
        if (block.customMode) {
          // Initialize custom sets from common settings
          block.customSets = Array.from({ length: block.sets }, () => ({
            workSeconds: block.workSeconds,
            restSeconds: block.restSeconds
          }));
        } else {
          block.sets = Math.max(1, block.customSets.length);
        }
        renderBlocksEditor();
      }
    });

    el.btnSavePreset.addEventListener('click', () => {
      syncEditorDOMToModel();
      const normalized = normalizePreset(editingPreset);
      const existingIdx = presets.findIndex((p) => p.id === normalized.id);
      if (existingIdx !== -1) {
        presets[existingIdx] = normalized;
      } else {
        presets.push(normalized);
      }
      activePresetId = normalized.id;
      savePresets();
      renderPresetSelector();
      loadActivePresetIntoTimer();
      el.modalEditor.classList.add('hidden');
      showToast('プリセットを保存しました');
    });

    // Share URL Copy
    el.btnCopyShareUrl.addEventListener('click', async () => {
      const url = el.shareUrlInput.value;
      try {
        await navigator.clipboard.writeText(url);
        showToast('共有URLをクリップボードにコピーしました');
      } catch (err) {
        el.shareUrlInput.select();
        document.execCommand('copy');
        showToast('共有URLをコピーしました');
      }
    });

    // Config Toggles
    el.chkBgAudio.addEventListener('change', () => {
      appConfig.bgAudio = el.chkBgAudio.checked;
      saveConfig();
      if (!appConfig.bgAudio) stopBackgroundAudio();
      else if (isRunning) startBackgroundAudio();
    });

    el.chkSpeech.addEventListener('change', () => {
      appConfig.speech = el.chkSpeech.checked;
      saveConfig();
    });

    el.chkBeep.addEventListener('change', () => {
      appConfig.beep = el.chkBeep.checked;
      saveConfig();
    });

    // JSON Export / Import
    el.btnExportJson.addEventListener('click', () => {
      const jsonStr = JSON.stringify(presets, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timer-plus-presets-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('JSONファイルを書き出しました');
    });

    el.inputImportJsonFile.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        importPresetsFromJsonString(String(reader.result));
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    el.btnImportJsonText.addEventListener('click', () => {
      const raw = el.textareaImportJson.value.trim();
      if (!raw) {
        showToast('JSONテキストを入力してください');
        return;
      }
      importPresetsFromJsonString(raw);
      el.textareaImportJson.value = '';
    });
  }

  function importPresetsFromJsonString(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      let added = 0;
      list.forEach((item) => {
        if (item && typeof item === 'object') {
          const norm = normalizePreset({ ...item, id: uid('import') });
          presets.push(norm);
          activePresetId = norm.id;
          added++;
        }
      });
      if (added > 0) {
        savePresets();
        renderPresetSelector();
        loadActivePresetIntoTimer();
        el.modalConfig.classList.add('hidden');
        showToast(`${added}件のプリセットをインポートしました`);
      } else {
        showToast('有効なプリセットが見つかりませんでした');
      }
    } catch (e) {
      showToast('JSONの形式が正しくありません');
    }
  }

  // --- Service Worker Registration ---
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => {
          console.warn('ServiceWorker registration failed:', err);
        });
      });
    }
  }

  // --- Boot ---
  function init() {
    loadState();
    checkUrlHashForSharedPreset();
    renderPresetSelector();
    loadActivePresetIntoTimer();
    bindEvents();
    registerServiceWorker();
  }

  init();
})();

