import type { HttpContext } from '@adonisjs/core/http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import FileStorageService from '#services/file_storage_service'
import VideoProcessingService from '#services/video_processing_service'
import JobQueueService from '#services/job_queue_service'
import { uploadVideoValidator, videoIdValidator } from '#validators/video_validator'
import env from '#start/env'

export default class VideosController {
    private fileStorage: FileStorageService
    private videoProcessor: VideoProcessingService
    private jobQueue: JobQueueService

    constructor() {
        this.fileStorage = new FileStorageService()
        this.videoProcessor = new VideoProcessingService()
        this.jobQueue = JobQueueService.getInstance()
    }

    /**
     * Upload a video file
     * POST /api/videos/upload
     */
    async upload({ request, response }: HttpContext) {
        console.log('Upload request received')
        try {
            // Validate request
            const payload = await request.validateUsing(uploadVideoValidator)
            const videoFile = payload.video
            console.log('Video file:', videoFile)
            // Check file size
            const maxSize = env.get('VIDEO_MAX_SIZE', 362144000)
            console.log('Max size:', maxSize)
            console.log('Actual size:', videoFile.size)
            if (videoFile.size > maxSize) {
                return response.badRequest({
                    error: 'File size exceeds maximum limit',
                    maxSize: `${maxSize / 1024 / 1024}MB`,
                    actualSize: `${videoFile.size / 1024 / 1024}MB`,
                })
            }

            // Save file
            const storedFile = await this.fileStorage.saveUploadedFile(videoFile)

            // Validate video format and duration
            const validation = await this.videoProcessor.validateVideo(storedFile.path)
            if (!validation.valid) {
                // Delete invalid file
                await this.fileStorage.deleteFile(storedFile.uuid)
                return response.badRequest({
                    error: 'Invalid video file',
                    details: validation.errors,
                })
            }

            return response.ok({
                videoId: storedFile.uuid,
                filename: storedFile.originalName,
                size: storedFile.size,
            })
        } catch (error) {
            console.error('Upload error:', error)
            return response.internalServerError({
                error: 'Failed to upload video',
                message: error.message,
            })
        }
    }

    /**
     * Start processing a video
     * POST /api/videos/:id/process
     */
    async process({ params, response }: HttpContext) {
        try {
            const { id } = await videoIdValidator.validate(params)
            console.log('Processing video:', id)
            // Check if file exists
            const inputPath = this.fileStorage.getFilePath(id, 'original')
            const exists = await this.fileStorage.fileExists(inputPath)
            console.log('Input path:', inputPath)
            await new Promise(resolve => setTimeout(resolve, 2000))
            console.log('File exists:', exists)
            if (!exists) {
                return response.notFound({
                    error: 'Video not found',
                    videoId: id,
                })
            }

            // Check if already processing or completed
            const existingJob = this.jobQueue.getJobStatus(id)
            if (existingJob) {
                if (existingJob.status === 'completed') {
                    return response.ok({
                        status: 'already_completed',
                        message: 'Video already processed',
                        result: existingJob.result,
                    })
                }
                if (existingJob.status === 'processing' || existingJob.status === 'queued') {
                    return response.ok({
                        status: existingJob.status,
                        message: 'Video is already being processed',
                        progress: existingJob.progress,
                    })
                }
            }

            // Check CPU load
            const cpuLoad = await this.jobQueue.checkCPULoad()
            if (cpuLoad > 90) {
                return response.serviceUnavailable({
                    error: 'Server is currently overloaded',
                    message: 'Please try again in a few moments',
                    cpuLoad: `${cpuLoad.toFixed(1)}%`,
                })
            }

            // Check if can accept new job
            if (!this.jobQueue.canAcceptNewJob()) {
                return response.serviceUnavailable({
                    error: 'Maximum concurrent jobs reached',
                    message: 'Please wait for current jobs to complete',
                })
            }

            // Add job to queue
            await this.jobQueue.addJob(id, inputPath)

            return response.ok({
                status: 'queued',
                message: 'Video processing started',
                videoId: id,
            })
        } catch (error) {
            console.error('Process error:', error)
            return response.internalServerError({
                error: 'Failed to start processing',
                message: error.message,
            })
        }
    }

    /**
     * Get processing status
     * GET /api/videos/:id/status
     */
    async status({ params, response }: HttpContext) {
        try {
            const { id: videoId } = await videoIdValidator.validate(params)

            const jobStatus = this.jobQueue.getJobStatus(videoId)

            if (!jobStatus) {
                return response.notFound({
                    error: 'Job not found',
                    videoId,
                })
            }

            return response.ok(jobStatus)
        } catch (error) {
            console.error('Status error:', error)
            return response.internalServerError({
                error: 'Failed to get status',
                message: error.message,
            })
        }
    }

    /**
     * Download processed video
     * GET /api/videos/:id/download
     */
    async download({ params, response }: HttpContext) {
        try {
            const { id: videoId } = await videoIdValidator.validate(params)

            // Check job status
            const jobStatus = this.jobQueue.getJobStatus(videoId)

            if (!jobStatus) {
                return response.notFound({
                    error: 'Video not found',
                    videoId,
                })
            }

            if (jobStatus.status !== 'completed') {
                return response.badRequest({
                    error: 'Video processing not completed',
                    status: jobStatus.status,
                    progress: jobStatus.progress,
                })
            }

            const outputPath = this.fileStorage.getFilePath(videoId, 'processed')
            const exists = await this.fileStorage.fileExists(outputPath)

            if (!exists) {
                return response.notFound({
                    error: 'Processed video file not found',
                })
            }

            // Get file stats
            const stats = await stat(outputPath)

            // Set headers
            response.header('Content-Type', 'video/mp4')
            response.header('Content-Length', stats.size.toString())
            response.header('Content-Disposition', `attachment; filename="video_cut.mp4"`)

            // Stream file
            const stream = createReadStream(outputPath)
            return response.stream(stream)
        } catch (error) {
            console.error('Download error:', error)
            return response.internalServerError({
                error: 'Failed to download video',
                message: error.message,
            })
        }
    }

    /**
     * Delete video files
     * DELETE /api/videos/:id
     */
    async delete({ params, response }: HttpContext) {
        try {
            const { id: videoId } = await videoIdValidator.validate(params)

            // Cancel job if running
            await this.jobQueue.cancelJob(videoId)

            // Delete files
            await this.fileStorage.deleteFile(videoId)

            return response.ok({
                message: 'Video deleted successfully',
                videoId,
            })
        } catch (error) {
            console.error('Delete error:', error)
            return response.internalServerError({
                error: 'Failed to delete video',
            })
        }
    }
}
