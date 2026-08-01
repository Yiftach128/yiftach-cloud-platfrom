import { CloudOutlined, CloudServerOutlined, DashboardOutlined, PlusOutlined } from '@ant-design/icons';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import type { ReactElement } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';

/* One step darker than the content background (antd's colorBgLayout, #f5f5f5). */
const siderBackground: string = '#ececec';

/* Menu keys are the route paths, so selection and navigation need no mapping table. */
const menuItems: MenuProps['items'] = [
    { key: '/services', icon: <CloudServerOutlined />, label: 'My Services' },
    { key: '/containers/new', icon: <PlusOutlined />, label: 'New Container' },
    { key: '/overview', icon: <DashboardOutlined />, label: 'Overview' },
];

function AppLayout(): ReactElement {
    const location = useLocation();
    const navigate = useNavigate();

    function handleMenuClick(info: { key: string }): void {
        navigate(info.key);
    }

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Layout.Sider theme="light" style={{ background: siderBackground, borderRight: '1px solid #8c8c8c' }}>
                <div className="app-logo"><CloudOutlined /> YCP</div>
                <Menu
                    className="app-sider-menu"
                    mode="inline"
                    selectedKeys={[location.pathname]}
                    items={menuItems}
                    onClick={handleMenuClick}
                    style={{ background: 'transparent', borderInlineEnd: 'none' }}
                />
            </Layout.Sider>
            <Layout>
                <Layout.Content style={{ padding: 24 }}>
                    <Outlet />
                </Layout.Content>
            </Layout>
        </Layout>
    );
}

export default AppLayout;
