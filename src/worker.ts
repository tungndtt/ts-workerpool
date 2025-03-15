import { parentPort, threadId } from "worker_threads";

const workerId = threadId - 1;
parentPort!.on("message", async ({ id, data }) => {
    const start = new Date().getTime();
    while (new Date().getTime() - start < 2000) {
        // cpu-bound task
    }
    const result = `[Worker ${workerId}]: Echo ${data}`;
    parentPort!.postMessage({ id, result });
});