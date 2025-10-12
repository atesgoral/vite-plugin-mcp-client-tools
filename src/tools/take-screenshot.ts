import { promises as fs } from "node:fs";
import path from "node:path";

import { z } from "zod";

const outputSchema = {
  path: z.string(),
};

interface CaptureScreenshotResult {
  dataUrl: string;
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
    const { dataUrl } = await this.component.captureScreenshot();

    // const { path } = await this.server.saveScreenshot({ dataUrl });

    const base64Data = dataUrl.split(",")[1];

    return {
      content: [
        {
          type: "text",
          text: "Screenshot of current browser tab captured",
        },
        {
          type: "image",
          mimeType: "image/jpeg",
          data: base64Data,
        },
      ],
      // structuredContent: {
      //   path,
      // },
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

        const canvas = new OffscreenCanvas(
          this.#video.videoWidth,
          this.#video.videoHeight
        );
        const ctx = canvas.getContext("2d");

        if (!ctx) throw new Error("Could not obtain 2D context");

        ctx.drawImage(this.#video, 0, 0, canvas.width, canvas.height);

        const blob = await canvas.convertToBlob({
          type: "image/jpeg",
          quality: 0.2,
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

        return { dataUrl };
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
