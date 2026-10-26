(function () {
  'use strict';

  const OUTPUT_SIZE = 512;
  const JPEG_QUALITY = 0.9;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 3;
  const KEY_PAN_STEP = 8;
  const EMPTY_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  const form = document.querySelector('[data-avatar-form]');
  const input = document.querySelector('[data-avatar-input]');
  const preview = document.querySelector('[data-avatar-preview]');
  const status = document.querySelector('[data-avatar-status]');
  const dialog = document.querySelector('[data-crop-dialog]');
  const stage = document.querySelector('[data-crop-stage]');
  const cropImage = document.querySelector('[data-crop-image]');
  const zoomInput = document.querySelector('[data-crop-zoom]');
  const cancelButton = document.querySelector('[data-crop-cancel]');
  const applyButton = document.querySelector('[data-crop-apply]');

  if (
    !form || !input || !preview || !dialog || !stage || !cropImage
    || !zoomInput || !cancelButton || !applyButton
  ) {
    return;
  }

  if (typeof dialog.showModal !== 'function' || typeof DataTransfer !== 'function') {
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext('2d');

  if (!context) {
    return;
  }

  const paperColor = window.getComputedStyle(document.documentElement)
    .getPropertyValue('--color-paper')
    .trim() || '#F7F4EC';

  let naturalWidth = 0;
  let naturalHeight = 0;
  let stageSize = 0;
  let zoomValue = MIN_ZOOM;
  let panX = 0;
  let panY = 0;
  let renderedWidth = 0;
  let renderedHeight = 0;
  let appliedFile = null;
  let dragState = null;
  let resizeFrame = 0;

  function setStatus(message, isError) {
    if (!status) {
      return;
    }
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(isError));
  }

  function setFormFile(file) {
    const transfer = new DataTransfer();
    if (file) {
      transfer.items.add(file);
    }
    input.files = transfer.files;
  }

  function restoreSelection() {
    setFormFile(appliedFile);
  }

  function setPreview(dataUrl) {
    let image = preview.querySelector('[data-avatar-preview-image]');
    if (!image) {
      image = document.createElement('img');
      image.className = 'avatar-preview__image';
      image.width = 104;
      image.height = 104;
      image.setAttribute('data-avatar-preview-image', '');
      preview.prepend(image);
    }
    image.src = dataUrl;
    image.alt = 'Photo ready to save';
    image.hidden = false;

    const initials = preview.querySelector('[data-avatar-preview-initials]');
    if (initials) {
      initials.hidden = true;
    }
  }

  function clampPan() {
    const maxX = Math.max(0, (renderedWidth - stageSize) / 2);
    const maxY = Math.max(0, (renderedHeight - stageSize) / 2);
    panX = Math.min(maxX, Math.max(-maxX, panX));
    panY = Math.min(maxY, Math.max(-maxY, panY));
  }

  function paint() {
    clampPan();
    cropImage.style.width = renderedWidth + 'px';
    cropImage.style.height = renderedHeight + 'px';
    cropImage.style.left = ((stageSize - renderedWidth) / 2 + panX) + 'px';
    cropImage.style.top = ((stageSize - renderedHeight) / 2 + panY) + 'px';
    cropImage.classList.add('is-ready');
  }

  function fitImage() {
    stageSize = stage.clientWidth;
    if (!stageSize || !naturalWidth || !naturalHeight) {
      return;
    }
    const coverScale = Math.max(stageSize / naturalWidth, stageSize / naturalHeight);
    renderedWidth = naturalWidth * coverScale * zoomValue;
    renderedHeight = naturalHeight * coverScale * zoomValue;
    panX = 0;
    panY = 0;
    paint();
  }

  function setZoom(nextZoom) {
    if (!stageSize || !naturalWidth || !naturalHeight) {
      return;
    }
    const oldLeft = (stageSize - renderedWidth) / 2 + panX;
    const oldTop = (stageSize - renderedHeight) / 2 + panY;
    const centerX = renderedWidth ? (stageSize / 2 - oldLeft) / renderedWidth : 0.5;
    const centerY = renderedHeight ? (stageSize / 2 - oldTop) / renderedHeight : 0.5;
    const coverScale = Math.max(stageSize / naturalWidth, stageSize / naturalHeight);

    zoomValue = nextZoom;
    renderedWidth = naturalWidth * coverScale * zoomValue;
    renderedHeight = naturalHeight * coverScale * zoomValue;
    panX = stageSize / 2 - centerX * renderedWidth - (stageSize - renderedWidth) / 2;
    panY = stageSize / 2 - centerY * renderedHeight - (stageSize - renderedHeight) / 2;
    paint();
  }

  function resetCrop() {
    naturalWidth = 0;
    naturalHeight = 0;
    stageSize = 0;
    zoomValue = MIN_ZOOM;
    panX = 0;
    panY = 0;
    renderedWidth = 0;
    renderedHeight = 0;
    dragState = null;
    cropImage.classList.remove('is-ready');
    cropImage.onload = null;
    cropImage.onerror = null;
    cropImage.src = EMPTY_IMAGE;
    zoomInput.value = String(MIN_ZOOM);
    stage.classList.remove('is-dragging');
  }

  function openCrop(file) {
    const reader = new FileReader();

    reader.addEventListener('error', function () {
      restoreSelection();
      setStatus('That image could not be opened. Choose a different file.', true);
    });

    reader.addEventListener('load', function () {
      cropImage.classList.remove('is-ready');
      cropImage.onload = function () {
        naturalWidth = cropImage.naturalWidth;
        naturalHeight = cropImage.naturalHeight;
        if (!naturalWidth || !naturalHeight) {
          resetCrop();
          restoreSelection();
          setStatus('That image could not be opened. Choose a different file.', true);
          return;
        }
        zoomValue = MIN_ZOOM;
        zoomInput.value = String(MIN_ZOOM);
        if (!dialog.open) {
          try {
            dialog.showModal();
          } catch {
            resetCrop();
            restoreSelection();
            setStatus('The crop window could not open. Choose the photo again.', true);
            return;
          }
        }
        window.requestAnimationFrame(function () {
          fitImage();
          stage.focus();
        });
      };
      cropImage.onerror = function () {
        resetCrop();
        restoreSelection();
        setStatus('That image could not be opened. Choose a different file.', true);
      };
      cropImage.src = String(reader.result || '');
    });

    reader.readAsDataURL(file);
  }

  function dataUrlToBlob(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const header = dataUrl.slice(0, comma);
    const encoded = dataUrl.slice(comma + 1);
    const mimeMatch = /^data:([^;]+)/.exec(header);
    const binary = window.atob(encoded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeMatch ? mimeMatch[1] : 'image/jpeg' });
  }

  function applyCrop() {
    if (!naturalWidth || !naturalHeight || !renderedWidth || !stageSize) {
      return;
    }

    const scale = renderedWidth / naturalWidth;
    const sourceSize = stageSize / scale;
    const left = (stageSize - renderedWidth) / 2 + panX;
    const top = (stageSize - renderedHeight) / 2 + panY;
    let sourceX = -left / scale;
    let sourceY = -top / scale;

    sourceX = Math.min(Math.max(sourceX, 0), Math.max(0, naturalWidth - sourceSize));
    sourceY = Math.min(Math.max(sourceY, 0), Math.max(0, naturalHeight - sourceSize));

    let dataUrl;
    try {
      context.fillStyle = paperColor;
      context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        cropImage,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      );
      dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    } catch {
      setStatus('That photo could not be cropped. Choose a different file.', true);
      return;
    }

    const file = new File([dataUrlToBlob(dataUrl)], 'avatar-photo.jpg', {
      type: 'image/jpeg',
    });
    appliedFile = file;
    setFormFile(file);
    setPreview(dataUrl);
    setStatus('Photo ready. Choose Save photo to keep it.');
    dialog.close();
  }

  function startDrag(event) {
    if (!cropImage.classList.contains('is-ready') || event.button !== 0) {
      return;
    }
    event.preventDefault();
    dragState = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-dragging');
  }

  function moveDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    panX += event.clientX - dragState.x;
    panY += event.clientY - dragState.y;
    dragState.x = event.clientX;
    dragState.y = event.clientY;
    paint();
  }

  function endDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    dragState = null;
    stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
  }

  function nudgePhoto(event) {
    if (!cropImage.classList.contains('is-ready')) {
      return;
    }
    const step = event.shiftKey ? 2 : KEY_PAN_STEP;
    let handled = true;

    if (event.key === 'ArrowLeft') {
      panX -= step;
    } else if (event.key === 'ArrowRight') {
      panX += step;
    } else if (event.key === 'ArrowUp') {
      panY -= step;
    } else if (event.key === 'ArrowDown') {
      panY += step;
    } else {
      handled = false;
    }

    if (handled) {
      event.preventDefault();
      paint();
    }
  }

  input.addEventListener('change', function () {
    const file = input.files && input.files[0];
    if (!file) {
      return;
    }
    if (!SUPPORTED_TYPES.includes(file.type)) {
      input.value = '';
      restoreSelection();
      setStatus('Choose a PNG, JPEG, or WebP image.', true);
      return;
    }
    input.value = '';
    setStatus('');
    openCrop(file);
  });

  zoomInput.addEventListener('input', function () {
    const nextZoom = Number.parseFloat(zoomInput.value);
    if (Number.isFinite(nextZoom)) {
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom)));
    }
  });

  stage.addEventListener('pointerdown', startDrag);
  stage.addEventListener('pointermove', moveDrag);
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('keydown', nudgePhoto);

  cancelButton.addEventListener('click', function () {
    dialog.close();
  });

  applyButton.addEventListener('click', applyCrop);

  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  dialog.addEventListener('close', function () {
    restoreSelection();
    resetCrop();
    setStatus(appliedFile ? 'Photo ready. Choose Save photo to keep it.' : '');
  });

  window.addEventListener('resize', function () {
    if (!dialog.open || !naturalWidth) {
      return;
    }
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(function () {
      fitImage();
    });
  });
})();
