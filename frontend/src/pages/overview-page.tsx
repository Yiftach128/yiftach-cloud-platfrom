import type { ReactElement } from 'react';

import OverviewGraph from '../components/overview-graph.tsx';
import type { OverviewPageProps } from './interfaces.ts';

function OverviewPage(props: OverviewPageProps): ReactElement {
    return <OverviewGraph fetcher={props.fetcher} />;
}

export default OverviewPage;
