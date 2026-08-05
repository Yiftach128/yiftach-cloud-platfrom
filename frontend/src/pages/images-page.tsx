import type { ReactElement } from 'react';

import ImageList from '../components/image-list.tsx';
import type { ImagesPageProps } from './interfaces.ts';

function ImagesPage(props: ImagesPageProps): ReactElement {
    return <ImageList fetcher={props.fetcher} />;
}

export default ImagesPage;
