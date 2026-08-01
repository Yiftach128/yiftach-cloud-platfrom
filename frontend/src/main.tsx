import { ConfigProvider } from 'antd';
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
    components: {
        Menu: {
            itemSelectedBg: 'transparent',
            itemSelectedColor: 'rgba(0, 0, 0, 0.88)',
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
        <ConfigProvider theme={appTheme}>
            <App />
        </ConfigProvider>
    </StrictMode>,
);
