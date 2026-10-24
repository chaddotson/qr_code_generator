import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm";

/**
 * Browser-side QR code renderer with optional center-logo compositing.
 * The high error-correction level keeps logo-bearing codes easier to scan.
 */
export class QRCodeCreator {
  constructor(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError("QRCodeCreator requires a canvas element.");
    }

    this.canvas = canvas;
    this.logo = null;
    this.renderVersion = 0;
  }

  async setLogo(file) {
    if (!file) {
      this.logo = null;
      return;
    }

    if (!file.type.startsWith("image/")) {
      throw new TypeError("Please choose an image file.");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new RangeError("Logo images must be 5 MB or smaller.");
    }

    const imageUrl = URL.createObjectURL(file);
    try {
      this.logo = await this.#loadImage(imageUrl);
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  async render({ text, size, margin, darkColor, lightColor, logoScale = 0.2 }) {
    const currentVersion = ++this.renderVersion;
    const value = text.trim();

    if (!value) {
      throw new Error("Enter a destination or some text first.");
    }

    await QRCode.toCanvas(this.canvas, value, {
      width: size,
      margin,
      errorCorrectionLevel: "H",
      color: { dark: darkColor, light: lightColor },
    });

    if (currentVersion !== this.renderVersion || !this.logo) return;
    this.#drawLogo(logoScale, lightColor);
  }

  download(filename = "qr-code.png") {
    const link = document.createElement("a");
    link.download = filename;
    link.href = this.canvas.toDataURL("image/png");
    link.click();
  }

  #loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("That logo image could not be read."));
      image.src = src;
    });
  }

  #drawLogo(scale, backgroundColor) {
    const context = this.canvas.getContext("2d");
    const logoSize = Math.round(this.canvas.width * scale);
    const padding = Math.max(6, Math.round(logoSize * 0.14));
    const plateSize = logoSize + padding * 2;
    const plateX = (this.canvas.width - plateSize) / 2;
    const plateY = (this.canvas.height - plateSize) / 2;
    const logoX = (this.canvas.width - logoSize) / 2;
    const logoY = (this.canvas.height - logoSize) / 2;
    const radius = Math.max(8, Math.round(plateSize * 0.16));

    context.save();
    context.fillStyle = backgroundColor;
    this.#roundedRect(context, plateX, plateY, plateSize, plateSize, radius);
    context.fill();

    context.beginPath();
    this.#roundedRect(context, logoX, logoY, logoSize, logoSize, Math.round(radius * 0.7));
    context.clip();

    const imageRatio = this.logo.naturalWidth / this.logo.naturalHeight;
    let drawWidth = logoSize;
    let drawHeight = logoSize;
    if (imageRatio > 1) drawHeight = logoSize / imageRatio;
    if (imageRatio < 1) drawWidth = logoSize * imageRatio;

    context.drawImage(
      this.logo,
      logoX + (logoSize - drawWidth) / 2,
      logoY + (logoSize - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    context.restore();
  }

  #roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
  }
}

const form = document.querySelector("#qr-form");
const canvas = document.querySelector("#qr-canvas");
const creator = new QRCodeCreator(canvas);
const controls = {
  content: document.querySelector("#content"),
  size: document.querySelector("#size"),
  margin: document.querySelector("#margin"),
  darkColor: document.querySelector("#dark-color"),
  lightColor: document.querySelector("#light-color"),
  logo: document.querySelector("#logo"),
  logoScale: document.querySelector("#logo-scale"),
};

const status = document.querySelector("#status");
const dimensionLabel = document.querySelector("#dimension-label");
const removeLogo = document.querySelector("#remove-logo");
const logoScaleField = document.querySelector("#logo-scale-field");
const uploadTitle = document.querySelector("#upload-title");
const uploadHelp = document.querySelector("#upload-help");
let renderTimer;

function values() {
  return {
    text: controls.content.value,
    size: Number(controls.size.value),
    margin: Number(controls.margin.value),
    darkColor: controls.darkColor.value,
    lightColor: controls.lightColor.value,
    logoScale: Number(controls.logoScale.value) / 100,
  };
}

async function render() {
  clearTimeout(renderTimer);
  status.textContent = "Updating";
  status.classList.remove("error");

  try {
    await creator.render(values());
    status.textContent = "Ready";
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  }
}

function queueRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 120);
}

form.addEventListener("input", (event) => {
  if (event.target === controls.darkColor) {
    document.querySelector("#dark-value").textContent = controls.darkColor.value.toUpperCase();
  }
  if (event.target === controls.lightColor) {
    document.querySelector("#light-value").textContent = controls.lightColor.value.toUpperCase();
  }
  if (event.target === controls.size) {
    dimensionLabel.textContent = `${controls.size.value} × ${controls.size.value} px`;
  }
  if (event.target === controls.logoScale) {
    document.querySelector("#logo-scale-value").textContent = `${controls.logoScale.value}%`;
    document.querySelector("#logo-scale-warning").hidden = Number(controls.logoScale.value) <= 26;
  }
  queueRender();
});

controls.logo.addEventListener("change", async () => {
  const [file] = controls.logo.files;
  try {
    await creator.setLogo(file);
    const hasLogo = Boolean(file);
    removeLogo.hidden = !hasLogo;
    logoScaleField.hidden = !hasLogo;
    uploadTitle.textContent = hasLogo ? file.name : "Choose an image";
    uploadHelp.textContent = hasLogo ? "Logo added · click to replace" : "PNG, JPG, WebP, or SVG · up to 5 MB";
    await render();
  } catch (error) {
    controls.logo.value = "";
    status.textContent = error.message;
    status.classList.add("error");
  }
});

removeLogo.addEventListener("click", async () => {
  controls.logo.value = "";
  await creator.setLogo(null);
  removeLogo.hidden = true;
  logoScaleField.hidden = true;
  uploadTitle.textContent = "Choose an image";
  uploadHelp.textContent = "PNG, JPG, WebP, or SVG · up to 5 MB";
  await render();
});

document.querySelector("#download").addEventListener("click", () => creator.download());

render();
