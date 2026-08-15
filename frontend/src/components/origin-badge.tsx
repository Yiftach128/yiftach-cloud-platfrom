import { CloudOutlined, DesktopOutlined } from '@ant-design/icons';
import { Space } from 'antd';
import type { ReactElement } from 'react';

import type { OriginBadgeProps } from './interfaces.ts';

/**
 * Where a container came from: the cloud badge for containers created through
 * the platform, the device badge for everything else on the daemon. Carries no
 * styling of its own — the services table cell and the overview card each wrap
 * it in their own text treatment.
 */
function OriginBadge(props: OriginBadgeProps): ReactElement {
    if (props.managed) {
        return (
            <Space size={4}>
                <CloudOutlined />
                YCP
            </Space>
        );
    }
    return (
        <Space size={4}>
            <DesktopOutlined />
            device
        </Space>
    );
}

export default OriginBadge;
