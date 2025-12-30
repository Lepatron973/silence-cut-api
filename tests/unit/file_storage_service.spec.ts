import { test } from '@japa/runner'
import FileStorageService from '#services/file_storage_service'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

const TEST_DIR = '/tmp/test-storage'

test.group('FileStorageService', (group) => {
    let service: FileStorageService

    group.setup(async () => {
        await mkdir(TEST_DIR, { recursive: true })
        service = new FileStorageService()
    })

    group.teardown(async () => {
        await rm(TEST_DIR, { recursive: true, force: true })
    })

    test('should generate unique UUID', ({ assert }) => {
        const uuid1 = service.generateUUID()
        const uuid2 = service.generateUUID()

        assert.isString(uuid1)
        assert.isString(uuid2)
        assert.notEqual(uuid1, uuid2)
        assert.match(
            uuid1,
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        )
    })

    test('should generate correct file paths', ({ assert }) => {
        const uuid = '12345678-1234-1234-1234-123456789012'

        const originalPath = service.getFilePath(uuid, 'original')
        const processedPath = service.getFilePath(uuid, 'processed')

        assert.include(originalPath, uuid)
        assert.include(originalPath, '.mp4')
        assert.include(processedPath, uuid)
        assert.include(processedPath, '_cut.mp4')
    })

    test('should check file existence', async ({ assert }) => {
        const testFile = join(TEST_DIR, 'exists.mp4')
        await writeFile(testFile, 'test')

        const exists = await service.fileExists(testFile)
        const notExists = await service.fileExists(join(TEST_DIR, 'not-exists.mp4'))

        assert.isTrue(exists)
        assert.isFalse(notExists)
    })

    test('should calculate file age correctly', async ({ assert }) => {
        const testFile = join(TEST_DIR, 'age-test.mp4')
        await writeFile(testFile, 'test')

        const age = await service.getFileAge(testFile)

        assert.isNumber(age)
        assert.isAtLeast(age, 0)
        assert.isBelow(age, 1) // Should be less than 1 minute old
    })

    test('should cleanup old files', async ({ assert }) => {
        // This test would require mocking file timestamps
        // or waiting for actual time to pass
    }).skip()
})
