import { Base64 } from 'js-base64';
import * as path from 'path';
import { TestEvent, TestSuiteInfo } from 'vscode-test-adapter-api';
import { distinctBy, getTestOutputBySplittingString, groupBy } from '../utilities';
import { TEST_RESULT_PREFIX } from './unittestScripts';

export function parseTestSuites(output: string, cwd: string): TestSuiteInfo[] {
    const allTests = getTestOutputBySplittingString(output, '==DISCOVERED TESTS==')
        .split(/\r?\n/g)
        .map(line => line.trim())
        .filter(line => line)
        .map(line => splitTestId(line))
        .filter(line => line)
        .map(line => line!);
    return Array.from(groupBy(allTests, t => t.suitId).entries())
        .map(([suitId, tests]) => ({
            type: 'suite' as 'suite',
            id: suitId,
            label: suitId.substring(suitId.lastIndexOf('.') + 1),
            file: filePathBySuitId(cwd, suitId),
            children: tests.map(test => ({
                id: test.testId,
                label: test.testLabel,
                type: 'test' as 'test',
            })),
        }));
}

export function parseTestStates(output: string): TestEvent[] {
    const testEvents = output
        .split(/\r?\n/g)
        .map(line => line.trim())
        .map(line => tryParseTestState(line))
        .filter(line => line)
        .map(line => line!);

    // HACK: Remove duplicates by id so it does not appear in the debug console more than once,
    // because right now script is printing test results multiple times.
    return distinctBy(testEvents, e => e.test);
}

function tryParseTestState(line: string): TestEvent | undefined {
    if (!line) {
        return undefined;
    }
    if (!line.startsWith(TEST_RESULT_PREFIX)) {
        return undefined;
    }
    const [, result, testId, base64Message = ''] = line.split(':');
    if (result == null || testId == null) {
        return undefined;
    }
    const state = toState(result.trim());
    if (!state) {
        return undefined;
    }
    return {
        type: 'test',
        test: testId.trim(),
        state,
        message: base64Message ? Base64.decode(base64Message.trim()) : undefined,
    };
}

function toState(value: string): 'running' | 'passed' | 'failed' | 'skipped' | undefined {
    switch (value) {
        case 'running':
        case 'passed':
        case 'failed':
        case 'skipped':
            return value;
        default:
            return undefined;
    }
}

function splitTestId(testId: string) {
    const separatorIndex = testId.lastIndexOf('.');
    if (separatorIndex < 0) {
        return null;
    }
    return {
        suitId: testId.substring(0, separatorIndex),
        testId,
        testLabel: testId.substring(separatorIndex + 1),
    };
}

function filePathBySuitId(cwd: string, suitId: string) {
    const separatorIndex = suitId.lastIndexOf('.');
    if (separatorIndex < 0) {
        return undefined;
    }
    return path.resolve(cwd, suitId.substring(0, separatorIndex).split('.').join('/') + '.py');
}
