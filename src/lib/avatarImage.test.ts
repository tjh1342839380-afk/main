import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canvasToBlob, loadImage } from './canvasImage'
import { blobToDataUrl, fileToDataUrl } from './dataUrl'
import { AVATAR_TARGET_BYTES, prepareAvatarImage } from './avatarImage'

vi.mock('./canvasImage', () => ({
    canvasToBlob: vi.fn(),
    loadImage: vi.fn(),
}))

vi.mock('./dataUrl', () => ({
    blobToDataUrl: vi.fn(),
    fileToDataUrl: vi.fn(),
}))

function createFile(size: number, type: string, name = 'avatar.png') {
    return new File([new Uint8Array(size)], name, { type })
}

describe('prepareAvatarImage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('rejects non-image files', async () => {
        await expect(prepareAvatarImage(createFile(100, 'text/plain', 'avatar.txt'))).rejects.toThrow('请选择有效的图片文件')
    })

    it('keeps images that are already within the target size', async () => {
        vi.mocked(fileToDataUrl).mockResolvedValue('data:image/png;base64,c21hbGw=')

        await expect(prepareAvatarImage(createFile(1024, 'image/png'))).resolves.toBe('data:image/png;base64,c21hbGw=')
        expect(loadImage).not.toHaveBeenCalled()
    })

    it('rejects oversized GIF files instead of removing animation', async () => {
        const file = createFile(AVATAR_TARGET_BYTES + 1, 'image/gif', 'avatar.gif')

        await expect(prepareAvatarImage(file)).rejects.toThrow('GIF 头像不能自动压缩')
        expect(fileToDataUrl).not.toHaveBeenCalled()
    })

    it('compresses oversized static images to WebP near the target size', async () => {
        const clearRect = vi.fn()
        const drawImage = vi.fn()
        const canvas = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({ clearRect, drawImage })),
        } as unknown as HTMLCanvasElement
        vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
        vi.mocked(fileToDataUrl).mockResolvedValue('data:image/png;base64,c291cmNl')
        vi.mocked(loadImage).mockResolvedValue({ naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement)
        vi.mocked(canvasToBlob)
            .mockResolvedValueOnce(new Blob([new Uint8Array(AVATAR_TARGET_BYTES + 1)], { type: 'image/webp' }))
            .mockResolvedValueOnce(new Blob([new Uint8Array(AVATAR_TARGET_BYTES)], { type: 'image/webp' }))
        vi.mocked(blobToDataUrl).mockResolvedValue('data:image/webp;base64,Y29tcHJlc3NlZA==')

        await expect(prepareAvatarImage(createFile(AVATAR_TARGET_BYTES + 1, 'image/png'))).resolves.toBe('data:image/webp;base64,Y29tcHJlc3NlZA==')
        expect(canvas.width).toBe(400)
        expect(canvas.height).toBe(200)
        expect(clearRect).toHaveBeenCalledWith(0, 0, 400, 200)
        expect(drawImage).toHaveBeenCalled()
        expect(canvasToBlob).toHaveBeenNthCalledWith(1, canvas, 'image/webp', 0.92)
        expect(canvasToBlob).toHaveBeenNthCalledWith(2, canvas, 'image/webp', 0.84)
        expect(blobToDataUrl).toHaveBeenCalledWith(expect.objectContaining({ size: AVATAR_TARGET_BYTES }), 'image/webp')
    })
})
