import { Breadcrumb } from 'antd';
import type { BreadcrumbProps } from 'antd';
import type { ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { NavigateFunction } from 'react-router';

import type { HeaderBreadcrumbProps, NavItem } from './interfaces.ts';

function buildBreadcrumbItems(
    pathname: string,
    navItems: NavItem[],
    navigate: NavigateFunction,
): NonNullable<BreadcrumbProps['items']> {
    /* Exact match: the page is a nav root, one plain crumb. */
    for (const item of navItems) {
        if (pathname === item.path) {
            return [{ title: item.label, style: { fontWeight: 600 } }];
        }
    }
    /* Prefix match: a child of a nav root — clickable root crumb + decoded leaf.
       location.pathname is still percent-encoded (react-router only decodes params). */
    for (const item of navItems) {
        const childPrefix: string = item.path + '/';
        if (pathname.startsWith(childPrefix)) {
            const encodedLeaf: string = pathname.substring(childPrefix.length);
            let leafTitle: string = decodeURIComponent(encodedLeaf);
            if (item.childLabels !== undefined) {
                const mapped: string | undefined = item.childLabels[leafTitle];
                if (mapped !== undefined) {
                    leafTitle = mapped;
                }
            }
            return [
                {
                    title: item.label,
                    className: 'app-breadcrumb-link',
                    onClick: (): void => {
                        navigate(item.path);
                    },
                },
                { title: leafTitle, style: { fontWeight: 600 } },
            ];
        }
    }
    /* Redirect frames ('/', unknown paths) render once before <Navigate> fires. */
    return [];
}

function HeaderBreadcrumb(props: HeaderBreadcrumbProps): ReactElement {
    const location = useLocation();
    const navigate = useNavigate();

    const items: NonNullable<BreadcrumbProps['items']> =
        buildBreadcrumbItems(location.pathname, props.navItems, navigate);
    if (items.length === 0) {
        return <></>;
    }
    return <Breadcrumb separator=">" items={items} />;
}

export default HeaderBreadcrumb;
