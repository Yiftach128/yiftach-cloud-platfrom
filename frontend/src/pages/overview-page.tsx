import { Result } from 'antd';
import type { ReactElement } from 'react';

function OverviewPage(): ReactElement {
    return (
        <Result
            status="info"
            subTitle="The overview dashboard is coming soon."
        />
    );
}

export default OverviewPage;
