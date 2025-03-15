import { Worker } from "worker_threads";
import crypto from "crypto";
import fs from "fs";
import path from "path";

async function getWorkerDirectory() {
    // Read outDir from tsconfig.json
    const pwd = process.cwd();
    const tsConfigPath = path.resolve(pwd, "tsconfig.json");
    return new Promise<string>((resolve, reject) => {
        fs.readFile(tsConfigPath, "utf8", (err, data) => {
            if (err) {
                reject(err.message);
            }
            const tsConfig = JSON.parse(data);
            const outDir = tsConfig.compilerOptions && tsConfig.compilerOptions.outDir;
            if (outDir) {
                resolve(path.resolve(pwd, outDir));
            } else {
                reject("outDir not defined in tsconfig.json");
            }
        })
    });
}

class Lock {
    private resolve: ((data?: any) => void) | undefined;

    constructor() {
        this.resolve = undefined;
    }

    async acquire() {
        await new Promise((resolve) => {
            this.resolve = resolve;
        });
    }

    release() {
        if (this.resolve) {
            this.resolve();
            this.resolve = undefined;
        }
    }
}

type QueueElement = {
    prev: QueueElement, 
    next: QueueElement, 
    value: any
} | undefined;

class TaskQueue {
    private head: QueueElement;
    private tail: QueueElement;
    private lock: Lock;

    constructor() {
        this.head = undefined;
        this.tail = undefined;
        this.lock = new Lock();
    }

    push(item: any) {
        if (this.tail) {
            const tail = { prev: this.tail, next: undefined, value: item };
            this.tail.next = tail;
            this.tail = tail;
        } else {
            this.head = this.tail = { prev: undefined, next: undefined, value: item };
        }
        this.lock.release();
    }

    async *pop() {
        while (true) {
            if (!this.head) {
                await this.lock.acquire();
            }
            const item = this.head!.value;
            if (this.head === this.tail) {
                this.head = this.tail = undefined;
            } else {
                const head = this.head!.next;
                head!.prev = undefined;
                this.head = head;
            }
            yield item;
        }
    }
}

class AvailabilityQueue {
    private availability: boolean[];
    private availabilityCount: number;
    private lock: Lock;

    constructor(size: number) {
        this.availability = new Array(size).fill(false);
        this.availabilityCount = 0;
        this.lock = new Lock();
    }

    freeze(id: number) {
        if(this.availability[id]) {
            this.availability[id] = false;
            this.availabilityCount -= 1;
        }
    }

    enable(id: number) {
        if(!this.availability[id]) {
            this.availability[id] = true;
            this.availabilityCount += 1;
            this.lock.release();
        }
    }

    async getAvailability() {
        while (this.availabilityCount <= 0) {
            await this.lock.acquire();
        }
        for (let id = 0; id < this.availability.length; id++) {
            if (this.availability[id]) {
                this.freeze(id);
                return id;
            }
        }
        return -1;
    }
}

export default class WorkerPool {
    private workers: Worker[]; // pool of workers
    private availability: AvailabilityQueue; // workers availability
    private taskQueue: TaskQueue; // list of tasks
    private notifications: Map<string, (result: any) => void>; // task result notifications

    private constructor() {}

    static async getInstance(workerName: string, poolSize: number): Promise<WorkerPool> {
        const workerPool = new WorkerPool();
        workerPool.workers = [];
        workerPool.availability = new AvailabilityQueue(poolSize);
        workerPool.taskQueue = new TaskQueue();
        workerPool.notifications = new Map();
        const workerDirectory = await getWorkerDirectory();
        const workerFile = path.resolve(workerDirectory, "workers", workerName);
        const workerInitialization = [];
        for (let workerId = 0; workerId < poolSize; workerId++) {
            workerInitialization.push(
                new Promise<void>((resolve) => {
                    const worker = new Worker(workerFile);
                    worker.on("message", async ({ id, result }) => {
                        // notify task result
                        const notification = workerPool.notifications.get(id);
                        workerPool.notifications.delete(id);
                        notification?.(result);
                        // make worker available to process further tasks
                        workerPool.availability.enable(workerId);
                    });
                    worker.on("exit", () => {
                        console.log(`Worker ${workerId} exits`);
                        workerPool.availability.freeze(workerId);
                    });
                    worker.on("error", (error) => {
                        console.log(`Worker ${workerId} error: ${error.message}`)
                    });
                    worker.on("online", () => {
                        console.log(`Worker ${workerId} started`);
                        workerPool.availability.enable(workerId);
                        resolve(); // ready signal
                    });
                    workerPool.workers.push(worker);
                })
            );
        }
        // wait for all workers up-to-run
        await Promise.all(workerInitialization);
        return workerPool;
    }

    // start the worker pool
    async start() {
        // wait for new tasks
        for await (const task of this.taskQueue.pop()) {
            // wait-lock until there is available worker
            const workerId = await this.availability.getAvailability();
            // delegate task to worker
            this.workers[workerId].postMessage(task);
        }
    }

    async stop() {
        await Promise.all(this.workers.map((worker) => worker.terminate()));
    }

    async addTask(data: any) {
        return new Promise((resolve) => {
            const id = crypto.randomUUID();
            this.notifications.set(id, resolve);
            this.taskQueue.push({ id, data });
        });
    }
}
