declare module 'react-window' {
  import * as React from 'react';
  export interface ListChildComponentProps<T = any> {
    index: number;
    style: React.CSSProperties;
    data: T;
  }
  export interface FixedSizeListProps<T = any> {
    height: number;
    width: number;
    itemCount: number;
    itemSize: number;
    itemData?: T;
    children: (props: ListChildComponentProps<T>) => React.ReactElement;
  }
  export function FixedSizeList<T = any>(
    props: FixedSizeListProps<T>
  ): React.ReactElement;
  export { FixedSizeList as List, ListChildComponentProps };
}

declare module 'react-virtualized-auto-sizer' {
  import * as React from 'react';
  interface AutoSizerProps {
    children: (size: { height: number; width: number }) => React.ReactNode;
    disableHeight?: boolean;
    disableWidth?: boolean;
  }
  export default class AutoSizer extends React.Component<AutoSizerProps> {}
}

declare module 'crypto-js' {
  const CryptoJS: any;
  export default CryptoJS;
}

declare const jest: any;

declare module 'libsodium-wrappers-sumo' {
  import sodium from 'libsodium-wrappers';
  export * from 'libsodium-wrappers';
  export default sodium;
} 