import { describe, expect, it } from 'vitest'

import {
    AGENT_REFERENCE_FILE_MAX_BYTES,
    formatAgentReferenceFileSize,
    getAgentReferenceFileMimeType,
    validateAgentReferenceFiles,
} from './agentFiles'

describe('agentFiles', () => {
    it('accepts PowerPoint files and normalizes their MIME type', () => {
        const file = { name: '参考方案.PPTX', type: '', size: 1024 }

        expect(() => validateAgentReferenceFiles([file])).not.toThrow()
        expect(getAgentReferenceFileMimeType(file)).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation')
    })

    it('rejects unsupported formats and combined files over 50 MB', () => {
        expect(() => validateAgentReferenceFiles([{ name: 'archive.zip', size: 10 }])).toThrow('不支持')
        expect(() => validateAgentReferenceFiles(
            [{ name: 'second.pdf', size: 2 }],
            [{ id: 'first', name: 'first.pdf', mimeType: 'application/pdf', size: AGENT_REFERENCE_FILE_MAX_BYTES - 1 }],
        )).toThrow('总大小不能超过 50 MB')
    })

    it('formats compact file sizes', () => {
        expect(formatAgentReferenceFileSize(512)).toBe('512 B')
        expect(formatAgentReferenceFileSize(1536)).toBe('2 KB')
        expect(formatAgentReferenceFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB')
    })
})
