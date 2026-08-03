import { App as AntdApp, ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './index.css';
import App from './App.tsx';

/*
 * The sidebar marks the active route with a grey bar (see index.css), so the
 * Menu's default blue selected background and blue text are turned off here.
 */
const appTheme: ThemeConfig = {
    token: {
        /* Grey accent instead of antd's default blue: button hover/active and
           focus states across the app derive their color from this. */
        colorPrimary: '#595959',
        /* Square corners everywhere: the LG/SM/XS radii derive from this seed,
           so every component (buttons, inputs, cards, popovers, ...) follows. */
        borderRadius: 0,
        /* Pressing a danger button keeps its hover red — no darker click shade. */
        colorErrorActive: '#ff7875',
    },
    components: {
        Breadcrumb: {
            /* Header-strip typography: pairs with .app-logo (18px, bold last crumb). */
            fontSize: 18,
        },
        Button: {
            /* Clicking adds no effect of its own: the pressed state reuses the
               hover colors (the ripple wave is disabled on the ConfigProvider). */
            defaultHoverBorderColor: '#666666',
            defaultHoverColor: '#666666',
            defaultActiveBorderColor: '#666666',
            defaultActiveColor: '#666666',
        },
        Menu: {
            itemSelectedBg: 'transparent',
            itemSelectedColor: 'rgba(0, 0, 0, 0.88)',
            /* Clicking a menu item adds no effect of its own: the pressed
               state reuses the hover fill. */
            itemActiveBg: 'rgba(0, 0, 0, 0.06)',
        },
        Tooltip: {
            /* Tooltip background app-wide: grey instead of the near-black default. */
            colorBgSpotlight: '#595959',
        },
    },
};

const rootElement: HTMLElement | null = document.getElementById('root');
if (rootElement === null) {
    throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
    <StrictMode>
        <ConfigProvider theme={appTheme} wave={{ disabled: true }}>
            {/* AntdApp provides the message/notification context; toasts survive route changes. */}
            <AntdApp>
                <App />
            </AntdApp>
        </ConfigProvider>
    </StrictMode>,
);
