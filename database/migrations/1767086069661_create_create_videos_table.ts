import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'videos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('uuid', 36).notNullable().unique()
      table.string('original_filename').notNullable()
      table.bigInteger('file_size').notNullable()
      table.decimal('duration', 10, 2).nullable()
      table.enum('status', ['uploaded', 'processing', 'completed', 'failed']).defaultTo('uploaded')
      table.integer('progress').defaultTo(0)
      table.text('error_message').nullable()
      table.decimal('original_duration', 10, 2).nullable()
      table.decimal('final_duration', 10, 2).nullable()
      table.decimal('time_saved', 10, 2).nullable()
      table.decimal('percentage_saved', 5, 2).nullable()
      table.integer('silences_removed').nullable()

      table.timestamp('created_at')
      table.timestamp('updated_at')
      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}