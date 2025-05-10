const type = {
  base: 'Helvetica Neue', // Example base font
  bold: 'HelveticaNeue-Bold', // Example bold font
  // Add your custom fonts here, e.g.:
  // spaceMono: 'SpaceMono-Regular',
};

const size = {
  h1: 38,
  h2: 32,
  h3: 28,
  h4: 24,
  h5: 20,
  large: 18,
  medium: 16,
  regular: 14,
  small: 12,
  tiny: 10,
};

const weight = {
  bold: 'bold' as 'bold',
  medium: '500' as '500',
  regular: 'normal' as 'normal',
  light: '300' as '300',
};

const style = {
  normal: 'normal' as 'normal',
  italic: 'italic' as 'italic',
};

export default {
  type,
  size,
  weight,
  style,
}; 