import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, passwordProblem } from '@familyos/domain';

/**
 * Asks for a new password twice without echoing it, for the operator commands. Never takes the
 * password from an argument or an environment variable, so it can't end up in shell history.
 * With stdin piped instead of a terminal, it reads two lines.
 */
export async function readNewPassword(input: NodeJS.ReadableStream = process.stdin) {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (!muted) process.stderr.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input, output, terminal: Boolean(process.stdin.isTTY) });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string) => {
    muted = false;
    output.write(prompt);
    muted = true;
    const next = await lines.next();
    muted = false;
    process.stderr.write('\n');
    if (next.done) throw new Error('no password given');
    return next.value;
  };
  try {
    const first = await ask(`New password (at least ${PASSWORD_MIN_LENGTH} characters): `);
    const problem = passwordProblem(first);
    if (problem === 'too_short') {
      throw new Error(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    }
    if (problem === 'too_long')
      throw new Error(`password must be at most ${PASSWORD_MAX_BYTES} bytes`);
    if ((await ask('Same password again: ')) !== first) throw new Error('passwords did not match');
    return first;
  } finally {
    rl.close();
  }
}
