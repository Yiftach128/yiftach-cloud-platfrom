import type { ReactElement } from 'react';
import { Navigate, useParams } from 'react-router';
import type { Params } from 'react-router';

import ImageDetails from '../components/image-details.tsx';
import type { ImageDetailsPageProps } from './interfaces.ts';

function ImageDetailsPage(props: ImageDetailsPageProps): ReactElement {
    const params: Readonly<Params<string>> = useParams();
    const imageId: string | undefined = params.imageId;
    if (imageId === undefined) {
        /* Unreachable when mounted via /images/:imageId, but the type demands it. */
        return <Navigate to="/images" replace />;
    }
    /* react-router has already percent-decoded route params — do not decode again. */
    return <ImageDetails fetcher={props.fetcher} imageId={imageId} />;
}

export default ImageDetailsPage;
