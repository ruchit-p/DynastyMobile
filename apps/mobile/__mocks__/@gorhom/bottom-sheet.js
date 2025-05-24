const React = require('react');
const { forwardRef } = React;

module.exports = {
  __esModule: true,
  default: forwardRef(({ children, snapPoints, onChange, enablePanDownToClose, backdropComponent }, ref) => {
    const [currentIndex, setCurrentIndex] = React.useState(-1);
    
    React.useImperativeHandle(ref, () => ({
      snapToIndex: (index) => {
        setCurrentIndex(index);
        onChange?.(index);
      },
      close: () => {
        setCurrentIndex(-1);
        onChange?.(-1);
      },
      present: () => {
        setCurrentIndex(0);
        onChange?.(0);
      },
    }));
    
    if (currentIndex === -1) return null;
    
    return React.createElement('View', { testID: 'bottom-sheet' }, [
      backdropComponent && React.createElement(backdropComponent, { key: 'backdrop' }),
      children,
    ]);
  }),
  BottomSheetBackdrop: ({ onPress }) => 
    React.createElement('View', { testID: 'backdrop', onPress }),
  BottomSheetModal: forwardRef(({ children }, ref) => 
    React.createElement('View', { testID: 'bottom-sheet-modal', ref }, children)
  ),
  BottomSheetModalProvider: ({ children }) => children,
  useBottomSheetModal: () => ({
    dismiss: jest.fn(),
    dismissAll: jest.fn(),
  }),
};