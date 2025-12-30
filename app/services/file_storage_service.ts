import { randomUUID } from 'node:crypto'
import { unlink, stat, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import env from '#start/env'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type { StoredFile } from '#types/video'

/**
 * Service for managing file storage operations
 */
export default class FileStorageService {
    private storagePath: string

    constructor() {
        this.storagePath = env.get('VIDEO_STORAGE_PATH', '/tmp/videos')
    }

    /**
     * Save an uploaded file with UUID naming
     */
    async saveUploadedFile(file: MultipartFile): Promise<StoredFile> {
        const uuid = this.generateUUID()
        // Normalize extension to lowercase
        const extension = (file.extname || 'mp4').toLowerCase()
        const filename = `${uuid}.${extension}`
        const filePath = join(this.storagePath, filename)

        // Move file to storage location
        await file.move(this.storagePath, {
            name: filename,
            overwrite: true,
        })

        return {
            uuid,
            originalName: file.clientName,
            path: filePath,
            size: file.size,
            uploadedAt: new Date(),
        }
    }

    /**
     * Generate a unique UUID
     */
    generateUUID(): string {
        return randomUUID()
    }

    /**
     * Get file path for a video
     * Tries accepted extensions in order: mp4, mov
     */
    getFilePath(uuid: string, type: 'original' | 'processed'): string {
        console.log('UUID:', uuid)
        console.log('Type:', type)

        const suffix = type === 'processed' ? '_cut' : ''
        const baseFilename = `${uuid}${suffix}`

        // List of accepted extensions to try
        const acceptedExtensions = ['mp4', 'mov']

        // Try each extension
        for (const ext of acceptedExtensions) {
            const filename = `${baseFilename}.${ext}`
            const filePath = join(this.storagePath, filename)

            if (existsSync(filePath)) {
                console.log('Found file:', filePath)
                return filePath
            }
        }

        // Default to .mp4 if file not found
        const defaultPath = join(this.storagePath, `${baseFilename}.mp4`)
        console.log('File not found, using default:', defaultPath)

        return defaultPath
    }

    /**
     * Delete files associated with a video ID
     */
    async deleteFile(uuid: string): Promise<void> {
        const originalPath = this.getFilePath(uuid, 'original')
        const processedPath = this.getFilePath(uuid, 'processed')

        try {
            await unlink(originalPath)
        } catch (error) {
            // File might not exist, ignore
        }

        try {
            await unlink(processedPath)
        } catch (error) {
            // File might not exist, ignore
        }
    }

    /**
     * Get file age in minutes
     */
    async getFileAge(filePath: string): Promise<number> {
        try {
            const stats = await stat(filePath)
            const ageMs = Date.now() - stats.mtime.getTime()
            return ageMs / 1000 / 60 // Convert to minutes
        } catch (error) {
            return 0
        }
    }

    /**
     * Clean up old files (older than specified minutes)
     */
    async cleanupOldFiles(): Promise<number> {
        const maxAge = env.get('FILE_CLEANUP_INTERVAL', 15)
        let deletedCount = 0

        try {
            const files = await readdir(this.storagePath)

            for (const file of files) {
                const filePath = join(this.storagePath, file)
                const age = await this.getFileAge(filePath)

                if (age > maxAge) {
                    try {
                        await unlink(filePath)
                        deletedCount++
                    } catch (error) {
                        console.error(`Failed to delete old file ${file}:`, error)
                    }
                }
            }
        } catch (error) {
            console.error('Failed to cleanup old files:', error)
        }

        return deletedCount
    }

    /**
     * Check if a file exists
     */
    async fileExists(filePath: string): Promise<boolean> {
        try {
            await stat(filePath)
            return true
        } catch {
            return false
        }
    }
}
