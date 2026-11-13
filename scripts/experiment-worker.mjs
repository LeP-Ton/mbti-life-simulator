import { parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";

const { runExperiment } = await import(
  pathToFileURL(workerData.kernelPath).href
);
try {
  const report = await runExperiment(
    { ...workerData.spec, seeds: 1, replicateStart: workerData.replicate },
    {
      onCell: (cell) => parentPort.postMessage({ type: "cell", cell }),
    },
  );
  parentPort.postMessage({ type: "done", report });
} catch (error) {
  parentPort.postMessage({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
}
