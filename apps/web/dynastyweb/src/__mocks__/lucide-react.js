const Icon = (props) => null;

module.exports = new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (prop === 'default') return Icon;
    return Icon;
  }
});