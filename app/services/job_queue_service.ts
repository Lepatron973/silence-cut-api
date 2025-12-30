import { cpus } from 'node:os'
import { readFileSync } from 'node:fs'
import env from '#start/env'
import VideoProcessingService from '#services/video_processing_service'
import FileStorageService from '#services/file_storage_service'
import type { Job, JobStatus } from '#types/video'

/**
 * Service for managing background video processing jobs
 */
export default class JobQueueService {
    private static instance: JobQueueService
    private jobs: Map<string, Job> = new Map()
    private queue: string[] = []
    private processing: Set<string> = new Set()
    private maxConcurrentJobs: number
    private videoProcessor: VideoProcessingService
    private fileStorage: FileStorageService

    private constructor() {
        this.maxConcurrentJobs = env.get('MAX_CONCURRENT_JOBS', 2)
        this.videoProcessor = new VideoProcessingService()
        this.fileStorage = new FileStorageService()
    }

    /**
     * Get singleton instance
     */
    static getInstance(): JobQueueService {
        if (!JobQueueService.instance) {
            JobQueueService.instance = new JobQueueService()
        }
        return JobQueueService.instance
    }

    /**
     * Add a new job to the queue
     */
    async addJob(videoId: string, inputPath: string): Promise<Job> {
        const outputPath = this.fileStorage.getFilePath(videoId, 'processed')

        const job: Job = {
            id: videoId,
            videoId,
            inputPath,
            outputPath,
            status: 'queued',
            progress: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            retries: 0,
        }

        this.jobs.set(videoId, job)
        this.queue.push(videoId)

        // Start processing if capacity available
        this.processNext()

        return job
    }

    /**
     * Process the next job in queue
     */
    async processNext(): Promise<void> {
        // Check if we can process more jobs
        if (!this.canAcceptNewJob() || this.queue.length === 0) {
            return
        }

        const videoId = this.queue.shift()
        if (!videoId) return

        const job = this.jobs.get(videoId)
        if (!job) return

        this.processing.add(videoId)
        job.status = 'processing'
        job.progress = 0
        job.updatedAt = new Date()

        try {
            // Step 1: Detect silences (0-50%)
            job.progress = 10
            let silences = await this.videoProcessor.detectSilences(job.inputPath)

            // Merge close silences to reduce segment count
            silences = this.videoProcessor.mergeSilences(silences, 2.0)

            // Limit to max 10 silences for performance (keep the longest ones)
            if (silences.length > 10) {
                silences = silences
                    .sort((a, b) => (b.end - b.start) - (a.end - a.start)) // Sort by duration desc
                    .slice(0, 10) // Keep 10 longest
                    .sort((a, b) => a.start - b.start) // Re-sort by time
                console.log(`[Silence Limit] Reduced from ${silences.length} to 10 longest silences`)
            }

            job.progress = 50

            // Step 2: Remove silences (50-100%)
            const result = await this.videoProcessor.removeSilences(
                job.inputPath,
                job.outputPath,
                silences
            )

            job.progress = 100
            job.status = 'completed'
            job.result = result
            job.updatedAt = new Date()
        } catch (error) {
            console.error(`Job ${videoId} failed:`, error)

            const errorMessage = error.message || String(error)

            // Check if error is a processing error (don't retry these)
            const isProcessingError =
                errorMessage.includes('FFmpeg') ||
                errorMessage.includes('memory') ||
                errorMessage.includes('timeout') ||
                errorMessage.includes('failed') ||
                errorMessage.includes('ENOMEM') ||
                errorMessage.includes('killed')

            if (isProcessingError) {
                // Don't retry processing errors - fail immediately with user-friendly message
                job.status = 'failed'

                // Provide user-friendly error messages
                if (errorMessage.includes('memory') || errorMessage.includes('ENOMEM')) {
                    job.error = 'Vidéo trop volumineuse pour être traitée. Essayez avec une vidéo plus courte ou de résolution inférieure.'
                } else if (errorMessage.includes('timeout') || errorMessage.includes('killed')) {
                    job.error = 'Le traitement a pris trop de temps. Essayez avec une vidéo plus courte.'
                } else {
                    job.error = 'Erreur lors du traitement de la vidéo. Vérifiez que le fichier est valide.'
                }

                console.log(`[Job ${videoId}] Processing error, no retry: ${job.error}`)
            } else if (job.retries < 1) {
                // Retry for network/temporary errors
                job.retries++
                job.status = 'queued'
                job.progress = 0
                this.queue.push(videoId)
                console.log(`[Job ${videoId}] Temporary error, retrying (attempt ${job.retries + 1}/2)`)
            } else {
                // Max retries reached
                job.status = 'failed'
                job.error = 'Le traitement a échoué après plusieurs tentatives.'
                console.log(`[Job ${videoId}] Max retries reached`)
            }

            job.updatedAt = new Date()
        } finally {
            this.processing.delete(videoId)
            // Process next job
            setTimeout(() => this.processNext(), 100)
        }
    }

    /**
     * Get job status
     */
    getJobStatus(videoId: string): JobStatus | null {
        const job = this.jobs.get(videoId)
        if (!job) return null

        return {
            videoId: job.videoId,
            status: job.status,
            progress: job.progress,
            message: this.getStatusMessage(job),
            error: job.error,
            result: job.result,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
        }
    }

    /**
     * Cancel a job
     */
    async cancelJob(videoId: string): Promise<void> {
        const job = this.jobs.get(videoId)
        if (!job) return

        // Remove from queue if queued
        const queueIndex = this.queue.indexOf(videoId)
        if (queueIndex > -1) {
            this.queue.splice(queueIndex, 1)
        }

        // Mark as failed if processing (we can't actually stop FFmpeg easily)
        if (job.status === 'processing') {
            job.status = 'failed'
            job.error = 'Job cancelled by user'
        }

        this.jobs.delete(videoId)
    }

    /**
     * Check CPU load
     */
    async checkCPULoad(): Promise<number> {
        try {
            // Read /proc/loadavg on Linux
            const loadavg = readFileSync('/proc/loadavg', 'utf-8')
            const load1min = parseFloat(loadavg.split(' ')[0])
            const numCPUs = cpus().length
            return (load1min / numCPUs) * 100
        } catch {
            // Fallback: estimate based on current jobs
            return (this.processing.size / this.maxConcurrentJobs) * 100
        }
    }

    /**
     * Check if system can accept new jobs
     */
    canAcceptNewJob(): boolean {
        return this.processing.size < this.maxConcurrentJobs
    }

    /**
     * Get status message based on job state
     */
    private getStatusMessage(job: Job): string {
        switch (job.status) {
            case 'queued':
                return "Vidéo en file d'attente..."
            case 'processing':
                if (job.progress < 50) {
                    return 'Détection des silences en cours...'
                } else {
                    return 'Suppression des silences en cours...'
                }
            case 'completed':
                return 'Traitement terminé avec succès !'
            case 'failed':
                return 'Le traitement a échoué'
            default:
                return ''
        }
    }

    /**
     * Get all jobs (for debugging)
     */
    getAllJobs(): Job[] {
        return Array.from(this.jobs.values())
    }

    /**
     * Clear completed jobs older than specified minutes
     */
    clearOldJobs(maxAgeMinutes: number = 30): number {
        let cleared = 0
        const now = Date.now()

        for (const [videoId, job] of this.jobs.entries()) {
            if (job.status === 'completed' || job.status === 'failed') {
                const ageMinutes = (now - job.updatedAt.getTime()) / 1000 / 60
                if (ageMinutes > maxAgeMinutes) {
                    this.jobs.delete(videoId)
                    cleared++
                }
            }
        }

        return cleared
    }
}
