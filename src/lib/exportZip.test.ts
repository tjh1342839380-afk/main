import { describe, expect, it } from 'vitest'

import type { AppSettings, StoredAgentReferenceFile, StoredImage, StoredImageThumbnail, TaskParams, TaskRecord } from '../types'
import { buildExportZip, readExportZip, readExportZipFileAsDataUrl } from './exportZip'

describe('exportZip', () => {
  it('builds and reads backup zip entries without changing manifest shape', () => {
    const task: TaskRecord = {
      id: 'task-1',
      prompt: '提示词',
      params: {} as TaskParams,
      inputImageIds: ['img-1'],
      outputImages: ['img-2'],
      streamPartialImageIds: ['img-3'],
      status: 'done',
      error: null,
      createdAt: 1700000000000,
      finishedAt: 1700000000200,
      elapsed: 200,
    }
    const images: StoredImage[] = [{
      id: 'img-1',
      dataUrl: 'data:image/png;base64,AAECAw==',
      source: 'generated',
    }, {
      id: 'img-2',
      dataUrl: 'data:image/png;base64,BAUGBw==',
      source: 'generated',
    }, {
      id: 'img-3',
      dataUrl: 'data:image/png;base64,CAkKCw==',
      source: 'generated',
    }]
    const thumbnail: StoredImageThumbnail = {
      id: 'img-1',
      thumbnailDataUrl: 'data:image/jpeg;base64,BAUG',
      width: 32,
      height: 24,
      thumbnailVersion: 2,
    }
    const agentFile: StoredAgentReferenceFile = {
      id: 'agent-file-1',
      name: '品牌参考.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      size: 4,
      dataUrl: 'data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,UEsDBA==',
      createdAt: 1700000000300,
    }

    const { manifest, bytes } = buildExportZip({
      options: { exportConfig: true, exportTasks: true },
      exportedAt: 1700000001000,
      settings: {} as AppSettings,
      tasks: [task],
      images,
      thumbnailsByImageId: new Map([[thumbnail.id, thumbnail]]),
      favoriteCollections: [],
      defaultFavoriteCollectionId: null,
      agentConversations: [{
        id: 'conversation-1',
        title: '演示文稿',
        activeRoundId: 'round-1',
        createdAt: 1700000000000,
        updatedAt: 1700000000300,
        rounds: [{
          id: 'round-1',
          index: 1,
          parentRoundId: null,
          userMessageId: 'message-1',
          prompt: '生成 PPT',
          inputImageIds: [],
          inputFiles: [{ id: agentFile.id, name: agentFile.name, mimeType: agentFile.mimeType, size: agentFile.size }],
          outputTaskIds: [],
          status: 'done',
          error: null,
          createdAt: 1700000000000,
          finishedAt: 1700000000300,
        }],
        messages: [{ id: 'message-1', role: 'user', content: '生成 PPT', roundId: 'round-1', createdAt: 1700000000000 }],
      }],
      agentFiles: [agentFile],
    })
    const parsed = readExportZip(bytes)

    expect(parsed.manifest).toEqual(manifest)
    expect(parsed.manifest.version).toBe(4)
    expect(parsed.manifest.exportedAt).toBe(new Date(1700000001000).toISOString())
    expect(parsed.manifest.imageFiles?.['img-1']).toEqual({
      path: 'images/task-task-1-input.png',
      createdAt: 1700000000000,
      source: 'generated',
      width: 32,
      height: 24,
    })
    expect(parsed.manifest.imageFiles?.['img-2']?.path).toBe('images/task-task-1.png')
    expect(parsed.manifest.imageFiles?.['img-3']?.path).toBe('images/task-task-1-partial.png')
    expect(parsed.manifest.thumbnailFiles?.['img-1']).toEqual({
      path: 'thumbnails/task-task-1-input.jpeg',
      width: 32,
      height: 24,
      thumbnailVersion: 2,
    })
    expect(readExportZipFileAsDataUrl(parsed.files, 'images/task-task-1-input.png')).toBe(images[0].dataUrl)
    expect(readExportZipFileAsDataUrl(parsed.files, 'images/task-task-1.png')).toBe(images[1].dataUrl)
    expect(readExportZipFileAsDataUrl(parsed.files, 'images/task-task-1-partial.png')).toBe(images[2].dataUrl)
    expect(readExportZipFileAsDataUrl(parsed.files, 'thumbnails/task-task-1-input.jpeg')).toBe(thumbnail.thumbnailDataUrl)
    expect(parsed.manifest.agentFileFiles?.[agentFile.id]?.name).toBe(agentFile.name)
    expect(readExportZipFileAsDataUrl(
      parsed.files,
      parsed.manifest.agentFileFiles![agentFile.id].path,
      agentFile.mimeType,
    )).toBe(agentFile.dataUrl)
  })
})
