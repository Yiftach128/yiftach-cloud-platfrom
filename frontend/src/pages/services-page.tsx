import { Typography } from 'antd';
import type { ReactElement } from 'react';

import ContainerList from '../components/container-list.tsx';
import type { ServicesPageProps } from './interfaces.ts';

function ServicesPage(props: ServicesPageProps): ReactElement {
    return (
        <div>
            <Typography.Title level={2}>My Services</Typography.Title>
            <ContainerList fetcher={props.fetcher} />
        </div>
    );
}

export default ServicesPage;
