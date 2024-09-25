//@ts-nocheck

const asyncStorage = require("next/dist/client/components/static-generation-async-storage.external.original");

const staticGenerationAsyncStorage = {
  run: (store, cb, ...args) =>
    asyncStorage.staticGenerationAsyncStorage.run(store, cb, ...args),
  getStore: () => {
    return asyncStorage.staticGenerationAsyncStorage.getStore();
  },
};

exports.staticGenerationAsyncStorage = staticGenerationAsyncStorage;
