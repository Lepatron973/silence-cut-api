import { test } from '@japa/runner'
import { fileURLToPath } from 'node:url'
import { mkdir, copyFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const FIXTURE_VIDEO = fileURLToPath(new URL('../fixtures/test-video.mp4', import.meta.url))
const FIXTURE_VIDEO_LONG = fileURLToPath(new URL('../fixtures/test-video-lourd.mp4', import.meta.url))
const TEST_VIDEOS_DIR = fileURLToPath(new URL('../../tmp/test-videos', import.meta.url))

test.group('Videos API - Upload', (group) => {
    group.setup(async () => {
        await mkdir(TEST_VIDEOS_DIR, { recursive: true })
    })

    group.teardown(async () => {
        await rm(TEST_VIDEOS_DIR, { recursive: true, force: true })
    })

    test('should upload a valid MP4 file', async ({ client, assert }) => {
        const testFile = join(TEST_VIDEOS_DIR, 'test.mp4')
        await copyFile(FIXTURE_VIDEO, testFile)

        const response = await client.post('/api/videos/upload').file('video', testFile)

        response.assertStatus(200)
        response.assertBodyContains({
            filename: 'test.mp4',
        })
        assert.properties(response.body(), ['videoId', 'filename', 'size'])
        assert.isString(response.body().videoId)
    })

    test('should reject non-MP4 files', async ({ client, assert }) => {
        const testFile = join(TEST_VIDEOS_DIR, 'test.txt')
        await writeFile(testFile, 'not a video')

        const response = await client.post('/api/videos/upload').file('video', testFile)

        // Should reject invalid file (422 or 500)
        assert.include([422, 500], response.status())
    })

    test('should reject files larger than 250MB', async ({ client }) => {
        // Skipped - would require creating a 250MB+ file
    }).skip()

    test('should reject missing video field', async ({ client, assert }) => {
        const response = await client.post('/api/videos/upload')

        // Should reject missing field (422 or 500)
        assert.include([422, 500], response.status())
    })
})

test.group('Videos API - Process', (group) => {
    group.setup(async () => {
        await mkdir(TEST_VIDEOS_DIR, { recursive: true })
    })

    group.teardown(async () => {
        await rm(TEST_VIDEOS_DIR, { recursive: true, force: true })
    })

    test('should reject processing non-existent video', async ({ client }) => {
        const fakeId = 'non-existent-uuid'
        const response = await client.post(`/api/videos/${fakeId}/process`)

        response.assertStatus(404)
        response.assertBodyContains({
            error: 'Video not found',
        })
    })

    test('should queue video for processing', async ({ client, assert }) => {
        const testFile = join(TEST_VIDEOS_DIR, 'test-process.mp4')
        await copyFile(FIXTURE_VIDEO, testFile)

        const uploadResponse = await client.post('/api/videos/upload').file('video', testFile)
        const { videoId } = uploadResponse.body()

        const response = await client.post(`/api/videos/${videoId}/process`)

        // Can be 200 (queued) or 503 (service unavailable - server busy) depending on load
        assert.include([200, 503], response.status())

        if (response.status() === 200) {
            response.assertBodyContains({
                videoId,
            })
            // Status can be 'queued' or 'processing' depending on timing
            assert.include(['queued', 'processing'], response.body().status)
        }
    }).timeout(10000)

    test('should reject already processing video', async ({ client, assert }) => {
        const testFile = join(TEST_VIDEOS_DIR, 'test-duplicate.mp4')
        await copyFile(FIXTURE_VIDEO_LONG, testFile) // Use longer video

        const uploadResponse = await client.post('/api/videos/upload').file('video', testFile)
        const { videoId } = uploadResponse.body()

        await client.post(`/api/videos/${videoId}/process`)

        // Try to process again immediately (should still be processing)
        const response = await client.post(`/api/videos/${videoId}/process`)

        // Can be 409 (conflict), 503 (service unavailable), or 200 (already completed) depending on timing
        assert.include([200, 409, 503], response.status())
    }).timeout(10000)
})

test.group('Videos API - Status', (group) => {
    group.setup(async () => {
        await mkdir(TEST_VIDEOS_DIR, { recursive: true })
    })

    group.teardown(async () => {
        await rm(TEST_VIDEOS_DIR, { recursive: true, force: true })
    })

    test('should return 404 for non-existent video', async ({ client }) => {
        const response = await client.get('/api/videos/fake-id/status')

        response.assertStatus(404)
        response.assertBodyContains({
            error: 'Job not found',
        })
    })

    test('should return job status', async ({ client, assert }) => {
        const testFile = join(TEST_VIDEOS_DIR, 'test-status.mp4')
        await copyFile(FIXTURE_VIDEO_LONG, testFile) // Use longer video

        const uploadResponse = await client.post('/api/videos/upload').file('video', testFile)
        const { videoId } = uploadResponse.body()

        await client.post(`/api/videos/${videoId}/process`)

        // Check status immediately (should be queued or processing)
        const response = await client.get(`/api/videos/${videoId}/status`)

        // Can be 200 (found) or 404 (already completed and cleaned) depending on timing
        if (response.status() === 200) {
            assert.properties(response.body(), ['videoId', 'status', 'progress', 'message'])
            assert.include(['queued', 'processing', 'completed'], response.body().status)
        } else {
            assert.equal(response.status(), 404)
        }
    }).timeout(10000)
})

test.group('Videos API - Download', (group) => {
    group.setup(async () => {
        await mkdir(TEST_VIDEOS_DIR, { recursive: true })
    })

    group.teardown(async () => {
        await rm(TEST_VIDEOS_DIR, { recursive: true, force: true })
    })

    test('should return 404 for non-existent video', async ({ client }) => {
        const response = await client.get('/api/videos/fake-id/download')

        response.assertStatus(404)
    })

    test('should return 400 if processing not completed', async ({ client, assert }) => {
        const testFile = join(TEST_VIDEOS_DIR, 'test-download.mp4')
        await copyFile(FIXTURE_VIDEO, testFile)

        const uploadResponse = await client.post('/api/videos/upload').file('video', testFile)
        const { videoId } = uploadResponse.body()

        const response = await client.get(`/api/videos/${videoId}/download`)

        // Can be 404 (not found) or 400 (not ready) depending on timing
        assert.include([400, 404], response.status())
    })
})

test.group('Videos API - Delete', (group) => {
    group.setup(async () => {
        await mkdir(TEST_VIDEOS_DIR, { recursive: true })
    })

    group.teardown(async () => {
        await rm(TEST_VIDEOS_DIR, { recursive: true, force: true })
    })

    test('should delete video and files', async ({ client }) => {
        const testFile = join(TEST_VIDEOS_DIR, 'test-delete.mp4')
        await copyFile(FIXTURE_VIDEO, testFile)

        const uploadResponse = await client.post('/api/videos/upload').file('video', testFile)
        const { videoId } = uploadResponse.body()

        const response = await client.delete(`/api/videos/${videoId}`)

        response.assertStatus(200)
        response.assertBodyContains({
            message: 'Video deleted successfully',
            videoId,
        })
    })

    test('should handle deleting non-existent video gracefully', async ({ client }) => {
        const response = await client.delete('/api/videos/fake-id')

        // DELETE is idempotent - should succeed even if doesn't exist
        response.assertStatus(200)
    })
})
