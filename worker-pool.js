// Worker Pool Manager
// Manages a pool of workers based on hardwareConcurrency

class WorkerPool {
  constructor(workerScript, poolSize) {
    this.workerScript = workerScript;
    this.poolSize = poolSize || (navigator.hardwareConcurrency || 4);
    this.workers = [];
    this.taskQueue = [];
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    if (!window.Worker) {
      console.warn('Web Workers not supported, falling back to main thread');
      return;
    }

    // Create worker pool
    for (let i = 0; i < this.poolSize; i++) {
      try {
        const worker = {
          worker: new Worker(this.workerScript),
          inUse: false,
          id: i
        };
        
        worker.worker.onerror = (error) => {
          console.error(`Worker ${i} error:`, error);
          worker.inUse = false;
          this.processQueue();
        };
        
        this.workers.push(worker);
      } catch (err) {
        console.error(`Failed to create worker ${i}:`, err);
      }
    }
    
    this.initialized = true;
  }

  async execute(data, transferList) {
    if (!this.initialized) {
      await this.initialize();
    }

    // If workers not available, fall back to main thread
    if (!this.initialized || this.workers.length === 0) {
      return Promise.reject(new Error('Workers not available'));
    }

    return new Promise((resolve, reject) => {
      const task = { data, transferList, resolve, reject };
      
      const availableWorker = this.workers.find(w => !w.inUse);
      
      if (availableWorker) {
        this.runTask(availableWorker, task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  runTask(workerObj, task) {
    workerObj.inUse = true;
    
    const messageHandler = (e) => {
      workerObj.worker.removeEventListener('message', messageHandler);
      workerObj.inUse = false;
      
      if (e.data.error) {
        task.reject(new Error(e.data.error));
      } else {
        task.resolve(e.data.result);
      }
      
      this.processQueue();
    };
    
    workerObj.worker.addEventListener('message', messageHandler);
    
    try {
      if (task.transferList && task.transferList.length > 0) {
        workerObj.worker.postMessage(task.data, task.transferList);
      } else {
        workerObj.worker.postMessage(task.data);
      }
    } catch (err) {
      workerObj.worker.removeEventListener('message', messageHandler);
      workerObj.inUse = false;
      task.reject(err);
      this.processQueue();
    }
  }

  processQueue() {
    if (this.taskQueue.length === 0) return;
    
    const availableWorker = this.workers.find(w => !w.inUse);
    if (availableWorker) {
      const task = this.taskQueue.shift();
      this.runTask(availableWorker, task);
    }
  }

  terminate() {
    this.workers.forEach(w => {
      w.worker.terminate();
    });
    this.workers = [];
    this.taskQueue = [];
    this.initialized = false;
  }
}

