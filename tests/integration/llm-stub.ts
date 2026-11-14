import http from 'node:http';
import type { ServerResponse } from 'node:http';

const json = (response: ServerResponse, status: number, payload: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
};

const model = 'zglosto/basal-2.0-4.5b:q4_k_m';

const server = http.createServer(async (request, response) => {
  if (
    request.method === 'GET' &&
    (request.url === '/engines/v1/models' || request.url === '/engines/llama.cpp/v1/models')
  ) {
    return json(response, 200, { object: 'list', data: [{ id: model, object: 'model' }] });
  }

  if (request.method !== 'POST' || request.url !== '/engines/llama.cpp/v1/completions') {
    return json(response, 404, { error: 'Not found' });
  }

  let body = '';
  for await (const chunk of request) body += chunk.toString();

  let prompt = '';
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'prompt' in parsed &&
      typeof parsed.prompt === 'string'
    ) {
      prompt = parsed.prompt;
    } else {
      return json(response, 400, { error: 'Expected a Basal completion prompt' });
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
  const emergency = prompt.includes('[emergency]');
  return json(response, 200, {
    choices: [
      {
        text: emergency ? 'B' : 'A',
        logprobs: {
          content: [
            {
              top_logprobs: [
                { token: 'A', logprob: emergency ? -5 : -0.01 },
                { token: 'B', logprob: emergency ? -0.01 : -5 },
              ],
            },
          ],
        },
      },
    ],
  });
});

server.listen(Number(process.env.LLM_STUB_PORT ?? '8123'), '0.0.0.0');
