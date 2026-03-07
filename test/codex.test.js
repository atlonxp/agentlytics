const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const codex = require('../editors/codex');

function makeTempCodexHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentlytics-codex-'));
}

function writeSessionFile(codexHome, relativePath, entries) {
  const filePath = path.join(codexHome, 'sessions', relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  return filePath;
}

function withCodexHome(tempDir, fn) {
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = tempDir;
  try {
    return fn();
  } finally {
    if (previous == null) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
  }
}

test('getChats returns empty when CODEX_HOME has no sessions directory', () => {
  const tempDir = makeTempCodexHome();
  assert.deepEqual(withCodexHome(tempDir, () => codex.getChats()), []);
});

test('getChats discovers Codex sessions and ignores bootstrap prompts for titles', () => {
  const tempDir = makeTempCodexHome();
  const filePath = writeSessionFile(tempDir, '2026/03/07/session.jsonl', [
    {
      type: 'session_meta',
      payload: {
        id: 'session-1',
        timestamp: '2026-03-07T10:00:00.000Z',
        cwd: '/tmp/project',
        source: 'vscode',
        originator: 'Codex Desktop',
        cli_version: '0.100.0-alpha.10',
        model_provider: 'openai',
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '<user_instructions>\nignore me\n</user_instructions>' }],
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '<environment_context>\nignore me\n</environment_context>' }],
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Implement Codex support for analytics.' }],
      },
    },
  ]);

  const chats = withCodexHome(tempDir, () => codex.getChats());
  assert.equal(chats.length, 1);
  assert.equal(chats[0].source, 'codex');
  assert.equal(chats[0].composerId, 'session-1');
  assert.equal(chats[0].folder, '/tmp/project');
  assert.equal(chats[0].name, 'Implement Codex support for analytics.');
  assert.equal(chats[0]._rawSource, 'vscode');
  assert.equal(chats[0]._filePath, filePath);
});

test('parseSessionMessages renders reasoning, tool activity, and token usage on the assistant turn', () => {
  const tempDir = makeTempCodexHome();
  const filePath = writeSessionFile(tempDir, '2026/03/07/rich-session.jsonl', [
    {
      type: 'session_meta',
      payload: {
        id: 'session-2',
        timestamp: '2026-03-07T10:00:00.000Z',
        cwd: '/tmp/project',
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Summarize the repository structure.' }],
      },
    },
    {
      type: 'turn_context',
      payload: {
        turn_id: 'turn-1',
        model: 'gpt-5-codex',
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'reasoning',
        summary: [{ type: 'summary_text', text: 'Inspecting likely entrypoints' }],
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'shell_command',
        arguments: JSON.stringify({ command: 'ls', workdir: '/tmp/project' }),
        call_id: 'call-1',
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'call-1',
        output: 'Exit code: 0\nOutput:\nREADME.md\nsrc\n',
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'The repo has a small adapter-based backend and a React UI.' }],
      },
    },
    {
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: 120,
            cached_input_tokens: 20,
            output_tokens: 45,
            total_tokens: 165,
          },
        },
      },
    },
  ]);

  const messages = codex._test.parseSessionMessages(filePath);
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], {
    role: 'user',
    content: 'Summarize the repository structure.',
  });
  assert.equal(messages[1].role, 'assistant');
  assert.match(messages[1].content, /\[thinking\] Inspecting likely entrypoints/);
  assert.match(messages[1].content, /\[tool-call: shell_command\(command, workdir\)\]/);
  assert.match(messages[1].content, /\[tool-result: shell_command\] Exit code: 0 Output: README\.md src/);
  assert.match(messages[1].content, /The repo has a small adapter-based backend and a React UI\./);
  assert.equal(messages[1]._model, 'gpt-5-codex');
  assert.equal(messages[1]._inputTokens, 120);
  assert.equal(messages[1]._outputTokens, 45);
  assert.equal(messages[1]._cacheRead, 20);
  assert.deepEqual(messages[1]._toolCalls, [
    {
      name: 'shell_command',
      args: { command: 'ls', workdir: '/tmp/project' },
    },
  ]);
});

test('parseSessionMessages diffs cumulative totals and keeps model unset when metadata is absent', () => {
  const tempDir = makeTempCodexHome();
  const filePath = writeSessionFile(tempDir, '2026/03/07/cumulative-session.jsonl', [
    {
      type: 'session_meta',
      payload: {
        id: 'session-3',
        timestamp: '2026-03-07T10:00:00.000Z',
        cwd: '/tmp/project',
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Check cumulative token handling.' }],
      },
    },
    {
      type: 'turn_context',
      payload: {
        turn_id: 'turn-1',
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'First answer.' }],
      },
    },
    {
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 0,
            output_tokens: 30,
            total_tokens: 130,
          },
        },
      },
    },
    {
      type: 'turn_context',
      payload: {
        turn_id: 'turn-2',
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Second answer.' }],
      },
    },
    {
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 160,
            cached_input_tokens: 10,
            output_tokens: 55,
            total_tokens: 215,
          },
        },
      },
    },
  ]);

  const messages = codex._test.parseSessionMessages(filePath);
  assert.equal(messages.length, 3);
  assert.equal(messages[1]._inputTokens, 100);
  assert.equal(messages[1]._outputTokens, 30);
  assert.equal(messages[1]._cacheRead, undefined);
  assert.equal(messages[1]._model, undefined);
  assert.equal(messages[2]._inputTokens, 60);
  assert.equal(messages[2]._outputTokens, 25);
  assert.equal(messages[2]._cacheRead, 10);
  assert.equal(messages[2]._model, undefined);
});

test('parseSessionMessages skips malformed lines without failing the session', () => {
  const tempDir = makeTempCodexHome();
  const filePath = path.join(tempDir, 'sessions', '2026/03/07', 'broken.jsonl');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    JSON.stringify({
      type: 'session_meta',
      payload: {
        id: 'session-4',
        timestamp: '2026-03-07T10:00:00.000Z',
        cwd: '/tmp/project',
      },
    }),
    '{ this is not valid json',
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Hello' }],
      },
    }),
  ].join('\n') + '\n');

  const messages = codex._test.parseSessionMessages(filePath);
  assert.deepEqual(messages, [{ role: 'user', content: 'Hello' }]);
});
