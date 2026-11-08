import type { Task } from 'graphile-worker';

/** Proves the queue is alive end to end. Later milestones add real tasks beside it. */
export const heartbeat: Task = async (_payload, helpers) => {
  helpers.logger.info('heartbeat');
};
