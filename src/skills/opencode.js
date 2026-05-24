const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(process.cwd());
const OPENCODE_TIMEOUT = parseInt(process.env.OPENCODE_TIMEOUT || '120') * 1000;
const OPENCODE_MAX_OUTPUT = parseInt(process.env.OPENCODE_MAX_OUTPUT || '8000');

function sanitizeForOpenCode(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<(\/?\w+[^>]*)>/g, '')
    .replace(/\b(rm\s+-rf|del\s+\/[sS]|format\s+[cC]:|shutdown|reboot)\b/gi, '[redacted]')
    .slice(0, 4000);
}

async function executeOpenCodeTask(taskPrompt, options = {}) {
  const {
    workingDir = WORKSPACE_ROOT,
    timeout = OPENCODE_TIMEOUT,
    personaId = null,
    personaName = null,
    userId = null,
    sessionId = null,
  } = options;

  const safePrompt = sanitizeForOpenCode(taskPrompt);
  if (!safePrompt || safePrompt.trim().length < 5) {
    return { success: false, error: 'Task prompt too short or empty', output: '' };
  }

  const workDir = workingDir || WORKSPACE_ROOT;
  if (!fs.existsSync(workDir)) {
    return { success: false, error: `Working directory does not exist: ${workDir}`, output: '' };
  }

  return new Promise((resolve) => {
    let output = '';
    let errorOutput = '';
    let killed = false;
    const startTime = Date.now();

    const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', TERM: 'dumb' };

    const args = ['run', '--non-interactive', safePrompt];

    const child = spawn('opencode', args, {
      cwd: workDir,
      env,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, 3000);
    }, timeout);

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      if (output.length < OPENCODE_MAX_OUTPUT) {
        output += chunk;
      }
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      if (errorOutput.length < 2000) {
        errorOutput += chunk;
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const elapsed = Date.now() - startTime;

      if (output.length > OPENCODE_MAX_OUTPUT) {
        output = output.slice(output.length - OPENCODE_MAX_OUTPUT);
      }

      output = output
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      resolve({
        success: code === 0 || code === null,
        exitCode: code,
        output,
        errorOutput: errorOutput.trim(),
        elapsed,
        killed,
        prompt: safePrompt.substring(0, 200),
        workingDir: workDir,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        error: `Failed to spawn opencode: ${err.message}`,
        output: output.trim(),
        errorOutput: errorOutput.trim(),
        elapsed: Date.now() - startTime,
        prompt: safePrompt.substring(0, 200),
        workingDir: workDir,
      });
    });
  });
}

async function invokeSkillOpenCode(skillId, input, context = {}) {
  const { getSkill } = require('./index');
  const skill = await getSkill(skillId);
  if (!skill) throw new Error(`Skill "${skillId}" not found`);
  if (!skill.is_active) throw new Error(`Skill "${skillId}" is not active`);
  if (skill.type !== 'opencode' && skill.type !== 'task') {
    throw new Error(`Skill "${skillId}" is type "${skill.type}", not opencode/task. Use invokeSkill for LLM skills.`);
  }

  const { sanitizeForPrompt } = require('./index');
  const safeInput = sanitizeForPrompt(input || '');
  const safeContext = sanitizeForPrompt(JSON.stringify(context));

  let taskPrompt = skill.prompt || '';
  taskPrompt = taskPrompt.replace(/\{input\}/g, safeInput).replace(/\{context\}/g, safeContext || '{}');

  if (!taskPrompt) {
    taskPrompt = safeInput;
  }

  const result = await executeOpenCodeTask(taskPrompt, {
    workingDir: WORKSPACE_ROOT,
    personaId: context.personaId || skill.persona_id,
    personaName: context.personaName,
    userId: context.userId,
    sessionId: context.sessionId,
  });

  return {
    skillId: skill.id,
    skillName: skill.name,
    type: skill.type,
    output_format: skill.output_format,
    success: result.success,
    output: result.output,
    elapsed: result.elapsed,
    prompt: result.prompt,
  };
}

module.exports = {
  executeOpenCodeTask,
  invokeSkillOpenCode,
  sanitizeForOpenCode,
  OPENCODE_MAX_OUTPUT,
  WORKSPACE_ROOT,
};