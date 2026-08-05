import type { ReactElement } from 'react';

import NewContainerWizard from '../components/new-container-wizard.tsx';
import type { NewContainerPageProps } from './interfaces.ts';

function NewContainerPage(props: NewContainerPageProps): ReactElement {
    return <NewContainerWizard fetcher={props.fetcher} />;
}

export default NewContainerPage;
