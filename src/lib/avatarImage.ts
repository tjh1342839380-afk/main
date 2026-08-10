import { canvasToBlob, loadImage } from './canvasImage'
import { blobToDataUrl, fileToDataUrl } from './dataUrl'

export const AVATAR_TARGET_BYTES = 20 * 1024

const AVATAR_SCALE_STEPS = [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36]
const AVATAR_QUALITY_STEPS = [0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36]

async function compressAvatarImage(file: File) {
    const source = await fileToDataUrl(file)
    const image = await loadImage(source)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器不支持头像压缩')

    for (const scale of AVATAR_SCALE_STEPS) {
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

        for (const quality of AVATAR_QUALITY_STEPS) {
            const blob = await canvasToBlob(canvas, 'image/webp', quality)
            if (blob.size <= AVATAR_TARGET_BYTES) {
                return blobToDataUrl(blob, 'image/webp')
            }
        }
    }

    throw new Error('图片压缩后仍超过 20 KB，请选择尺寸更小的图片')
}

export async function prepareAvatarImage(file: File) {
    if (!file.type.startsWith('image/')) {
        throw new Error('请选择有效的图片文件')
    }

    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
    if (isGif && file.size > AVATAR_TARGET_BYTES) {
        throw new Error('GIF 头像不能自动压缩，请选择不超过 20 KB 的文件')
    }

    if (isGif || file.size <= AVATAR_TARGET_BYTES) {
        return fileToDataUrl(file)
    }

    return compressAvatarImage(file)
}
