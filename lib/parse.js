/**
 * 测试报告解析：vitest / jest 的 JSON reporter、pytest 的 JUnit XML、
 * 与 node:test 的层级 TAP 13（含 YAML 诊断块）统一成一次运行的扁平用例列表。
 *
 * @module dsh-flakefinder/parse
 */
import { normalizeRelPath } from './config.js';
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const ERROR_CLASS_RE = /^([A-Z][A-Za-z0-9_.]*(?:Error|Exception|Failure))\b/;
const FILE_EXT_RE = /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/i;
function stripAnsi(text) {
    return text.replace(ANSI_RE, '');
}
function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function normalizeStatus(value) {
    if (value === 'passed')
        return 'passed';
    if (value === 'failed')
        return 'failed';
    if (value === 'pending' || value === 'skipped' || value === 'todo' || value === 'disabled')
        return 'skipped';
    return 'failed';
}
function inferErrorType(text) {
    const cleaned = stripAnsi(text).trim();
    if (cleaned === '')
        return undefined;
    const firstLine = cleaned.split(/\r?\n/)[0]?.trim() ?? '';
    const cls = ERROR_CLASS_RE.exec(firstLine);
    if (cls !== null && cls[1] !== 'Error')
        return cls[1];
    if (/timed?\s*out|\btimeout\b/i.test(firstLine))
        return 'TimeoutError';
    if (/^expect\(|\bassert(?:ion)?\b/i.test(firstLine))
        return 'AssertionError';
    if (cls !== null)
        return cls[1];
    return undefined;
}
function parseErrorText(raw, explicitType) {
    const cleaned = stripAnsi(raw).replace(/\r\n/g, '\n').trim();
    if (cleaned === '')
        return undefined;
    const lines = cleaned.split('\n');
    const firstIdx = lines.findIndex(line => line.trim() !== '');
    if (firstIdx === -1)
        return undefined;
    const firstLine = lines[firstIdx].trim();
    const rest = lines.slice(firstIdx + 1).join('\n').trim();
    const type = explicitType?.trim() || inferErrorType(firstLine);
    return {
        ...(type !== undefined ? { type } : {}),
        message: firstLine,
        ...(rest !== '' ? { stack: rest } : {}),
    };
}
function uniqueId(baseId, seen, used) {
    const count = (seen.get(baseId) ?? 0) + 1;
    seen.set(baseId, count);
    if (count === 1 && !used.has(baseId)) {
        used.add(baseId);
        return baseId;
    }
    let suffix = Math.max(count, 2);
    let candidate = baseId + ' #' + String(suffix);
    while (used.has(candidate)) {
        suffix += 1;
        candidate = baseId + ' #' + String(suffix);
    }
    used.add(candidate);
    return candidate;
}
/** vitest 与 jest 的 JSON 结构高度接近，这里统一读取。 */
export function parseJsonReport(text, framework, cwd) {
    let root;
    try {
        root = JSON.parse(text);
    }
    catch {
        throw new Error(framework + ' 报告不是合法 JSON。请确认项目安装的是支持 --reporter=json 的版本。');
    }
    const obj = (root ?? {});
    const suites = Array.isArray(obj.testResults) ? obj.testResults : [];
    const tests = [];
    const seenIds = new Map();
    const usedIds = new Set();
    for (const suite of suites) {
        const rawFile = typeof suite.name === 'string' && suite.name !== '' ? suite.name : '(unknown)';
        const file = rawFile === '(unknown)' ? rawFile : normalizeRelPath(rawFile, cwd);
        const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
        if (assertions.length > 0) {
            for (const item of assertions) {
                const fullName = typeof item.fullName === 'string' && item.fullName !== ''
                    ? item.fullName
                    : (typeof item.title === 'string' ? item.title : '(unnamed)');
                const status = normalizeStatus(item.status);
                let error;
                if (Array.isArray(item.failureMessages)) {
                    const messages = item.failureMessages
                        .filter((msg) => typeof msg === 'string' && msg.trim() !== '');
                    if (messages.length > 0) {
                        error = parseErrorText(messages.join('\n\n'));
                    }
                }
                tests.push({
                    id: uniqueId(file + ' > ' + fullName, seenIds, usedIds),
                    file,
                    name: fullName,
                    status,
                    durationMs: Math.max(0, asNumber(item.duration) ?? 0),
                    ...(error !== undefined ? { error } : {}),
                });
            }
        }
        else {
            const status = normalizeStatus(suite.status);
            const error = typeof suite.message === 'string' && suite.message.trim() !== ''
                ? parseErrorText(suite.message)
                : undefined;
            tests.push({
                id: uniqueId(file + ' > (suite)', seenIds, usedIds),
                file,
                name: '(suite)',
                status,
                durationMs: 0,
                ...(error !== undefined ? { error } : {}),
            });
        }
    }
    return {
        framework,
        success: obj.success === true,
        total: reportedCount(obj.numTotalTests, tests.length),
        passed: reportedCount(obj.numPassedTests, tests.filter(test => test.status === 'passed').length),
        failed: reportedCount(obj.numFailedTests, tests.filter(test => test.status === 'failed').length),
        skipped: reportedCount(obj.numPendingTests, tests.filter(test => test.status === 'skipped').length),
        tests,
    };
}
function reportedCount(reported, fallback) {
    if (typeof reported === 'number' && Number.isFinite(reported))
        return Math.round(reported);
    return fallback;
}
function attrOf(tag, name) {
    const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')').exec(tag);
    if (m === null)
        return '';
    return m[1] ?? m[2] ?? '';
}
/** 解码 XML 属性里的实体与数字字符引用。 */
function decodeXmlEntities(text) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (raw, body) => {
        const key = body.toLowerCase();
        if (key.startsWith('#')) {
            const hex = key.startsWith('#x');
            const code = parseInt(hex ? key.slice(2) : key.slice(1), hex ? 16 : 10);
            return Number.isFinite(code) && code >= 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : raw;
        }
        return named[key] ?? raw;
    });
}
/** 解包 CDATA 段，并对 CDATA 之外的 XML 实体进行解码。 */
function decodeXmlText(raw) {
    return raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+|<)/g, (_m, cdata, plain) => {
        if (cdata !== undefined)
            return cdata;
        return decodeXmlEntities(plain ?? '');
    });
}
function extractJunitError(body) {
    const failMatch = /<(failure|error)\b([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/\1\s*>)/i.exec(body);
    if (failMatch === null)
        return undefined;
    const tagName = failMatch[1].toLowerCase();
    const attrs = failMatch[2] ?? '';
    const rawBody = failMatch[3] ?? '';
    const attrType = decodeXmlEntities(attrOf(attrs, 'type')).trim() || undefined;
    const attrMessage = decodeXmlEntities(attrOf(attrs, 'message')).trim();
    let stackText = decodeXmlText(rawBody).trim();
    if (stackText === '') {
        const sysErr = /<system-err\b[^>]*>([\s\S]*?)<\/system-err\s*>/i.exec(body);
        if (sysErr !== null) {
            stackText = decodeXmlText(sysErr[1] ?? '').trim();
        }
    }
    if (attrMessage !== '') {
        const type = attrType ?? inferErrorType(attrMessage) ?? inferErrorType(stackText);
        return {
            ...(type !== undefined ? { type } : {}),
            message: attrMessage,
            ...(stackText !== '' ? { stack: stackText } : {}),
        };
    }
    if (stackText !== '') {
        return parseErrorText(stackText, attrType);
    }
    return {
        ...(attrType !== undefined ? { type: attrType } : {}),
        message: attrType ?? (tagName === 'error' ? 'Test error' : 'Test failed'),
    };
}
/** 解析 pytest 的 JUnit XML 报告。 */
export function parseJunitReport(text, cwd) {
    if (!/<(?:testsuites|testsuite|testcase)\b/i.test(text)) {
        throw new Error('pytest JUnit XML 报告格式无效或为空：未找到 testsuite/testcase 节点。');
    }
    const strippedCdata = text.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
    if (/<testsuite\b(?![^>]*\/>)/i.test(strippedCdata) && !/<\/testsuite\s*>/i.test(strippedCdata)) {
        throw new Error('pytest JUnit XML 报告不完整或被截断：缺少 </testsuite> 闭合标签。');
    }
    if (/<testsuites\b(?![^>]*\/>)/i.test(strippedCdata) && !/<\/testsuites\s*>/i.test(strippedCdata)) {
        throw new Error('pytest JUnit XML 报告不完整或被截断：缺少 </testsuites> 闭合标签。');
    }
    const tests = [];
    const seenIds = new Map();
    const usedIds = new Set();
    // Match self-closing and paired nodes in one pass; separate regexes can let
    // an empty node consume the closing tag of the following failed testcase.
    const cases = /<testcase\b([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/testcase\s*>)/gi;
    for (const m of text.matchAll(cases)) {
        const tag = m[1];
        const body = m[2] ?? '';
        const fileAttr = decodeXmlEntities(attrOf(tag, 'file')).trim();
        const classname = decodeXmlEntities(attrOf(tag, 'classname')).trim();
        const file = fileAttr !== ''
            ? normalizeRelPath(fileAttr, cwd)
            : (classname !== '' ? classname : '(pytest)');
        const name = decodeXmlEntities(attrOf(tag, 'name')) || '(unnamed)';
        const error = extractJunitError(body);
        const status = error !== undefined || /<(?:failure|error)\b/i.test(body)
            ? 'failed'
            : /<skipped\b/i.test(body)
                ? 'skipped'
                : 'passed';
        tests.push({
            id: uniqueId(file + ' > ' + name, seenIds, usedIds),
            file,
            name,
            status,
            durationMs: Math.max(0, Number(attrOf(tag, 'time')) || 0) * 1000,
            ...(status === 'failed' && error !== undefined ? { error } : {}),
        });
    }
    const openedTestcases = (strippedCdata.match(/<testcase\b/gi) ?? []).length;
    if (openedTestcases > tests.length) {
        throw new Error('pytest JUnit XML 报告不完整或被截断：存在未闭合的 testcase 节点。');
    }
    const failed = tests.filter(item => item.status === 'failed').length;
    const skipped = tests.filter(item => item.status === 'skipped').length;
    return { framework: 'pytest', success: failed === 0, total: tests.length, passed: tests.length - failed - skipped, failed, skipped, tests };
}
function indentOf(line) {
    return line.length - line.trimStart().length;
}
function parseYamlScalar(raw) {
    const trimmed = raw.trim();
    if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
        return trimmed
            .slice(1, -1)
            .replace(/''/g, "'")
            .replace(/\\\\/g, '\\');
    }
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed === 'string')
                return parsed;
        }
        catch {
            // 回退到基础去引号。
        }
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
function parseTapYamlBlock(lines, startIndex, caseIndent) {
    const yaml = {};
    if (startIndex >= lines.length)
        return { yaml, nextIndex: startIndex };
    const firstLine = lines[startIndex];
    const openMatch = /^(\s+)---\s*$/.exec(firstLine);
    if (openMatch === null || openMatch[1].length <= caseIndent) {
        return { yaml, nextIndex: startIndex };
    }
    const yamlIndent = openMatch[1].length;
    let i = startIndex + 1;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed === '') {
            i += 1;
            continue;
        }
        const lineIndent = indentOf(line);
        if (trimmed === '...' && lineIndent <= yamlIndent) {
            i += 1;
            break;
        }
        if (lineIndent <= caseIndent) {
            break;
        }
        const kv = /^(\s*)([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
        if (kv === null || kv[1].length > yamlIndent + 1) {
            i += 1;
            continue;
        }
        const keyIndent = kv[1].length;
        const key = kv[2];
        const rest = kv[3].trim();
        if (/^[|>][+-]?\d*$/.test(rest)) {
            const folded = rest.startsWith('>');
            const collected = [];
            let j = i + 1;
            while (j < lines.length) {
                const sub = lines[j];
                if (sub.trim() === '') {
                    collected.push('');
                    j += 1;
                    continue;
                }
                const subIndent = indentOf(sub);
                if (subIndent <= keyIndent)
                    break;
                collected.push(sub);
                j += 1;
            }
            while (collected.length > 0 && collected[collected.length - 1] === '') {
                collected.pop();
            }
            let minIndent = Infinity;
            for (const row of collected) {
                if (row.trim() !== '') {
                    const ind = indentOf(row);
                    if (ind < minIndent)
                        minIndent = ind;
                }
            }
            const strip = Number.isFinite(minIndent) ? minIndent : 0;
            const stripped = collected.map(row => (row.length >= strip ? row.slice(strip) : ''));
            if (folded) {
                const paragraphs = [];
                let current = [];
                for (const row of stripped) {
                    if (row === '') {
                        if (current.length > 0) {
                            paragraphs.push(current.join(' '));
                            current = [];
                        }
                    }
                    else {
                        current.push(row);
                    }
                }
                if (current.length > 0)
                    paragraphs.push(current.join(' '));
                yaml[key] = paragraphs.join('\n\n');
            }
            else {
                yaml[key] = stripped.join('\n');
            }
            i = j;
            continue;
        }
        if (rest === '') {
            // 嵌套 YAML 对象（如 cause:），跳过其缩进子行。
            let j = i + 1;
            while (j < lines.length) {
                const sub = lines[j];
                if (sub.trim() === '') {
                    j += 1;
                    continue;
                }
                if (indentOf(sub) <= keyIndent)
                    break;
                j += 1;
            }
            i = j;
            continue;
        }
        yaml[key] = parseYamlScalar(rest);
        i += 1;
    }
    return { yaml, nextIndex: i };
}
function buildTapError(yaml) {
    const rawError = stripAnsi(yaml.error ?? '').trim();
    const rawStack = stripAnsi(yaml.stack ?? '').trim();
    const failureType = yaml.failureType?.trim() || undefined;
    const explicitName = yaml.name?.trim() || undefined;
    const code = yaml.code?.trim() || undefined;
    const expected = yaml.expected?.trim();
    const actual = yaml.actual?.trim();
    const location = yaml.location?.trim();
    if (rawError === '' &&
        rawStack === '' &&
        failureType === undefined &&
        explicitName === undefined &&
        code === undefined &&
        expected === undefined &&
        actual === undefined) {
        return undefined;
    }
    let type = explicitName;
    if (type === undefined && code === 'ERR_ASSERTION')
        type = 'AssertionError';
    if (type === undefined)
        type = inferErrorType(rawError);
    if (type === undefined && failureType !== undefined && /timeout/i.test(failureType))
        type = 'TimeoutError';
    if (type === undefined)
        type = failureType;
    let message = rawError;
    if (message === '') {
        message = rawStack.split(/\r?\n/)[0]?.trim() || failureType || code || 'Test failed';
    }
    const diffParts = [];
    if (expected !== undefined && expected !== '')
        diffParts.push('expected: ' + expected);
    if (actual !== undefined && actual !== '')
        diffParts.push('actual: ' + actual);
    if (diffParts.length > 0 && !message.includes('expected:') && !message.includes('actual:')) {
        message += ' (' + diffParts.join(', ') + ')';
    }
    const stack = rawStack !== '' ? rawStack : (location ? 'at ' + location : undefined);
    return {
        ...(type !== undefined ? { type } : {}),
        message,
        ...(stack !== undefined ? { stack } : {}),
    };
}
function parseTapDuration(yaml) {
    if (yaml.duration_ms === undefined)
        return 0;
    const num = Number(yaml.duration_ms);
    return Number.isFinite(num) && num >= 0 ? num : 0;
}
/** 解析 node:test 的 TAP 13 输出：支持层级子测试（仅输出叶节点）与 YAML 诊断块。 */
export function parseTapReport(text, options) {
    const lines = text.split(/\r?\n/);
    const root = {
        indent: -1,
        name: '',
        yaml: {},
        children: [],
        completed: false,
        fromSubtestHeader: false,
    };
    const stack = [root];
    const bailOuts = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed === '' || /^TAP version\b/i.test(trimmed) || /^\d+\.\.\d+(?:\s*#.*)?$/.test(trimmed)) {
            i += 1;
            continue;
        }
        const bailMatch = /^Bail out!(?:\s+(.*))?$/i.exec(trimmed);
        if (bailMatch !== null) {
            bailOuts.push((bailMatch[1] ?? '').trim() || 'TAP Bail out!');
            i += 1;
            continue;
        }
        const indent = indentOf(line);
        const subtestMatch = /^#\s*Subtest:\s*(.+?)\s*$/.exec(trimmed);
        if (subtestMatch !== null) {
            while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
                stack.pop();
            }
            const node = {
                indent,
                name: subtestMatch[1],
                yaml: {},
                children: [],
                completed: false,
                fromSubtestHeader: true,
            };
            stack[stack.length - 1].children.push(node);
            stack.push(node);
            i += 1;
            continue;
        }
        if (trimmed.startsWith('#')) {
            i += 1;
            continue;
        }
        const caseMatch = /^(not ok|ok)(?=\s|$)(?:\s+(\d+))?(?:\s+-\s*|\s+)?(.*)$/.exec(trimmed);
        if (caseMatch === null) {
            i += 1;
            continue;
        }
        const failed = caseMatch[1] === 'not ok';
        const rawDesc = (caseMatch[3] ?? '').trim();
        const directiveMatch = /(?:^|\s)(?<!\\)#\s*(SKIP|TODO)\b.*$/i.exec(rawDesc);
        const skipped = directiveMatch !== null;
        const cleanName = (directiveMatch !== null ? rawDesc.slice(0, directiveMatch.index) : rawDesc)
            .replace(/\\#/g, '#')
            .trim() || '(unnamed)';
        const status = skipped ? 'skipped' : failed ? 'failed' : 'passed';
        while (stack.length > 1 && stack[stack.length - 1].indent > indent) {
            stack.pop();
        }
        const top = stack[stack.length - 1];
        let targetNode;
        if (top.indent === indent && top.fromSubtestHeader && !top.completed) {
            targetNode = top;
            targetNode.status = status;
            if (targetNode.name === '' && cleanName !== '(unnamed)')
                targetNode.name = cleanName;
            targetNode.completed = true;
            stack.pop();
        }
        else {
            targetNode = {
                indent,
                name: cleanName,
                status,
                yaml: {},
                children: [],
                completed: true,
                fromSubtestHeader: false,
            };
            top.children.push(targetNode);
        }
        const yamlResult = parseTapYamlBlock(lines, i + 1, indent);
        targetNode.yaml = yamlResult.yaml;
        i = yamlResult.nextIndex;
    }
    const defaultFile = options?.target !== undefined && options.target.trim() !== ''
        ? normalizeRelPath(options.target, options.cwd)
        : '(node:test)';
    const tests = [];
    const seenIds = new Map();
    const usedIds = new Set();
    function emitLeaf(segments, status, yaml) {
        let file = defaultFile;
        let name;
        if (segments.length >= 2 && FILE_EXT_RE.test(segments[0])) {
            file = normalizeRelPath(segments[0], options?.cwd);
            name = segments.slice(1).join(' > ');
        }
        else {
            name = segments.join(' > ');
        }
        const error = status === 'failed' ? buildTapError(yaml) : undefined;
        tests.push({
            id: uniqueId(file + ' > ' + name, seenIds, usedIds),
            file,
            name,
            status,
            durationMs: parseTapDuration(yaml),
            ...(error !== undefined ? { error } : {}),
        });
    }
    function hasCompletedDescendant(node) {
        for (const child of node.children) {
            if (child.completed || hasCompletedDescendant(child))
                return true;
        }
        return false;
    }
    function walk(nodes, prefix) {
        let anyFailed = false;
        for (const node of nodes) {
            const pathSegments = [...prefix, node.name || '(unnamed)'];
            if (hasCompletedDescendant(node)) {
                const childFailed = walk(node.children, pathSegments);
                if (childFailed)
                    anyFailed = true;
                // 容器本身因 hookFailed 等原因失败但子测试全过时，补记一条容器失败以免被当成稳定通过。
                if (node.completed && node.status === 'failed' && !childFailed && node.yaml.failureType !== 'subtestsFailed') {
                    emitLeaf([...pathSegments, '(hook)'], 'failed', node.yaml);
                    anyFailed = true;
                }
            }
            else if (node.completed && node.status !== undefined) {
                emitLeaf(pathSegments, node.status, node.yaml);
                if (node.status === 'failed')
                    anyFailed = true;
            }
        }
        return anyFailed;
    }
    walk(root.children, []);
    for (const bailMsg of bailOuts) {
        tests.push({
            id: uniqueId(defaultFile + ' > (bail out)', seenIds, usedIds),
            file: defaultFile,
            name: '(bail out)',
            status: 'failed',
            durationMs: 0,
            error: { type: 'BailOutError', message: bailMsg },
        });
    }
    const failed = tests.filter(item => item.status === 'failed').length;
    const skipped = tests.filter(item => item.status === 'skipped').length;
    return {
        framework: 'node',
        success: failed === 0 && tests.length > 0,
        total: tests.length,
        passed: tests.length - failed - skipped,
        failed,
        skipped,
        tests,
    };
}
