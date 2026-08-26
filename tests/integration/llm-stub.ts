import http from 'node:http';
import type { ServerResponse } from 'node:http';

const json = (response: ServerResponse, status: number, payload: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
};

const model = 'ai/gemma3-qat:1B-Q4_K_M';

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/engines/v1/models') {
    return json(response, 200, { object: 'list', data: [{ id: model, object: 'model' }] });
  }

  if (request.method !== 'POST' || request.url !== '/engines/llama.cpp/v1/chat/completions') {
    return json(response, 404, { error: 'Not found' });
  }

  let body = '';
  for await (const chunk of request) body += chunk.toString();

  let prompt = '';
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null && 'messages' in parsed) {
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      prompt = messages
        .filter(
          (message): message is { content: string } =>
            typeof message === 'object' &&
            message !== null &&
            'content' in message &&
            typeof message.content === 'string',
        )
        .map((message) => message.content)
        .join('\n');
    }
  } catch {
    return json(response, 400, { error: 'Invalid JSON' });
  }

  if (prompt.includes('[timeout]')) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return json(response, 200, { choices: [{ message: { content: '{}' } }] });
  }
  if (prompt.includes('[unavailable]')) {
    return json(response, 503, { error: 'Model unavailable' });
  }
  if (prompt.includes('[invalid]')) {
    return json(response, 200, { choices: [{ message: { content: 'invalid' } }] });
  }
  if (prompt.includes('[emergency]')) {
    return json(response, 200, {
      choices: [{ message: { content: '{"classification":"emergency","confidence":0.99}' } }],
    });
  }

  return json(response, 200, {
    choices: [{ message: { content: '{"classification":"municipal","confidence":0.9}' } }],
  });
});

server.listen(8123, '0.0.0.0');
