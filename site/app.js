(() => {
  'use strict';
  const collection = window.MOTION_COLLECTION;
  if (!collection?.styles?.length) return;
  const $ = id => document.getElementById(id);
  const styles = collection.styles;
  const total = String(styles.length).padStart(2, '0');
  $('edition-count').textContent = total;
  $('edition-caption').textContent = `${styles.length} 种风格 · 每段 ${collection.duration} 秒`;
  $('collection-count').textContent = `01 — ${total}`;
  const video = $('main-video');
  const gif = $('gif-preview');
  const timeline = $('timeline');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let selected = styles[0], mode = 'video', token = 0, wasPlaying = false;
  const mb = bytes => bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`;

  function updateDownload() {
    const format = $('export-format').value;
    $('download-current').href = selected[format];
    $('download-current').download = `${selected.id}${format === 'compatibleGif' ? '-compatible' : ''}.${format === 'video' ? 'mp4' : 'gif'}`;
    $('download-label').textContent = format === 'video' ? '下载 MP4' : '下载 GIF';
    $('download-size').textContent = mb(format === 'compatibleGif' ? selected.compatibleSize : selected.sizes[format === 'video' ? 'mp4' : 'gif']);
    if (mode === 'gif') loadGif();
  }
  function loadGif() {
    // GIF preview and GIF download use the same selected variant.
    const path = $('export-format').value === 'compatibleGif' ? selected.compatibleGif : selected.gif;
    gif.src = `${path}?replay=${++token}`;
    gif.alt = `${selected.name} GIF ${$('export-format').value === 'compatibleGif' ? '50 fps 兼容版' : '近似 60 fps'}预览`;
  }
  function syncPlayback() {
    const isPlaying = !video.paused && !video.ended;
    $('play-toggle').setAttribute('aria-label', isPlaying ? '暂停' : '播放');
    $('play-toggle').innerHTML = `<svg><use href="#i-${isPlaying ? 'pause' : 'play'}"/></svg>`;
  }
  function syncTime() {
    const t = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    timeline.value = t;
    $('time').innerHTML = `${t.toFixed(2)} <span>/ ${selected.duration.toFixed(2)}</span>`;
    timeline.setAttribute('aria-valuetext', `${t.toFixed(2)} 秒，共 ${selected.duration.toFixed(2)} 秒`);
  }
  async function play() {
    try { await video.play(); } catch (error) {
      if (!['AbortError', 'NotAllowedError'].includes(error.name)) $('player-error').hidden = false;
    }
    syncPlayback();
  }
  function selectStyle(style, announce = true) {
    selected = style;
    $('style-name').textContent = style.name;
    $('style-en').textContent = style.en.toUpperCase();
    $('style-number').textContent = `${style.number} / ${total}`;
    $('preview-index').textContent = style.number;
    $('style-description').textContent = style.description;
    $('style-mood').textContent = style.mood;
    document.querySelectorAll('.style-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.id === style.id)));
    $('player-error').hidden = true;
    video.pause();
    video.src = style.video;
    video.setAttribute('aria-label', `${style.name} 60 fps 动画预览`);
    video.load();
    timeline.max = style.duration;
    timeline.value = 0;
    syncTime();
    updateDownload();
    const url = new URL(location.href);
    url.hash = style.id;
    history.replaceState(null, '', url);
    if (mode === 'video' && !reducedMotion) play();
    if (announce) $('announcement').textContent = `已切换到${style.name}，时长 ${style.duration} 秒。`;
  }
  function setMode(next) {
    mode = next;
    const isVideo = mode === 'video';
    video.hidden = !isVideo;
    gif.hidden = isVideo;
    $('video-controls').hidden = !isVideo;
    $('gif-controls').hidden = isVideo;
    document.querySelectorAll('[data-mode]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.mode === mode);
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    if (isVideo) {
      gif.removeAttribute('src');
      if (!reducedMotion) play();
    } else {
      video.pause();
      loadGif();
    }
  }

  for (const style of styles) {
    const button = document.createElement('button');
    button.className = 'style-card';
    button.dataset.id = style.id;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${style.number} ${style.name}，${style.duration} 秒`);
    button.innerHTML = `<div class="card-image"><img src="${style.poster}" alt="" loading="lazy"/><span class="selected-mark">NOW PLAYING</span><span class="card-play"><svg><use href="#i-play"/></svg></span></div><div class="card-meta"><span class="card-number">${style.number}</span><span><span class="card-title">${style.name}</span><span class="card-subtitle">${style.en.toUpperCase()}</span></span></div>`;
    button.addEventListener('click', () => selectStyle(style));
    $('style-grid').append(button);
  }
  $('style-grid').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const index = styles.indexOf(selected);
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + styles.length) % styles.length;
    selectStyle(styles[next]);
    $('style-grid').children[next].focus();
  });
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('play-toggle').addEventListener('click', () => video.paused ? play() : video.pause());
  $('replay').addEventListener('click', () => { video.currentTime = 0; play(); });
  $('gif-replay').addEventListener('click', loadGif);
  $('export-format').addEventListener('change', updateDownload);
  $('speed').addEventListener('change', () => { video.playbackRate = Number($('speed').value); });
  $('loop').addEventListener('change', () => { video.loop = $('loop').checked; });
  timeline.addEventListener('pointerdown', () => { wasPlaying = !video.paused; video.pause(); });
  timeline.addEventListener('input', () => { video.currentTime = Number(timeline.value); syncTime(); });
  timeline.addEventListener('change', () => { if (wasPlaying) play(); wasPlaying = false; });
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (video.requestFullscreen) await video.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch { $('announcement').textContent = '当前浏览器无法进入全屏。'; }
  });
  if (!document.fullscreenEnabled && !video.webkitEnterFullscreen) $('fullscreen').hidden = true;
  for (const event of ['play', 'pause', 'ended']) video.addEventListener(event, syncPlayback);
  video.addEventListener('timeupdate', syncTime);
  video.addEventListener('error', () => { $('player-error').hidden = false; });
  video.addEventListener('loadedmetadata', () => {
    video.playbackRate = Number($('speed').value);
    if (reducedMotion) { video.currentTime = 2.2; video.pause(); }
    syncTime();
  });
  gif.addEventListener('error', () => { if (mode === 'gif') $('player-error').hidden = false; });
  window.addEventListener('hashchange', () => {
    const style = styles.find(s => s.id === location.hash.slice(1));
    if (style && style !== selected) selectStyle(style);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { wasPlaying = !video.paused; video.pause(); }
    else if (wasPlaying && mode === 'video' && !reducedMotion) { play(); wasPlaying = false; }
  });
  selectStyle(styles.find(s => s.id === location.hash.slice(1)) || styles[0], false);
})();
