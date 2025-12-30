import vine from '@vinejs/vine'

/**
 * Validator for video upload
 */
export const uploadVideoValidator = vine.compile(
    vine.object({
        video: vine.file({
            size: '350mb',
            extnames: ['mp4', 'MP4', 'mov', 'MOV'],
        }),
    })
)

/**
 * Validator for video ID parameter
 */
export const videoIdValidator = vine.compile(
    vine.object({
        id: vine.string().trim(),
    })
)
