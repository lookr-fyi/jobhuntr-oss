export function createLatestRequest(commit, fail = () => {}) {
  let latestRequest = 0;
  return async (request) => {
    const requestId = ++latestRequest;
    try {
      const result = await request();
      if (requestId === latestRequest) commit(result);
      return result;
    } catch (error) {
      if (requestId === latestRequest) fail(error);
      return null;
    }
  };
}
