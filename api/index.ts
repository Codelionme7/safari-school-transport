import express from 'express';
import { createSafariApiRouter } from '../server/apiRouter';

const app = express();
const { router } = createSafariApiRouter();

app.use('/api/v1', router);

export default app;
