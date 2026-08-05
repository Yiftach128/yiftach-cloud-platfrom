import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import AppLayout from './components/app-layout.tsx';
import { DockerFetcherService } from './fetchers/docker-fetcher-service.ts';
import ContainerDetailsPage from './pages/container-details-page.tsx';
import ImagesPage from './pages/images-page.tsx';
import NewContainerPage from './pages/new-container-page.tsx';
import OverviewPage from './pages/overview-page.tsx';
import ServicesPage from './pages/services-page.tsx';

const dockerFetcher: DockerFetcherService = new DockerFetcherService('/api/v1');

function App(): ReactElement {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<AppLayout />}>
                    <Route index element={<Navigate to="/services" replace />} />
                    <Route path="/services" element={<ServicesPage fetcher={dockerFetcher} />} />
                    <Route path="/services/:containerName" element={<ContainerDetailsPage fetcher={dockerFetcher} />} />
                    <Route path="/containers/new/:source?" element={<NewContainerPage fetcher={dockerFetcher} />} />
                    <Route path="/images" element={<ImagesPage fetcher={dockerFetcher} />} />
                    <Route path="/overview" element={<OverviewPage />} />
                    <Route path="*" element={<Navigate to="/services" replace />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
