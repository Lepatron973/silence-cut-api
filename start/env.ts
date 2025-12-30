/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
    NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
    PORT: Env.schema.number(),
    APP_KEY: Env.schema.string(),
    HOST: Env.schema.string({ format: 'host' }),
    LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),

    /*
    |----------------------------------------------------------
    | Variables for configuring database connection
    |----------------------------------------------------------
    */
    DB_HOST: Env.schema.string({ format: 'host' }),
    DB_PORT: Env.schema.number(),
    DB_USER: Env.schema.string(),
    DB_PASSWORD: Env.schema.string.optional(),
    DB_DATABASE: Env.schema.string(),

    /*
    |----------------------------------------------------------
    | Variables for video processing
    |----------------------------------------------------------
    */
    VIDEO_STORAGE_PATH: Env.schema.string.optional(),
    VIDEO_MAX_SIZE: Env.schema.number.optional(),
    VIDEO_MAX_DURATION: Env.schema.number.optional(),
    SILENCE_THRESHOLD: Env.schema.string.optional(),
    SILENCE_DURATION: Env.schema.string.optional(),
    FILE_CLEANUP_INTERVAL: Env.schema.number.optional(),
    MAX_CONCURRENT_JOBS: Env.schema.number.optional(),
})
