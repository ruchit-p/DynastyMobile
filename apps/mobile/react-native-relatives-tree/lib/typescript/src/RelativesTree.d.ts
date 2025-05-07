import React, { Component } from 'react';
import type { RelativeItem, RelativeItemProps, RelativesTreeProps } from './types';
declare class RelativesTree<RelativesT extends RelativeItem> extends Component<RelativesTreeProps<RelativesT>> {
    static defaultProps: {
        style: {
            flex: number;
        };
        spouseKey: string;
        childKeyExtractor: (_: any, index: number) => number;
        pathColor: string;
        strokeWidth: number;
        gap: number;
    };
    renderNode: (props: RelativeItemProps<RelativesT>) => React.ReactNode;
    renderSpouse: (level: number, spouse: RelativesT) => React.ReactNode;
    renderTree(data: RelativesT[], level: number): React.JSX.Element;
    render(): React.JSX.Element;
}
export default RelativesTree;
//# sourceMappingURL=RelativesTree.d.ts.map