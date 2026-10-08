(() => {
  'use strict';
  const duration = 600000;
  const storageKey = document.body.dataset.storageKey || 'win10min.timer-preview.' + document.body.dataset.variant;
  const $ = id => document.getElementById(id);
  const display = $('timer'), status = $('status'), toggle = $('toggle');
  const reset = $('reset'), sound = $('sound'), panel = document.querySelector('.timer-panel');
  const progress = $('progress'), task = $('task'), undo = $('undo');
  const dialog = $('focus-dialog'), focusView = $('focus-view');
  const pageTitle = document.title;
  const companion = document.querySelector('.emperor-companion');
  let emperorMessage = '';
  function encourage() {
    if (!companion) return;
    const elapsed = duration - remaining;
    const message = state === 'complete' ? 'A little time, well spent. What will you carry forward?' :
      state === 'paused' ? 'Take a breath. Your next step can wait.' :
      state === 'ready' ? 'Even Rome began with one stone.' :
      elapsed >= 540000 ? 'One last minute. Give this small step your care.' :
      elapsed >= 420000 ? 'Keep it simple. Stay with this one thing.' :
      elapsed >= 240000 ? 'One stone at a time. That is how things grow.' :
      elapsed >= 120000 ? 'No need to rush. Give this moment your attention.' :
      'Begin where you are. One small step is enough.';
    if (message === emperorMessage) return;
    emperorMessage = message;
    $('emperor-speech').textContent = message;
    companion.classList.remove('is-speaking');
    // Restart one short greeting, never a continuous animation during focus.
    void companion.offsetWidth;
    companion.classList.add('is-speaking');
  }
  let remaining = duration, deadline = 0, state = 'ready', interval;
  let audioContext, resetSnapshot, savedBodyOverflow = '';

  function save() {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        state, remaining, deadline, task: task.value, sound: sound.checked
      }));
      $('storage-note').textContent = 'Your timer stays in this tab, even if you reload.';
      if (companion) $('storage-note').hidden = true;
    } catch {
      $('storage-note').textContent = 'Storage unavailable. Reloading resets this timer.';
      $('storage-note').hidden = false;
    }
  }
  function restore() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey));
      if (!saved) return;
      if (!['ready', 'running', 'paused', 'complete'].includes(saved.state) ||
          !Number.isFinite(saved.remaining) || saved.remaining < 0 || saved.remaining > duration ||
          (saved.state === 'running' && (!Number.isFinite(saved.deadline) || saved.deadline > Date.now() + duration))) {
        sessionStorage.removeItem(storageKey); return;
      }
      state = saved.state;
      remaining = saved.remaining;
      deadline = saved.deadline;
      task.value = typeof saved.task === 'string' ? saved.task.slice(0, 100) : '';
      sound.checked = saved.sound === true;
      if (state === 'running') {
        remaining = Math.max(0, deadline - Date.now());
        if (remaining === 0) state = 'complete';
        else interval = setInterval(tick, 200);
      }
      status.textContent = state === 'running' ? 'Timer restored. Keep going with your small task.' :
        state === 'paused' ? 'Your paused timer is ready to resume.' :
        state === 'complete' ? 'Ten minutes complete. Review your work, then choose your next step.' : companion ? 'Ready.' : 'Ready when you are.';
      if (sound.checked && state === 'running') {
        $('audio-note').textContent = 'After reloading, use Test sound to re-enable the alarm.';
      }
      if (task.value) document.querySelector('.task-picker details').open = true;
    } catch { /* Corrupt or blocked storage must never stop the timer. */ }
  }
  async function prepareAudio(force = false) {
    if (!sound.checked && !force) return false;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Audio unavailable');
      audioContext ||= new Audio();
      await audioContext.resume();
      if (audioContext.state !== 'running') throw new Error('Audio suspended');
      $('audio-note').textContent = '';
      return true;
    } catch {
      $('audio-note').textContent = 'Sound is unavailable in this browser. The visual timer still works.';
      return false;
    }
  }
  function playChime() {
    if (!audioContext || audioContext.state !== 'running') return false;
    try {
      if (document.body.dataset.variant === 'a') {
        // A warm ascending bell: modest gain increase, soft attack and long tail.
        const master = audioContext.createGain();
        master.gain.value = 0.72;
        master.connect(audioContext.destination);
        let voices = 6;
        [523.25, 659.25, 783.99].forEach((frequency, index) => {
          const start = audioContext.currentTime + index * 0.4;
          const length = index === 2 ? 2.4 : 1.8;
          [[1,0.24,'triangle'],[2,0.055,'sine']].forEach(([ratio,volume,type]) => {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.type = type;
            oscillator.frequency.value = frequency * ratio;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(volume, start + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.001, start + length);
            oscillator.connect(gain); gain.connect(master);
            oscillator.start(start); oscillator.stop(start + length + 0.05);
            oscillator.onended = () => {
              oscillator.disconnect(); gain.disconnect();
              if (--voices === 0) master.disconnect();
            };
          });
        });
        return true;
      }
      for (let i = 0; i < 3; i++) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = audioContext.currentTime + i * 0.35;
        oscillator.frequency.value = i === 1 ? 660 : 880;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.14, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        oscillator.connect(gain); gain.connect(audioContext.destination);
        oscillator.start(start); oscillator.stop(start + 0.31);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      }
      return true;
    } catch { return false; }
  }
  function render() {
    const seconds = Math.ceil(remaining / 1000);
    const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    display.textContent = time;
    progress.style.strokeDasharray = `${remaining / duration * 100} 100`;
    panel.dataset.state = state;
    encourage();
    document.body.dataset.state = state;
    panel.style.setProperty('--elapsed', String(1 - remaining / duration));
    document.querySelector('.stage').style.setProperty('--scene-elapsed', String(1 - remaining / duration));
    document.querySelectorAll('.minute-step').forEach((step,index) => step.classList.toggle('passed',index < Math.floor((duration-remaining)/60000)));
    $('completion').hidden = state !== 'complete';
    $('state-label').textContent = {ready:'READY TO FOCUS',running:'FOCUS IN PROGRESS',paused:'TAKE YOUR TIME',complete:'SESSION COMPLETE'}[state];
    $('clock-label').textContent = {ready:'TIME FOR ONE THING',running:'ONE SMALL STEP AT A TIME',paused:'PAUSED · RESUME WHEN READY',complete:'A LITTLE FOCUS. WELL DONE.'}[state];
    document.title = state === 'ready' ? pageTitle : `${time} · ${state === 'running' ? 'Focus' : state === 'complete' ? 'Time is up' : 'Paused'} | Win10min`;
    $('toggle-label').textContent = {ready:companion ? 'Start' : 'Start 10 minutes',running:'Pause',paused:'Resume',complete:'Start again'}[state];
    toggle.querySelector('svg').innerHTML = state === 'running' ? '<path d="M7 5h3v14H7zm7 0h3v14h-3z"/>' : '<path d="m9 5 11 7-11 7Z"/>';
    reset.disabled = state === 'ready';
    $('active-task').textContent = task.value.trim();
    $('active-task').hidden = !task.value.trim();
    $('clear-task').hidden = !task.value;
    undo.hidden = !resetSnapshot;
  }
  function tick() {
    if (state !== 'running') return;
    remaining = Math.max(0, deadline - Date.now());
    if (remaining === 0) {
      state = 'complete';
      clearInterval(interval);
      status.textContent = 'Ten minutes complete. Review your work, then choose your next step.';
      if (sound.checked && !playChime()) {
        $('audio-note').textContent = 'Time is up. Your browser could not play the sound.';
      }
      save();
    }
    render();
  }
  toggle.addEventListener('click', () => {
    // Reconcile a suspended tab; a late Pause click must not silently start a new timer.
    const previousState = state;
    tick();
    if (previousState === 'running' && state === 'complete') return;
    resetSnapshot = null;
    if (state === 'running') {
      state = 'paused';
      clearInterval(interval);
      status.textContent = 'Paused. Resume when you are ready.';
    } else {
      if (state === 'complete') remaining = duration;
      deadline = Date.now() + remaining;
      state = 'running';
      status.textContent = companion ? 'One step at a time.' : 'Focus on one small task.';
      prepareAudio();
      interval = setInterval(tick, 200);
    }
    save(); render();
  });
  reset.addEventListener('click', () => {
    tick();
    resetSnapshot = {state,remaining,deadline};
    state = 'ready'; remaining = duration;
    clearInterval(interval);
    status.textContent = 'Timer reset.';
    save(); render();
    toggle.focus({preventScroll:true});
  });
  undo.addEventListener('click', () => {
    if (!resetSnapshot) return;
    ({state,remaining,deadline} = resetSnapshot);
    resetSnapshot = null;
    status.textContent = 'Reset undone.';
    if (state === 'running') { tick(); interval = state === 'running' ? setInterval(tick, 200) : undefined; }
    save(); render();
    toggle.focus({preventScroll:true});
  });
  sound.addEventListener('change', () => {
    if (sound.checked) prepareAudio();
    else $('audio-note').textContent = '';
    save();
  });
  $('test-sound').addEventListener('click', async () => {
    if (await prepareAudio(true)) {
      $('audio-note').textContent = playChime() ? 'Sound test started. Check your device volume if you cannot hear it.' : 'Sound is unavailable in this browser.';
    }
  });
  task.addEventListener('input', () => { save(); render(); });
  $('clear-task').addEventListener('click', () => { task.value = ''; save(); render(); task.focus(); });
  document.querySelectorAll('[data-task]').forEach(button => button.addEventListener('click', () => {
    task.value = button.dataset.task; save(); render(); task.focus();
  }));
  focusView.addEventListener('click', () => {
    if (dialog.open) { dialog.close(); return; }
    savedBodyOverflow = document.body.style.overflow;
    dialog.append(panel);
    try {
      dialog.showModal();
      document.body.style.overflow = 'hidden';
      focusView.querySelector('span').textContent = 'Exit focus view';
      focusView.focus({preventScroll:true});
    } catch {
      $('timer-home').append(panel);
      status.textContent = 'Focus view is unavailable in this browser.';
    }
  });
  dialog.addEventListener('close', () => {
    $('timer-home').append(panel);
    document.body.style.overflow = savedBodyOverflow;
    focusView.querySelector('span').textContent = 'Focus view';
    focusView.focus({preventScroll:true});
  });
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('pageshow', tick);
  // Press feedback is pointer-only: keyboard actions stay immediate.
  document.querySelectorAll('button').forEach(button => {
    button.addEventListener('pointerdown', () => button.classList.add('is-pressed'));
    ['pointerup','pointercancel','pointerleave','blur'].forEach(event => button.addEventListener(event, () => button.classList.remove('is-pressed')));
  });
  toggle.disabled = sound.disabled = $('test-sound').disabled = false;
  focusView.disabled = typeof dialog.showModal !== 'function';
  restore(); save(); render();
})();
