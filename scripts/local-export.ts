import type { Plugin } from "vite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { buildEditPlan } from "../lib/edit-plan";

const exec = promisify(execFile);
export function localExport(): Plugin {
  return {
    name: "freeze-local-export",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0];
        if (!["/api/local-config", "/api/local-assemble"].includes(path || ""))
          return next();
        res.setHeader("Cache-Control", "no-store");
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) {
          res.statusCode = 403;
          res.end();
          return;
        }
        let dir: string | undefined;
        try {
          if (path === "/api/local-config") {
            let available = false;
            try {
              await exec("ffmpeg", ["-version"]);
              await exec("ffprobe", ["-version"]);
              available = true;
            } catch {
              /* Browser fallback remains available. */
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ nativeExport: available }));
            return;
          }
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end();
            return;
          }
          const buffers: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            const bytes = Buffer.from(chunk);
            size += bytes.length;
            if (size > 155 * 1024 * 1024)
              throw new Error("Video exceeds the local upload limit.");
            buffers.push(bytes);
          }
          const request = new Request("http://localhost/api/local-assemble", {
            method: "POST",
            headers: { "Content-Type": req.headers["content-type"] || "" },
            body: Buffer.concat(buffers),
          });
          const form = await request.formData();
          const source = form.get("source");
          const at = Number(form.get("freezeAt"));
          const cameraValue = form.get("cameraUrl");
          if (typeof cameraValue !== "string")
            throw new Error("Missing generated clip URL.");
          const camera = new URL(cameraValue);
          if (!(source instanceof File) || !Number.isFinite(at) || at < 0)
            throw new Error("Invalid source or freeze timestamp.");
          if (
            camera.protocol !== "https:" ||
            camera.port ||
            camera.username ||
            camera.password ||
            !camera.hostname.endsWith(".fal.media")
          )
            throw new Error("Expected a fal-generated video URL.");
          dir = await mkdtemp(join(tmpdir(), "freeze-export-"));
          const sourcePath = join(dir, "source"),
            cameraPath = join(dir, "camera.mp4"),
            output = join(dir, "finished.mp4");
          await writeFile(
            sourcePath,
            new Uint8Array(await source.arrayBuffer()),
          );
          const remote = await fetch(camera, {
            redirect: "error",
            signal: AbortSignal.timeout(60000),
          });
          if (!remote.ok)
            throw new Error("Could not retrieve the generated clip.");
          await writeFile(
            cameraPath,
            new Uint8Array(await remote.arrayBuffer()),
          );
          async function probe(file: string) {
            const { stdout } = await exec("ffprobe", [
              "-v",
              "error",
              "-show_streams",
              "-show_format",
              "-of",
              "json",
              file,
            ]);
            return JSON.parse(stdout);
          }
          const original = await probe(sourcePath),
            generated = await probe(cameraPath);
          const duration = Number(original.format.duration),
            cameraDuration = Number(generated.format.duration);
          if (
            !Number.isFinite(duration) ||
            !Number.isFinite(cameraDuration) ||
            at > duration ||
            duration > 60.5
          )
            throw new Error("Invalid clip duration or selected frame.");
          const video = generated.streams.find(
            (s: { codec_type: string }) => s.codec_type === "video",
          );
          const width = Number(video?.width),
            height = Number(video?.height);
          if (
            !Number.isInteger(width) ||
            !Number.isInteger(height) ||
            width <= 0 ||
            height <= 0
          )
            throw new Error("Could not read generated video dimensions.");
          const audio = (p: typeof original) =>
            p.streams.some(
              (s: { codec_type: string }) => s.codec_type === "audio",
            );
          const graph = buildEditPlan(
            width,
            height,
            at,
            cameraDuration,
            duration,
            audio(original),
            audio(generated),
          );
          const args = [
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            sourcePath,
            "-i",
            cameraPath,
            "-filter_complex",
            graph,
            "-map",
            "[v]",
          ];
          if (audio(original) || audio(generated))
            args.push("-map", "[a]", "-c:a", "aac", "-b:a", "192k");
          args.push(
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-y",
            output,
          );
          await exec("ffmpeg", args, {
            timeout: 300000,
            maxBuffer: 2 * 1024 * 1024,
          });
          const finished = await probe(output);
          if (
            Math.abs(
              Number(finished.format.duration) - (duration + cameraDuration),
            ) > 0.25
          )
            throw new Error(
              "The assembled duration did not match the full three-part edit.",
            );
          res.setHeader("Content-Type", "video/mp4");
          res.end(await readFile(output));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "Local assembly failed.",
            }),
          );
        } finally {
          if (dir) {
            const target = resolve(dir);
            if (
              dirname(target) === resolve(tmpdir()) &&
              basename(target).startsWith("freeze-export-")
            )
              await rm(target, { recursive: true, force: true });
          }
        }
      });
    },
  };
}
