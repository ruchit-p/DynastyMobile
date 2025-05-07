import { FlatList, ScrollView, View } from 'react-native';
import React, { Component } from 'react';
import Svg, { Line } from 'react-native-svg';
import { styles } from './styles';
class RelativesTree extends Component {
  static defaultProps = {
    style: styles.container,
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
      style: styles.marginLeftZero
    });
  };
  renderTree(data, level) {
    return /*#__PURE__*/React.createElement(FlatList, {
      data: data,
      nestedScrollEnabled: true,
      horizontal: true,
      showsHorizontalScrollIndicator: false,
      contentContainerStyle: styles.renderViewPadding,
      keyExtractor: this.props.levelKeyExtractor,
      initialScrollIndex: 0,
      renderItem: ({
        item
      }) => {
        const spouse = item[this.props.spouseKey];
        const isChildren = item.children && item.children.length > 0;
        return /*#__PURE__*/React.createElement(View, {
          style: styles.levelsView
        }, /*#__PURE__*/React.createElement(View, {
          style: styles.nodesView
        }, spouse && /*#__PURE__*/React.createElement(View, {
          style: {
            width: this.props.cardWidth,
            marginHorizontal: this.props.gap / 2
          }
        }), this.renderNode({
          level,
          info: item,
          style: spouse ? {
            marginHorizontal: this.props.gap / 2,
            ...styles.marginRightZero
          } : {
            marginHorizontal: this.props.gap
          }
        }), spouse && /*#__PURE__*/React.createElement(Svg, {
          height: "20",
          width: this.props.gap
        }, /*#__PURE__*/React.createElement(Line, {
          x1: "0",
          y1: "50%",
          x2: this.props.gap,
          y2: "50%",
          stroke: this.props.pathColor,
          strokeWidth: this.props.strokeWidth
        })), spouse && typeof spouse === 'object' && this.renderSpouse(level, spouse)), isChildren && /*#__PURE__*/React.createElement(Svg, {
          height: "50",
          width: "20"
        }, /*#__PURE__*/React.createElement(Line, {
          x1: "50%",
          y1: "0",
          x2: "50%",
          y2: "150",
          stroke: this.props.pathColor,
          strokeWidth: this.props.strokeWidth
        })), /*#__PURE__*/React.createElement(View, {
          style: styles.childrenLines
        }, item.children && item.children.map((child, index) => {
          return /*#__PURE__*/React.createElement(View, {
            key: this.props.childKeyExtractor(child, index),
            style: styles.childrenLines
          }, /*#__PURE__*/React.createElement(View, null, /*#__PURE__*/React.createElement(Svg, {
            height: "50",
            width: "100%"
          }, /*#__PURE__*/React.createElement(Line, {
            x1: "50%",
            y1: "0",
            x2: "50%",
            y2: "100%",
            stroke: this.props.pathColor,
            strokeWidth: this.props.strokeWidth
          }), item.children && item.children.length !== 1 && item.children.length - 1 !== index && /*#__PURE__*/React.createElement(Line, {
            x1: "100%",
            y1: this.props.strokeWidth / 2,
            x2: "50%",
            y2: this.props.strokeWidth / 2,
            stroke: this.props.pathColor,
            strokeWidth: this.props.strokeWidth
          }), item.children && item.children.length !== 1 && index !== 0 && /*#__PURE__*/React.createElement(Line, {
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
    return /*#__PURE__*/React.createElement(View, {
      style: this.props.style
    }, /*#__PURE__*/React.createElement(ScrollView, {
      showsVerticalScrollIndicator: false
    }, this.renderTree(this.props.data, 1)));
  }
}
export default RelativesTree;
//# sourceMappingURL=RelativesTree.js.map