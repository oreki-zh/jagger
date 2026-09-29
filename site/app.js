(() => {
  'use strict';
  const collection = window.MOTION_COLLECTION;
  if (!collection?.styles?.length) return;
  const $ = id => document.getElementById(id);
  const styles = collection.styles;
  const assetUrl = path => `${path}?v=${encodeURIComponent(collection.assetVersion || collection.sha256.slice(0, 12))}`;
  const archiveUrl = `media/motion-collection.zip?v=${encodeURIComponent(collection.archiveVersion || collection.assetVersion)}`;
  document.querySelectorAll('a[href^="media/motion-collection.zip"]').forEach(link => { link.href = archiveUrl; });
  document.querySelector('footer a[download]').href = assetUrl('assets/logo.svg');
  const total = String(styles.length).padStart(2, '0');
  $('edition-count').textContent = total;
  $('edition-caption').textContent = `${styles.length} 种风格 · 每段 ${collection.duration} 秒`;
  $('collection-count').textContent = `01 — ${total}`;
  const video = $('main-video');
  video.poster = assetUrl('media/still.png');
  const gif = $('gif-preview');
  const timeline = $('timeline');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let selected = styles[0], mode = 'video', token = 0;
  // Logo size: the published canvas stays fixed; only the artwork scales about its centre.
  const box = collection.logoBox || { x: 90, y: 106, width: 900, height: 108 };
  const canvasW = styles[0].width, canvasH = styles[0].height;
  const minScale = .4, maxScale = 1.2;
  let logoScale = 1, exporting = null, boundsTimer = 0;
  const isCustom = () => Math.abs(logoScale - 1) > 5e-4;
  const pct = () => Math.round(logoScale * 100);
  let initialStill = false, resumeAfterScrub = false, resumeAfterVisibility = false;
  const mb = bytes => bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`;

  function updateDownload() {
    const format = $('export-format').value;
    const kind = format === 'video' ? 'MP4' : 'GIF';
    $('download-current').href = assetUrl(selected[format]);
    $('download-current').download = `${selected.id}.${format === 'video' ? 'mp4' : 'gif'}`;
    $('download-current').classList.toggle('is-custom', isCustom());
    if (exporting) {
      $('download-label').textContent = '正在导出…';
      $('download-size').textContent = '点击取消';
    } else if (isCustom()) {
      $('download-label').textContent = `导出 ${kind} · ${pct()}%`;
      $('download-size').textContent = '重新生成';
    } else {
      $('download-label').textContent = `下载 ${kind}`;
      $('download-size').textContent = mb(selected.sizes[format === 'video' ? 'mp4' : 'gif']);
    }
    if (mode === 'gif') loadGif();
  }
  function setScale(value, source) {
    logoScale = Math.min(maxScale, Math.max(minScale, value));
    $('logo-scale').value = pct();
    $('scale-value').textContent = `${pct()}%`;
    $('logo-scale').setAttribute('aria-valuetext', `标识大小 ${pct()}%`);
    const mx = (canvasW - box.width * logoScale) / 2, my = (canvasH - box.height * logoScale) / 2;
    if (source !== 'x') $('margin-x').value = Math.round(mx);
    if (source !== 'y') $('margin-y').value = Math.round(my);
    for (const el of [video, gif]) el.style.transform = isCustom() ? `scale(${logoScale})` : '';
    const bounds = $('logo-bounds');
    Object.assign(bounds.style, { left: `${mx / canvasW * 100}%`, right: `${mx / canvasW * 100}%`, top: `${my / canvasH * 100}%`, bottom: `${my / canvasH * 100}%` });
    if (source) {
      bounds.classList.add('is-visible');
      clearTimeout(boundsTimer);
      boundsTimer = setTimeout(() => bounds.classList.remove('is-visible'), 1400);
    }
    document.querySelectorAll('[data-scale]').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.scale) / 100 - logoScale) < 5e-4)));
    updateDownload();
  }
  async function exportCustom() {
    if (exporting) { exporting.abort(); return; }
    const style = selected, format = $('export-format').value, scale = logoScale, percent = pct();
    const controller = new AbortController();
    exporting = controller;
    const status = $('export-status'), bar = $('download-progress');
    const progress = v => { bar.style.width = `${Math.round(v * 100)}%`; status.textContent = `正在生成 ${style.name} ${format === 'video' ? 'MP4' : 'GIF'} · ${percent}% · ${Math.round(v * 100)}%`; };
    $('size-tool').disabled = true;
    updateDownload();
    progress(0);
    try {
      const blob = format === 'video'
        ? await window.LogoExporter.exportMp4(assetUrl(style.video), scale, { width: style.width, height: style.height, fps: style.fps, frames: Math.round(style.duration * style.fps) }, progress, controller.signal)
        : await window.LogoExporter.exportGif(assetUrl(style.gif), scale, progress, controller.signal);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${style.id}-${percent}.${format === 'video' ? 'mp4' : 'gif'}`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = `已导出 ${link.download} · ${mb(blob.size)} · 1080 × 320`;
    } catch (error) {
      status.textContent = error.name === 'AbortError' ? '已取消导出。' : `导出失败：${error.message}`;
    } finally {
      exporting = null;
      bar.style.width = '0';
      $('size-tool').disabled = false;
      updateDownload();
    }
  }
  function loadGif(restart = false) {
    // Reuse cached assets when selecting styles; only an explicit replay needs a fresh URL.
    const src = `${assetUrl(selected.gif)}${restart ? `&replay=${++token}` : ''}`;
    if (gif.getAttribute('src') !== src) gif.src = src;
    gif.alt = `${selected.name} GIF 50 fps 预览`;
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
    // Reduced motion controls initial autoplay, never an explicit playback request.
    if (initialStill) { initialStill = false; video.currentTime = 0; }
    try { await video.play(); } catch (error) {
      if (!['AbortError', 'NotAllowedError'].includes(error.name)) $('player-error').hidden = false;
    }
    syncPlayback();
  }
  function selectStyle(style, announce = true) {
    selected = style;
    initialStill = !announce && reducedMotion;
    resumeAfterScrub = resumeAfterVisibility = false;
    $('style-name').textContent = style.name;
    $('style-en').textContent = style.en.toUpperCase();
    $('style-number').textContent = `${style.number} / ${total}`;
    $('preview-index').textContent = style.number;
    $('style-description').textContent = style.description;
    $('style-mood').textContent = style.mood;
    const series = seriesById[style.series];
    $('style-credit').hidden = !series?.credit;
    $('style-credit').textContent = series?.credit ? `由 ${series.credit} 设计` : '';
    document.querySelectorAll('.style-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.id === style.id)));
    $('player-error').hidden = true;
    video.pause();
    video.src = assetUrl(style.video);
    video.setAttribute('aria-label', `${style.name} 60 fps 动画预览`);
    video.load();
    timeline.max = style.duration;
    timeline.value = 0;
    syncTime();
    updateDownload();
    const url = new URL(location.href);
    url.hash = style.id;
    history.replaceState(null, '', url);
    if (mode === 'video' && !initialStill) play();
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
      play();
    } else {
      video.pause();
      loadGif();
    }
  }

  const seriesById = Object.fromEntries((collection.series || []).map(s => [s.id, s]));
  let currentSeries = null;
  for (const style of styles) {
    const series = seriesById[style.series];
    if (series && style.series !== currentSeries) {
      currentSeries = style.series;
      const count = styles.filter(s => s.series === style.series).length;
      const heading = document.createElement('div');
      heading.className = `series-heading series-${series.id}`;
      heading.setAttribute('role', 'presentation');
      heading.innerHTML = `<span class="series-number">${series.number}</span><span class="series-name">${series.name}</span><span class="series-en">${series.en.toUpperCase()}</span><span class="series-count">${String(count).padStart(2, '0')} 款</span>`;
      $('style-grid').append(heading);
    }
    const button = document.createElement('button');
    button.className = 'style-card';
    button.dataset.id = style.id;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${style.number} ${style.name}，${style.duration} 秒`);
    button.innerHTML = `<div class="card-image"><img src="${assetUrl(style.poster)}" alt="" loading="lazy"/><span class="selected-mark">NOW PLAYING</span><span class="card-play"><svg><use href="#i-play"/></svg></span></div><div class="card-meta"><span class="card-number">${style.number}</span><span><span class="card-title">${style.name}</span><span class="card-subtitle">${style.en.toUpperCase()}</span></span>${series?.credit ? `<span class="card-badge">OPUS 5.5</span>` : ''}</div>`;
    button.addEventListener('click', () => selectStyle(style));
    $('style-grid').append(button);
  }
  $('style-grid').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const index = styles.indexOf(selected);
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + styles.length) % styles.length;
    selectStyle(styles[next]);
    $('style-grid').querySelector(`[data-id="${styles[next].id}"]`).focus();
  });
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('play-toggle').addEventListener('click', () => video.paused ? play() : video.pause());
  $('replay').addEventListener('click', () => { video.currentTime = 0; play(); });
  $('gif-replay').addEventListener('click', () => loadGif(true));
  $('export-format').addEventListener('change', updateDownload);
  $('logo-scale').addEventListener('input', () => setScale(Number($('logo-scale').value) / 100, 'range'));
  $('margin-x').addEventListener('input', () => { const v = Number($('margin-x').value); if (Number.isFinite(v) && $('margin-x').value !== '') setScale((canvasW - 2 * v) / box.width, 'x'); });
  $('margin-y').addEventListener('input', () => { const v = Number($('margin-y').value); if (Number.isFinite(v) && $('margin-y').value !== '') setScale((canvasH - 2 * v) / box.height, 'y'); });
  for (const id of ['margin-x', 'margin-y']) $(id).addEventListener('change', () => setScale(logoScale, 'blur'));
  document.querySelectorAll('[data-scale]').forEach(b => b.addEventListener('click', () => setScale(Number(b.dataset.scale) / 100, 'preset')));
  $('download-current').addEventListener('click', event => {
    if (!isCustom() && !exporting) return;
    event.preventDefault();
    exportCustom();
  });
  $('speed').addEventListener('change', () => { video.playbackRate = Number($('speed').value); });
  $('loop').addEventListener('change', () => { video.loop = $('loop').checked; });
  timeline.addEventListener('pointerdown', () => { resumeAfterScrub = !video.paused; video.pause(); });
  timeline.addEventListener('input', () => { initialStill = false; video.currentTime = Number(timeline.value); syncTime(); });
  timeline.addEventListener('change', () => { if (resumeAfterScrub) play(); resumeAfterScrub = false; });
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
    if (initialStill) { video.currentTime = 2.2; video.pause(); }
    syncTime();
  });
  gif.addEventListener('error', () => { if (mode === 'gif') $('player-error').hidden = false; });
  gif.addEventListener('load', () => { if (mode === 'gif') $('player-error').hidden = true; });
  window.addEventListener('hashchange', () => {
    const style = styles.find(s => s.id === location.hash.slice(1));
    if (style && style !== selected) selectStyle(style);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { resumeAfterVisibility = !video.paused; video.pause(); }
    else if (resumeAfterVisibility && mode === 'video') { resumeAfterVisibility = false; play(); }
  });
  setScale(1);
  selectStyle(styles.find(s => s.id === location.hash.slice(1)) || styles[0], false);
})();
