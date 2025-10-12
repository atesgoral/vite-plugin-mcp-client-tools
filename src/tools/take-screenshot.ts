import { promises as fs } from "node:fs";
import path from "node:path";

import { z } from "zod";

const outputSchema = {
  path: z.string(),
};

interface CaptureScreenshotResult {
  dataUrl: string;
  quality: number;
  saveToDisk: boolean;
}

interface SaveScreenshotArgs {
  dataUrl: string;
}

interface SaveScreenshotResult {
  path: string;
}

interface ToolContext {
  component: {
    captureScreenshot(): Promise<CaptureScreenshotResult>;
  };
  server: {
    saveScreenshot(args: SaveScreenshotArgs): Promise<SaveScreenshotResult>;
  };
}

type ScreenShareOverlayConstructor = new (...args: any[]) => HTMLElement & {
  captureScreenshot(): Promise<CaptureScreenshotResult>;
};

export const takeScreenshotTool = {
  name: "take-screenshot",
  description:
    "Capture a screenshot of the shared screen via browser screen sharing",
  // outputSchema,
  handler: async function (this: ToolContext) {
    const { dataUrl, quality, saveToDisk } = await this.component.captureScreenshot();

    const base64Data = dataUrl.split(",")[1];

    let savedPath: string | undefined;
    if (saveToDisk) {
      const { path } = await this.server.saveScreenshot({ dataUrl });
      savedPath = path;
    }

    const textContent = savedPath
      ? `Screenshot of current browser tab captured (quality: ${quality}, saved to: ${savedPath})`
      : `Screenshot of current browser tab captured (quality: ${quality})`;

    return {
      content: [
        {
          type: "text",
          text: textContent,
        },
        {
          type: "image",
          mimeType: "image/jpeg",
          data: base64Data,
        },
      ],
    };
  },
  component: <T extends new (...args: any[]) => HTMLElement>(
    Base: T
  ): T & ScreenShareOverlayConstructor => {
    class ScreenShareOverlay extends Base {
      #mediaStream: MediaStream | null = null;
      #video: HTMLVideoElement | null = null;
      #capturePromise: Promise<void> | null = null;
      #captureResolve: (() => void) | null = null;
      #captureReject: ((error: Error) => void) | null = null;
      #qualitySlider: HTMLInputElement | null = null;
      #saveToDiskCheckbox: HTMLInputElement | null = null;

      connectedCallback() {
        const shadow = this.attachShadow({ mode: "open" });

        const style = document.createElement("style");

        style.textContent = `
          :host {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 10000;
          }

          :host([visible]) {
            display: flex;
          }

          .backdrop {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
          }

          .modal {
            position: relative;
            background: #fff;
            border-radius: 12px;
            padding: 32px;
            max-width: 500px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            display: flex;
            flex-direction: column;
            gap: 24px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          }

          .modal h2 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
            color: #111;
          }

          .modal p {
            margin: 0;
            font-size: 16px;
            line-height: 1.5;
            color: #555;
          }

          .buttons {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
          }

          button {
            font-size: 16px;
            padding: 10px 20px;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
          }

          .primary {
            background: #000;
            color: #fff;
          }

          .primary:hover {
            background: #222;
          }

          .secondary {
            background: #eee;
            color: #333;
          }

          .secondary:hover {
            background: #ddd;
          }

          .options {
            border-top: 1px solid #e0e0e0;
            padding-top: 16px;
          }

          .options-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            user-select: none;
            padding: 8px 0;
          }

          .options-header:hover {
            opacity: 0.7;
          }

          .options-title {
            font-size: 14px;
            font-weight: 600;
            color: #333;
          }

          .reset-button {
            align-self: flex-start;
            font-size: 12px;
            padding: 4px 12px;
            border-radius: 4px;
            border: 1px solid #ddd;
            background: #fff;
            color: #666;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
          }

          .reset-button:hover {
            background: #f5f5f5;
            border-color: #ccc;
          }

          .chevron {
            width: 20px;
            height: 20px;
            transition: transform 0.2s;
          }

          .chevron.expanded {
            transform: rotate(180deg);
          }

          .options-content {
            display: none;
            padding-top: 16px;
            gap: 16px;
            flex-direction: column;
          }

          .options-content.expanded {
            display: flex;
          }

          .option-row {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .option-label {
            font-size: 14px;
            font-weight: 500;
            color: #333;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .option-description {
            font-size: 12px;
            color: #666;
          }

          .slider-container {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          input[type="range"] {
            flex: 1;
            height: 4px;
            background: #ddd;
            border-radius: 2px;
            outline: none;
            -webkit-appearance: none;
          }

          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            background: #000;
            border-radius: 50%;
            cursor: pointer;
          }

          input[type="range"]::-moz-range-thumb {
            width: 16px;
            height: 16px;
            background: #000;
            border-radius: 50%;
            cursor: pointer;
            border: none;
          }

          .slider-value {
            font-size: 14px;
            font-weight: 500;
            color: #333;
            min-width: 40px;
            text-align: right;
          }

          .checkbox-container {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: #000;
          }

          .checkbox-label {
            font-size: 14px;
            font-weight: 500;
            color: #333;
            cursor: pointer;
            user-select: none;
          }
        `;

        const backdrop = document.createElement("div");
        backdrop.className = "backdrop";
        backdrop.addEventListener("click", () => this.#cancelCapture());

        const modal = document.createElement("div");
        modal.className = "modal";

        const title = document.createElement("h2");
        title.textContent = "Screen Capture Required";

        const description = document.createElement("p");
        description.textContent = "To take screenshots, this tool needs permission to capture your screen. Click 'Start Capture' to share the current tab.";

        // Options section
        const options = document.createElement("div");
        options.className = "options";

        const optionsHeader = document.createElement("div");
        optionsHeader.className = "options-header";

        const optionsTitle = document.createElement("div");
        optionsTitle.className = "options-title";
        optionsTitle.textContent = "Options";

        const chevron = document.createElement("div");
        chevron.className = "chevron";
        chevron.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>`;

        const optionsContent = document.createElement("div");
        optionsContent.className = "options-content";

        // JPEG Quality slider
        const qualityRow = document.createElement("div");
        qualityRow.className = "option-row";

        const qualityLabel = document.createElement("div");
        qualityLabel.className = "option-label";
        qualityLabel.textContent = "JPEG Quality";

        const qualityDescription = document.createElement("div");
        qualityDescription.className = "option-description";
        qualityDescription.textContent = "Lower quality produces smaller files";

        const sliderContainer = document.createElement("div");
        sliderContainer.className = "slider-container";

        const qualitySlider = document.createElement("input");
        qualitySlider.type = "range";
        qualitySlider.min = "0";
        qualitySlider.max = "10";
        qualitySlider.value = "2"; // Default 0.2
        qualitySlider.step = "1";
        this.#qualitySlider = qualitySlider;

        const qualityValue = document.createElement("div");
        qualityValue.className = "slider-value";
        qualityValue.textContent = "0.2";

        qualitySlider.addEventListener("input", (e) => {
          const value = parseInt((e.target as HTMLInputElement).value);
          qualityValue.textContent = (value / 10).toFixed(1);
        });

        sliderContainer.appendChild(qualitySlider);
        sliderContainer.appendChild(qualityValue);

        qualityRow.appendChild(qualityLabel);
        qualityRow.appendChild(qualityDescription);
        qualityRow.appendChild(sliderContainer);

        // Save to disk checkbox
        const saveToDiskRow = document.createElement("div");
        saveToDiskRow.className = "option-row";

        const saveToDiskLabel = document.createElement("div");
        saveToDiskLabel.className = "option-label";
        saveToDiskLabel.textContent = "Save to Disk";

        const saveToDiskDescription = document.createElement("div");
        saveToDiskDescription.className = "option-description";
        saveToDiskDescription.textContent = "Also save screenshot to tmp/screenshots directory";

        const checkboxContainer = document.createElement("div");
        checkboxContainer.className = "checkbox-container";

        const saveToDiskCheckbox = document.createElement("input");
        saveToDiskCheckbox.type = "checkbox";
        saveToDiskCheckbox.id = "save-to-disk-checkbox";
        saveToDiskCheckbox.checked = false; // Default OFF
        this.#saveToDiskCheckbox = saveToDiskCheckbox;

        const checkboxLabel = document.createElement("label");
        checkboxLabel.className = "checkbox-label";
        checkboxLabel.htmlFor = "save-to-disk-checkbox";
        checkboxLabel.textContent = "Enable file saving";

        checkboxContainer.appendChild(saveToDiskCheckbox);
        checkboxContainer.appendChild(checkboxLabel);

        saveToDiskRow.appendChild(saveToDiskLabel);
        saveToDiskRow.appendChild(saveToDiskDescription);
        saveToDiskRow.appendChild(checkboxContainer);

        // Reset button
        const resetButton = document.createElement("button");
        resetButton.type = "button";
        resetButton.className = "reset-button";
        resetButton.textContent = "Reset to Defaults";

        // Reset button functionality
        const resetToDefaults = () => {
          qualitySlider.value = "2";
          qualityValue.textContent = "0.2";
          saveToDiskCheckbox.checked = false;
        };

        resetButton.addEventListener("click", () => {
          resetToDefaults();
        });

        optionsContent.appendChild(qualityRow);
        optionsContent.appendChild(saveToDiskRow);
        optionsContent.appendChild(resetButton);

        // Accordion toggle
        optionsHeader.addEventListener("click", () => {
          const isExpanded = optionsContent.classList.toggle("expanded");
          chevron.classList.toggle("expanded", isExpanded);
        });

        optionsHeader.appendChild(optionsTitle);
        optionsHeader.appendChild(chevron);
        options.appendChild(optionsHeader);
        options.appendChild(optionsContent);

        const buttons = document.createElement("div");
        buttons.className = "buttons";

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "secondary";
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => this.#cancelCapture());

        const startButton = document.createElement("button");
        startButton.type = "button";
        startButton.className = "primary";
        startButton.textContent = "Start Capture";
        startButton.addEventListener("click", () => this.#startCapture());

        buttons.appendChild(cancelButton);
        buttons.appendChild(startButton);

        modal.appendChild(title);
        modal.appendChild(description);
        modal.appendChild(options);
        modal.appendChild(buttons);

        shadow.appendChild(style);
        shadow.appendChild(backdrop);
        shadow.appendChild(modal);
      }

      #showModal() {
        this.setAttribute("visible", "");
        document.addEventListener("keydown", this.#onKeyDown);

        // Create a new promise that will be resolved/rejected by user action
        this.#capturePromise = new Promise((resolve, reject) => {
          this.#captureResolve = resolve;
          this.#captureReject = reject;
        });

        return this.#capturePromise;
      }

      #hideModal() {
        this.removeAttribute("visible");
        document.removeEventListener("keydown", this.#onKeyDown);
      }

      #onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          this.#cancelCapture();
        }
      };

      #cancelCapture() {
        this.#hideModal();
        if (this.#captureReject) {
          this.#captureReject(new Error("Screen capture cancelled by user"));
          this.#captureResolve = null;
          this.#captureReject = null;
        }
      }

      async #startCapture() {
        try {
          // Hide modal first
          this.#hideModal();
          // Wait for next frame to ensure modal is hidden before starting capture
          await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
          await this.#startScreenCapture();
          // Wait 2s for browser's dimension overlay to fade away
          await new Promise(resolve => setTimeout(resolve, 2000));
          if (this.#captureResolve) {
            this.#captureResolve();
            this.#captureResolve = null;
            this.#captureReject = null;
          }
        } catch (error) {
          this.#hideModal();
          if (this.#captureReject) {
            if (
              error instanceof DOMException &&
              error.name === "NotAllowedError"
            ) {
              this.#captureReject(new Error("Screen capture permission denied by user"));
            } else {
              this.#captureReject(error instanceof Error ? error : new Error(String(error)));
            }
            this.#captureResolve = null;
            this.#captureReject = null;
          }
        }
      }


      async #startScreenCapture() {
        const mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30 },
          },
          audio: false,
          preferCurrentTab: true,
          selfBrowserSurface: "include",
          surfaceSwitching: "exclude",
        } as DisplayMediaStreamOptions);

        mediaStream.getTracks().forEach((track) => {
          track.addEventListener(
            "ended",
            () => {
              console.log(`${track.kind} track ended`);
              this.#stopScreenCapture();
            },
            { once: true }
          );
        });

        const video = document.createElement("video");

        video.srcObject = mediaStream;
        video.play();

        this.#mediaStream = mediaStream;
        this.#video = video;

        await new Promise<void>((resolve, reject) => {
          video.addEventListener("loadedmetadata", () => resolve(), {
            once: true,
          });
          video.addEventListener(
            "error",
            (e) => reject(new Error(`Video error: ${e}`)),
            { once: true }
          );
        });

        // Add persistent error handler for ongoing video issues
        video.addEventListener("error", () => {
          console.error("Video error occurred during capture");
          this.#stopScreenCapture();
        });
      }

      #stopScreenCapture() {
        if (this.#mediaStream) {
          this.#mediaStream.getTracks().forEach((track) => track.stop());
          this.#mediaStream = null;
        }

        if (this.#video) {
          this.#video.srcObject = null;
          this.#video = null;
        }
      }

      async captureScreenshot(): Promise<CaptureScreenshotResult> {
        if (!this.#video) {
          // Show the modal and wait for user action
          await this.#showModal();
        }

        // After modal interaction, video should be set
        if (!this.#video) {
          throw new Error("Screen capture not available");
        }

        // Get quality value from slider (default to 0.2 if not set)
        const quality = this.#qualitySlider
          ? parseInt(this.#qualitySlider.value) / 10
          : 0.2;

        // Get save to disk checkbox value (default to false if not set)
        const saveToDisk = this.#saveToDiskCheckbox?.checked ?? false;

        const canvas = new OffscreenCanvas(
          this.#video.videoWidth,
          this.#video.videoHeight
        );
        const ctx = canvas.getContext("2d");

        if (!ctx) throw new Error("Could not obtain 2D context");

        ctx.drawImage(this.#video, 0, 0, canvas.width, canvas.height);

        const blob = await canvas.convertToBlob({
          type: "image/jpeg",
          quality,
        });

        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.addEventListener(
            "load",
            () => resolve(reader.result as string),
            {
              once: true,
            }
          );
          reader.readAsDataURL(blob);
        });

        return { dataUrl, quality, saveToDisk };
      }
    }

    return ScreenShareOverlay as T & ScreenShareOverlayConstructor;
  },
  server: {
    saveScreenshot: async (
      args: SaveScreenshotArgs
    ): Promise<SaveScreenshotResult> => {
      const dataUrl = args.dataUrl;

      const matches = /^data:image\/(?<ext>\w+);base64,(?<base64Data>.+)$/.exec(
        String(dataUrl)
      );

      if (!matches?.groups) throw new Error("Invalid image data URL format");

      const { ext, base64Data } = matches.groups as {
        ext: string;
        base64Data: string;
      };

      const buffer = Buffer.from(base64Data, "base64");

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `screenshot-${timestamp}.${ext}`;
      const screenshotsDir = path.join(process.cwd(), "tmp", "screenshots");
      const filepath = path.join(screenshotsDir, filename);

      await fs.mkdir(screenshotsDir, { recursive: true });
      await fs.writeFile(filepath, buffer);

      console.log(
        `Screenshot saved: ${filepath} (${Math.round(buffer.length / 1024)}kB)`
      );

      return { path: filepath };
    },
  },
};
