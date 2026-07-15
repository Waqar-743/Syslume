import { FORMAT_SIZE } from "../constants";
import type { ProgressPayload } from "../types";

interface ScanningViewProps {
  progress: ProgressPayload | null;
  targetPath: string;
  elapsedMs: number;
  warnings: string[];
  onCancel: () => void;
}

export default function ScanningView({ progress, targetPath, elapsedMs, warnings, onCancel }: ScanningViewProps) {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return (
    <section className="scan-stage">
      <div className="scan-visual" aria-hidden="true">
        <div className="scan-orbit orbit-one" /><div className="scan-orbit orbit-two" />
        <span className="scan-core">DS</span>
      </div>
      <div className="scan-copy">
        <span className="eyebrow"><b>Live</b> filesystem walk</span>
        <h1>Reading the shape<br />of your storage.</h1>
        <p className="scan-path" title={progress?.current_path || targetPath}>{progress?.current_path || targetPath}</p>
        <div className="scan-rule"><i /></div>
        <dl className="scan-metrics">
          <div><dt>Objects read</dt><dd>{(progress?.visited_entries || 0).toLocaleString()}</dd></div>
          <div><dt>Data mapped</dt><dd>{FORMAT_SIZE(progress?.visited_bytes_approx || 0)}</dd></div>
          <div><dt>Elapsed</dt><dd>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</dd></div>
        </dl>
        <div className="scan-footnote">
          <span>{progress?.phase === "finalizing" ? "Building the final index" : "Progress is indeterminate while the filesystem is being discovered"}</span>
          {warnings.length > 0 && <span className="warning-copy">{warnings.length} paths could not be read</span>}
        </div>
        <button className="cancel-action" onClick={onCancel}>Cancel scan</button>
      </div>
    </section>
  );
}
