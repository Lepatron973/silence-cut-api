import { cleanupOldFiles } from '#jobs/cleanup_old_files'

/**
 * Scheduler service to run periodic background tasks
 */
export function startSchedulers() {
    console.log('[Scheduler] Starting background schedulers...')

    // Run cleanup immediately on startup
    cleanupOldFiles()

    // Run cleanup every 5 minutes
    const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes in milliseconds
    setInterval(() => {
        cleanupOldFiles()
    }, CLEANUP_INTERVAL)

    console.log('[Scheduler] Cleanup job scheduled to run every 5 minutes')
}
