import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Optional Video model for tracking processed videos
 * Currently not used in stateless MVP but available for future enhancements
 */
export default class Video extends BaseModel {
    @column({ isPrimary: true })
    declare id: number

    @column()
    declare uuid: string

    @column()
    declare originalFilename: string

    @column()
    declare fileSize: number

    @column()
    declare duration: number | null

    @column()
    declare status: 'uploaded' | 'processing' | 'completed' | 'failed'

    @column()
    declare progress: number

    @column()
    declare errorMessage: string | null

    @column()
    declare originalDuration: number | null

    @column()
    declare finalDuration: number | null

    @column()
    declare timeSaved: number | null

    @column()
    declare percentageSaved: number | null

    @column()
    declare silencesRemoved: number | null

    @column.dateTime({ autoCreate: true })
    declare createdAt: DateTime

    @column.dateTime({ autoCreate: true, autoUpdate: true })
    declare updatedAt: DateTime

    @column.dateTime()
    declare deletedAt: DateTime | null
}
