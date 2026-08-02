import type { ReactElement } from 'react';

import ContainerList from '../components/container-list.tsx';
import type { ServicesPageProps } from './interfaces.ts';

function ServicesPage(props: ServicesPageProps): ReactElement {
    return <ContainerList fetcher={props.fetcher} />;
}

export default ServicesPage;
