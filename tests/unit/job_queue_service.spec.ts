import { test } from '@japa/runner'
import JobQueueService from '#services/job_queue_service'

test.group('JobQueueService', (group) => {
    let service: JobQueueService

    group.setup(() => {
        service = JobQueueService.getInstance()
    })

    test('should be a singleton', ({ assert }) => {
        const instance1 = JobQueueService.getInstance()
        const instance2 = JobQueueService.getInstance()

        assert.strictEqual(instance1, instance2)
    })

    test('should add job to queue', async ({ assert }) => {
        const videoId = 'test-video-123'
        const inputPath = '/tmp/test.mp4'

        const job = await service.addJob(videoId, inputPath)

        assert.equal(job.videoId, videoId)
        assert.equal(job.inputPath, inputPath)
        // Status can be 'queued' or 'processing' depending on timing
        assert.include(['queued', 'processing'], job.status)
        assert.isNumber(job.progress)
    })

    test('should get job status', async ({ assert }) => {
        const videoId = 'test-status-456'
        const inputPath = '/tmp/test2.mp4'

        await service.addJob(videoId, inputPath)
        const status = service.getJobStatus(videoId)

        assert.isNotNull(status)
        assert.equal(status?.videoId, videoId)
        // Status can be 'queued' or 'processing' depending on timing
        assert.include(['queued', 'processing'], status ? status.status : '')
        assert.properties(status!, ['videoId', 'status', 'progress', 'message'])
    })

    test('should return null for non-existent job', ({ assert }) => {
        const status = service.getJobStatus('non-existent-id')

        assert.isNull(status)
    })

    test('should cancel job', async ({ assert }) => {
        const videoId = 'test-cancel-789'
        const inputPath = '/tmp/test3.mp4'

        await service.addJob(videoId, inputPath)
        await service.cancelJob(videoId)

        const status = service.getJobStatus(videoId)
        assert.isNull(status)
    })

    test('should check if can accept new job', ({ assert }) => {
        const canAccept = service.canAcceptNewJob()

        assert.isBoolean(canAccept)
    })

    test('should clear old jobs', async ({ assert }) => {
        const cleared = service.clearOldJobs(0) // Clear all jobs

        assert.isNumber(cleared)
        assert.isAtLeast(cleared, 0)
    })
})
