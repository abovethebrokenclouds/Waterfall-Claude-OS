/**
 * Agent 6 — FFmpeg Command Generator.
 *
 * Pure, deterministic. Compiles a declarative VideoSpec into an FFmpeg
 * invocation: trims the source window, scales/crops to a 9:16 canvas, applies
 * the background treatment, and draws text overlays. The render worker executes
 * the returned args; the `shell` string is for inspection/debugging.
 */
import type { FfmpegCommand, Overlay, VideoSpec } from "../types";

function quote(arg: string): string {
  return /[\s"'\\]/.test(arg) ? `'${arg.replace(/'/g, "'\\''")}'` : arg;
}

function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’");
}

function drawTextFilter(o: Overlay, canvasW: number, canvasH: number): string {
  const x = Math.round(o.position.x * canvasW);
  const y = Math.round(o.position.y * canvasH);
  const size = o.fontSize ?? 48;
  const color = (o.color ?? "#FFFFFF").replace("#", "0x");
  const parts = [
    `text='${escapeDrawText(o.text ?? "")}'`,
    `x=(${x}-text_w/2)`,
    `y=(${y}-text_h/2)`,
    `fontsize=${size}`,
    `fontcolor=${color}`,
    "box=1",
    "boxcolor=0x00000088",
    "boxborderw=20",
  ];
  if (o.timing) {
    parts.push(
      `enable='between(t,${o.timing.startSec},${o.timing.endSec})'`,
    );
  }
  return `drawtext=${parts.join(":")}`;
}

export function ffmpegCommandGenerator(spec: VideoSpec): FfmpegCommand {
  const { w, h } = spec.resolution;
  const duration = (spec.source.endSec - spec.source.startSec).toFixed(3);

  // Base: scale to cover then crop to the vertical canvas.
  const cover =
    `scale=${w}:${h}:force_original_aspect_ratio=increase,` +
    `crop=${w}:${h}`;

  const background =
    spec.background.type === "blur"
      ? // blurred fill behind a contained foreground
        `split=2[bg][fg];` +
        `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` +
        `boxblur=${spec.background.value}[bgb];` +
        `[fg]scale=${w}:-1[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2`
      : cover;

  const textFilters = spec.overlays
    .filter((o) => o.type === "text" && o.text)
    .map((o) => drawTextFilter(o, w, h));

  const filterComplex = [`[0:v]${background}[base]`]
    .concat(
      textFilters.length
        ? [`[base]${textFilters.join(",")}[v]`]
        : [`[base]copy[v]`],
    )
    .join(";");

  const args = [
    "-y",
    "-ss",
    spec.source.startSec.toString(),
    "-t",
    duration,
    "-i",
    "{INPUT}",
    "-filter_complex",
    filterComplex,
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-r",
    spec.fps.toString(),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "{OUTPUT}",
  ];

  const shell = `ffmpeg ${args.map(quote).join(" ")}`;
  return { args, filterComplex, shell };
}
