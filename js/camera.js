const DEFAULT_CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

export class CameraController {
  constructor(videoElement, overlayCanvas, constraints = DEFAULT_CONSTRAINTS) {
    this.video = videoElement;
    this.overlay = overlayCanvas;
    this.constraints = constraints;
    this.stream = null;
    this.onFrame = null;
    this._handleResize = this._handleResize.bind(this);
    this.video.addEventListener("loadedmetadata", this._handleResize);
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("브라우저가 카메라를 지원하지 않습니다.");
    }

    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
    this.video.srcObject = this.stream;
    await this.video.play();
    this._handleResize();
    return this.stream;
  }

  stop() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }
    this.stream = null;
    if (this.video) {
      this.video.srcObject = null;
    }
    if (this.overlay) {
      const ctx = this.overlay.getContext("2d");
      ctx?.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }
  }

  _handleResize() {
    if (!this.overlay || !this.video.videoWidth || !this.video.videoHeight) {
      return;
    }
    this.overlay.width = this.video.videoWidth;
    this.overlay.height = this.video.videoHeight;
    this._drawOverlay();
  }

  _drawOverlay() {
    if (!this.overlay) return;
    const ctx = this.overlay.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    const { width, height } = this.overlay;
    const radius = Math.min(width, height) * 0.32;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.save();
    ctx.strokeStyle = "rgba(37, 99, 235, 0.8)";
    ctx.lineWidth = Math.max(2, width * 0.004);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(37, 99, 235, 0.4)";
    ctx.setLineDash([12, 14]);
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radius * 0.6, radius * 0.96, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.lineWidth = Math.max(1, width * 0.0025);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - radius * 1.2);
    ctx.lineTo(centerX, centerY + radius * 1.2);
    ctx.moveTo(centerX - radius * 1.2, centerY);
    ctx.lineTo(centerX + radius * 1.2, centerY);
    ctx.strokeStyle = "rgba(248, 250, 252, 0.8)";
    ctx.stroke();

    ctx.restore();
  }

  async capture() {
    if (!this.stream) {
      throw new Error("카메라가 활성화되어 있지 않습니다.");
    }
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;
    if (!width || !height) {
      throw new Error("카메라 프레임 정보를 가져오지 못했습니다.");
    }

    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = width;
    captureCanvas.height = height;
    const ctx = captureCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("캔버스 컨텍스트를 초기화하지 못했습니다.");
    }
    ctx.drawImage(this.video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const dataUrl = captureCanvas.toDataURL("image/jpeg", 0.92);
    const blob = await new Promise((resolve) => captureCanvas.toBlob(resolve, "image/jpeg", 0.92));

    return {
      width,
      height,
      canvas: captureCanvas,
      dataUrl,
      blob,
      imageData,
      capturedAt: Date.now(),
    };
  }
}
