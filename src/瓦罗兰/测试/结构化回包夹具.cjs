const { updateBlock } = require('../运行/message-protocol.ts');

function* valueTokens(value) {
  if (value === null || typeof value !== 'object') {
    yield value;
    return;
  }
  if (Array.isArray(value)) {
    yield { container: 'array' };
    for (const member of value) yield* valueTokens(member);
  } else {
    yield { container: 'object' };
    for (const [key, member] of Object.entries(value)) {
      yield key;
      yield* valueTokens(member);
    }
  }
  yield { container: 'end' };
}

function structuredReply(commands) {
  return JSON.stringify({ JSONPatch: JSON.stringify(commands) });
}

function arrayReply(commands) {
  const JSONPatch = commands.map(command => {
    if (command.op === 'move') {
      const { op, from, to, path, ...extra } = command;
      return { move: from, to: to ?? path, ...extra, ...(to !== undefined && path !== undefined ? { path } : {}) };
    }
    const { op, path, value, ...extra } = command;
    const wire = { [op]: path, ...extra };
    if (value !== undefined) wire.value = value !== null && typeof value === 'object' ? [...valueTokens(value)] : value;
    return wire;
  });
  return JSON.stringify({ JSONPatch });
}

function structuredFixtureReply(config, reply) {
  if (config.json_schema?.name !== 'variable_update' || typeof reply !== 'string' ||
      !reply.trimStart().startsWith('<') || !reply.includes('<JSONPatch')) return reply;
  try {
    return structuredReply(updateBlock(reply).commands);
  } catch {
    // Malformed XML fixtures exercise error handling with their original text.
    return reply;
  }
}

module.exports = { structuredReply, arrayReply, structuredFixtureReply };
