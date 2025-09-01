import { promises as fs } from "node:fs";
import path from "node:path";

import { z } from "zod";

import type { McpTool } from "../index.js";

const outputSchema = {
  path: z.string(),
};

export const takeScreenshotTool: McpTool<undefined, typeof outputSchema> = {
  name: "take-screenshot",
  description:
    "Capture a screenshot of the shared screen via browser screen sharing",
  outputSchema,
  handler: async function () {
    const dataUrl = await this.component.captureScreenshot();

    const { path } = await this.server.saveScreenshot({ dataUrl });

    return {
      structuredContent: {
        path,
      },
    };
  },
  component: (Base) => {
    class ScreenShareOverlay extends Base {
      private mediaStream: MediaStream | null = null;
      private video: HTMLVideoElement | null = null;

      connectedCallback() {
        const shadow = this.attachShadow({ mode: "open" });

        const style = document.createElement("style");

        style.textContent = `
          button {
            background: #000;
            color: #eee;
            border: 1px solid #eee;
            border-radius: 8px;
            padding: 8px 12px;
            cursor: pointer;
          }

          button:hover {
            background: #111;
            color: #fff;
          }
        `;

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Start Screen Capture";
        button.disabled = false;
        button.addEventListener("click", () => this.toggleScreenCapture());

        shadow.appendChild(style);
        shadow.appendChild(button);
      }

      private async toggleScreenCapture() {
        try {
          await this.startScreenCapture();
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "NotAllowedError"
          ) {
            console.log("Screen capture permission denied by user");
          } else {
            console.error(error);
          }
        }
      }

      private async startScreenCapture() {
        const mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30 },
          },
          audio: false,
          preferCurrentTab: true,
          selfBrowserSurface: "include",
          surfaceSwitching: "exclude",
        } as DisplayMediaStreamOptions & { preferCurrentTab: boolean });

        mediaStream.getTracks().forEach((track) => {
          track.addEventListener(
            "ended",
            () => {
              console.log(`${track.kind} track ended`);
              this.stopScreenCapture();
            },
            { once: true }
          );
        });

        const video = document.createElement("video");

        video.srcObject = mediaStream;
        video.play();

        this.mediaStream = mediaStream;
        this.video = video;

        await new Promise((resolve, reject) => {
          video.addEventListener("loadedmetadata", resolve, { once: true });
          video.addEventListener(
            "error",
            (e) => reject(new Error(`Video error: ${e}`)),
            { once: true }
          );
        });

        // Add persistent error handler for ongoing video issues
        video.addEventListener("error", () => {
          console.error("Video error occurred during capture");
          this.stopScreenCapture();
        });
      }

      private stopScreenCapture() {
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
          this.mediaStream = null;
        }

        if (this.video) {
          this.video.srcObject = null;
          this.video = null;
        }
      }

      async captureScreenshot() {
        if (!this.video) throw new Error("Not capturing");

        const canvas = new OffscreenCanvas(
          this.video.videoWidth,
          this.video.videoHeight
        );
        const ctx = canvas.getContext("2d");

        if (!ctx) throw new Error("Could not obtain 2D context");

        ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);

        const blob = await canvas.convertToBlob({
          type: "image/jpeg",
          quality: 0.2,
        });

        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.addEventListener(
            "load",
            () => resolve(reader.result as string),
            { once: true }
          );
          reader.readAsDataURL(blob);
        });

        return dataUrl;
      }
    }

    return ScreenShareOverlay;
  },
  server: {
    saveScreenshot: async (args) => {
      const dataUrl = args.dataUrl;

      if (typeof dataUrl !== "string")
        throw new Error("dataUrl is not a string");

      const screenshotsDir = path.join(process.cwd(), "tmp", "screenshots");
      await fs.mkdir(screenshotsDir, { recursive: true });

      const [mimeHeader, base64Data] = dataUrl.split(",");
      if (!base64Data || !mimeHeader)
        throw new Error("Invalid data URL format");

      const mimeType = mimeHeader.split(";")[0];
      const ext = mimeType.split("/")[1];

      const buffer = Buffer.from(base64Data, "base64");

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `screenshot-${timestamp}.${ext}`;
      const filepath = path.join(screenshotsDir, filename);

      await fs.writeFile(filepath, buffer);

      console.log(
        `Screenshot saved: ${filepath} (${Math.round(buffer.length / 1024)}kB)`
      );

      return { path: filepath };
    },
  } as const,
};
