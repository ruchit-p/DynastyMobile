"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _reactNative = require("react-native");
var _react = _interopRequireWildcard(require("react"));
var _reactNativeSvg = _interopRequireWildcard(require("react-native-svg"));
var _styles = require("./styles");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
class RelativesTree extends _react.Component {
  static defaultProps = {
    style: _styles.styles.container,
    spouseKey: 'spouse',
    childKeyExtractor: (_, index) => index,
    pathColor: 'black',
    strokeWidth: 1,
    gap: 20
  };
  renderNode = props => {
    if (this.props.relativeItem) {
      return this.props.relativeItem(props);
    } else {
      return null;
    }
  };
  renderSpouse = (level, spouse) => {
    return this.renderNode({
      level,
      info: spouse,
      style: _styles.styles.marginLeftZero
    });
  };
  renderTree(data, level) {
    return /*#__PURE__*/_react.default.createElement(_reactNative.FlatList, {
      data: data,
      nestedScrollEnabled: true,
      horizontal: true,
      showsHorizontalScrollIndicator: false,
      contentContainerStyle: _styles.styles.renderViewPadding,
      keyExtractor: this.props.levelKeyExtractor,
      initialScrollIndex: 0,
      renderItem: ({
        item
      }) => {
        const spouse = item[this.props.spouseKey];
        const isChildren = item.children && item.children.length > 0;
        return /*#__PURE__*/_react.default.createElement(_reactNative.View, {
          style: _styles.styles.levelsView
        }, /*#__PURE__*/_react.default.createElement(_reactNative.View, {
          style: _styles.styles.nodesView
        }, spouse && /*#__PURE__*/_react.default.createElement(_reactNative.View, {
          style: {
            width: this.props.cardWidth,
            marginHorizontal: this.props.gap / 2
          }
        }), this.renderNode({
          level,
          info: item,
          style: spouse ? {
            marginHorizontal: this.props.gap / 2,
            ..._styles.styles.marginRightZero
          } : {
            marginHorizontal: this.props.gap
          }
        }), spouse && /*#__PURE__*/_react.default.createElement(_reactNativeSvg.default, {
          height: "20",
          width: this.props.gap
        }, /*#__PURE__*/_react.default.createElement(_reactNativeSvg.Line, {
          x1: "0",
          y1: "50%",
          x2: this.props.gap,
          y2: "50%",
          stroke: this.props.pathColor,
          strokeWidth: this.props.strokeWidth
        })), spouse && typeof spouse === 'object' && this.renderSpouse(level, spouse)), isChildren && /*#__PURE__*/_react.default.createElement(_reactNativeSvg.default, {
          height: "50",
          width: "20"
        }, /*#__PURE__*/_react.default.createElement(_reactNativeSvg.Line, {
          x1: "50%",
          y1: "0",
          x2: "50%",
          y2: "150",
          stroke: this.props.pathColor,
          strokeWidth: this.props.strokeWidth
        })), /*#__PURE__*/_react.default.createElement(_reactNative.View, {
          style: _styles.styles.childrenLines
        }, item.children && item.children.map((child, index) => {
          return /*#__PURE__*/_react.default.createElement(_reactNative.View, {
            key: this.props.childKeyExtractor(child, index),
            style: _styles.styles.childrenLines
          }, /*#__PURE__*/_react.default.createElement(_reactNative.View, null, /*#__PURE__*/_react.default.createElement(_reactNativeSvg.default, {
            height: "50",
            width: "100%"
          }, /*#__PURE__*/_react.default.createElement(_reactNativeSvg.Line, {
            x1: "50%",
            y1: "0",
            x2: "50%",
            y2: "100%",
            stroke: this.props.pathColor,
            strokeWidth: this.props.strokeWidth
          }), item.children && item.children.length !== 1 && item.children.length - 1 !== index && /*#__PURE__*/_react.default.createElement(_reactNativeSvg.Line, {
            x1: "100%",
            y1: this.props.strokeWidth / 2,
            x2: "50%",
            y2: this.props.strokeWidth / 2,
            stroke: this.props.pathColor,
            strokeWidth: this.props.strokeWidth
          }), item.children && item.children.length !== 1 && index !== 0 && /*#__PURE__*/_react.default.createElement(_reactNativeSvg.Line, {
            x1: "50%",
            y1: this.props.strokeWidth / 2,
            x2: "0",
            y2: this.props.strokeWidth / 2,
            stroke: this.props.pathColor,
            strokeWidth: this.props.strokeWidth
          })), this.renderTree([child], level + 1)));
        })));
      }
    });
  }
  render() {
    return /*#__PURE__*/_react.default.createElement(_reactNative.View, {
      style: this.props.style
    }, /*#__PURE__*/_react.default.createElement(_reactNative.ScrollView, {
      showsVerticalScrollIndicator: false
    }, this.renderTree(this.props.data, 1)));
  }
}
var _default = exports.default = RelativesTree;
//# sourceMappingURL=RelativesTree.js.map