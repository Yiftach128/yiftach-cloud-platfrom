import type { ReactElement } from 'react';

import BuildAgentList from '../components/build-agent-list.tsx';
import type { BuildAgentsPageProps } from './interfaces.ts';

function BuildAgentsPage(props: BuildAgentsPageProps): ReactElement {
    return <BuildAgentList fetcher={props.fetcher} />;
}

export default BuildAgentsPage;
