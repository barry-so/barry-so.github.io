// State Serialization Worker
// Handles JSON operations for state management

self.onmessage = function(e) {
  const { task, data } = e.data;
  
  try {
    if (task === 'serialize') {
      const serialized = JSON.stringify(data);
      self.postMessage({ result: serialized, task });
    } else if (task === 'deserialize') {
      const deserialized = JSON.parse(data);
      self.postMessage({ result: deserialized, task });
    } else if (task === 'cleanupCache') {
      // Process cache cleanup operations
      const cacheEntries = data.cacheEntries;
      const toRemove = Math.floor(cacheEntries.length * 0.3);
      
      cacheEntries.sort((a, b) => a.expiry - b.expiry);
      const keysToRemove = cacheEntries.slice(0, toRemove).map(entry => entry.key);
      
      self.postMessage({ result: keysToRemove, task });
    } else {
      self.postMessage({ error: `Unknown task: ${task}` });
    }
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

