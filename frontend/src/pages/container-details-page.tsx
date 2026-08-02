import type { ReactElement } from 'react';
import { Navigate, useParams } from 'react-router';
import type { Params } from 'react-router';

import ContainerDetails from '../components/container-details.tsx';
import type { ContainerDetailsPageProps } from './interfaces.ts';

function ContainerDetailsPage(props: ContainerDetailsPageProps): ReactElement {
    const params: Readonly<Params<string>> = useParams();
    const containerName: string | undefined = params.containerName;
    if (containerName === undefined) {
        /* Unreachable when mounted via /services/:containerName, but the type demands it. */
        return <Navigate to="/services" replace />;
    }
    /* react-router has already percent-decoded route params — do not decode again. */
    return <ContainerDetails fetcher={props.fetcher} containerName={containerName} />;
}

export default ContainerDetailsPage;
