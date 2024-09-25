const async_hooks = {
  createHook: (_callbacks) => {
    return {
      enable: () => {},
      disable: () => {},
    };
  },
  executionAsyncId: () => 0,
  triggerAsyncId: () => 0,
  executionAsyncResource: () => null,
  AsyncLocalStorage: class {
    constructor() {
      this.store = undefined;
    }

    getStore() {
      return this.store;
    }

    run(store, callback, ...args) {
      this.store = store;
      try {
        return callback(...args);
      } finally {
        this.store = undefined;
      }
    }

    exit(callback, ...args) {
      const previousStore = this.store;
      this.store = undefined;
      try {
        return callback(...args);
      } finally {
        this.store = previousStore;
      }
    }

    enterWith(store) {
      this.store = store;
    }
  },
};

globalThis.AsyncLocalStorage = async_hooks.AsyncLocalStorage;
module.exports = async_hooks;
