import { test } from '@japa/runner'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

const TEST_VIDEOS_DIR = '/tmp/integration-test-videos'

test.group('Integration - Full Video Processing Flow', (group) => {
    group.setup(async () => {
        await mkdir(TEST_VIDEOS_DIR, { recursive: true })
    })

    group.teardown(async () => {
        await rm(TEST_VIDEOS_DIR, { recursive: true, force: true })
    })

    test('should complete full video processing workflow', async ({ client, assert }) => {
        // 1. Upload video
        const testFile = join(TEST_VIDEOS_DIR, 'integration-test.mp4')
        await writeFile(testFile, Buffer.alloc(4096)) // 4KB test file

        const uploadResponse = await client.post('/api/videos/upload').file('video', testFile)
        uploadResponse.assertStatus(200)

        const { videoId } = uploadResponse.body()
        assert.isString(videoId)

        // 2. Start processing
        const processResponse = await client.post(`/api/videos/${videoId}/process`)
        processResponse.assertStatus(200)
        processResponse.assertBodyContains({ status: 'queued' })

        // 3. Check status (should be queued or processing)
        const statusResponse = await client.get(`/api/videos/${videoId}/status`)
        statusResponse.assertStatus(200)

        const status = statusResponse.body()
        assert.include(['queued', 'processing', 'completed'], status.status)

        // 4. Delete video
        const deleteResponse = await client.delete(`/api/videos/${videoId}`)
        deleteResponse.assertStatus(200)

        // 5. Verify deletion
        const statusAfterDelete = await client.get(`/api/videos/${videoId}/status`)
        statusAfterDelete.assertStatus(404)
    }).timeout(30000) // 30 seconds timeout for processing

    test('should handle concurrent uploads', async ({ client, assert }) => {
        const uploads = []

        // Upload 3 videos concurrently
        for (let i = 0; i < 3; i++) {
            const testFile = join(TEST_VIDEOS_DIR, `concurrent-${i}.mp4`)
            await writeFile(testFile, Buffer.alloc(2048))

            uploads.push(client.post('/api/videos/upload').file('video', testFile))
        }

        const responses = await Promise.all(uploads)

        // All should succeed
        responses.forEach((response) => {
            response.assertStatus(200)
        })

        // All should have unique IDs
        const videoIds = responses.map((r) => r.body().videoId)
        const uniqueIds = new Set(videoIds)
        assert.equal(uniqueIds.size, 3)
    })

    test('should respect max concurrent jobs limit', async ({ client, assert }) => {
        // Upload 3 videos
        const videoIds: string[] = []

        for (let i = 0; i < 3; i++) {
            const testFile = join(TEST_VIDEOS_DIR, `limit-test-${i}.mp4`)
            await writeFile(testFile, Buffer.alloc(2048))

            const response = await client.post('/api/videos/upload').file('video', testFile)
            videoIds.push(response.body().videoId)
        }

        // Start processing all 3
        const processPromises = videoIds.map((id) => client.post(`/api/videos/${id}/process`))
        await Promise.all(processPromises)

        // Wait for processing...
        await new Promise((resolve) => setTimeout(resolve, 2000))

        // Check statuses
        const statuses = await Promise.all(
            videoIds.map((id) => client.get(`/api/videos/${id}/status`))
        )

        // At least one should be queued (due to max 2 concurrent jobs)
        const queuedCount = statuses.filter((s) => s.body().status === 'queued').length
        assert.isAtLeast(queuedCount, 1)
    }).timeout(60000)
})

test.group('Integration - Error Handling', () => {
    test('should handle invalid file gracefully', async ({ client, assert }) => {
        const testFile = join(TEST_VIDEOS_DIR, 'invalid.txt')
        await writeFile(testFile, 'not a video')

        const response = await client.post('/api/videos/upload').file('video', testFile)

        response.assertStatus(404)
        assert.exists(response.body().error)
    })

    test('should handle missing file', async ({ client }) => {
        const response = await client.post('/api/videos/upload')

        response.assertStatus(422)
    })

    test('should handle invalid video ID format', async ({ client }) => {
        const response = await client.get('/api/videos/invalid-id-format/status')

        response.assertStatus(404)
    })
})
