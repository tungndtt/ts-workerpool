# Worker Pool in TypeScript

This project provides an implementation of a worker pool in TypeScript. The goal is to manage a fixed number of active worker threads that handle resource-intensive tasks in the background.

### Motivation

The implementation is driven by several key motivations:

-   **Resource Control**: Efficiently manage the amount of resources used by background tasks.
-   **Worker Reuse**: Reuse workers to minimize the overhead associated with creating new worker threads.
-   **Prevent Out-of-Memory Errors**: Mitigate the risk of [out-of-memory issues](https://en.wikipedia.org/wiki/Out_of_memory) by limiting the number of concurrent workers.
-   **Asynchronous Task Offloading**: Offload computationally expensive tasks to worker threads, allowing the main thread to remain responsive.
-   **Task Delegation on Worker Readiness**: Ensure tasks are delegated to workers as soon as they are available, preventing task loss when a worker is busy.

### Usage

##### Worker

```ts
import { parentPort, threadId } from "worker_threads";
parentPort!.on("message", async ({ id, data }) => {
    // process heavy task (even cpu-bound)
    ...
    // notify the task result
    parentPort!.postMessage({ id, result });
});
```

##### Worker Pool

```ts
const workerPath = "path to worker script (relative to root code dir)";
const poolSize = 4;
const pool = await WorkerPool.getInstance(workerPath, poolSize);
```

##### Run Command

```sh
npm run dev
```

> [!NOTE]  
> The worker pool implementation utilizes precompiled worker JS files included in the build. To function correctly, it needs to know the location of the build directory, which can vary based on your project setup.
> Currently, the build directory detection is based on the environment mode, which is determined by the `NODE_ENV` variable. By default, `NODE_ENV` is set to `dev`, but you can set it to `prod` for production mode.
>
> -   In development mode, the build directory is determined dynamically using the `tsconfig.json` file. Specifically, the `compilerOptions.outDir` must be set in `tsconfig.json` to define the output directory.
> -   In production mode, the build directory is expected to be explicitly defined and used for launching the worker pool.

### Example

-   Worker

```ts
// worker.ts
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
```

-   Application

```ts
// app.ts
import WorkerPool from "./worker_pool";
async function app() {
    const pool = await WorkerPool.getInstance("worker", 4);
    pool.start();
    console.log("submit tasks ...");
    const tasks = [];
    for (let i = 0; i < 8; i++) {
        tasks.push(
            pool.addTask(i).then((result) => {
                console.log(result);
            })
        );
    }
    await Promise.all(tasks);
    console.log("finish tasks. Take 2s break ...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log("submit first additional task ...");
    const extraTask1 = pool.addTask("extra task 1");
    console.log("submit second additional task ...");
    const extraTask2 = pool.addTask("extra task 2");
    (await Promise.all([extraTask1, extraTask2])).forEach((result) => console.log(result));
    pool.stop();
}
app();
```

-   Output:

```
Worker 0 started
Worker 1 started
Worker 2 started
Worker 3 started
submit tasks ...
[Worker 0]: Echo 0
[Worker 2]: Echo 2
[Worker 3]: Echo 3
[Worker 1]: Echo 1
[Worker 0]: Echo 4
[Worker 2]: Echo 5
[Worker 3]: Echo 6
[Worker 1]: Echo 7
finish tasks. Take 2s break ...
submit first additional task ...
submit second additional task ...
[Worker 0]: Echo extra task 1
[Worker 1]: Echo extra task 2
Worker 1 exits
Worker 0 exits
Worker 3 exits
Worker 2 exits
```
