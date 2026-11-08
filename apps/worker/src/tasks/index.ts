import type { TaskList } from 'graphile-worker';
import { heartbeat } from './heartbeat';

export const taskList: TaskList = {
  heartbeat,
};
