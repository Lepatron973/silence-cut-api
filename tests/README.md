# Tests Unitaires - SilenceCut API

Documentation des tests unitaires et d'intégration pour l'API SilenceCut.

## Structure des Tests

```
tests/
├── bootstrap.ts              # Configuration Japa
├── functional/               # Tests fonctionnels (API endpoints)
│   └── videos.spec.ts
├── unit/                     # Tests unitaires (services)
│   ├── file_storage_service.spec.ts
│   ├── job_queue_service.spec.ts
│   └── video_processing_service.spec.ts
└── integration/              # Tests d'intégration
    └── full_workflow.spec.ts
```

---

## Exécution des Tests

### Tous les tests
```bash
npm test
```

### Tests spécifiques
```bash
# Tests fonctionnels uniquement
npm test -- --files=tests/functional/**

# Tests unitaires uniquement
npm test -- --files=tests/unit/**

# Tests d'intégration uniquement
npm test -- --files=tests/integration/**

# Un fichier spécifique
npm test -- tests/functional/videos.spec.ts
```

### Mode watch
```bash
npm test -- --watch
```

---

## Tests Fonctionnels (API Endpoints)

### Upload Endpoint
**Fichier :** `tests/functional/videos.spec.ts`

**Tests :**
- ✅ Upload fichier MP4 valide
- ✅ Rejet fichier non-MP4
- ✅ Rejet fichier > 250MB (skipped)
- ✅ Rejet requête sans fichier

**Exemple :**
```typescript
test('should upload a valid MP4 file', async ({ client, assert }) => {
  const response = await client
    .post('/api/videos/upload')
    .file('video', testFile)

  response.assertStatus(200)
  assert.properties(response.body(), ['videoId', 'filename', 'size'])
})
```

---

### Process Endpoint
**Tests :**
- ✅ Rejet vidéo inexistante
- ✅ Mise en queue pour traitement
- ✅ Rejet vidéo déjà en traitement

---

### Status Endpoint
**Tests :**
- ✅ 404 pour vidéo inexistante
- ✅ Retour du statut du job

---

### Download Endpoint
**Tests :**
- ✅ 404 pour vidéo inexistante
- ✅ 400 si traitement non terminé

---

### Delete Endpoint
**Tests :**
- ✅ Suppression vidéo et fichiers
- ✅ 404 pour vidéo inexistante

---

## Tests Unitaires (Services)

### FileStorageService
**Fichier :** `tests/unit/file_storage_service.spec.ts`

**Tests :**
- ✅ Génération UUID unique
- ✅ Génération chemins fichiers corrects
- ✅ Vérification existence fichier
- ✅ Calcul âge fichier
- ⏭️ Nettoyage fichiers anciens (skipped)

**Exemple :**
```typescript
test('should generate unique UUID', ({ assert }) => {
  const uuid1 = service.generateUUID()
  const uuid2 = service.generateUUID()

  assert.notEqual(uuid1, uuid2)
  assert.match(uuid1, /^[0-9a-f]{8}-[0-9a-f]{4}-.../)
})
```

---

### JobQueueService
**Fichier :** `tests/unit/job_queue_service.spec.ts`

**Tests :**
- ✅ Pattern Singleton
- ✅ Ajout job à la queue
- ✅ Récupération statut job
- ✅ Retour null pour job inexistant
- ✅ Annulation job
- ✅ Vérification capacité accepter nouveau job
- ✅ Nettoyage anciens jobs

---

### VideoProcessingService
**Fichier :** `tests/unit/video_processing_service.spec.ts`

**Tests :**
- ⏭️ Détection silences (nécessite FFmpeg + vidéo test)
- ⏭️ Validation métadonnées (nécessite vidéo test)
- ⏭️ Construction segments (nécessite vidéo test)
- ⏭️ Validation codec (nécessite vidéo test)

> [!NOTE]
> Ces tests nécessitent des fichiers vidéo réels et FFmpeg. Ils sont skippés par défaut mais peuvent être activés avec des fixtures appropriées.

---

## Tests d'Intégration

### Full Workflow
**Fichier :** `tests/integration/full_workflow.spec.ts`

**Scénarios testés :**

#### 1. Workflow Complet
```
Upload → Process → Status → Delete → Verify
```
- Upload vidéo
- Démarrage traitement
- Vérification statut
- Suppression
- Confirmation suppression

**Timeout :** 30 secondes

---

#### 2. Uploads Concurrents
- Upload 3 vidéos simultanément
- Vérification succès de tous
- Vérification unicité des IDs

---

#### 3. Limite Jobs Concurrents
- Upload 3 vidéos
- Démarrage traitement simultané
- Vérification qu'au moins 1 est en queue (max 2 concurrent)

**Timeout :** 60 secondes

---

### Error Handling
**Tests :**
- ✅ Gestion fichier invalide
- ✅ Gestion fichier manquant
- ✅ Gestion format ID invalide

---

## Couverture de Code

### Pour générer un rapport de couverture :
```bash
npm test -- --coverage
```

### Objectifs de couverture :
- **Statements :** > 80%
- **Branches :** > 75%
- **Functions :** > 80%
- **Lines :** > 80%

---

## Fixtures et Mocks

### Créer des Fixtures Vidéo

Pour les tests nécessitant de vraies vidéos :

```bash
# Créer une vidéo de test de 5 secondes
ffmpeg -f lavfi -i testsrc=duration=5:size=320x240:rate=30 \
  -f lavfi -i sine=frequency=1000:duration=5 \
  -pix_fmt yuv420p tests/fixtures/test-video.mp4

# Créer une vidéo avec silences
ffmpeg -f lavfi -i testsrc=duration=10:size=320x240:rate=30 \
  -f lavfi -i "sine=frequency=1000:duration=3,
               anullsrc=duration=2,
               sine=frequency=1000:duration=3,
               anullsrc=duration=2" \
  -pix_fmt yuv420p tests/fixtures/video-with-silences.mp4
```

---

## CI/CD Integration

### GitHub Actions
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test
```

---

## Bonnes Pratiques

### 1. Isolation des Tests
- Chaque test doit être indépendant
- Utiliser `group.setup()` et `group.teardown()`
- Nettoyer les fichiers temporaires

### 2. Nommage
- Noms descriptifs : `should [action] when [condition]`
- Groupes logiques par fonctionnalité

### 3. Assertions
- Utiliser assertions spécifiques
- Vérifier tous les champs importants
- Tester les cas limites

### 4. Performance
- Utiliser `.skip()` pour tests longs
- Définir timeouts appropriés
- Paralléliser quand possible

---

## Debugging Tests

### Mode verbose
```bash
npm test -- --verbose
```

### Test spécifique avec logs
```bash
DEBUG=* npm test -- tests/functional/videos.spec.ts
```

### Breakpoints
Utiliser `debugger` dans le code de test et lancer avec :
```bash
node --inspect-brk node_modules/.bin/japa
```

---

## Prochaines Étapes

### Tests à Ajouter
- [ ] Tests de performance (charge)
- [ ] Tests de sécurité (injection, XSS)
- [ ] Tests de validation approfondie
- [ ] Tests FFmpeg avec vraies vidéos
- [ ] Tests de cleanup automatique
- [ ] Tests de monitoring CPU

### Améliorations
- [ ] Augmenter couverture à 90%+
- [ ] Ajouter tests E2E avec Playwright
- [ ] Implémenter tests de régression
- [ ] Ajouter benchmarks de performance
