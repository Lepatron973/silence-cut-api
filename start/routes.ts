/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

const VideosController = () => import('#controllers/videos_controller')

router.get('/', async () => {
    return {
        hello: 'world',
    }
})

// Video processing routes
router
    .group(() => {
        router.post('/videos/upload', [VideosController, 'upload'])
        router.post('/videos/:id/process', [VideosController, 'process'])
        router.get('/videos/:id/status', [VideosController, 'status'])
        router.get('/videos/:id/download', [VideosController, 'download'])
        router.delete('/videos/:id', [VideosController, 'delete'])
    })
    .prefix('/api')
