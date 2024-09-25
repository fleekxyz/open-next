import path from "path";
import { Readable } from "stream";

const __FS_CACHE__ = new Map();

function getPathToCidMap() {
  if (!globalThis.__IPFS_CID_MAP__) {
    throw new Error(
      "Global CID map not set. Please set globalThis.__IPFS_CID_MAP__"
    );
  }

  return globalThis.__IPFS_CID_MAP__;
}

function fetchFromIPFSSync(cid) {
  if (__FS_CACHE__.has(cid)) {
    return __FS_CACHE__.get(cid);
  }

  const xhr = new XMLHttpRequest();
  xhr.open("GET", `${globalThis.__IPFS_GATEWAY_URL__}${cid}`, false); // false makes the request synchronous
  xhr.send(null);

  if (xhr.status === 200) {
    const content = xhr.responseText;
    __FS_CACHE__.set(cid, content);

    return content;
  } else {
    throw new Error(
      `Failed to fetch CID ${cid}: ${xhr.status} ${xhr.statusText}`
    );
  }
}

async function fetchFromIPFS(cid) {
  if (__FS_CACHE__.has(cid)) {
    return __FS_CACHE__.get(cid);
  }

  const response = await fetch(`${globalThis.__IPFS_GATEWAY_URL__}${cid}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch CID ${cid}`);
  }

  const content = await response.text();
  __FS_CACHE__.set(cid, content);

  return content;
}

function getCID(filePath) {
  const normalizedPath = path.normalize(filePath);

  return getPathToCidMap().get(normalizedPath);
}

function readFile(path, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  options = options || {};

  const cid = getCID(path);

  if (!cid) {
    const error = new Error(
      `ENOENT: no such file or directory, open '${path}'`
    );
    error.code = "ENOENT";

    return callback(error);
  }

  try {
    const content = fetchFromIPFSSync(cid);
    callback(null, options.encoding ? content : Buffer.from(content));
  } catch (error) {
    callback(error);
  }
}

function readFileSync(path, options) {
  const cid = getCID(path);

  if (!cid) {
    const error = new Error(
      `ENOENT: no such file or directory, open '${path}'`
    );
    error.code = "ENOENT";
    throw error;
  }

  const content = fetchFromIPFSSync(cid);

  return options && options.encoding ? content : Buffer.from(content);
}

async function readFilePromise(path, options) {
  const cid = getCID(path);

  if (!cid) {
    const error = new Error(
      `ENOENT: no such file or directory, open '${path}'`
    );
    error.code = "ENOENT";
    throw error;
  }

  const content = await fetchFromIPFS(cid);

  return options && options.encoding ? content : Buffer.from(content);
}

function existsSync(path) {
  return getCID(path) !== undefined;
}

function stat(path, callback) {
  const cid = getCID(path);

  if (!cid) {
    const error = new Error(
      `ENOENT: no such file or directory, stat '${path}'`
    );
    error.code = "ENOENT";

    return callback(error);
  }

  try {
    const content = fetchFromIPFSSync(cid);
    const stats = createStats(content);
    callback(null, stats);
  } catch (error) {
    callback(error);
  }
}

function statSync(path) {
  const cid = getCID(path);

  if (!cid) {
    const error = new Error(
      `ENOENT: no such file or directory, stat '${path}'`
    );
    error.code = "ENOENT";
    throw error;
  }

  const content = fetchFromIPFSSync(cid);

  return createStats(content);
}

async function statPromise(path) {
  const cid = getCID(path);

  if (!cid) {
    const error = new Error(
      `ENOENT: no such file or directory, stat '${path}'`
    );
    error.code = "ENOENT";
    throw error;
  }

  const content = await fetchFromIPFS(cid);

  return createStats(content);
}

function createStats(content) {
  return {
    isFile: () => true,
    isDirectory: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 0,
    ino: 0,
    mode: 33188,
    nlink: 1,
    uid: 0,
    gid: 0,
    rdev: 0,
    size: content.length,
    blksize: 4096,
    blocks: Math.ceil(content.length / 4096),
    atimeMs: Date.now(),
    mtimeMs: Date.now(),
    ctimeMs: Date.now(),
    birthtimeMs: Date.now(),
    atime: new Date(),
    mtime: new Date(),
    ctime: new Date(),
    birthtime: new Date(),
  };
}

function createReadStream(path, _) {
  const cid = getCID(path);

  if (!cid) {
    const error = new Error(
      `ENOENT: no such file or directory, open '${path}'`
    );
    error.code = "ENOENT";
    throw error;
  }

  return new Readable({
    async read() {
      try {
        const content = await fetchFromIPFS(cid);
        this.push(content);
        this.push(null);
      } catch (error) {
        this.destroy(error);
      }
    },
  });
}

module.exports = {
  readFile,
  readFileSync,
  promises: {
    readFile: readFilePromise,
    stat: statPromise,
  },
  existsSync,
  stat,
  statSync,
  createReadStream,
};
