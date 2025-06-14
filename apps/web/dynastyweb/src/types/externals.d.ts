declare module 'react-window' {
  import * as React from 'react';
  export interface ListChildComponentProps<T = unknown> {
    index: number;
    style: React.CSSProperties;
    data: T;
  }
  export interface FixedSizeListProps<T = unknown> {
    height: number;
    width: number;
    itemCount: number;
    itemSize: number;
    itemData?: T;
    children: (props: ListChildComponentProps<T>) => React.ReactElement;
  }
  export function FixedSizeList<T = unknown>(
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
  const CryptoJS: {
    AES: {
      encrypt(message: string | ArrayBuffer, key: string): { toString(): string };
      decrypt(ciphertext: string, key: string): { toString(encoding: { _name: string }): string };
    };
    enc: {
      Utf8: { _name: string };
    };
    SHA256(message: string): { toString(): string };
  };
  export default CryptoJS;
}

declare const jest: {
  fn(): unknown;
  fn<T>(implementation: T): T;
};

declare module 'libsodium-wrappers-sumo' {
  import sodium from 'libsodium-wrappers';
  export * from 'libsodium-wrappers';
  export default sodium;
} 