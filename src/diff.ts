import { readFile, writeFile } from "fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export interface ImageDiffResult {
  diffPath?: string;
  mismatchRatio: number;
}

export async function diffImages(
  baselinePath: string,
  candidatePath: string,
  outputPath?: string,
): Promise<ImageDiffResult> {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    readFile(baselinePath),
    readFile(candidatePath),
  ]);
  const baseline = PNG.sync.read(baselineBuffer);
  const candidate = PNG.sync.read(candidateBuffer);
  if (
    baseline.width !== candidate.width ||
    baseline.height !== candidate.height
  ) {
    return { mismatchRatio: 1 };
  }
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const mismatchPixels = pixelmatch(
    baseline.data,
    candidate.data,
    diff.data,
    baseline.width,
    baseline.height,
    { threshold: 0.1 },
  );
  if (outputPath) {
    await writeFile(outputPath, PNG.sync.write(diff));
  }
  const totalPixels = baseline.width * baseline.height;
  return {
    diffPath: outputPath,
    mismatchRatio: totalPixels === 0 ? 0 : mismatchPixels / totalPixels,
  };
}
