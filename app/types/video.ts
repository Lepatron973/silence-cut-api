/**
 * Video processing types and interfaces
 */

export interface VideoMetadata {
    duration: number // in seconds
    codec: string
    resolution: {
        width: number
        height: number
    }
    bitrate: number
    size: number // in bytes
}

export interface SilenceInterval {
    start: number // timestamp in seconds
    end: number // timestamp in seconds
    duration: number // duration in seconds
}

export interface ProcessingResult {
    outputPath: string
    originalDuration: number
    finalDuration: number
    timeSaved: number // in seconds
    percentageSaved: number
    silencesRemoved: number
}

export interface JobStatus {
    videoId: string
    status: 'queued' | 'processing' | 'completed' | 'failed'
    progress: number // 0-100
    message?: string
    error?: string
    result?: ProcessingResult
    createdAt: Date
    updatedAt: Date
}

export interface StoredFile {
    uuid: string
    originalName: string
    path: string
    size: number
    uploadedAt: Date
}

export interface ValidationResult {
    valid: boolean
    errors: string[]
}

export interface Job {
    id: string
    videoId: string
    inputPath: string
    outputPath: string
    status: JobStatus['status']
    progress: number
    error?: string
    result?: ProcessingResult
    createdAt: Date
    updatedAt: Date
    retries: number
}
