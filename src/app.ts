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
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log("submit additional tasks ...");
    let result = await pool.addTask("extra task 1");
    console.log(result);
    result = await pool.addTask("extra task 2");
    console.log(result);
    pool.stop();
}

async function measureRuntime() {
    const pool = await WorkerPool.getInstance("worker", 128);
    pool.start();
    const startTime = new Date().getTime();
    const tasks = [];
    for (let i = 0; i < 10000; i++) {
        tasks.push(pool.addTask(i));
    }
    await Promise.all(tasks);
    const endTime = new Date().getTime();
    const duration = (endTime - startTime) / 1000;
    console.log(`Run in ${duration} seconds`);
    pool.stop();
}

// measureRuntime();
app();
