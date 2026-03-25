function createLogger(scope = 'APP') {
  function print(level, args) {
    const ts = new Date().toISOString();
    console[level](`[${ts}] [${scope}]`, ...args);
  }

  return {
    info: (...args) => print('log', args),
    warn: (...args) => print('warn', args),
    error: (...args) => print('error', args),
  };
}

module.exports = {
  createLogger,
};
