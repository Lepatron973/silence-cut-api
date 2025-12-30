import FileStorageService from '#services/file_storage_service'
import JobQueueService from '#services/job_queue_service'

/**
 * Cleanup job to remove old video files and job records
 * Runs every 5 minutes via scheduler
 */
export async function cleanupOldFiles() {
    console.log('[Cleanup] Starting cleanup job...')

    const fileStorage = new FileStorageService()
    const jobQueue = JobQueueService.getInstance()

    try {
        // Clean up old files (>15 minutes)
        const deletedFiles = await fileStorage.cleanupOldFiles()
        console.log(`[Cleanup] Deleted ${deletedFiles} old files`)

        // Clean up old completed/failed jobs (>30 minutes)
        const clearedJobs = jobQueue.clearOldJobs(30)
        console.log(`[Cleanup] Cleared ${clearedJobs} old jobs`)
    } catch (error) {
        console.error('[Cleanup] Error during cleanup:', error)
    }
}
