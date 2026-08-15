import { CloudOutlined, CloudServerOutlined, CodeSandboxOutlined, DashboardOutlined, PlusOutlined } from '@ant-design/icons';
import { Divider, Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import type { ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import HeaderBreadcrumb from './header-breadcrumb.tsx';
import type { NavItem } from './interfaces.ts';

/* One step darker than the content background (antd's colorBgLayout, #f5f5f5). */
const siderBackground: string = '#ececec';

/* Shared by the sider logo and the content-side header strip, so the divider under
   each renders at the same y-position and reads as one continuous line. */
const headerRowHeight: number = 56;

const dividerColor: string = '#d9d9d9';

/* Single source of truth for navigation: drives the sider menu, the selected-item
   derivation, and the header breadcrumb roots. Paths double as menu keys. */
const navItems: NavItem[] = [
    { path: '/overview', icon: <DashboardOutlined />, label: 'Overview' },
    { path: '/services', icon: <CloudServerOutlined />, label: 'My Services' },
    {
        path: '/containers/new',
        icon: <PlusOutlined />,
        label: 'New Service',
        childLabels: { database: 'Managed Service', image: 'Docker Image', github: 'GitHub Repository' },
    },
    { path: '/images', icon: <CodeSandboxOutlined />, label: 'My Images' },
];

/* The Link makes each item a real anchor (new-tab friendly); antd's menu CSS
   stretches an in-item anchor over the whole row, icon included, so no
   Menu-level onClick is needed. */
const menuItems: MenuProps['items'] = navItems.map((item: NavItem) => ({
    key: item.path,
    icon: item.icon,
    label: <Link to={item.path}>{item.label}</Link>,
}));

/* Child routes (e.g. /services/<container>) keep their nav root highlighted. Exact
   matches win first so one nav path can never shadow another. */
function deriveSelectedMenuKey(pathname: string, items: NavItem[]): string {
    for (const item of items) {
        if (pathname === item.path) {
            return item.path;
        }
    }
    for (const item of items) {
        if (pathname.startsWith(item.path + '/')) {
            return item.path;
        }
    }
    return pathname;
}

function AppLayout(): ReactElement {
    const location = useLocation();

    const selectedMenuKey: string = deriveSelectedMenuKey(location.pathname, navItems);

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Layout.Sider theme="light" style={{ background: siderBackground, borderRight: '1px solid #aaa' }}>
                <div className="app-logo" style={{ height: headerRowHeight }}><CloudOutlined /> YCP</div>
                <Divider style={{ margin: '0 0 8px 0', borderColor: dividerColor }} />
                <Menu
                    className="app-sider-menu"
                    mode="inline"
                    selectedKeys={[selectedMenuKey]}
                    items={menuItems}
                    style={{ background: 'transparent', borderInlineEnd: 'none' }}
                />
            </Layout.Sider>
            <Layout>
                {/* Header strip matching the sider logo row; the divider below continues
                    the sider's divider across the rest of the screen. */}
                <div style={{ height: headerRowHeight, display: 'flex', alignItems: 'center', padding: '0 24px' }}>
                    <HeaderBreadcrumb navItems={navItems} />
                </div>
                <Divider style={{ margin: 0, borderColor: dividerColor }} />
                <Layout.Content style={{ padding: 24 }}>
                    <Outlet />
                </Layout.Content>
            </Layout>
        </Layout>
    );
}

export default AppLayout;
