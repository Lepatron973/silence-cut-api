import { spawn } from 'node:child_process'
import env from '#start/env'
import type {
    VideoMetadata,
    SilenceInterval,
    ProcessingResult,
    ValidationResult,
} from '#types/video'

/**
 * Service for FFmpeg video processing operations
 */
export default class VideoProcessingService {
    private silenceThreshold: string
    private silenceDuration: string

    constructor() {
        this.silenceThreshold = env.get('SILENCE_THRESHOLD', '-35dB')
        this.silenceDuration = env.get('SILENCE_DURATION', '0.5')
    }

    /**
     * Detect silences in a video file
     */
    async detectSilences(inputPath: string): Promise<SilenceInterval[]> {
        return new Promise((resolve, reject) => {
            const silences: SilenceInterval[] = []
            let stderrOutput = ''

            console.log(`[FFmpeg] Detecting silences in: ${inputPath}`)

            const ffmpeg = spawn('ffmpeg', [
                '-i',
                inputPath,
                '-af',
                `silencedetect=noise=${this.silenceThreshold.endsWith('dB') ? this.silenceThreshold : this.silenceThreshold + 'dB'}:d=${this.silenceDuration}`,
                '-f',
                'null',
                '-',
            ])

            ffmpeg.stderr.on('data', (data) => {
                stderrOutput += data.toString()
            })

            ffmpeg.on('close', (code) => {
                console.log(`[FFmpeg] Exit code: ${code}`)
                console.log(`[FFmpeg] Stderr output length: ${stderrOutput.length}`)

                if (code !== 0) {
                    console.error(`[FFmpeg] Full stderr:`, stderrOutput.substring(0, 500))
                    reject(new Error(`FFmpeg silence detection failed with code ${code}`))
                    return
                }

                // Parse silence intervals from stderr
                const silenceStartRegex = /silence_start: ([\d.]+)/g
                const silenceEndRegex = /silence_end: ([\d.]+)/g

                const starts: number[] = []
                const ends: number[] = []

                let match
                while ((match = silenceStartRegex.exec(stderrOutput)) !== null) {
                    starts.push(parseFloat(match[1]))
                }

                while ((match = silenceEndRegex.exec(stderrOutput)) !== null) {
                    ends.push(parseFloat(match[1]))
                }

                // Pair starts and ends
                for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
                    silences.push({
                        start: starts[i],
                        end: ends[i],
                        duration: ends[i] - starts[i],
                    })
                }

                console.log(`[FFmpeg] Detected ${silences.length} silence intervals`)
                resolve(silences)
            })

            ffmpeg.on('error', (error) => {
                console.error(`[FFmpeg] Spawn error:`, error)
                reject(error)
            })
        })
    }

    /**
     * Merge silences that are close together (less than 2 seconds apart)
     * This reduces the number of segments and improves FFmpeg performance
     */
    mergeSilences(silences: SilenceInterval[], minGap: number = 2.0): SilenceInterval[] {
        if (silences.length === 0) return silences

        const merged: SilenceInterval[] = []
        let current = { ...silences[0] }

        for (let i = 1; i < silences.length; i++) {
            const next = silences[i]
            const gap = next.start - current.end

            // If gap is less than minGap seconds, merge the silences
            if (gap < minGap) {
                current.end = next.end
            } else {
                merged.push(current)
                current = { ...next }
            }
        }

        // Don't forget the last one
        merged.push(current)

        console.log(`[Silence Merge] Reduced from ${silences.length} to ${merged.length} intervals`)
        return merged
    }

    /**
     * Remove silences from video using stream copy mode
     */
    async removeSilences(
        inputPath: string,
        outputPath: string,
        silences: SilenceInterval[]
    ): Promise<ProcessingResult> {
        // Get original metadata
        const metadata = await this.getVideoMetadata(inputPath)

        // If no silences detected, just copy the file
        if (silences.length === 0) {
            await this.copyFile(inputPath, outputPath)
            return {
                outputPath,
                originalDuration: metadata.duration,
                finalDuration: metadata.duration,
                timeSaved: 0,
                percentageSaved: 0,
                silencesRemoved: 0,
            }
        }

        // Build segments to keep (non-silent parts)
        const segments = this.buildKeepSegments(silences, metadata.duration)

        // If no segments remain (entire video is silence), just copy the file
        if (segments.length === 0) {
            console.log('[Processing] Entire video detected as silence. Keeping original.')
            await this.copyFile(inputPath, outputPath)
            return {
                outputPath,
                originalDuration: metadata.duration,
                finalDuration: metadata.duration,
                timeSaved: 0,
                percentageSaved: 0,
                silencesRemoved: silences.length,
            }
        }

        // Create filter complex for cutting
        const filterComplex = this.buildFilterComplex(segments)

        return new Promise((resolve, reject) => {
            const args = [
                '-i',
                inputPath,
                '-filter_complex',
                filterComplex,
                '-map',
                '[outv]',
                '-map',
                '[outa]',
                '-c:v',
                'libx264',
                '-preset',
                'ultrafast', // 5x faster encoding
                '-crf',
                '28', // Slightly lower quality but much faster
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-y',
                outputPath,
            ]

            const ffmpeg = spawn('ffmpeg', args)
            let stderrOutput = ''

            ffmpeg.stderr.on('data', (data) => {
                stderrOutput += data.toString()
            })

            ffmpeg.on('close', async (code) => {
                if (code !== 0) {
                    reject(new Error(`FFmpeg processing failed: ${stderrOutput}`))
                    return
                }

                try {
                    const finalMetadata = await this.getVideoMetadata(outputPath)
                    const timeSaved = metadata.duration - finalMetadata.duration
                    const percentageSaved = (timeSaved / metadata.duration) * 100

                    resolve({
                        outputPath,
                        originalDuration: metadata.duration,
                        finalDuration: finalMetadata.duration,
                        timeSaved,
                        percentageSaved,
                        silencesRemoved: silences.length,
                    })
                } catch (error) {
                    reject(error)
                }
            })

            ffmpeg.on('error', (error) => {
                reject(error)
            })
        })
    }

    /**
     * Get video metadata using ffprobe
     */
    async getVideoMetadata(filePath: string): Promise<VideoMetadata> {
        return new Promise((resolve, reject) => {
            const ffprobe = spawn('ffprobe', [
                '-v',
                'quiet',
                '-print_format',
                'json',
                '-show_format',
                '-show_streams',
                filePath,
            ])

            let stdout = ''
            let stderr = ''

            ffprobe.stdout.on('data', (data) => {
                stdout += data.toString()
            })

            ffprobe.stderr.on('data', (data) => {
                stderr += data.toString()
            })

            ffprobe.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`ffprobe failed: ${stderr}`))
                    return
                }

                try {
                    const data = JSON.parse(stdout)
                    const videoStream = data.streams.find((s: any) => s.codec_type === 'video')

                    if (!videoStream) {
                        reject(new Error('No video stream found'))
                        return
                    }

                    resolve({
                        duration: parseFloat(data.format.duration || '0'),
                        codec: videoStream.codec_name,
                        resolution: {
                            width: videoStream.width,
                            height: videoStream.height,
                        },
                        bitrate: parseInt(data.format.bit_rate || '0'),
                        size: parseInt(data.format.size || '0'),
                    })
                } catch (error) {
                    reject(error)
                }
            })

            ffprobe.on('error', (error) => {
                reject(error)
            })
        })
    }

    /**
     * Validate video file
     */
    async validateVideo(filePath: string): Promise<ValidationResult> {
        const errors: string[] = []

        try {
            const metadata = await this.getVideoMetadata(filePath)

            // Check codec (should be H.264)
            if (metadata.codec !== 'h264') {
                errors.push(`Invalid codec: ${metadata.codec}. Expected H.264`)
            }

            // Check duration
            const maxDuration = env.get('VIDEO_MAX_DURATION', 600)
            if (metadata.duration > maxDuration) {
                errors.push(`Video duration (${metadata.duration}s) exceeds maximum (${maxDuration}s)`)
            }

            return {
                valid: errors.length === 0,
                errors,
            }
        } catch (error) {
            errors.push(`Failed to validate video: ${error.message}`)
            return {
                valid: false,
                errors,
            }
        }
    }

    /**
     * Build segments to keep (non-silent parts)
     */
    private buildKeepSegments(
        silences: SilenceInterval[],
        totalDuration: number
    ): Array<{ start: number; end: number }> {
        const segments: Array<{ start: number; end: number }> = []
        let currentStart = 0

        for (const silence of silences) {
            if (silence.start > currentStart) {
                segments.push({
                    start: currentStart,
                    end: silence.start,
                })
            }
            currentStart = silence.end
        }

        // Add final segment if there's content after last silence
        if (currentStart < totalDuration) {
            segments.push({
                start: currentStart,
                end: totalDuration,
            })
        }

        return segments
    }

    /**
     * Build FFmpeg filter complex for cutting
     */
    private buildFilterComplex(segments: Array<{ start: number; end: number }>): string {
        if (segments.length === 0) return ''

        const filters: string[] = []

        // Create trim filters for each segment
        segments.forEach((segment, index) => {
            filters.push(
                `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${index}]`
            )
            filters.push(
                `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[a${index}]`
            )
        })

        // Concatenate all segments
        const vInputs = segments.map((_, i) => `[v${i}]`).join('')
        const aInputs = segments.map((_, i) => `[a${i}]`).join('')
        filters.push(`${vInputs}concat=n=${segments.length}:v=1:a=0[outv]`)
        filters.push(`${aInputs}concat=n=${segments.length}:v=0:a=1[outa]`)

        return filters.join(';')
    }

    /**
     * Copy file (used when no silences detected)
     */
    private async copyFile(source: string, destination: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', ['-i', source, '-c', 'copy', '-y', destination])

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve()
                } else {
                    reject(new Error(`Failed to copy file with code ${code}`))
                }
            })

            ffmpeg.on('error', reject)
        })
    }
}
