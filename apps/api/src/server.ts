import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();

serve({ fetch: createApp().fetch, port: config.API_PORT }, (info) => {
  console.warn(`api listening on :${info.port}`);
});
