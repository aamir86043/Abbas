// Camera via MediaDevices. Permission requested only when started.
let stream = null;

export const Camera = {
  supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  get active() { return !!stream; },

  async start(videoEl) {
    if (!this.supported) throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
    if (stream) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
    } catch (e) {
      const code = e.name === 'NotAllowedError' ? 'denied'
        : e.name === 'NotFoundError' ? 'notfound' : 'failed';
      throw Object.assign(e, { code });
    }
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
    // If the track ends unexpectedly, surface it
    stream.getVideoTracks()[0].addEventListener('ended', () => { stream = null; videoEl.dispatchEvent(new Event('camerafail')); });
  },

  stop(videoEl) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (videoEl) videoEl.srcObject = null;
  },

  /** Latest frame only. maxW keeps cloud uploads small. Returns JPEG data URL. */
  captureJpeg(videoEl, maxW = 640, quality = 0.6) {
    if (!videoEl.videoWidth) return null;
    const scale = Math.min(1, maxW / videoEl.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(videoEl.videoWidth * scale);
    c.height = Math.round(videoEl.videoHeight * scale);
    c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  }
};
