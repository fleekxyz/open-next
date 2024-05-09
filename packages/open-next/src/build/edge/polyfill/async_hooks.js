class AsyncContextFrame {
    static currentFrame = null;
  
    constructor(parent = null, storageContext = new Map()) {
      this.parent = parent;
      this.storageContext = new Map(storageContext);
    }
  
    static current() {
      return AsyncContextFrame.currentFrame || new AsyncContextFrame();
    }
  
    static run(storageKey, value, fn) {
      const current = AsyncContextFrame.current();
      const newFrame = new AsyncContextFrame(current, current.storageContext);
      newFrame.storageContext.set(storageKey, value);
  
      const oldFrame = AsyncContextFrame.exchange(newFrame);
      try {
        return fn();
      } finally {
        AsyncContextFrame.exchange(oldFrame);
      }
    }
  
    static exchange(newFrame) {
      const oldFrame = AsyncContextFrame.currentFrame;
      AsyncContextFrame.currentFrame = newFrame;
      return oldFrame;
    }
  
    get(key) {
      return this.storageContext.get(key);
    }
  }
  
  export class AsyncLocalStorage {
    constructor() {
      this.storageKey = {};
    }
  
    run(store, fn, ...args) {
      return AsyncContextFrame.run(this.storageKey, store, () => fn(...args));
    }
  
    getStore() {
      return AsyncContextFrame.current().get(this.storageKey);
    }
  
    exit(fn) {
      return this.run(undefined, fn);
    }
  }
  
  export class AsyncResource {
    constructor(type, options = {}) {
      this.frame = AsyncContextFrame.current();
      this.type = type;
    }
  
    runInAsyncScope(fn, thisArg, ...args) {
      const oldFrame = AsyncContextFrame.exchange(this.frame);
      try {
        return fn.apply(thisArg, args);
      } finally {
        AsyncContextFrame.exchange(oldFrame);
      }
    }
  
    bind(fn, thisArg = null) {
      return (...args) => this.runInAsyncScope(fn, thisArg, ...args);
    }
  
    static bind(fn, type = "default", thisArg = null) {
      const resource = new AsyncResource(type);
      return resource.bind(fn, thisArg);
    }
  }
  
  globalThis.AsyncLocalStorage = AsyncLocalStorage;