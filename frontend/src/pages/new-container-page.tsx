import { Result } from 'antd';
import type { ReactElement } from 'react';

function NewContainerPage(): ReactElement {
    return (
        <Result
            status="info"
            subTitle="Creating containers is coming soon — the backend does not expose this yet."
        />
    );
}

export default NewContainerPage;
